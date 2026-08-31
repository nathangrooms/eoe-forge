-- The coverage bands become a real partition, and vanilla cards get their own.
--
-- The admin Engine screen drew four numbers summing to 120%, then three summing
-- to 99%. Both were the same defect: `engine_coverage()` reported "no record at
-- all" as `coverage = 'none' OR source = 'none'`, which is the UNION of two
-- other bands, and the 354 cards whose coverage is literally 'none' were in no
-- band at all.
--
-- MEASURED: 347 of those 354 HAVE NO RULES TEXT. Aegis Turtle, Zombie Goliath.
-- A vanilla creature has been read completely, because there is nothing to read.
--
-- They are NOT folded into 'full'. That would be true and misleading: `full` is
-- the number this project quotes as progress, and 347 cards with no text are not
-- progress. They get their own band so the four sum to the catalogue.
--
-- AND THE BAND IS DECIDED BY `coverage` ALONE, WITH NO JOIN. The first version
-- joined `cards_unique` to read `oracle_text` and prove they were vanilla, and
-- TIMED OUT: that matview's rows average 3.2 KB and all five branches paid the
-- detoast. Third time in two days that touching a fat column cost a query, after
-- the vocabulary scan (2,007 ms of ILIKE) and the gap query (4,954 ms of
-- anti-join plus columns). `coverage not in ('full','partial','manual')`
-- identifies the same cards from a column already in hand. 1.48 s after.

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
    from public.card_facet_memo m
    where m.compiler_version = public.card_facet_current_version()
      and m.coverage is not null
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
  select 'nothing to read', count(*)::bigint,
         round(100.0 * count(*) / nullif((select n from total), 0), 1)
    from scored where coverage not in ('full', 'partial', 'manual')
  union all
  select 'no record at all', count(*)::bigint,
         round(100.0 * count(*) / nullif((select n from total), 0), 1)
    from scored where coverage = 'none' or source = 'none'
  union all
  select 'still to be measured', public.card_facet_gap()::bigint, null::numeric;
$$;

comment on function public.engine_coverage() is
  'How much of the whole catalogue the ability compiler reads, right now. The first four measures PARTITION the catalogue and sum to it. "no record at all" is an OVERLAP of two of them and must never be drawn as a fifth band. "read the whole card" is the compiler consuming every paragraph, not the reading being correct.';

grant execute on function public.engine_coverage() to anon, authenticated, service_role;
