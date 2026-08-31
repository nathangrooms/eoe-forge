-- Every word the engine can say about a card, with how many cards carry it.
--
-- The owner, 31 Aug 2026: *"in admin we need a list of all archetypes,
-- strategies and every single type of card definition across both commanders,
-- lands and other cards"*, and earlier: *"Especially if we are adding specific
-- rules and types I dont know"*.
--
-- WHY THIS IS A QUERY AND NOT A LIST IN THE COMPONENT. The facet vocabulary is
-- open: a compiler rule written next week emits a facet nobody has typed
-- anywhere else, and a hand-maintained list in a React file would be wrong from
-- the moment it shipped and wrong silently. Reading the facets the catalogue
-- ACTUALLY carries means the screen describes the engine that is running rather
-- than the engine somebody remembered.
--
-- The counts are the point as much as the names. A facet on nine cards and a
-- facet on nine thousand are different objects, and only one of them is worth
-- a role rule.

-- IT READS `cards_pool`, NOT `cards_unique`, AND MATCHES WITH `like`.
--
-- Both measured, because the first version of this timed out on the 3 s the
-- authenticator role carries and returned a blank screen:
--
--   cards_unique, unnest tags            9,214 ms   fat rows, 3.2 KB each
--   cards_pool,   unnest tags + facets   2,007 ms   with two ILIKE per row
--   cards_pool,   unnest tags + facets     172 ms   the same two as LIKE
--
-- ILIKE was the entire difference. Type lines are properly cased by Scryfall,
-- so `like '%Land%'` is not a shortcut, it is the correct match.

drop function if exists public.engine_vocabulary();

create or replace function public.engine_vocabulary()
returns table (
  kind       text,
  name       text,
  cards      bigint,
  lands      bigint,
  commanders bigint
)
language sql
stable
security definer
set search_path = public
as $$
  -- Facets: what the ability compiler decided a card DOES.
  select 'facet'::text, f::text, count(*)::bigint,
         count(*) filter (where p.type_line like '%Land%')::bigint,
         count(*) filter (where p.type_line like 'Legendary Creature%')::bigint
  from public.cards_pool p, lateral unnest(p.facets) f
  group by f

  union all

  -- Tags: what the 109 tagger rules decided a card IS. A different reading of
  -- the same text, kept separate on purpose — CLAUDE.md records the two being
  -- conflated more than once.
  select 'tag'::text, t::text, count(*)::bigint,
         count(*) filter (where p.type_line like '%Land%')::bigint,
         count(*) filter (where p.type_line like 'Legendary Creature%')::bigint
  from public.cards_pool p, lateral unnest(p.tags) t
  group by t

  union all

  -- The compiler's own verdict, so the dictionary carries its own denominator.
  select 'coverage'::text, coalesce(m.coverage, 'not yet measured')::text,
         count(*)::bigint, 0::bigint, 0::bigint
  from public.card_facet_memo m
  where m.compiler_version = public.card_facet_current_version()
  group by coalesce(m.coverage, 'not yet measured');
$$;

comment on function public.engine_vocabulary() is
  'Every facet and tag the catalogue actually carries, with card counts. Live, so a rule written tomorrow shows up here without anyone editing a component.';

grant execute on function public.engine_vocabulary() to anon, authenticated, service_role;
