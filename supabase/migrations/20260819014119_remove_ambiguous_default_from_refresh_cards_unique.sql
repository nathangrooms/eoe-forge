-- `refresh_cards_unique()` and `refresh_cards_unique(boolean default false)`
-- both answer a no-argument call, and Postgres refuses to choose:
--
--   ERROR: function public.refresh_cards_unique() is not unique
--
-- That is not a cosmetic clash. The deployed edge function calls
-- `rpc('refresh_cards_unique')` with no arguments, so the ambiguity would have
-- failed the sync's completion path on every run.
--
-- Dropping the default leaves two signatures that cannot be confused: the
-- no-argument one every caller uses, and an explicit `(true)` for the rare
-- "rebuild it now whatever the state says".
drop function if exists public.refresh_cards_unique(boolean);

create or replace function public.refresh_cards_unique(p_force boolean)
returns text
language plpgsql
security definer
set search_path = public
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

  -- current_setting returns a string like '8s' or '0'. 0 means no limit.
  begin
    v_timeout_ms := (current_setting('statement_timeout'))::integer;
  exception when others then
    -- Units attached, e.g. '8s'. Parse through interval, which understands them.
    v_timeout_ms := (extract(epoch from current_setting('statement_timeout')::interval) * 1000)::integer;
  end;

  -- A caller with eight seconds cannot do minutes of work. Record that a
  -- rebuild is due and let the cron tick, which has no timeout, do it.
  if not p_force and v_timeout_ms > 0 and v_timeout_ms < 60000 then
    update public.cards_unique_refresh_state set requested_at = now() where id;
    return format(
      'refresh requested; this caller has only %s ms and the rebuild needs minutes. '
      || 'cards-unique-refresh will do it on its next tick.', v_timeout_ms);
  end if;

  -- Refreshing while a sync is mid-flight rebuilds a view of a half-written
  -- catalogue, at the moment the database is busiest, and it will be wrong
  -- again within the minute. Wait for the run to end; the sync requests a
  -- refresh when it completes.
  select (status = 'running') into v_syncing
  from public.sync_status where id = 'scryfall_cards';

  if not p_force and coalesce(v_syncing, false) then
    return 'skipped: catalogue sync in progress, will refresh when it finishes';
  end if;

  -- Nothing to do if the catalogue has not moved since the last rebuild, and
  -- nobody has asked for one. The sync rewrites `cards` nightly whether or not
  -- anything changed, so this is checked against updated_at rather than assumed.
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

  refresh materialized view concurrently public.cards_unique;

  select count(*) into v_rows from public.cards_unique;
  v_ms := round(extract(epoch from clock_timestamp() - v_started) * 1000);

  update public.cards_unique_refresh_state
     set refreshed_at = now(),
         last_source_change = v_newest,
         last_duration_ms = v_ms,
         requested_at = null
   where id;

  return format('cards_unique refreshed: %s rows in %s ms', v_rows, v_ms);
end;
$fn$;

create or replace function public.refresh_cards_unique()
returns text
language sql
security definer
set search_path = public
as $fn$ select public.refresh_cards_unique(false); $fn$;

revoke all on function public.refresh_cards_unique(boolean) from public, anon, authenticated;
revoke all on function public.refresh_cards_unique() from public, anon, authenticated;
grant execute on function public.refresh_cards_unique(boolean) to service_role;
grant execute on function public.refresh_cards_unique() to service_role;
