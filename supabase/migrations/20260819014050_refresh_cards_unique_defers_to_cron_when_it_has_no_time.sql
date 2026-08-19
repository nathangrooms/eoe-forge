-- `refresh materialized view concurrently` cannot finish inside a PostgREST
-- request, and the sync was calling it from one.
--
-- CONCURRENTLY builds the new contents into a temporary table, diffs it against
-- the live one and applies the difference. On 33,037 rows carrying 20 indexes
-- that is minutes, not seconds, and it is slowest exactly when it matters most:
-- straight after a sync, when every row has just been rewritten. Measured by
-- calling it during the catalogue load, it was cancelled with 57014 inside the
-- DELETE stage of the diff.
--
-- Every caller that reaches it through PostgREST gets `authenticator`'s
-- `statement_timeout=8s` (confirmed empirically: the function reads back
-- exactly 8000 ms when called through the edge function), and that timeout is
-- armed before the function body runs and cannot be widened from inside it. So
-- a request can never do this work, and pretending otherwise means the sync
-- ends with a warning in the log and a stale view.
--
-- pg_cron has no such limit: it runs as `postgres` with no role timeout. So the
-- work moves there, and the function tells the two callers apart by asking how
-- much time it actually has.
--
-- The function body created here was replaced within the hour by
-- 20260819014119_remove_ambiguous_default_from_refresh_cards_unique.sql, which
-- carries the final version. What survives from this migration is the state
-- table and the cron schedule.

create table if not exists public.cards_unique_refresh_state (
  id                    boolean primary key default true check (id),
  requested_at          timestamptz,
  refreshed_at          timestamptz,
  last_source_change    timestamptz,
  last_duration_ms      integer,
  constraint cards_unique_refresh_state_singleton check (id)
);

insert into public.cards_unique_refresh_state (id) values (true) on conflict (id) do nothing;

alter table public.cards_unique_refresh_state enable row level security;
revoke all on public.cards_unique_refresh_state from anon, authenticated;

comment on table public.cards_unique_refresh_state is
  'When cards_unique was last rebuilt and whether one is outstanding. Written by refresh_cards_unique().';

-- Every 15 minutes rather than once at 06:30. The function is cheap when there
-- is nothing to do and refuses to run during a sync, so a frequent tick costs
-- almost nothing and means a finished sync is visible in search within fifteen
-- minutes instead of the next morning.
select cron.unschedule('cards-unique-refresh');
select cron.schedule(
  'cards-unique-refresh',
  '*/15 * * * *',
  $cron$ select public.refresh_cards_unique(); $cron$
);
