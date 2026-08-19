-- MTGJSON calls 3,004 things a "deck" and most of them are not decks.
--
-- This is the most important table in the meta schema. It lives as DATA rather than as code in
-- one of the ingestion clients because there must be exactly one copy of it: the moment the
-- edge function and the loader disagree about whether "MTGO Redemption" is a decklist, a full
-- set redemption enters the corpus and the co-occurrence engine starts asserting that every
-- card in Tenth Edition is played alongside every other card in Tenth Edition.
--
-- Measured shapes that justify the exclusions (2026-08-19, one sample of each fetched live):
--   MTGO Redemption   383 distinct cards, one copy of each. A whole set.
--   Secret Lair Drop   30 cards. An art product.
--   Jumpstart          19 cards. Half a deck, meant to be combined at random with another.
--   Bundle Land Pack   40 cards, all basic lands.
--   Commander Deck     99 main + 1 commander = 100. An actual decklist.
--
-- It is an ALLOWLIST. A type nobody has classified is ignored rather than guessed at, so a new
-- MTGJSON product type is skipped until a human looks at it.

create table if not exists public.meta_deck_type_allowlist (
  deck_type text primary key,
  format    text,
  reason    text not null,
  constraint meta_deck_type_format_ck check (format is null or format in ('commander','brawl','constructed','multiplayer'))
);

comment on table public.meta_deck_type_allowlist is
  'Which MTGJSON deck types are real decklists, and what format each is. A NULL format means the type is deliberately excluded and the reason column says why. Ingestion joins against this table; it never hardcodes the list.';
comment on column public.meta_deck_type_allowlist.format is
  'NULL means "not a decklist, do not ingest". Never default this to a format to make an import work.';

alter table public.meta_deck_type_allowlist enable row level security;
drop policy if exists meta_deck_type_allowlist_read on public.meta_deck_type_allowlist;
create policy meta_deck_type_allowlist_read on public.meta_deck_type_allowlist for select to public using (true);
drop policy if exists meta_deck_type_allowlist_write on public.meta_deck_type_allowlist;
create policy meta_deck_type_allowlist_write on public.meta_deck_type_allowlist for all to service_role using (true) with check (true);
revoke insert, update, delete, truncate on public.meta_deck_type_allowlist from anon, authenticated;

insert into public.meta_deck_type_allowlist (deck_type, format, reason) values
  ('Commander Deck',              'commander',    '100-card singleton. The format the engine most needs evidence for.'),
  ('MTGO Commander Deck',         'commander',    '100-card singleton, digital release.'),
  ('Brawl Deck',                  'brawl',        '60-card singleton with a commander.'),
  ('Historic Brawl Precon Deck',  'brawl',        '60-card singleton with a commander.'),
  ('World Championship Deck',     'constructed',  'Genuine tournament decklist, cleanly licensed.'),
  ('Pro Tour Deck',               'constructed',  'Genuine tournament decklist, cleanly licensed.'),
  ('Theme Deck',                  'constructed',  'Designer-built 60-card constructed deck.'),
  ('Intro Pack',                  'constructed',  'Designer-built 60-card constructed deck.'),
  ('Planeswalker Deck',           'constructed',  'Designer-built 60-card constructed deck.'),
  ('Event Deck',                  'constructed',  'Designer-built 60-card constructed deck.'),
  ('Challenger Deck',             'constructed',  'Designer-built 60-card constructed deck.'),
  ('Pioneer Challenger Deck',     'constructed',  'Designer-built 60-card constructed deck.'),
  ('Modern Event Deck',           'constructed',  'Designer-built 60-card constructed deck.'),
  ('Premium Deck',                'constructed',  'Designer-built 60-card constructed deck.'),
  ('Duel Deck',                   'constructed',  'Designer-built 60-card constructed deck.'),
  ('Starter Deck',                'constructed',  'Designer-built 60-card constructed deck.'),
  ('Guild Kit',                   'constructed',  'Designer-built 60-card constructed deck.'),
  ('Clash Pack',                  'constructed',  'Designer-built 60-card constructed deck.'),
  ('Game Night Deck',             'constructed',  'Designer-built 60-card constructed deck.'),
  ('MTGO Theme Deck',             'constructed',  'Designer-built 60-card constructed deck.'),
  ('Archenemy Deck',              'multiplayer',  '60-card deck for a multiplayer variant with its own extra-card zone.'),
  ('Planechase Deck',             'multiplayer',  '60-card deck for a multiplayer variant with its own extra-card zone.'),

  ('MTGO Redemption',             null, 'A full set redemption, one copy of every card. Measured at 383 distinct cards. Would poison every co-occurrence figure in the database.'),
  ('Secret Lair Drop',            null, 'An art product of a few cards. Not a deck.'),
  ('Jumpstart',                   null, 'A 19-card half-deck designed to be combined at random with another.'),
  ('Bundle Land Pack',            null, 'Basic lands only.'),
  ('Box Set',                     null, 'Product contents manifest.'),
  ('Deck Builder''s Toolkit',     null, 'A pile of cards and lands to build from, not a built deck.'),
  ('Welcome Booster',             null, 'Product contents manifest.'),
  ('San Diego Comic Con Promos',  null, 'Promo card list.'),
  ('Arena Starter Deck',          null, 'Digital-only starter contents, not a constructed list.'),
  ('Arena Starter Kit',           null, 'Digital-only starter contents.'),
  ('Arena Promotional Deck',      null, 'Digital promo contents.'),
  ('Shandalar Enemy Deck',        null, 'Decks from a 1997 video game with its own card pool and rules.'),
  ('Duel Of The Planeswalkers Deck', null, 'Decks from a video game with a restricted card pool.'),
  ('Sample Deck',                 null, 'Small teaching deck, well under a legal 60.'),
  ('Welcome Deck',                null, 'Small teaching deck.'),
  ('Demo Deck',                   null, 'Small teaching deck.'),
  ('Halfdeck',                    null, 'Explicitly half a deck.'),
  ('Starter Kit',                 null, 'Two small learn-to-play decks packaged together.'),
  ('Advanced Deck',               null, 'Learn-to-play product.'),
  ('Advanced Pack',               null, 'Learn-to-play product.'),
  ('Enhanced Deck',               null, 'Learn-to-play product.'),
  ('Spellslinger Starter Kit',    null, 'Learn-to-play product.'),
  ('Challenge Deck',              null, 'A scripted solitaire opponent, not a constructed deck.'),
  ('Dandan Deck',                 null, 'A novelty format deck with its own rules.'),
  ('Enemy Deck',                  null, 'A scripted video-game opponent.')
on conflict (deck_type) do update
  set format = excluded.format, reason = excluded.reason;

-- Legal deck size per format. Exact for singleton formats, a floor for the rest.
create or replace function public.meta_is_complete_deck(p_format text, p_total integer)
returns boolean language sql immutable
as $$
  select case p_format
    when 'commander'   then p_total = 100
    when 'brawl'       then p_total = 60
    when 'constructed' then p_total >= 60
    when 'multiplayer' then p_total >= 60
    else false
  end;
$$;

comment on function public.meta_is_complete_deck(text, integer) is
  'Whether a deck is a legal-size list. Incomplete decks are still stored, but every aggregate filters them out: a 64-card Commander deck is a draft and counting it would distort inclusion rates downward for every card it is missing.';;