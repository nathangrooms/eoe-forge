-- ============================================================================
-- Hardening for 20260819190000_data_pipeline_scheduler.sql, from review.
--
-- Four defects, all of them cases where the pipeline reports success it has not
-- earned or damages work it does not own.
--
-- 1. The guard that stops the tier 1 top-up from wiping the bulk sweep's
--    staging table only looked for a sweep running on TODAY'S date. A sweep
--    that started at 23:55 and is still streaming at 00:05 carries yesterday's
--    date, so the guard missed it and the next line was an unconditional
--    `delete from price_sweep_stage`. That is the same collision that already
--    killed a sweep at 02:40 on 2026-08-19, reached by a different route. The
--    date is now dropped from the guard: any running sweep blocks this.
--
-- 2. Once a day's run was marked succeeded, the tick refused to do anything
--    else that day. But the runner still asserts full tier 1 coverage
--    afterwards, and tier 1 is a live view: add a card to a collection at 07:00
--    and the 06:20 run's assertion is now false, with no call that can repair
--    it before midnight. A re-run failed loudly and permanently. The short
--    circuit now checks real coverage rather than the run's own status word, so
--    a finished day is still free to re-run and a day that has since gone short
--    repairs itself.
--
-- 3. The watchdog could not see the failure it was built for. `scryfall-cards`
--    was called healthy on `last_sync` alone, so a sync that terminates early
--    every night, touching the row and leaving the catalogue at 43,361 of
--    96,732, reported ok forever. That is precisely the shape of the outage
--    that ran from January to August. Completeness is now part of the answer,
--    and so is a resume pointer left behind by a run flagged finished.
--
-- 4. The `price-bulk` probe wrote its "no sweep has ever completed" fallback
--    with coalesce() around format(). format() renders NULL as an empty string
--    and never returns NULL, so the fallback was unreachable and a database
--    with no sweep history printed a sentence with holes in it.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Is today's tier 1 guarantee actually met? One predicate, used by the tick,
-- by the safety net and by the coverage report, so the three cannot disagree
-- about what "done" means.
-- ---------------------------------------------------------------------------
create or replace function public.price_snapshot_day_complete(p_date date default current_date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not exists (
    select 1
      from (select distinct t.card_id from public.price_snapshot_tier1 t) t
      join public.cards c on c.id = t.card_id
     where c.prices is not null
       and (c.prices->>'usd'  is not null or c.prices->>'usd_foil'   is not null
         or c.prices->>'eur'  is not null or c.prices->>'eur_foil'   is not null
         or c.prices->>'tix'  is not null or c.prices->>'usd_etched' is not null)
       and not exists (
         select 1
           from public.card_price_key k
           join public.card_price_point pt
             on pt.card_key = k.card_key and pt.d = p_date
          where k.card_id = t.card_id)
  );
$$;

comment on function public.price_snapshot_day_complete(date) is
  'True when every card someone owns, wants, plays or has listed and that carries a price has a point recorded for that day. The run log is a record of what happened; this is the fact itself, and the fact wins.';


-- ---------------------------------------------------------------------------
-- One page of the tier 1 top-up. See defects 1 and 2 above for what changed.
-- ---------------------------------------------------------------------------
create or replace function public.price_snapshot_tick(
  p_batch integer default 200,
  p_date  date    default current_date
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_run     public.pipeline_runs%rowtype;
  v_from    text;
  v_to      text;
  v_scanned integer;
  v_staged  integer;
  v_done    boolean;
  v_sweep   date;
  a         record;
begin
  if p_batch is null or p_batch < 1 or p_batch > 5000 then
    raise exception 'price_snapshot_tick: p_batch must be between 1 and 5000, got %', p_batch;
  end if;

  -- The bulk sweep owns price_sweep_stage while it streams, and this function
  -- empties that table. No date filter: a sweep that began before midnight
  -- carries the previous day and is every bit as alive.
  select r.d into v_sweep
    from public.price_sweep_run r
   where r.status = 'running'
   order by r.d desc
   limit 1;
  if found then
    return jsonb_build_object('job', 'price-snapshot', 'done', false,
                              'skipped', format('the bulk price sweep for %s is running; this must follow it, not race it', v_sweep));
  end if;

  if not pg_try_advisory_xact_lock(hashtext('pipeline:price-snapshot')) then
    return jsonb_build_object('job', 'price-snapshot', 'done', false,
                              'skipped', 'another tick holds the lock');
  end if;

  insert into public.pipeline_runs (job, run_key)
  values ('price-snapshot', p_date::text)
  on conflict (job, run_key) do nothing;

  select * into v_run
    from public.pipeline_runs
   where job = 'price-snapshot' and run_key = p_date::text
     for update;

  -- Re-running a day that is genuinely covered is free. Re-running a day the
  -- log calls finished but that has since gone short reopens it, because tier 1
  -- is a live view and somebody adding a card at 07:00 must not leave the
  -- guarantee unrepairable until midnight.
  if v_run.status = 'succeeded' then
    if public.price_snapshot_day_complete(p_date) then
      return jsonb_build_object('job', 'price-snapshot', 'date', p_date, 'done', true,
                                'already_complete', true,
                                'scanned_this_tick', 0, 'written_this_tick', 0,
                                'scanned_total', v_run.scanned,
                                'written_total', v_run.written, 'ticks', v_run.ticks);
    end if;

    update public.pipeline_runs
       set status       = 'running',
           resume_after = null,
           finished_at  = null,
           heartbeat_at = now(),
           detail       = pipeline_runs.detail
                            || jsonb_build_object('reopened_at', now(),
                                                  'reopened_why', 'cards were added to tier 1 after the run finished')
     where job = 'price-snapshot' and run_key = p_date::text
     returning * into v_run;
  end if;

  -- Anything left in the stage belongs to a run that died. Not ours, not
  -- today's, and applying it would put yesterday's numbers on today's date.
  delete from public.price_sweep_stage;

  v_from := coalesce(v_run.resume_after, '');

  -- Keyset page. The ORDER BY is inside the subquery and the LIMIT applies to
  -- the ordered set. A LIMIT taken before an ORDER BY grabs an arbitrary page
  -- and silently caps coverage; that has happened in this repository.
  select count(*), max(q.card_id) into v_scanned, v_to
    from (select distinct t.card_id
            from public.price_snapshot_tier1 t
           where t.card_id > v_from
           order by t.card_id
           limit p_batch) q;

  if v_scanned = 0 then
    v_to := v_from;
  end if;

  insert into public.price_sweep_stage (card_id, usd, usd_foil, usd_etched, eur, eur_foil, tix)
  select c.id,
         round((c.prices->>'usd')::numeric        * 100)::int,
         round((c.prices->>'usd_foil')::numeric   * 100)::int,
         round((c.prices->>'usd_etched')::numeric * 100)::int,
         round((c.prices->>'eur')::numeric        * 100)::int,
         round((c.prices->>'eur_foil')::numeric   * 100)::int,
         round((c.prices->>'tix')::numeric        * 100)::int
    from public.cards c
   where c.prices is not null
     and c.id > v_from and c.id <= v_to
     and c.id in (select t.card_id from public.price_snapshot_tier1 t)
  on conflict (card_id) do nothing;

  get diagnostics v_staged = row_count;

  -- Gate wide open, heartbeat 0: every one of these earns a row today whether
  -- it moved or not. src 2 marks it as the top-up rather than the bulk sweep.
  select * into a from public.apply_price_sweep(p_date, 2::smallint, 0::numeric, 0, 0);

  delete from public.price_sweep_stage;

  v_done := v_scanned < p_batch;

  update public.pipeline_runs
     set ticks        = pipeline_runs.ticks + 1,
         scanned      = pipeline_runs.scanned + v_scanned,
         written      = pipeline_runs.written + a.rows_written,
         heartbeat_at = now(),
         -- Cleared in the same statement that marks the run succeeded.
         resume_after = case when v_done then null else v_to end,
         status       = case when v_done then 'succeeded' else 'running' end,
         finished_at  = case when v_done then now() else null end
   where job = 'price-snapshot' and run_key = p_date::text
   returning * into v_run;

  return jsonb_build_object(
    'job', 'price-snapshot', 'date', p_date, 'done', v_done, 'batch', p_batch,
    'scanned_this_tick', v_scanned, 'staged_this_tick', v_staged,
    'written_this_tick', a.rows_written, 'keys_added', a.keys_added,
    'scanned_total', v_run.scanned, 'written_total', v_run.written,
    'ticks', v_run.ticks, 'resume_after', v_run.resume_after);
end
$fn$;

comment on function public.price_snapshot_tick(integer, date) is
  'One keyset page of the tier 1 top-up: cards a user owns, wants, plays or has listed get a price recorded every day whether it moved or not. Runs AFTER the bulk sweep, never alongside it, whatever date that sweep started on. Call until done is true.';


-- ---------------------------------------------------------------------------
-- The narrow emergency. Same two corrections.
-- ---------------------------------------------------------------------------
create or replace function public.price_snapshot_safety_net(p_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_run   public.pipeline_runs%rowtype;
  v_sweep date;
  a       record;
begin
  -- Coverage, not the run's own status word. A run marked succeeded whose
  -- guarantee has since gone short is exactly what a safety net is for.
  if public.price_snapshot_day_complete(p_date) then
    return jsonb_build_object('ran', false, 'reason', 'every card somebody holds already has a price on record for today');
  end if;

  -- Same guard as the tick, and for the same reason: this empties a table the
  -- bulk sweep owns while it streams, and the sweep does not take the advisory
  -- lock, so the lock alone would not see it. No date filter.
  select r.d into v_sweep
    from public.price_sweep_run r
   where r.status = 'running'
   order by r.d desc
   limit 1;
  if found then
    return jsonb_build_object('ran', false,
                              'reason', format('the bulk price sweep for %s is running', v_sweep));
  end if;

  if not pg_try_advisory_xact_lock(hashtext('pipeline:price-snapshot')) then
    return jsonb_build_object('ran', false, 'reason', 'another price run holds the lock');
  end if;

  delete from public.price_sweep_stage;

  insert into public.price_sweep_stage (card_id, usd, usd_foil, usd_etched, eur, eur_foil, tix)
  select c.id,
         round((c.prices->>'usd')::numeric        * 100)::int,
         round((c.prices->>'usd_foil')::numeric   * 100)::int,
         round((c.prices->>'usd_etched')::numeric * 100)::int,
         round((c.prices->>'eur')::numeric        * 100)::int,
         round((c.prices->>'eur_foil')::numeric   * 100)::int,
         round((c.prices->>'tix')::numeric        * 100)::int
    from public.cards c
   where c.prices is not null
     and c.id in (select t.card_id from public.price_snapshot_tier1 t)
  on conflict (card_id) do nothing;

  select * into a from public.apply_price_sweep(p_date, 2::smallint, 0::numeric, 0, 0);
  delete from public.price_sweep_stage;

  -- The run log should agree with what just happened, or the watchdog reads a
  -- stale word and the next tick reopens a day that is already covered.
  insert into public.pipeline_runs (job, run_key, status, finished_at, heartbeat_at, written, ticks, detail)
  values ('price-snapshot', p_date::text, 'succeeded', now(), now(), a.rows_written, 1,
          jsonb_build_object('source', 'safety net'))
  on conflict (job, run_key) do update set
    status       = 'succeeded',
    finished_at  = now(),
    heartbeat_at = now(),
    resume_after = null,
    written      = pipeline_runs.written + a.rows_written,
    ticks        = pipeline_runs.ticks + 1,
    detail       = pipeline_runs.detail || jsonb_build_object('safety_net_rows', a.rows_written);

  insert into public.dev_logs (level, event, detail, meta)
  values ('warn', 'price snapshot safety net fired',
          format('The scheduled price run had not covered every held card. Captured %s cards that a user owns, wants, plays or has listed.', a.rows_written),
          jsonb_build_object('rows', a.rows_written, 'date', p_date));

  return jsonb_build_object('ran', true, 'tier1_rows', a.rows_written, 'date', p_date);
end
$fn$;


-- ---------------------------------------------------------------------------
-- The watchdog. See defects 3 and 4 above.
-- ---------------------------------------------------------------------------
create or replace function public.pipeline_health()
returns table (
  job           text,
  watched       boolean,
  ok            boolean,
  last_success  timestamptz,
  age_hours     numeric,
  max_age_hours numeric,
  detail        text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  j          record;
  v_last     timestamptz;
  v_note     text;
  v_ok       boolean;
  v_age      numeric;
  s          public.sync_status%rowtype;
  u          public.cards_unique_refresh_state%rowtype;
  b          public.price_sweep_run%rowtype;
  v_stale    numeric;
  v_pointer  boolean;
begin
  for j in select * from public.pipeline_jobs order by pipeline_jobs.job loop
    v_last := null;
    v_note := '';
    v_ok   := null;

    if j.job = 'scryfall-cards' then
      select * into s from public.sync_status where id = 'scryfall_cards';
      if not found then
        v_note := 'no sync_status row for scryfall_cards';
      else
        v_last := s.last_sync;
        v_stale := extract(epoch from (now() - coalesce(s.last_sync, now() - interval '1 day'))) / 60;
        v_note := format('status=%s, %s of %s cards, idle %s min',
                         s.status, s.records_processed, s.total_records, round(v_stale, 1));

        -- The resume pointer lives as JSON inside error_message. A pointer left
        -- behind by a run flagged finished is the bug that froze this sync for
        -- six months, so it is read here rather than assumed absent.
        begin
          v_pointer := (s.error_message is not null)
                   and ((s.error_message)::jsonb ? 'next_page_url')
                   and ((s.error_message)::jsonb ->> 'next_page_url') is not null;
        exception when others then
          v_pointer := false;
        end;

        if s.status = 'running' then
          -- A pass in flight is healthy while it is still moving. Thirty
          -- minutes without progress is a stall, and the resume job should
          -- already have caught it.
          v_ok := v_stale <= 30;
          if not v_ok then
            v_note := v_note || '. Mid run and not moving. Resume it.';
          end if;

        -- Not running. Freshness alone is not enough: a pass that terminates
        -- early every night touches last_sync and leaves the catalogue half
        -- built, which is what actually happened here between January and
        -- August. Ask whether the catalogue is complete, not whether the row
        -- was touched.
        elsif s.total_records > 0 and s.records_processed < s.total_records then
          v_ok := false;
          v_note := v_note || format(
            '. The catalogue is incomplete and nothing is running: %s of %s printings, %s short. Every deck suggestion and power score is computed against this table.',
            s.records_processed, s.total_records, s.total_records - s.records_processed);

        elsif v_pointer then
          v_ok := false;
          v_note := v_note || '. Flagged finished but still holding a resume pointer, so the last pass stopped part way. Resume it.';

        elsif s.total_records = 0 then
          v_ok := false;
          v_note := v_note || '. The row reports a total of zero printings, so completeness cannot be judged.';
        end if;
      end if;

    elsif j.job = 'price-bulk' then
      -- The bulk sweep keeps a perfectly good log of its own. Read that rather
      -- than requiring it to write a heartbeat: a watchdog that needs the
      -- watched thing to cooperate goes quiet exactly when that thing breaks.
      select * into b from public.price_sweep_run r
       where r.status = 'done' order by r.d desc limit 1;
      if not found then
        -- format() prints NULL as an empty string and never returns NULL, so
        -- this cannot be a coalesce around the line below.
        v_note := 'no sweep has ever completed';
      else
        v_last := b.finished_at;
        v_note := format('last complete sweep %s, %s cards seen, %s prices recorded',
                         b.d, b.cards_seen, b.rows_written);
      end if;
      -- A failure today is worth saying out loud even while an older sweep is
      -- still inside the window.
      if exists (select 1 from public.price_sweep_run r
                  where r.d = current_date and r.status = 'failed') then
        v_ok := false;
        v_note := v_note || format('. Today failed: %s',
          coalesce((select left(r.error, 160) from public.price_sweep_run r
                     where r.d = current_date), 'no reason recorded'));
      end if;

    elsif j.job = 'cards-unique' then
      select * into u from public.cards_unique_refresh_state;
      v_last := u.refreshed_at;
      v_note := format('requested %s, refreshed %s',
                       coalesce(u.requested_at::text, 'never'),
                       coalesce(u.refreshed_at::text, 'never'));

    elsif j.job = 'collection-value' then
      select max(cvh.created_at) into v_last from public.collection_value_history cvh;
      v_note := format('%s snapshot rows, latest day %s',
                       (select count(*) from public.collection_value_history),
                       coalesce((select max(cvh2.snapshot_date)::text from public.collection_value_history cvh2), 'never'));

    elsif j.job = 'meta-queue' then
      select max(r.finished_at) into v_last
        from public.meta_ingest_runs r where r.status = 'completed';
      v_note := format('%s items still queued',
                       (select count(*) from public.meta_fetch_queue));

    elsif j.job = 'scryfall-sets' then
      select ss.last_sync into v_last from public.sync_status ss where ss.id = 'scryfall_sets';
      v_note := 'no sets sync exists yet';

    elsif j.job = 'price-snapshot' then
      select r.finished_at, format('%s rows written across %s ticks', r.written, r.ticks)
        into v_last, v_note
        from public.pipeline_runs r
       where r.job = j.job and r.status = 'succeeded'
       order by r.finished_at desc
       limit 1;
      if v_last is null then
        v_note := 'has never completed';

      -- Only once today's run claims to have finished. Before that, an
      -- uncovered day is simply a day whose run has not happened yet, and an
      -- alarm that cries every night between midnight and 06:20 is an alarm
      -- people learn to ignore. But a run that says succeeded while cards
      -- somebody holds have no point for today is the log lying, which is the
      -- one thing this function exists to catch.
      elsif exists (select 1 from public.pipeline_runs r
                     where r.job = 'price-snapshot'
                       and r.run_key = current_date::text
                       and r.status = 'succeeded')
        and not public.price_snapshot_day_complete(current_date) then
        v_ok := false;
        v_note := coalesce(v_note, '') ||
          '. The run log says today finished, but cards somebody owns, wants, plays or has listed still have no price on record for today.';
      end if;

    else
      select r.finished_at, format('%s rows written across %s ticks', r.written, r.ticks)
        into v_last, v_note
        from public.pipeline_runs r
       where r.job = j.job and r.status = 'succeeded'
       order by r.finished_at desc
       limit 1;
      if v_last is null then v_note := coalesce(v_note, 'has never completed'); end if;
    end if;

    v_age := case when v_last is null then null
                  else round(extract(epoch from (now() - v_last)) / 3600.0, 2) end;

    if v_age is not null and v_age < 0 then
      v_ok   := false;
      v_note := v_note || format(' [probe reports a future timestamp (%s h ahead); treat as unknown]', abs(v_age));
    end if;

    pipeline_health.job           := j.job;
    pipeline_health.watched       := j.watched;
    pipeline_health.last_success  := v_last;
    pipeline_health.age_hours     := v_age;
    pipeline_health.max_age_hours := j.max_age_hours;
    pipeline_health.ok            := coalesce(v_ok, v_age is not null and v_age >= 0 and v_age <= j.max_age_hours);
    pipeline_health.detail        := coalesce(nullif(v_note, ''), j.purpose);
    return next;
  end loop;
end
$fn$;

comment on function public.pipeline_health() is
  'One row per scheduled job: when it last succeeded, how stale that is, and whether it is inside its window. Each job is probed at its own source of truth, and completeness counts, not just freshness. The GitHub watchdog fails when any watched job returns ok = false.';


-- ---------------------------------------------------------------------------
-- Locks, for the one new function.
-- ---------------------------------------------------------------------------
revoke all on function public.price_snapshot_day_complete(date) from public, anon, authenticated;
grant execute on function public.price_snapshot_day_complete(date) to service_role, postgres;
