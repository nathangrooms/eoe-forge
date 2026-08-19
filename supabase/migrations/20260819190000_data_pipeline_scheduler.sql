-- ============================================================================
-- The data pipeline: a job registry, a resumable run log, a coverage policy for
-- price snapshots, and a watchdog.
--
-- WHY THIS EXISTS
--
-- This project has already lost six months to a job that stopped and told
-- nobody. cron.job_run_details for the daily price capture reads: succeeded
-- every morning to 2026-02-20, then nothing at all until 2026-08-18. Over the
-- same stretch the card catalogue froze on 2026-01-31 while every deck
-- suggestion and power score kept being computed against it. There WAS a
-- watchdog; it called format() with a '%.1f' specifier, which Postgres does not
-- accept, so it threw on every run it ever made, and because the resume call
-- sat before the throwing line the exception rolled the resume back. The
-- watchdog was not merely silent, it undid its own work.
--
-- Silence is the failure mode here, not breakage. So: every scheduled job is
-- registered in one table, every job declares how stale it may get, and one
-- function answers "is anything overdue" in words. GitHub Actions drives the
-- work, because a run list, a failure email and a re-run button all live there
-- and none of them live in a Postgres background worker.
--
-- DEPENDS ON 20260819150000_lean_price_history.sql, which owns how a price is
-- stored and written (card_price_key, card_price_point, card_price_last,
-- apply_price_sweep, card_price_series). Nothing here writes a price point
-- directly. There is one writer.
--
-- Companion document: docs/overhaul/DATA-PIPELINE.md
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. The registry. A job that is not in here is a job nobody is watching, so
--    adding a row is the same act as putting it under the alarm.
-- ---------------------------------------------------------------------------
create table if not exists public.pipeline_jobs (
  job            text primary key,
  purpose        text        not null,
  cadence        text        not null,
  max_age_hours  numeric     not null,
  watched        boolean     not null default true,
  note           text
);

comment on table public.pipeline_jobs is
  'Every scheduled data job, and how stale each is allowed to get before the watchdog fails.';
comment on column public.pipeline_jobs.watched is
  'false means the watchdog reports it but never fails on it. For jobs that have never run and would otherwise hold the alarm permanently red.';

alter table public.pipeline_jobs enable row level security;


-- ---------------------------------------------------------------------------
-- 2. The run log, including the resume pointer.
-- ---------------------------------------------------------------------------
create table if not exists public.pipeline_runs (
  job          text        not null references public.pipeline_jobs(job) on delete cascade,
  run_key      text        not null,
  status       text        not null default 'running'
                 check (status in ('running', 'succeeded', 'failed')),
  resume_after text,
  ticks        integer     not null default 0,
  scanned      integer     not null default 0,
  written      integer     not null default 0,
  started_at   timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  finished_at  timestamptz,
  detail       jsonb       not null default '{}'::jsonb,
  primary key (job, run_key)
);

create index if not exists idx_pipeline_runs_job_finished
  on public.pipeline_runs (job, finished_at desc nulls last);

comment on column public.pipeline_runs.resume_after is
  'Highest cards.id processed so far. NULL when the run is not in progress. Cleared in the same statement that marks the run succeeded: a pointer left behind after completion is why an earlier sync restarted mid catalogue.';

alter table public.pipeline_runs enable row level security;

drop policy if exists "Admins can read pipeline jobs" on public.pipeline_jobs;
create policy "Admins can read pipeline jobs"
  on public.pipeline_jobs for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "Admins can read pipeline runs" on public.pipeline_runs;
create policy "Admins can read pipeline runs"
  on public.pipeline_runs for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "Service role manages pipeline jobs" on public.pipeline_jobs;
create policy "Service role manages pipeline jobs"
  on public.pipeline_jobs for all to service_role using (true) with check (true);

drop policy if exists "Service role manages pipeline runs" on public.pipeline_runs;
create policy "Service role manages pipeline runs"
  on public.pipeline_runs for all to service_role using (true) with check (true);

revoke all on public.pipeline_jobs from anon;
revoke all on public.pipeline_runs from anon;


