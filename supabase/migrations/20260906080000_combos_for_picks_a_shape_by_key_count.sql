-- APPLIED 6 Sep 2026. The combo lookup needs BOTH shapes, and a popularity index.
--
-- Asking one key at a time is right for a narrow identity and wrong for a wide
-- one; the plain popularity walk is the reverse. Measured on the same instance:
--
--                         mono-red      five colours
--     per-key lateral       579 ms         8,648 ms
--     popularity walk     7,998 ms             1 ms
--
-- WHY EACH FAILS AT THE OTHER END. A five-colour identity matches EVERY combo -
-- the filter removed 368 of 56,240 rows - so 32 ordered index ranges of 400
-- each is 12,800 rows materialised to return 400. A mono-red identity is the
-- opposite: a walk down (popularity DESC) throws away 5,875 rows to find 400,
-- and those rows are scattered across the heap. That is 27 ms warm and EIGHT
-- SECONDS cold, with 536 buffer reads - which is how a query that measured fine
-- took production down again an hour after it was fixed.
--
-- So the function picks by key count, and `combo_pool_popularity_idx` is what
-- makes the wide case possible at all: without it the planner parallel-seq-
-- scans 55,504 rows and sorts.
--
-- ⚠️ THE INDEX MUST BE RECREATED IF `combo_pool` IS REBUILT, like every other
-- matview index in this project. There are FOUR now: id, (identity_key,
-- popularity DESC), gin(oracle_ids), and this one.
--
-- STABLE and SECURITY INVOKER, so grants and RLS behave as for a direct read.

create index if not exists combo_pool_popularity_idx
  on public.combo_pool using btree (popularity desc nulls last);

create or replace function public.combos_for(p_keys text[], p_limit int default 400)
returns setof public.combo_pool
language sql
stable
as $function$
  -- FEW KEYS: one ordered index range per key, then merge. Each key's rows are
  -- adjacent in (identity_key, popularity DESC), so locality is good.
  with top as (
    select t.id, t.popularity
    from unnest(p_keys) as k(key)
    cross join lateral (
      select c.id, c.popularity
      from public.combo_pool c
      where c.identity_key = k.key
      order by c.popularity desc nulls last
      limit greatest(p_limit, 1)
    ) t
    where array_length(p_keys, 1) <= 8
    order by t.popularity desc nulls last
    limit greatest(p_limit, 1)
  )
  select cp.* from public.combo_pool cp join top on top.id = cp.id
  where array_length(p_keys, 1) <= 8
  union all
  -- MANY KEYS (four or five colours): the filter removes almost nothing, so a
  -- walk down (popularity DESC) stops after about p_limit rows.
  select cp.* from public.combo_pool cp
  where array_length(p_keys, 1) > 8
    and cp.identity_key = any(p_keys)
  order by popularity desc nulls last
  limit greatest(p_limit, 1);
$function$;

grant execute on function public.combos_for(text[], int) to anon, authenticated, service_role;

do $$
declare a int; b int; c int;
begin
  select count(*) into a from public.combos_for(array['','R'], 400);
  select count(*) into b from public.combos_for(array['','B','G','W','BG','BW','GW','BGW'], 400);
  select count(*) into c from public.combos_for(array['','B','G','R','U','W','BG','BR','BU','BW','GR','GU','GW','RU','RW','UW',
    'BGR','BGU','BGW','BRU','BRW','BUW','GRU','GRW','GUW','RUW','BGRU','BGRW','BGUW','BRUW','GRUW','BGRUW'], 400);
  if a <> 400 or b <> 400 or c <> 400 then
    raise exception 'combos_for returned %/%/% for 1/3/5 colours, expected 400 each', a, b, c;
  end if;
  raise notice 'combos_for returns 400 at one, three and five colours';
end $$;
