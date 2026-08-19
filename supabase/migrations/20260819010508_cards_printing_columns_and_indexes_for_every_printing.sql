-- Hold every printing: the columns that make a printing identifiable, and the
-- indexes that keep the table usable at roughly three times its size.
--
-- Measured 2026-08-19 against Scryfall for the sync's own query
-- (-is:digital game:paper):
--   unique=cards  32,726   <- what we synced before
--   unique=art    47,604
--   unique=prints 96,732   <- what we moved to
--
-- Every column below is on the card object Scryfall already returns and was
-- already being thrown away. None is derived or guessed.

alter table public.cards
  -- The artwork's creator. The scanner tells printings apart BY artwork and the
  -- card page wants an art-variants list; before this an artist name existed
  -- only inside the `faces` jsonb, so only the 854 multi-face rows had one.
  add column if not exists artist text,

  -- Scryfall's stable id for one piece of art. Two printings that share it are
  -- the same painting in a different frame, which is exactly the grouping an
  -- art-variants section and a scanner match need. It is what `unique=art`
  -- keys on upstream.
  add column if not exists illustration_id text,

  -- Popularity rank across EDHREC decklists. Asked for by name. It is the only
  -- ordering we have for "what do people actually play" in commander lists.
  add column if not exists edhrec_rank integer,

  -- Print date. Orders the printings of one card on the card page and answers
  -- "the newest printing", which no column previously could.
  add column if not exists released_at date,

  -- Human-readable set name. Collection rows and marketplace listings have to
  -- name the set a card came from and only the three-letter code was stored,
  -- so the interface had no source for "Outlaws of Thunder Junction".
  add column if not exists set_name text,

  -- Which finishes this printing was actually made in (nonfoil / foil / etched).
  -- `user_collections.foil` and `listings.foil` were recorded with nothing to
  -- validate them against, and a foil-only or etched-only printing could not be
  -- represented at all.
  add column if not exists finishes text[],

  -- Borderless is one of the headline variant classes and this is the only
  -- field that states it.
  add column if not exists border_color text,

  -- showcase / extended art / etched. The variant vocabulary itself.
  add column if not exists frame_effects text[],

  -- Full-art lands and full-art promos.
  add column if not exists full_art boolean,

  -- Promo printings price very differently from the retail printing of the same
  -- card, which is the whole reason collection value needs printings.
  add column if not exists variation boolean,
  add column if not exists promo boolean,

  -- Wizards' official Commander Bracket "Game Changer" list, published on every
  -- card object. The EDH power score is the primary number in this product and
  -- had no access to it. NOTHING READS THIS YET; it is stored so the score can
  -- use it without another full re-sync.
  add column if not exists game_changer boolean;

comment on column public.cards.illustration_id is
  'Scryfall illustration id. Printings sharing this value carry the same artwork.';
comment on column public.cards.game_changer is
  'Wizards Commander Bracket Game Changer flag. Stored by the sync; no consumer reads it yet.';

-- ---------------------------------------------------------------------------
-- Duplicate indexes
-- ---------------------------------------------------------------------------
-- Five index pairs were byte-for-byte the same definition under two names. At
-- 34,088 rows they were only wasted space; the sync upserts the entire
-- catalogue nightly, so at 96,732 rows every duplicate is a second write of the
-- same index on every one of those rows. Dropped, keeping the `idx_cards_*`
-- name in each pair because that is the one the current plans reference.
drop index if exists public.cards_cmc_idx;             -- = idx_cards_cmc
drop index if exists public.cards_color_identity_idx;  -- = idx_cards_color_identity
drop index if exists public.cards_name_idx;            -- = idx_cards_name
drop index if exists public.cards_rarity_idx;          -- = idx_cards_rarity
drop index if exists public.cards_set_code_idx;        -- = idx_cards_set_code

-- ---------------------------------------------------------------------------
-- Search: the sequential scan that had to go before the table tripled
-- ---------------------------------------------------------------------------
-- The card search runs
--   name ilike %q% OR oracle_text ilike %q% OR type_line ilike %q%
-- Only type_line had a trigram index, so the OR could not be answered from
-- indexes at all. Measured on the live table at 34,088 rows, a term with no
-- match ('zzyzx') was a full sequential scan: 1,321 ms, 13,829 buffers. A term
-- that matches early ('dragon') finished in 61 ms purely because LIMIT 24 let
-- it stop near the front of the name index. The bad case is the real one, and
-- linear in row count it would land near four seconds at 96,732 rows.
--
-- With a trigram index on each of the three columns the planner BitmapOrs them:
-- the same 'zzyzx' query measured 13 ms and 25 buffers afterwards.
create index if not exists idx_cards_name_trgm
  on public.cards using gin (name gin_trgm_ops);

create index if not exists idx_cards_oracle_text_trgm
  on public.cards using gin (oracle_text gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Indexes for the new columns
-- ---------------------------------------------------------------------------
-- Partial: only ranked cards are ever ordered by rank, and roughly one card in
-- a hundred has no rank.
create index if not exists idx_cards_edhrec_rank
  on public.cards (edhrec_rank)
  where edhrec_rank is not null;

-- "Every printing that shares this artwork" is the art-variants query and the
-- scanner's result grouping.
create index if not exists idx_cards_illustration_id
  on public.cards (illustration_id)
  where illustration_id is not null;

-- "Every printing of this card, newest first" is the art-variants section on
-- the card page. Composite so the sort comes off the index.
create index if not exists idx_cards_oracle_id_released
  on public.cards (oracle_id, released_at desc);