-- ---------------------------------------------------------------------------
-- 3. Every job this app needs, its window, and who drives it.
-- ---------------------------------------------------------------------------
insert into public.pipeline_jobs (job, purpose, cadence, max_age_hours, watched, note) values
  ('price-snapshot',
   'A price recorded every day for every card a user owns, wants, plays or has listed. The rest of the catalogue is covered by the bulk sweep in the same workflow, on movement.',
   'daily 06:20 UTC', 30, true,
   'GitHub Actions prices-daily.yml, after scripts/prices/daily-sweep.mjs. The pg_cron job price-tier1-safety-net repeats it at 11:00 UTC only if that failed.'),

  ('collection-value',
   'Daily total value of every user collection into collection_value_history.',
   'daily after prices', 30, true,
   'GitHub Actions prices-daily.yml calls the capture-collection-value function. Held 3 rows total before this; it had never been scheduled.'),

  ('scryfall-cards',
   'Full Scryfall catalogue into cards. Every printing, resumable across pages.',
   'daily 03:15 UTC', 36, true,
   'Owned by supabase/functions/scryfall-sync. GitHub Actions cards-nightly.yml supervises rather than triggers: there is one resume pointer and two passes would fight over it.'),

  ('cards-unique',
   'Rebuild the cards_unique materialized view so search and suggestions see new cards.',
   'every 15 minutes', 6, true,
   'pg_cron job cards-unique-refresh. Refuses to run mid sync on purpose, so it is expected to go overdue during a long catalogue pass.'),

  ('meta-queue',
   'Drain meta_fetch_queue: Commander Spellbook combos and MTGJSON decks.',
   'every minute', 72, true,
   'pg_cron jobs meta-drain-spellbook and meta-drain-mtgjson. Watched on ingest run completion, not on the tick.'),

  ('scryfall-sets',
   'Set metadata from Scryfall.',
   'not scheduled', 168, false,
   'sync_status.scryfall_sets has never run and no function populates it. Unwatched so it does not hold the alarm red. A real gap, listed in DATA-PIPELINE.md section 8.')
on conflict (job) do update set
  purpose       = excluded.purpose,
  cadence       = excluded.cadence,
  max_age_hours = excluded.max_age_hours,
  watched       = excluded.watched,
  note          = excluded.note;


-- ---------------------------------------------------------------------------
-- 4. The coverage policy, as code.
--
--    Tier 1 is every card any user owns, wants, has in a deck, or has listed
--    for sale. They get a row every single day, movement or not, with no cap
--    and no price threshold, because these are the only numbers this product
--    ever quotes back at a person. A gap in the chart of a card nobody owns is
--    cosmetic. A gap in the chart of a card somebody owns is the product
--    failing at its one job.
--
--    Everything else gets a row the first time it is seen, and after that only
--    when a price actually moved. A missing day means unchanged. It never
--    means zero, and the read path (card_price_series) is what keeps that true.
-- ---------------------------------------------------------------------------
create or replace view public.price_snapshot_tier1
with (security_invoker = true) as
  select card_id from public.user_collections where card_id is not null
  union
  select card_id from public.wishlist         where card_id is not null
  union
  select card_id from public.deck_cards       where card_id is not null
  union
  select card_id from public.listings         where card_id is not null;

comment on view public.price_snapshot_tier1 is
  'Cards someone owns, wants, plays or has listed. A price is recorded for these every day, unconditionally. security_invoker so a logged in reader sees only their own rows; the snapshot runs as postgres and sees all of them.';

revoke all on public.price_snapshot_tier1 from anon;


