-- "What are the staples" is the top of one ordered list and it could not be
-- read at all. Measured on the live view:
--
--   select name from cards_unique
--   where edhrec_rank is not null and legalities->>'commander' = 'legal'
--   order by edhrec_rank limit 40;
--
--     Index Scan using cards_unique_commander_id_idx, 31,762 rows, then a sort
--     Execution Time: 11,894 ms      (3 s statement_timeout for anon)
--
-- This is section 10d of CLAUDE.md happening again on a different index. The
-- planner picked cards_unique_commander_id_idx, whose key is `id` under a
-- predicate pinning the legality expression to 'legal'. An index whose key
-- carries no ordering the query wants can filter rows and nothing else, so
-- every one of the 31,762 legal cards had to be read and sorted before the
-- first of forty could be returned. It also mis-estimated that scan at 195
-- rows, which is why it looked cheap.
--
-- The index below is keyed on the thing the query orders by, under the same
-- predicate, so the scan streams in rank order and stops at the limit. It also
-- serves the colour lists, which filter on colour_identity and take the first
-- few in the same order.
--
--   after, white staples, limit 10
--     Index Scan using cards_unique_commander_rank_idx, 10 rows, no sort
--     Buffers 80 rather than 32,286
--     Execution Time: 14.9 ms
--
-- 31,762 entries on a 77 MB view, so it is small. It is not the kind of index
-- the database discipline note warns about: that is about the 28 indexes on
-- `cards`, a 255 MB table rewritten by every sync.
--
-- NOTE FOR WHOEVER REBUILDS cards_unique: a materialized view drops its
-- indexes when it is recreated. This one has to be recreated with the rest.

create index if not exists cards_unique_commander_rank_idx
  on public.cards_unique (edhrec_rank)
  where edhrec_rank is not null and (legalities ->> 'commander') = 'legal';

analyze public.cards_unique;
