-- ============================================================================
-- The refresh could never have rescued itself, and the vacuum job could never
-- have run. 30 Aug 2026.
--
-- Two hours after "the view refresh has been failing every night" was
-- diagnosed and fixed, it failed again, at 06:00, after exactly 120 seconds.
-- The fix was wrong in a way that reads as right, which is the third time this
-- project has shipped one of those.
--
-- MEASURED, not reasoned:
--
--   set statement_timeout = '2s';
--   do $$ begin
--     perform set_config('statement_timeout','30s',true);
--     perform pg_sleep(5);
--   end $$;
--   -- ERROR: 57014 canceling statement due to statement timeout
--
-- `statement_timeout` is armed when the TOP-LEVEL statement begins and is
-- never re-armed. A function that raises it raises it for the NEXT statement,
-- not for itself. So `perform set_config('statement_timeout','20min',true)`
-- inside `refresh_cards_unique` was dead code that looked exactly like the
-- fix, and the rebuild kept dying at the cluster default of 120 seconds
-- against the 575 seconds it needs.
--
-- The timeout has to be set by the CALLER, in its own statement, before the
-- one that needs it. That is what pg_cron's command string is for.
--
-- And the second one, from the same session's own migration:
--
--   set statement_timeout = '20min'; vacuum (analyze) public.cards_pool;
--   -- ERROR: 25001 VACUUM cannot run inside a transaction block
--
-- A pg_cron command holding more than one statement is a single simple query,
-- and a multi-statement simple query IS an implicit transaction block. So
-- moving VACUUM out of a function and into a two-statement cron command moved
-- it from one transaction into another. `cards-views-vacuum` was created at
-- 06:04 and had not yet reached its 07:00 slot; it would have failed on every
-- run for the same reason the function did.
--
-- VACUUM therefore gets its own job per view, each ONE statement, running at
-- the 120 s default. Measured just now: both finish well inside it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The refresh, with the dead line removed and the guard made loud.
--
-- The old guard let anything above 60 s through, which is how a 120 s cron
-- session walked past it into a rebuild needing 575 s. There are three bands
-- now, and the middle one is the point:
--
--   under 60 s    a PostgREST caller (anon 3 s, authenticated 8 s). Record the
--                 request and return; the scheduled job does the work.
--   under 15 min  a caller that MEANT to do the work and has not been given
--                 enough time. RAISE, so it fails with a sentence saying what
--                 to do rather than a generic 57014 nine minutes from now.
--   otherwise     do it.
--
-- The middle band would have caught tonight's bug on its first run.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_cards_unique(p_force boolean)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_started    timestamptz := clock_timestamp();
  v_timeout_ms integer;
  v_rows       bigint;
  v_state      public.cards_unique_refresh_state;
  v_newest     timestamptz;
  v_syncing    boolean;
  v_ms         integer;
begin
  select * into v_state from public.cards_unique_refresh_state where id;

  begin
    v_timeout_ms := (current_setting('statement_timeout'))::integer;
  exception when others then
    v_timeout_ms := (extract(epoch from current_setting('statement_timeout')::interval) * 1000)::integer;
  end;

  -- A short caller cannot do this and should not try.
  if not p_force and v_timeout_ms > 0 and v_timeout_ms < 60000 then
    update public.cards_unique_refresh_state set requested_at = now() where id;
    return format(
      'refresh requested; this caller has only %s ms and the rebuild needs about 10 minutes. '
      || 'cards-unique-refresh will do it on its next tick.', v_timeout_ms);
  end if;

  -- A caller that means to do the work but has not been given enough time.
  -- This function CANNOT raise its own timeout, so the only honest answer is
  -- to refuse in a way somebody reads.
  if v_timeout_ms > 0 and v_timeout_ms < 900000 then
    raise exception
      'refresh_cards_unique needs about 575 s and this session allows % ms. '
      'A function cannot raise its own statement_timeout: the timer is armed '
      'when the top-level statement starts. Set it in the CALLER first, e.g. '
      '"set statement_timeout = ''20min''; select public.refresh_cards_unique();"',
      v_timeout_ms
      using errcode = '55000';
  end if;

  select (status = 'running') into v_syncing
  from public.sync_status where id = 'scryfall_cards';

  if not p_force and coalesce(v_syncing, false) then
    return 'skipped: catalogue sync in progress, will refresh when it finishes';
  end if;

  select max(updated_at) into v_newest from public.cards;
  if not p_force
     and v_state.requested_at is null
     and v_state.refreshed_at is not null
     and v_state.last_source_change is not null
     and v_newest is not null
     and v_newest <= v_state.last_source_change
  then
    return format('cards_unique already current as of %s', v_state.refreshed_at);
  end if;

  -- `cards_pool` is derived from `cards_unique`, so the two refresh together or
  -- they describe different days and nothing says which.
  refresh materialized view concurrently public.cards_unique;
  refresh materialized view concurrently public.cards_pool;

  select count(*) into v_rows from public.cards_unique;
  v_ms := round(extract(epoch from clock_timestamp() - v_started) * 1000);

  update public.cards_unique_refresh_state
     set refreshed_at = now(),
         last_source_change = v_newest,
         last_duration_ms = v_ms,
         requested_at = null
   where id;

  return format('cards_unique and cards_pool refreshed: %s rows in %s ms', v_rows, v_ms);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. The scheduled refresh, given the time it needs by the only thing that can
--    give it: the statement before it.
--
-- The timeout is BOUNDED. CLAUDE.md forbids `statement_timeout = 0` in a
-- scheduled job by name, because a query with no timeout holds its connection
-- indefinitely and took this app down once already.
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('cards-unique-refresh');
exception when others then
  null;
end $$;

select cron.schedule(
  'cards-unique-refresh',
  '0 6,12 * * *',
  $cron$set statement_timeout = '20min'; select public.refresh_cards_unique(false);$cron$
);

-- ---------------------------------------------------------------------------
-- 3. The vacuums, one statement each because VACUUM refuses to share.
--
-- A materialized view has no visibility map after a refresh, so every
-- index-only scan falls back to the heap. `cards_unique` had NEVER been
-- vacuumed, because autovacuum does not visit a matview on refresh: an
-- index-only scan reported `Heap Fetches: 31762`, and the first VACUUM took the
-- mono-red pool page from 7-12 s to 2.9 s.
--
-- No `set statement_timeout` here, and that is deliberate rather than an
-- oversight: adding it is exactly what made this a transaction block. Both
-- finish inside the 120 s default, measured 30 Aug. If one stops fitting, the
-- answer is a role setting, not a second statement.
--
-- An hour after each refresh window, comfortably past the 575 s it takes.
-- ---------------------------------------------------------------------------
do $$
declare
  v_name text;
begin
  foreach v_name in array array['cards-views-vacuum', 'cards-unique-vacuum', 'cards-pool-vacuum'] loop
    begin
      perform cron.unschedule(v_name);
    exception when others then
      null;
    end;
  end loop;
end $$;

select cron.schedule('cards-unique-vacuum', '0 7,13 * * *',
  $cron$vacuum (analyze) public.cards_unique;$cron$);

select cron.schedule('cards-pool-vacuum', '5 7,13 * * *',
  $cron$vacuum (analyze) public.cards_pool;$cron$);