-- ---------------------------------------------------------------------------
-- 5. One page of the tier 1 top-up.
--
--    THIS IS NOT THE DAILY SWEEP. scripts/prices/daily-sweep.mjs is, and it
--    runs first: it streams Scryfall's bulk file and records every printing
--    whose price moved. Both write through apply_price_sweep, so there is one
--    definition of a price move and one writer.
--
--    An earlier version of this function walked the whole catalogue through
--    price_sweep_stage as well, which was a duplicate sweep, and the two
--    collided for real rather than in theory: at 02:40:37 on 2026-08-19 the
--    bulk sweep failed with
--
--      staging 4000 rows at line 4657: canceling statement due to lock timeout (55P03)
--
--    because this function held a lock on the staging table. The catalogue
--    phase was removed the same hour.
--
--    What the bulk sweep cannot give is a daily row for a card somebody
--    actually holds: its gate treats every card the same, so an owned card
--    whose price is flat gets no point for up to a month. That guarantee is the
--    whole job of this function.
--
--    Pages exist because PostgREST arms an 8 second statement timeout on every
--    request and it cannot be widened from inside a function: the timer is
--    armed when the calling statement starts, so a later SET never re-arms it.
--    Pages buy real resumability as a side effect, because every page commits.
--    Proved by accident and then kept: a page that hit the timeout rolled back
--    whole and left the resume pointer exactly where it was.
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
  a         record;
begin
  if p_batch is null or p_batch < 1 or p_batch > 5000 then
    raise exception 'price_snapshot_tick: p_batch must be between 1 and 5000, got %', p_batch;
  end if;

  -- The bulk sweep owns price_sweep_stage while it streams. Waiting on it would
  -- burn the request's whole timeout; taking the lock from under it breaks it.
  -- Its own run row is the signal, and this function never writes to that table.
  if exists (select 1 from public.price_sweep_run r
              where r.d = p_date and r.status = 'running') then
    return jsonb_build_object('job', 'price-snapshot', 'done', false,
                              'skipped', 'the bulk price sweep is running; this must follow it, not race it');
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

  -- Re-running a finished day is free, not a second pass.
  if v_run.status = 'succeeded' then
    return jsonb_build_object('job', 'price-snapshot', 'date', p_date, 'done', true,
                              'already_complete', true,
                              'scanned_total', v_run.scanned,
                              'written_total', v_run.written, 'ticks', v_run.ticks);
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
  'One keyset page of the tier 1 top-up: cards a user owns, wants, plays or has listed get a price recorded every day whether it moved or not. Runs AFTER the bulk sweep, never alongside it. Call until done is true.';


