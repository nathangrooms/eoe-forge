-- APPLIED 6 Sep 2026. `combo_pool` had no scheduled vacuum and every deck build
-- reads it.
--
-- `cards_unique` (job 27) and `cards_pool` (job 28) have had one since 30 Aug.
-- `combo_pool` was added later and nobody added its job, which is the gap
-- CLAUDE.md already recorded:
--
--   "The scheduled vacuums cover cards_unique and cards_pool and NOT
--    combo_pool. Anything that adds a matview must add its vacuum, or it
--    degrades silently for months."
--
-- A materialized view gets NO VISIBILITY MAP from a refresh, so every
-- index-only scan falls back to the heap until it is vacuumed. `combo_pool` had
-- gone from creation to 6 Sep with `last_vacuum` NULL over 56,240 rows before
-- one was run by hand.
--
-- ⚠️ ONE STATEMENT, AND NO `set` LINE. A pg_cron command holding more than one
-- statement is an implicit transaction block, and VACUUM refuses to run inside
-- one (25001). That is why jobs 27 and 28 are bare `vacuum (analyze) ...` at the
-- 120 s default rather than carrying a statement_timeout, and this one matches.
--
-- Staggered five minutes after `cards_pool` so the three never overlap:
--
--   07:00 / 13:00   cards_unique
--   07:05 / 13:05   cards_pool
--   07:10 / 13:10   combo_pool     <- this
--
-- Idempotent: `cron.schedule` on an existing jobname replaces it.

select cron.schedule('combo-pool-vacuum', '10 7,13 * * *', 'vacuum (analyze) public.combo_pool;');

do $$
declare n int;
begin
  select count(*) into n from cron.job where jobname = 'combo-pool-vacuum';
  if n <> 1 then
    raise exception 'combo-pool-vacuum is not scheduled (% rows)', n;
  end if;
  raise notice 'combo-pool-vacuum scheduled';
end $$;
