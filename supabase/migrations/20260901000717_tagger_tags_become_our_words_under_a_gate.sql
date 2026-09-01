-- Scryfall Tagger tags translated into our vocabulary, and the gate they clear.
--
-- 387 of Tagger's 768 significant tags map to words we understand. The other
-- 381 do not, and most of that is not a gap: 107 describe a card's SHAPE
-- ("activated ability", "modal", "multiple targets"), 99 are flavour and
-- printing metadata, and 175 are true of a card without any single facet being
-- necessarily true, "spot removal" being the largest at 5,309 cards. Mapping
-- that one would repeat the failure that filed Bojuka Bog as removal.
--
-- THE GATE, and it is why `gated` exists as a column rather than the table
-- simply holding the good ones. Scored against a 374-word answer key written by
-- two independent readers who saw none of the contenders:
--
--   compiler alone                     86.7% precision   48.7% recall
--   the whole mapping, merged in       83.5%             75.7%      FAILS
--   high-confidence cares:/eff: only   86.9%             67.1%      passes
--   ...plus everything where the
--      compiler said nothing at all    86.3%             72.5%      passes
--
-- The naive union FAILS because both sources' errors compound. 85% is the bar
-- because below it the mapping puts cards in wrong roles faster than it fills
-- empty ones, and a wrong facet makes the deck builder spend a real slot on a
-- card that cannot do the job.
--
-- So `gated` marks the 196 mappings trusted on EVERY card. The other 191 are
-- used only where the compiler produced nothing, because a card with no words
-- has nothing to lose.
--
-- Keyed on tag_id, not slug: Scryfall's own docs say slugs change and to track
-- tags by their stable UUID.

create table if not exists public.tag_facet_map (
  tag_id     uuid primary key references public.scryfall_tags(tag_id) on delete cascade,
  slug       text not null,
  facets     text[] not null,
  confidence text not null check (confidence in ('high', 'medium')),
  -- Trusted on every card. False means "only where we have nothing else".
  gated      boolean not null default false,
  why        text
);

comment on table public.tag_facet_map is
  'Scryfall Tagger tags translated into our facet vocabulary. `gated` marks the mappings that cleared 85% precision against the 374-word answer key and are trusted on every card; the rest fill only cards the compiler is silent on.';

alter table public.tag_facet_map enable row level security;

drop policy if exists "the mapping is public" on public.tag_facet_map;
create policy "the mapping is public" on public.tag_facet_map
  for select to anon, authenticated using (true);

grant select on public.tag_facet_map to anon, authenticated, service_role;
revoke insert, update, delete on public.tag_facet_map from anon, authenticated;;