-- ---------------------------------------------------------------------------
-- 6. Loop the tick. Two schedulers, two limits.
--
--    GitHub Actions calls the tick over HTTP, one page per request, and every
--    page commits, so a run killed at page 3 of 4 keeps its first 3.
--
--    pg_cron has no request timeout so it can run the loop in one go, with
--    statement_timeout = 0 set by the job command (the same trick
--    retag_all_cards already uses here). The cost is that the loop is one
--    transaction: if it dies the day rolls back to the last committed cursor
--    rather than keeping partial pages. That is why this is the safety net and
--    not the primary.
-- ---------------------------------------------------------------------------
create or replace function public.price_snapshot_run(
  p_batch          integer default 200,
  p_budget_seconds integer default 300,
  p_date           date    default current_date
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_deadline timestamptz := clock_timestamp() + make_interval(secs => p_budget_seconds);
  v_started  timestamptz := clock_timestamp();
  r          jsonb;
  v_ticks    integer := 0;
begin
  loop
    r := public.price_snapshot_tick(p_batch, p_date);
    v_ticks := v_ticks + 1;

    exit when coalesce((r->>'done')::boolean, false);
    exit when r ? 'skipped';
    exit when clock_timestamp() > v_deadline;
  end loop;

  return jsonb_build_object(
    'ticks_this_call', v_ticks,
    'seconds',         round(extract(epoch from (clock_timestamp() - v_started))::numeric, 1),
    'ran_out_of_time', not coalesce((r->>'done')::boolean, false) and not (r ? 'skipped'),
    'last',            r);
end
$fn$;

comment on function public.price_snapshot_run(integer, integer, date) is
  'Loop price_snapshot_tick until the day is done or the budget runs out. For pg_cron and for a person at a console.';


-- ---------------------------------------------------------------------------
-- 7. Did today actually land? The daily workflow asserts on this and fails the
--    run if a single card somebody holds is missing.
-- ---------------------------------------------------------------------------
create or replace function public.price_snapshot_coverage(p_date date default current_date)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with t1 as (
    select distinct t.card_id from public.price_snapshot_tier1 t
  ),
  t1_priced as (
    select t.card_id
      from t1 t
      join public.cards c on c.id = t.card_id
     where c.prices is not null
       and (c.prices->>'usd'  is not null or c.prices->>'usd_foil'   is not null
         or c.prices->>'eur'  is not null or c.prices->>'eur_foil'   is not null
         or c.prices->>'tix'  is not null or c.prices->>'usd_etched' is not null)
  )
  select jsonb_build_object(
    'date',                 p_date,
    'tier1_ids',            (select count(*) from t1),
    'tier1_resolvable',     (select count(*) from t1 t join public.cards c on c.id = t.card_id),
    'tier1_priced',         (select count(*) from t1_priced),
    'tier1_captured_today', (select count(*) from t1_priced p
                              join public.card_price_key k on k.card_id = p.card_id
                              join public.card_price_point pt
                                on pt.card_key = k.card_key and pt.d = p_date),
    'rows_written_today',   (select count(*) from public.card_price_point where d = p_date),
    'run',                  (select to_jsonb(r) from public.pipeline_runs r
                              where r.job = 'price-snapshot' and r.run_key = p_date::text)
  );
$$;

comment on function public.price_snapshot_coverage(date) is
  'Coverage for one day. tier1_captured_today must equal tier1_priced or the daily workflow fails.';


-- ---------------------------------------------------------------------------
-- 8. A heartbeat other jobs can write, so work that is not SQL still lands in
--    the log the watchdog reads.
-- ---------------------------------------------------------------------------
create or replace function public.pipeline_heartbeat(
  p_job    text,
  p_ok     boolean default true,
  p_detail jsonb   default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_run public.pipeline_runs%rowtype;
begin
  if not exists (select 1 from public.pipeline_jobs where job = p_job) then
    raise exception 'pipeline_heartbeat: unknown job %. Add it to pipeline_jobs first so the watchdog watches it.', p_job;
  end if;

  insert into public.pipeline_runs (job, run_key, status, finished_at, heartbeat_at, detail)
  values (p_job, current_date::text,
          case when p_ok then 'succeeded' else 'failed' end,
          case when p_ok then now() else null end,
          now(), coalesce(p_detail, '{}'::jsonb))
  on conflict (job, run_key) do update set
    status       = excluded.status,
    finished_at  = excluded.finished_at,
    heartbeat_at = now(),
    ticks        = pipeline_runs.ticks + 1,
    detail       = excluded.detail
  returning * into v_run;

  return to_jsonb(v_run);
end
$fn$;


-- ---------------------------------------------------------------------------
-- 9. The watchdog. One call, one answer, in words.
--
--    An earlier version of this function derived the collection value job's
--    freshness from max(snapshot_date) + 23:59, which is a point in the FUTURE
--    for any snapshot taken today. It reported an age of -21.67 hours and
--    called a job healthy that had not actually run since December. That is
--    precisely the class of bug this function exists to catch, so it now reads
--    a real created_at and treats any negative age as a probe fault rather than
--    as good news.
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
  j       record;
  v_last  timestamptz;
  v_note  text;
  v_ok    boolean;
  v_age   numeric;
  s       public.sync_status%rowtype;
  u       public.cards_unique_refresh_state%rowtype;
  b       public.price_sweep_run%rowtype;
  v_stale numeric;
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
        -- A pass in flight is healthy while it is still moving. Ten minutes
        -- without progress is the same stall threshold the resume job uses.
        if s.status = 'running' then
          v_ok := v_stale <= 30;
          if not v_ok then
            v_note := v_note || '. Mid run and not moving. Resume it.';
          end if;
        end if;
      end if;

    elsif j.job = 'price-bulk' then
      -- The bulk sweep keeps a perfectly good log of its own. Read that rather
      -- than requiring it to write a heartbeat: a watchdog that needs the
      -- watched thing to cooperate goes quiet exactly when that thing breaks.
      select * into b from public.price_sweep_run r
       where r.status = 'done' order by r.d desc limit 1;
      v_last := b.finished_at;
      v_note := coalesce(
        format('last complete sweep %s, %s cards seen, %s prices recorded',
               b.d, b.cards_seen, b.rows_written),
        'no sweep has ever completed');
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
  'One row per scheduled job: when it last succeeded, how stale that is, and whether it is inside its window. The GitHub watchdog fails when any watched job returns ok = false.';


-- ---------------------------------------------------------------------------
-- 10. The narrow emergency: record what the product reports on, and nothing
--     else. Used when the full sweep is failing repeatedly.
-- ---------------------------------------------------------------------------
create or replace function public.price_snapshot_safety_net(p_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_run public.pipeline_runs%rowtype;
  a     record;
begin
  select * into v_run
    from public.pipeline_runs
   where job = 'price-snapshot' and run_key = p_date::text;

  if found and v_run.status = 'succeeded' then
    return jsonb_build_object('ran', false, 'reason', 'the scheduled run already completed today');
  end if;

  -- Same guard as the tick: the bulk sweep owns the staging table while it
  -- streams, and it does not take this advisory lock, so the lock alone would
  -- not see it.
  if exists (select 1 from public.price_sweep_run r
              where r.d = p_date and r.status = 'running') then
    return jsonb_build_object('ran', false, 'reason', 'the bulk price sweep is running');
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

  insert into public.dev_logs (level, event, detail, meta)
  values ('warn', 'price snapshot safety net fired',
          format('The scheduled price run had not completed. Captured %s cards that a user owns, wants, plays or has listed.', a.rows_written),
          jsonb_build_object('rows', a.rows_written, 'date', p_date));

  return jsonb_build_object('ran', true, 'tier1_rows', a.rows_written, 'date', p_date);
end
$fn$;


-- ---------------------------------------------------------------------------
-- 11. Locks. None of this is reachable without the service role key.
-- ---------------------------------------------------------------------------
revoke all on function public.price_snapshot_tick(integer, date)              from public, anon, authenticated;
revoke all on function public.price_snapshot_run(integer, integer, date)      from public, anon, authenticated;
revoke all on function public.price_snapshot_coverage(date)                   from public, anon, authenticated;
revoke all on function public.pipeline_heartbeat(text, boolean, jsonb)        from public, anon, authenticated;
revoke all on function public.pipeline_health()                               from public, anon, authenticated;
revoke all on function public.price_snapshot_safety_net(date)                 from public, anon, authenticated;

grant execute on function public.price_snapshot_tick(integer, date)           to service_role, postgres;
grant execute on function public.price_snapshot_run(integer, integer, date)   to service_role, postgres;
grant execute on function public.price_snapshot_coverage(date)                to service_role, postgres;
grant execute on function public.pipeline_heartbeat(text, boolean, jsonb)     to service_role, postgres;
grant execute on function public.pipeline_health()                            to service_role, postgres;
grant execute on function public.price_snapshot_safety_net(date)              to service_role, postgres;


-- ---------------------------------------------------------------------------
-- 12. The one pg_cron job we keep.
--
--     `daily-price-capture` used to POST the daily-price-capture edge function
--     with a hardcoded JWT in the command, then later called
--     capture_daily_prices('relevant', 5), which capped coverage at cards worth
--     five dollars or more. It is retired here and replaced by a narrower job
--     with an honest name.
--
--     This is the one thing that must not depend on GitHub being reachable: the
--     prices the product quotes back at people. It does nothing at all if the
--     GitHub run already finished today, because the first tick of a completed
--     day returns immediately. 11:00 UTC is about five hours after that run, so
--     it only fires when something genuinely went wrong.
--
--     It does NOT sweep the catalogue. That is scripts/prices/daily-sweep.mjs,
--     and a second sweeper is exactly the collision this file already caused
--     once.
-- ---------------------------------------------------------------------------
do $cron$
begin
  perform cron.unschedule('daily-price-capture')
   where exists (select 1 from cron.job where jobname = 'daily-price-capture');

  perform cron.unschedule('price-tier1-safety-net')
   where exists (select 1 from cron.job where jobname = 'price-tier1-safety-net');

  perform cron.schedule(
    'price-tier1-safety-net', '0 11 * * *',
    ' set statement_timeout = 0; select public.price_snapshot_run(200, 300); '
  );
end
$cron$;
