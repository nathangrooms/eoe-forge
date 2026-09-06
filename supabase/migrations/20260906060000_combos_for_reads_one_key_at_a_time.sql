-- APPLIED 6 Sep 2026. The combo lookup every deck build makes was 2.2 s against
-- a 3 s statement_timeout, and it FAILED REAL BUILDS.
--
--   POST ai-deck-builder-v2 {"commander":{"name":"Ghave, Guru of Spores"}}
--   -> {"error":"PostgREST 500 on combo_pool?select=... identity_key=in.(%:
--       {\"code\":\"57014\",\"message\":\"canceling statement due to statement timeout\"}"}
--
-- WHY IT IS SLOW, and it is not the index. `combo_pool_key_pop_idx` is on
-- `(identity_key, popularity DESC)` and can serve ONE key in popularity order
-- for free. Asked for eight keys at once - the subsets of a three-colour
-- identity - the planner cannot walk eight ordered ranges and merge them, so it
-- bitmaps all eight, reads EVERY matching row from the heap, and top-N sorts:
--
--   Bitmap Heap Scan  rows=18580  width=456  Heap Blocks: exact=2585
--   Buffers: shared hit=2626      Execution Time: 2196 ms
--
-- Every buffer is a CACHE HIT, so this is not IO and not a cold view - it is
-- 18,580 wide rows materialised to return 400. A five-colour identity has 32
-- keys and is worse.
--
-- THE FIX IS TO ASK ONE KEY AT A TIME. A lateral over the keys gives eight
-- ordered index scans of 400 rows each, one top-400 over the 3,200, and 400
-- lookups by id for the wide columns:
--
--   before   18,580 rows materialised            2,196 ms
--   after    8 index scans + 400 id lookups        297 ms      7.4x
--
-- Measured twice on a HEALTHY instance: the db-gate warm median was 0.04-0.07 s
-- either side. An earlier reading of 3,894 ms was taken while the database was
-- recovering from probe load, and CLAUDE.md's rule applies - all-cache-hit
-- buffers with a long execution time is starvation, not a plan. The 2,196 ms
-- here is the honest number and it is still too close to the cap.
--
-- STABLE and SECURITY INVOKER, so RLS and grants behave exactly as they do for
-- a direct read of `combo_pool`, which `anon` may already select.

create or replace function public.combos_for(p_keys text[], p_limit int default 400)
returns setof public.combo_pool
language sql
stable
as $function$
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
    order by t.popularity desc nulls last
    limit greatest(p_limit, 1)
  )
  select cp.*
  from public.combo_pool cp
  join top on top.id = cp.id
  order by cp.popularity desc nulls last;
$function$;

grant execute on function public.combos_for(text[], int) to anon, authenticated, service_role;

do $$
declare n int;
begin
  select count(*) into n from public.combos_for(array['','B','G','W','BG','BW','GW','BGW'], 400);
  if n <> 400 then
    raise exception 'combos_for returned % rows for a three-colour identity, expected 400', n;
  end if;
  raise notice 'combos_for returns % rows', n;
end $$;
