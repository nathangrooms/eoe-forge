-- APPLIED 6 Sep 2026. The land pool read scanned the fat matview.
--
-- `landPoolFor` is the ONE caller that genuinely needs `oracle_text` - it is how
-- the mana base learns what a land taps for - so it reads `cards_unique`, the
-- 77 MB matview, rather than the thin `cards_pool`. Its filter is
--
--     legalities->>'commander' = 'legal'
--     AND color_identity <@ '{...}'
--     AND type_line LIKE '%Land%'
--
-- and the planner served it by ANDing the legality index with the type-line
-- trigram index. The legality half returns THIRTY-ONE THOUSAND rows to
-- intersect with about 1,200 lands:
--
--     Bitmap Index Scan on cards_unique_commander_id_idx
--       rows=31829   actual time=721 ms          <- the whole cost
--     Bitmap Index Scan on cards_unique_type_line_trgm_idx
--       rows=1235    actual time=7.9 ms
--     Buffers: shared hit=1619                  Execution 894 ms
--
-- A PARTIAL INDEX COVERING BOTH CONDITIONS gives exactly the candidate set in
-- one scan, and no bitmap at all:
--
--     Index Scan using cards_unique_commander_land_idx
--       Buffers: shared hit=1009                 the 721 ms bitmap is GONE
--
-- What is left is 1,000 heap fetches of width-443 rows, which is inherent to
-- reading `oracle_text` for every land and is why this reads the fat view.
--
-- WHY IT MATTERED. Production measured PROGENITUS's pool fetch - five colours,
-- so `2500 rows + 1194 land rows`, the largest land pool there is - between
-- 355 ms warm and 18,128 ms cold. The CPU budget of an edge function is spent
-- across the WHOLE request, so a slow fetch is what the build does not have
-- left, and he returned 546 WORKER_RESOURCE_LIMIT on every attempt.
--
-- The client half of the same fix: `type_line=ilike` became `like`. Scryfall
-- CASES its type lines so the match is identical, and CLAUDE.md already
-- measured `ilike` at 12x on a `cards_unique` scan. Measured again here on the
-- five-colour identity: cold 2.40 s -> 0.28 s, warm the same either way.
--
-- ⚠️ A CONCURRENT REFRESH KEEPS ITS INDEXES, so `refresh_cards_unique` does not
-- lose this. A DROP-and-CREATE rebuild WOULD, like every other index on this
-- view - the swap procedure has to carry it.

create index if not exists cards_unique_commander_land_idx
  on public.cards_unique using btree (id)
  where type_line like '%Land%' and (legalities->>'commander') = 'legal';

analyze public.cards_unique;

do $$
declare n int;
begin
  select count(*) into n from pg_indexes
   where schemaname = 'public' and indexname = 'cards_unique_commander_land_idx';
  if n <> 1 then
    raise exception 'cards_unique_commander_land_idx is missing';
  end if;
  raise notice 'cards_unique_commander_land_idx present';
end $$;
