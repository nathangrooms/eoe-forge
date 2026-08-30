-- ============================================================================
-- Reconciling the repo with what was applied, 30 Aug 2026.
--
-- CLAUDE.md's rule is "apply migrations by writing the file first and applying
-- that exact file, so one version number exists rather than two". Tonight's
-- engine work drifted from it: several objects were applied through the
-- Supabase MCP tool without a matching file, and one index was created with a
-- bare `execute_sql` and so has no migration record at all.
--
-- Applied and recorded in the database, with no file until now:
--
--   20260830050416  cards_unique_facets_computed_column
--   20260830051058  facets_computed_column_reads_the_memo_as_owner
--   20260830055002  refresh_cards_pool_with_cards_unique
--   20260830060419  refresh_cannot_vacuum_inside_a_function
--   20260830061157  the_view_refresh_has_been_failing_every_night
--
-- Applied with no migration record of any kind:
--
--   cards_unique_identity_rank_id_idx
--
-- Every statement below is idempotent, so re-running it is harmless, and it
-- states the FINAL shape of each object rather than replaying the sequence. The
-- history is in the commit messages; what matters here is that a fresh database
-- built from this directory ends up where the live one is.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The facets computed column.
--
-- PostgREST turns a function whose single argument is a table type into a
-- selectable column, so the pool can ask for `facets` in the same request that
-- fetches the pool. SECURITY DEFINER because a computed column runs as the
-- CALLER and `card_facet_memo` is service-role only: without it every generate
-- returned `42501 permission denied` in under half a second. `search_path` is
-- pinned, which the security advisor checks by name.
--
-- Pinned to compiler_version 1. Bump this, `facet-memo-fill`'s
-- COMPILER_VERSION, and the `cards_pool` join together, then refill and
-- refresh. A reader on one version and a writer on another is silent: every
-- card reads as having no facets, which the ranker cannot tell apart from a
-- card that genuinely does nothing.
-- ---------------------------------------------------------------------------
create or replace function public.facets(public.cards_unique)
returns text[]
language sql
stable
parallel safe
security definer
set search_path = public, pg_temp
as $$
  select m.facets
  from public.card_facet_memo m
  where m.oracle_id = $1.oracle_id
    and m.compiler_version = 1
$$;

grant execute on function public.facets(public.cards_unique) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- An index that can serve colour identity and rank together.
--
-- Created outside a migration while measuring, so it existed in the live
-- database and nowhere else. It is what lets a pool filtered by colour be
-- walked in popularity order rather than sorted.
-- ---------------------------------------------------------------------------
create index if not exists cards_unique_identity_rank_id_idx
  on public.cards_unique (color_identity, edhrec_rank, id)
  where (legalities ->> 'commander') = 'legal' and edhrec_rank is not null;

-- ---------------------------------------------------------------------------
-- The refresh, in its final shape.
--
-- Three things it learned tonight, each of which broke it once:
--
--   1. `cards_pool` is derived from `cards_unique`, so the two refresh together
--      or they describe different days and nothing says which.
--   2. VACUUM CANNOT RUN INSIDE A FUNCTION. Putting it here raised 25001 and
--      rolled the whole refresh back, the same shape as the sync watchdog whose
--      `format()` threw after its work and undid it. It lives in its own cron
--      job now.
--   3. THE JOB WAS BEING GIVEN TWO MINUTES FOR NINE AND A HALF MINUTES OF WORK,
--      so it had been failing on every run since at least 28 Aug, silently,
--      because a failed cron job writes only to `cron.job_run_details`. Every
--      change to `cards` in that window was invisible to search, commander
--      selection, suggestions, the pool, the optimiser and Tutor.
--
-- The timeout is BOUNDED, not zero. CLAUDE.md forbids `statement_timeout = 0`
-- in a scheduled job by name.
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

  if not p_force and v_timeout_ms > 0 and v_timeout_ms < 60000 then
    update public.cards_unique_refresh_state set requested_at = now() where id;
    return format(
      'refresh requested; this caller has only %s ms and the rebuild needs minutes. '
      || 'cards-unique-refresh will do it on its next tick.', v_timeout_ms);
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

  perform set_config('statement_timeout', '20min', true);

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
-- The vacuum, in its own transaction because it cannot be in anyone else's.
--
-- A materialized view has no visibility map immediately after a refresh, so
-- every index-only scan falls back to the heap. `cards_unique` had NEVER been
-- vacuumed (`last_vacuum` was NULL) because autovacuum does not visit a matview
-- on refresh: an index-only scan reported `Heap Fetches: 31762`, and the first
-- VACUUM took the mono-red pool page from 7-12 s to 2.9 s.
--
-- An hour after each refresh window, which is comfortably longer than the
-- 575 s the refresh takes.
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('cards-views-vacuum');
exception when others then
  -- Not scheduled yet, which is the normal case on a fresh database.
  null;
end $$;

select cron.schedule(
  'cards-views-vacuum',
  '0 7,13 * * *',
  $cron$set statement_timeout = '20min'; vacuum (analyze) public.cards_unique; vacuum (analyze) public.cards_pool;$cron$
);
