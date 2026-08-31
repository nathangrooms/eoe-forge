-- How much of every card the engine reads becomes a live number, not a script.
--
-- The owner, 31 Aug 2026: "i dont care about top 400, or top 15k cards,
-- everything should be covered, always, automatically".
--
-- Every coverage figure this project has ever quoted came from someone running
-- a probe over a slice: the top 100, the top 2,000, the 400 most-built
-- commanders. Three problems with that, and the third is the one that matters.
-- A slice flatters. A one-off has nothing to compare against. And a number
-- nobody is measuring can regress for weeks without anybody knowing, which is
-- exactly how `cards_unique` came to describe 28 August for two days while
-- every search and suggestion was served from it.
--
-- `facetsForCard` has always returned the compiler's own coverage verdict
-- alongside the facets, and `facet-memo-fill` has always thrown it away. It
-- costs nothing to keep: the compile has already happened.
--
-- With it stored, "how much of the catalogue do we read" is a SELECT, it is
-- current for every card including the ones printed next week, and the
-- fifteen-minute top-up maintains it without anybody remembering to.
--
-- NO COMPILER VERSION BUMP. The facets do not change, only this column, so a
-- bump would be a lie about the compiler and would rewrite 33,032 rows to add a
-- word. Instead `card_facet_gap()` and `cards_missing_facets()` learn that a
-- row with no coverage recorded IS a gap, and the job that already exists fills
-- it over the following hours. That is the same mechanism that will carry the
-- next set, used for the thing it was built for.

alter table public.card_facet_memo
  add column if not exists coverage text;

comment on column public.card_facet_memo.coverage is
  'The compiler''s own verdict: full, partial, manual or none. "full" means every paragraph was consumed, NOT that the reading was correct. Never quote the two as one number.';

-- --------------------------------------------------------------- the gap ---
--
-- A row with no coverage is as much a gap as no row at all: the card has not
-- been through the current fill. Widening the gap rather than bumping the
-- version is what makes this backfill itself.

create or replace function public.card_facet_gap()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.cards_unique u
  where not exists (
    select 1
    from public.card_facet_memo m
    where m.oracle_id = u.oracle_id
      and m.compiler_version = public.card_facet_current_version()
      and m.coverage is not null
  );
$$;

create or replace function public.cards_missing_facets(
  p_version integer,
  p_after   text default '',
  p_limit   integer default 1000
)
returns table (
  oracle_id      text,
  name           text,
  layout         text,
  type_line      text,
  cmc            numeric,
  colors         text[],
  color_identity text[],
  oracle_text    text,
  mana_cost      text,
  power          text,
  toughness      text,
  keywords       text[],
  faces          jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select u.oracle_id, u.name, u.layout, u.type_line, u.cmc, u.colors, u.color_identity,
         u.oracle_text, u.mana_cost, u.power, u.toughness, u.keywords, u.faces
  from public.cards_unique u
  where u.oracle_id > coalesce(p_after, '')
    and not exists (
      select 1 from public.card_facet_memo m
      where m.oracle_id = u.oracle_id
        and m.compiler_version = p_version
        and m.coverage is not null
    )
  order by u.oracle_id
  limit least(greatest(coalesce(p_limit, 1000), 1), 1000);
$$;

revoke all on function public.cards_missing_facets(integer, text, integer) from public;
revoke all on function public.cards_missing_facets(integer, text, integer) from anon;
revoke all on function public.cards_missing_facets(integer, text, integer) from authenticated;
grant execute on function public.cards_missing_facets(integer, text, integer) to service_role;

-- ------------------------------------------------------------- the census ---

create or replace function public.engine_coverage()
returns table (
  measure text,
  cards   bigint,
  share   numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with scored as (
    select m.coverage, m.source
    from public.cards_unique u
    join public.card_facet_memo m
      on m.oracle_id = u.oracle_id
     and m.compiler_version = public.card_facet_current_version()
    where m.coverage is not null
  ),
  total as (select count(*)::bigint as n from scored)
  select 'measured'::text, (select n from total), 100.0
  union all
  select 'read the whole card', count(*)::bigint,
         round(100.0 * count(*) / nullif((select n from total), 0), 1)
    from scored where coverage = 'full'
  union all
  select 'read some of it', count(*)::bigint,
         round(100.0 * count(*) / nullif((select n from total), 0), 1)
    from scored where coverage = 'partial'
  union all
  select 'needs a human for all of it', count(*)::bigint,
         round(100.0 * count(*) / nullif((select n from total), 0), 1)
    from scored where coverage = 'manual'
  union all
  select 'no record at all', count(*)::bigint,
         round(100.0 * count(*) / nullif((select n from total), 0), 1)
    from scored where coverage = 'none' or source = 'none'
  union all
  select 'still to be measured', public.card_facet_gap()::bigint, null::numeric;
$$;

comment on function public.engine_coverage() is
  'How much of the whole catalogue the ability compiler reads, right now. "read the whole card" is the compiler consuming every paragraph, not the reading being correct.';

grant execute on function public.engine_coverage() to anon, authenticated, service_role;
