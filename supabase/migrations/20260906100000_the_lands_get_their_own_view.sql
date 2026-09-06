-- APPLIED 6 Sep 2026. The mana base was built by scanning a 187 MB matview.
--
-- `landPoolFor` is the ONE caller that genuinely needs `oracle_text` - it is how
-- the deck learns what a land taps for - so it read `cards_unique` and scanned
-- it for the ~1,200 land rows. Measured in production on PROGENITUS, five
-- colours and therefore the largest land pool there is:
--
--     pool: 2500 rows + 1194 land rows -> 2500 printings in    355 ms
--                                                           2,187 ms
--                                                          11,819 ms
--                                                          15,763 ms
--                                                          18,128 ms
--
-- The spread IS the bug: warm it is fine and cold it is sixteen seconds, and an
-- edge function spends its CPU budget across the WHOLE request, so a slow fetch
-- is what the build does not have left. He returned 546 WORKER_RESOURCE_LIMIT
-- on every attempt, and each retry warmed the cache further until one
-- succeeded - which is what a user would experience as "it works sometimes".
--
--     cards_unique      187 MB    894-1,565 ms for that query
--     cards_land_pool   728 kB           18 ms
--
-- 728 kB stays resident, so the cold case stops existing rather than being made
-- faster. A partial index on `cards_unique` was tried first and removed the
-- 721 ms bitmap but not the heap fetches; the narrow view removes both.
--
-- ⚠️ IT CARRIES COMMANDER LEGALITY AND NOTHING ELSE, exactly like `cards_pool`.
-- `landPoolFor` branches on the format: Commander reads this, every other
-- format reads `cards_unique`. Reading `commander_legal` for a Standard deck
-- would not error - it would quietly build from the wrong pool.
--
-- ⚠️ IT IS DERIVED FROM `cards_unique` AND MUST MOVE WITH IT.
-- `refresh_cards_unique` refreshes all three views now, CONCURRENTLY, which the
-- unique index on (id) allows. A view that silently describes last week's
-- catalogue is the failure this project has already had twice.
--
-- Its vacuum job is `cards-land-pool-vacuum` at 07:15 and 13:15, five minutes
-- behind combo_pool so the four never overlap. One statement, no `set` line: a
-- pg_cron command holding more than one statement is a transaction block and
-- VACUUM refuses to run inside one.

create materialized view if not exists public.cards_land_pool as
select
  c.id, c.oracle_id, c.name, c.type_line, c.cmc, c.color_identity, c.tags,
  c.mana_cost, c.edhrec_rank, c.oracle_text,
  c.prices->>'usd' as usd,
  c.legalities->>'commander' as commander_legal
from public.cards_unique c
where c.type_line like '%Land%'
with no data;

refresh materialized view public.cards_land_pool;

create unique index if not exists cards_land_pool_id_idx
  on public.cards_land_pool using btree (id);
create index if not exists cards_land_pool_legal_id_idx
  on public.cards_land_pool using btree (commander_legal, id);
create index if not exists cards_land_pool_identity_idx
  on public.cards_land_pool using gin (color_identity);

grant select on public.cards_land_pool to anon, authenticated, service_role;
analyze public.cards_land_pool;

select cron.schedule('cards-land-pool-vacuum', '15 7,13 * * *',
                     'vacuum (analyze) public.cards_land_pool;');

do $$
declare n bigint;
begin
  select count(*) into n from public.cards_land_pool;
  if n < 500 then
    raise exception 'cards_land_pool holds only % rows, expected over a thousand', n;
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'refresh_cards_unique'
      and pg_get_functiondef(p.oid) like '%cards_land_pool%'
  ) then
    raise exception 'refresh_cards_unique does not refresh cards_land_pool - it would go stale';
  end if;
  raise notice 'cards_land_pool holds % rows and is refreshed with cards_unique', n;
end $$;
