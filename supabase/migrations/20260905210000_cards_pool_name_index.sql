-- APPLIED 5 Sep 2026, during a production outage, and kept because the query it
-- serves is sent on EVERY deck build.
--
-- `Catalog.poolFacetsByName` reads the commander's facets out of `cards_pool`
-- by name, and `fetchAll` appends `order=id.asc` for keyset pagination. With no
-- index on `name` the planner walked `cards_pool_id_idx` in id order filtering
-- on name - 33,036 random heap fetches to return ONE row.
--
--   before   Seq Scan / id-index walk, 33,036 rows      measured 30.0 s
--   after    Index Scan using cards_pool_name_idx       cost 2.51, 1 row
--
-- The same lookup WITHOUT the `order=id` clause measured 0.7 s, which is what
-- made this survivable for so long: the ordering is what forced the bad plan,
-- and the index is what makes the ordering free.
--
-- ⚠️ THIS IS THE SIXTH INDEX ON `cards_pool`, and the alongside-and-swap
-- rebuild procedure recreates FIVE. A rebuild that forgets this one is SILENT
-- until commander lookups start timing out on every build. The full set:
--
--     cards_pool_id_idx                 unique (id)
--     cards_pool_band_idx               (knowledge_band)
--     cards_pool_identity_idx           gin (color_identity) where legal
--     cards_pool_identity_rank_id_idx   (color_identity, edhrec_rank, id) where legal
--     cards_pool_rank_idx               (edhrec_rank, id) where legal and rank not null
--     cards_pool_name_idx               (name)                              <-- this one
--
-- NOTE ON THE OUTAGE: this index did NOT fix it. The outage was disk IO
-- throttling caused by running eight parallel agents against this database,
-- and it recovered only by stopping the load. The index is a real improvement
-- found while diagnosing, not the cure. See the outage section in CLAUDE.md.

create index if not exists cards_pool_name_idx
  on public.cards_pool using btree (name);

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'cards_pool'
      and indexname = 'cards_pool_name_idx'
  ) then
    raise exception 'cards_pool_name_idx was not created';
  end if;
  raise notice 'cards_pool_name_idx present';
end $$;
