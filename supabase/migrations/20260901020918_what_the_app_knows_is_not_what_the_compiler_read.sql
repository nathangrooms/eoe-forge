-- Two questions, two functions, and they must never be quoted as one number.
--
--   engine_coverage()   DID THE COMPILER READ THE WHOLE CARD
--                       Its own span-accounted verdict, over card_facet_memo.
--                       This is the COMPILER'S WORK LIST and the honest measure
--                       of our own parser. Tagger cannot move it and must not.
--
--   engine_knowledge()  DOES THE APP KNOW WHAT THIS CARD DOES
--                       Over cards_pool, so it includes Tagger under the gate.
--                       This is what DECK BUILDING actually sees, and it is the
--                       number that decides whether a card can be suggested.
--
-- A card can score well on the second and badly on the first: Tagger saying
-- "this draws cards" is enough to offer it as a draw spell and nowhere near
-- enough to resolve it in play mode. Reporting the second as if it were the
-- first is the exact conflation CLAUDE.md has warned about three times.
--
-- The partition is exhaustive and disjoint, so the shares sum to 100. That is
-- deliberate: the coverage screen once summed to 120% because one band was the
-- union of two others, and 354 cards were in no band at all.

create or replace function public.engine_knowledge()
returns table (measure text, cards bigint, share numeric, note text)
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select m.coverage,
           exists (select 1 from unnest(coalesce(cp.facets, '{}'::text[])) f
                   where f ~ '^(eff|trig|cost|acost|scope|mana|ctr|tok):') as verb,
           exists (select 1 from unnest(coalesce(cp.facets, '{}'::text[])) f
                   where f ~ '^cares:')                                    as cares,
           cardinality(coalesce(cp.tag_facets, '{}'::text[])) > 0          as tagger_helped,
           exists (select 1 from unnest(coalesce(cp.compiler_facets, '{}'::text[])) f
                   where f ~ '^(eff|trig|cost|acost|scope|mana|ctr|tok):') as compiler_verb
    from public.cards_pool cp
    left join public.card_facet_memo m
      on m.oracle_id = cp.oracle_id and m.compiler_version = 10
  ),
  t as (select count(*)::bigint as n from p)

  -- ------------------------------------------------- the headline, first ----
  select 'the app knows what it does'::text,
         count(*) filter (where coverage = 'none' or coverage = 'full' or verb)::bigint,
         round(100.0 * count(*) filter (where coverage = 'none' or coverage = 'full' or verb)
               / nullif((select n from t), 0), 1),
         'complete, fully read, or at least one verb from any source'::text
    from p
  union all
  -- --------------------------------------- the partition, disjoint, 100% ----
  select 'nothing to read', count(*) filter (where coverage = 'none')::bigint,
         round(100.0 * count(*) filter (where coverage = 'none') / nullif((select n from t),0), 1),
         'no rules text at all. A vanilla creature is not an unread card'
    from p
  union all
  select 'whole card read', count(*) filter (where coverage = 'full')::bigint,
         round(100.0 * count(*) filter (where coverage = 'full') / nullif((select n from t),0), 1),
         'the compiler accounted for every paragraph'
    from p
  union all
  select 'knows what it does, not all of it',
         count(*) filter (where coverage in ('partial','manual') and verb)::bigint,
         round(100.0 * count(*) filter (where coverage in ('partial','manual') and verb)
               / nullif((select n from t),0), 1),
         'at least one verb, from the compiler or from Tagger under the gate'
    from p
  union all
  select 'knows what it looks at, not what it does',
         count(*) filter (where coverage in ('partial','manual') and not verb and cares)::bigint,
         round(100.0 * count(*) filter (where coverage in ('partial','manual') and not verb and cares)
               / nullif((select n from t),0), 1),
         'cares: words only. Cannot be offered for a job'
    from p
  union all
  select 'knows nothing about what it does',
         count(*) filter (where coverage in ('partial','manual') and not verb and not cares)::bigint,
         round(100.0 * count(*) filter (where coverage in ('partial','manual') and not verb and not cares)
               / nullif((select n from t),0), 1),
         'the real work list'
    from p
  union all
  -- ------------------------------------------------------- who said what ----
  select 'Tagger added a word', count(*) filter (where tagger_helped)::bigint,
         round(100.0 * count(*) filter (where tagger_helped) / nullif((select n from t),0), 1),
         'community reading, merged under the 86% precision gate'
    from p
  union all
  select 'Tagger was the only source', count(*) filter (where tagger_helped and not compiler_verb)::bigint,
         round(100.0 * count(*) filter (where tagger_helped and not compiler_verb)
               / nullif((select n from t),0), 1),
         'our compiler produced no verb for these at all'
    from p;
$$;

grant execute on function public.engine_knowledge() to anon, authenticated, service_role;

comment on function public.engine_knowledge() is
  'Does the APP know what a card does, over cards_pool including Tagger. Distinct from engine_coverage(), which is the compiler''s own span-accounted verdict and is the compiler''s work list.';;
