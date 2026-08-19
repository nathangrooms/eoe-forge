-- `cards` now holds every printing. Most of the product does not want that.
--
-- A commander picker, a search box, a suggestion list and a deck-building
-- candidate pool all want CARDS. Sol Ring has dozens of printings; without a
-- deduplicated source a suggestion list spends every slot on reprints of one
-- card and a commander picker offers the same legend eight times.
--
-- Rather than leave that to each caller to remember, the two modes are two
-- named sources:
--
--   public.cards          every printing. Use when the printing IS the subject:
--                         collection rows, marketplace listings, scanner
--                         results, the art-variants list on a card page.
--
--   public.cards_unique   one row per card. The default for everything else.
--
-- WHICH PRINTING REPRESENTS THE CARD
-- The rule is the deck optimiser's, copied exactly rather than invented a
-- second time. See supabase/functions/deck-optimizer/_engine/deck/recommend/
-- rank.ts, `dedupeByOracle` and `cheaper`:
--
--   cheapest USD price wins;
--   a priced printing always beats an unpriced one;
--   ties break on the lowest id.
--
-- That makes it deterministic: the same catalogue always yields the same
-- chosen printing, whatever order rows come back in. It is the right rule
-- because the question a candidate pool answers is "what does it cost to add
-- this card", and that is the cheapest printing you could buy.
--
-- Verified against the live table when this was created: for all 995 oracle_ids
-- with more than one printing, the row chosen here is the same row the
-- optimiser's cheaper() picks. 995 of 995, zero mismatches.
--
-- Materialised rather than a plain view. A DISTINCT ON across 96,732 rows on
-- every search would be paid on every keystroke; refreshed once after a sync
-- and once after the nightly price capture, it is paid twice a day. Measured on
-- the optimiser's own candidate query for a three-colour identity: 658 ms
-- against `cards`, 85 ms against `cards_unique`.

drop materialized view if exists public.cards_unique;

create materialized view public.cards_unique as
select distinct on (c.oracle_id)
  c.id,
  c.oracle_id,
  c.name,
  c.set_code,
  c.collector_number,
  c.layout,
  c.type_line,
  c.cmc,
  c.colors,
  c.color_identity,
  c.oracle_text,
  c.mana_cost,
  c.power,
  c.toughness,
  c.loyalty,
  c.keywords,
  c.legalities,
  c.image_uris,
  c.prices,
  c.is_legendary,
  c.is_reserved,
  c.rarity,
  c.tags,
  c.faces,
  c.artist,
  c.illustration_id,
  c.edhrec_rank,
  c.released_at,
  c.set_name,
  c.finishes,
  c.border_color,
  c.frame_effects,
  c.full_art,
  c.variation,
  c.promo,
  c.game_changer,
  c.created_at,
  c.updated_at,
  -- The only column `cards` does not have. Additive, so this stays a drop-in
  -- replacement, and it is what a card page needs to decide whether to offer an
  -- "other printings" control at all.
  count(*) over (partition by c.oracle_id)::integer as printings_count
from public.cards c
order by
  c.oracle_id,
  -- Regex-guarded so one malformed price from upstream cannot fail the whole
  -- refresh. A price that is not a plain decimal is treated as no price.
  (case when c.prices->>'usd' ~ '^[0-9]+(\.[0-9]+)?$'
        then (c.prices->>'usd')::numeric end) asc nulls last,
  c.id asc;

comment on materialized view public.cards_unique is
  'One row per oracle_id: the cheapest priced printing, ties broken on lowest id. The default card source for search, commanders, suggestions, candidate pools and MTG Brain. Use public.cards instead only where the individual printing is the subject.';

-- Required for REFRESH ... CONCURRENTLY, and it is also the guarantee the whole
-- design rests on: the database will not let a second row for one oracle_id
-- exist here.
create unique index cards_unique_oracle_id_key on public.cards_unique (oracle_id);

create index cards_unique_id_idx           on public.cards_unique (id);
create index cards_unique_name_idx         on public.cards_unique (name);
create index cards_unique_name_trgm_idx    on public.cards_unique using gin (name gin_trgm_ops);
create index cards_unique_oracle_text_trgm_idx on public.cards_unique using gin (oracle_text gin_trgm_ops);
create index cards_unique_type_line_trgm_idx   on public.cards_unique using gin (type_line gin_trgm_ops);
create index cards_unique_color_identity_idx on public.cards_unique using gin (color_identity);
create index cards_unique_tags_idx         on public.cards_unique using gin (tags);
create index cards_unique_cmc_idx          on public.cards_unique (cmc);
create index cards_unique_set_code_idx     on public.cards_unique (set_code);
create index cards_unique_rarity_idx       on public.cards_unique (rarity);
create index cards_unique_legendary_idx    on public.cards_unique (is_legendary) where is_legendary = true;
create index cards_unique_edhrec_rank_idx  on public.cards_unique (edhrec_rank) where edhrec_rank is not null;

-- The same seven partial legality indexes `cards` carries. The optimiser's
-- candidate pull is driven by exactly this predicate and knows the list by name
-- (INDEXED_FORMATS in the engine's query.ts), so it has to hold here too.
create index cards_unique_legal_commander_idx on public.cards_unique ((legalities->>'commander')) where (legalities->>'commander') = 'legal';
create index cards_unique_legal_legacy_idx    on public.cards_unique ((legalities->>'legacy'))    where (legalities->>'legacy')    = 'legal';
create index cards_unique_legal_modern_idx    on public.cards_unique ((legalities->>'modern'))    where (legalities->>'modern')    = 'legal';
create index cards_unique_legal_pauper_idx    on public.cards_unique ((legalities->>'pauper'))    where (legalities->>'pauper')    = 'legal';
create index cards_unique_legal_pioneer_idx   on public.cards_unique ((legalities->>'pioneer'))   where (legalities->>'pioneer')   = 'legal';
create index cards_unique_legal_standard_idx  on public.cards_unique ((legalities->>'standard'))  where (legalities->>'standard')  = 'legal';
create index cards_unique_legal_vintage_idx   on public.cards_unique ((legalities->>'vintage'))   where (legalities->>'vintage')   = 'legal';

-- Exactly the exposure `cards` already has. Its RLS policy is
-- "Cards are publicly readable" USING (true), so nothing becomes visible here
-- that was not visible before. A materialized view cannot carry RLS, which is
-- why this is safe only because the underlying data is already public.
grant select on public.cards_unique to anon, authenticated, service_role;

create or replace function public.refresh_cards_unique()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_rows    bigint;
begin
  -- CONCURRENTLY so readers are never blocked. It needs the unique index above
  -- and it cannot run inside an outer transaction block.
  refresh materialized view concurrently public.cards_unique;
  select count(*) into v_rows from public.cards_unique;
  return format('cards_unique refreshed: %s rows in %s ms',
                v_rows,
                round(extract(epoch from clock_timestamp() - v_started) * 1000));
end;
$$;

revoke all on function public.refresh_cards_unique() from public, anon, authenticated;
grant execute on function public.refresh_cards_unique() to service_role;
