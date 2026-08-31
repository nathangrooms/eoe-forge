-- `cards_missing_facets` finds the gap FIRST, then reads only those cards.
--
-- Bumping the facet memo to compiler version 9 made the gap the whole
-- catalogue, and this function then could not complete a single call under
-- `service_role`'s inherited 8 s. The fill never wrote a row, at batch sizes of
-- 1000, 400 and 150 alike, which is the clue: the cost was not in how many rows
-- came back.
--
-- Measured, same 400 rows, same warm database:
--
--   anti-join, ids only                12 ms     index-only, Heap Fetches 0
--   fat columns, no anti-join         679 ms     408 buffers
--   anti-join AND fat columns       4,954 ms   13,457 buffers
--   after this change              1,496 ms    4,764 buffers
--
-- Doing both at once costs thirty times either. The merge anti-join has to keep
-- `cards_unique` in oracle_id order while the thirteen selected columns force a
-- heap and TOAST visit per row, and the planner cannot have both cheaply.
--
-- Splitting them is the whole fix. `MATERIALIZED` is load-bearing and not a
-- hint: without it Postgres is free to inline the CTE and rebuild exactly the
-- plan being avoided. With it the anti-join runs alone against an index-only
-- scan, hands back at most `p_limit` ids, and the fat read is a plain lookup of
-- those specific rows.
--
-- `service_role` cannot be given its own statement_timeout, which was the first
-- thing tried: it is a reserved role and only a superuser may alter it. That is
-- the right outcome anyway. 8 s is a page-view budget and a batch job should be
-- made cheap rather than given a longer rope.
--
-- The signature and the returned columns are unchanged, so every caller is
-- untouched.

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
  with gap as materialized (
    select u.oracle_id
    from public.cards_unique u
    where u.oracle_id > coalesce(p_after, '')
      and not exists (
        select 1 from public.card_facet_memo m
        where m.oracle_id = u.oracle_id
          and m.compiler_version = p_version
          and m.coverage is not null
      )
    order by u.oracle_id
    limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
  )
  select u.oracle_id, u.name, u.layout, u.type_line, u.cmc, u.colors, u.color_identity,
         u.oracle_text, u.mana_cost, u.power, u.toughness, u.keywords, u.faces
  from gap
  join public.cards_unique u on u.oracle_id = gap.oracle_id
  order by u.oracle_id;
$$;

revoke all on function public.cards_missing_facets(integer, text, integer) from public;
revoke all on function public.cards_missing_facets(integer, text, integer) from anon;
revoke all on function public.cards_missing_facets(integer, text, integer) from authenticated;
grant execute on function public.cards_missing_facets(integer, text, integer) to service_role;
