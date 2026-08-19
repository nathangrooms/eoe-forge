-- Commander Spellbook enforces a rate limit it does not document.
--
-- Measured 2026-08-19: a burst of 100 concurrent requests through pg_net returned HTTP 429 for
-- every one of them, with no Retry-After, no X-RateLimit-* headers and an empty body. Research
-- had recorded "no published rate limit", which was true and turned out to be irrelevant. The
-- absence of a documented limit is not permission to burst.
--
-- Two things were wrong and are fixed here:
--   1. A 429 was treated as a failure and burned one of three attempts, so a queue could end up
--      permanently 'failed' purely for going too fast. A 429 means "come back later", not
--      "this will never work", and must not consume the retry budget.
--   2. There was no wait between rejection and retry, so retries fed the flood that caused it.

alter table public.meta_fetch_queue
  add column if not exists not_before timestamptz,
  add column if not exists rate_limited integer not null default 0;

comment on column public.meta_fetch_queue.not_before is
  'Earliest time this row may be dispatched again. Set when the upstream returns 429 so a retry waits instead of adding to the flood that caused it.';
comment on column public.meta_fetch_queue.rate_limited is
  'How many times this row has been rate limited. Backoff grows with it. Deliberately separate from `attempts` so being throttled never exhausts the retry budget.';

create or replace function public.meta_queue_dispatch(p_source text, p_batch integer default 20)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_sent integer := 0;
  r      record;
  v_req  bigint;
begin
  for r in
    select q.seq, q.url from public.meta_fetch_queue q
    where q.source_id = p_source and q.state = 'pending'
      and (q.not_before is null or q.not_before <= now())
    order by q.seq
    limit greatest(1, least(coalesce(p_batch, 20), 100))
  loop
    select net.http_get(
      r.url,
      headers := jsonb_build_object('User-Agent', public.meta_user_agent(), 'Accept', 'application/json'),
      timeout_milliseconds := 30000
    ) into v_req;

    update public.meta_fetch_queue q
       set state = 'sent', request_id = v_req, attempts = q.attempts + 1, updated_at = now()
     where q.source_id = p_source and q.seq = r.seq;

    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$fn$;

-- These two gain an extra OUT column below, so they must be dropped rather than replaced:
-- Postgres refuses CREATE OR REPLACE when the row type defined by OUT parameters changes.
drop function if exists public.meta_drain_tick(text, integer, boolean);
drop function if exists public.meta_queue_collect(text);

create function public.meta_queue_collect(p_source text)
returns table (loaded integer, failed integer, throttled integer, still_sent integer)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r          record;
  v_run      bigint;
  v_loaded   integer := 0;
  v_failed   integer := 0;
  v_throttled integer := 0;
  v_body     jsonb;
begin
  select run_id into v_run from public.meta_ingest_runs where source_id = p_source;

  for r in
    select q.seq, q.ref, q.request_id, q.rate_limited, resp.status_code, resp.content, resp.error_msg
    from public.meta_fetch_queue q
    join net._http_response resp on resp.id = q.request_id
    where q.source_id = p_source and q.state = 'sent'
    order by q.seq
  loop
    -- Rate limited. Wait, then try again. Does not consume the retry budget.
    if r.status_code = 429 then
      update public.meta_fetch_queue q
         set state = 'pending',
             attempts = greatest(0, q.attempts - 1),
             rate_limited = q.rate_limited + 1,
             not_before = now() + least(
               make_interval(secs => (30 * power(2, least(q.rate_limited, 6)))::int),
               interval '10 minutes'),
             error_msg = 'http 429, backing off',
             updated_at = now()
       where q.source_id = p_source and q.seq = r.seq;
      v_throttled := v_throttled + 1;
      continue;
    end if;

    if r.status_code is null or r.status_code >= 400 then
      update public.meta_fetch_queue q
         set state = case when q.attempts >= 3 then 'failed' else 'pending' end,
             not_before = now() + interval '30 seconds',
             error_msg = coalesce(r.error_msg, 'http ' || coalesce(r.status_code::text, 'null')),
             updated_at = now()
       where q.source_id = p_source and q.seq = r.seq;
      v_failed := v_failed + 1;
      continue;
    end if;

    begin
      v_body := r.content::jsonb;

      if p_source = 'commander_spellbook' then
        perform public.meta_load_spellbook_page(v_body, v_run);
      elsif p_source = 'mtgjson' then
        perform public.meta_load_mtgjson_deck(r.ref, v_body->'data');
      else
        raise exception 'no loader for meta source %', p_source;
      end if;

      update public.meta_fetch_queue q
         set state = 'done', error_msg = null, not_before = null, updated_at = now()
       where q.source_id = p_source and q.seq = r.seq;
      v_loaded := v_loaded + 1;

    exception when others then
      update public.meta_fetch_queue q
         set state = 'failed', error_msg = left(SQLERRM, 500), updated_at = now()
       where q.source_id = p_source and q.seq = r.seq;
      v_failed := v_failed + 1;
    end;
  end loop;

  update public.meta_ingest_runs ir
     set processed = (select count(*) from public.meta_fetch_queue q where q.source_id = p_source and q.state = 'done'),
         total     = (select count(*) from public.meta_fetch_queue q where q.source_id = p_source),
         cursor    = (select min(q.seq)::text from public.meta_fetch_queue q where q.source_id = p_source and q.state in ('pending','sent')),
         status    = 'running'
   where ir.source_id = p_source;

  return query
    select v_loaded, v_failed, v_throttled,
           (select count(*)::integer from public.meta_fetch_queue q
             where q.source_id = p_source and q.state = 'sent');
end;
$fn$;

create function public.meta_drain_tick(p_source text, p_batch integer default 20, p_prune boolean default false)
returns table (loaded integer, failed integer, throttled integer, dispatched integer, outstanding integer, drained boolean)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_loaded integer := 0;
  v_failed integer := 0;
  v_thr    integer := 0;
  v_disp   integer := 0;
  v_out    integer;
  v_drained boolean := false;
  v_inflight integer;
begin
  select c.loaded, c.failed, c.throttled into v_loaded, v_failed, v_thr
  from public.meta_queue_collect(p_source) c;

  select count(*)::integer into v_inflight
  from public.meta_fetch_queue q where q.source_id = p_source and q.state = 'sent';

  -- Only top up to the ceiling, so a slow or throttling upstream automatically limits us.
  if v_inflight < p_batch then
    select public.meta_queue_dispatch(p_source, p_batch - v_inflight) into v_disp;
  end if;

  select count(*)::integer into v_out
  from public.meta_fetch_queue q where q.source_id = p_source and q.state in ('pending','sent');

  if v_out = 0 then
    select f.drained into v_drained
    from public.meta_queue_finish_if_drained(p_source, p_prune) f;
  end if;

  return query select v_loaded, v_failed, v_thr, v_disp, v_out, coalesce(v_drained, false);
end;
$fn$;

comment on function public.meta_drain_tick(text, integer, boolean) is
  'One tick of ingestion: collect what came back, top the in-flight set up to the batch ceiling, finish the run if the queue drained. Safe to schedule every minute; a no-op once the queue is empty. The batch ceiling is the rate limit. Commander Spellbook returns 429 to a burst of 100 and documents no limit, so keep it low and let the backoff do its work.';

revoke all on function public.meta_queue_dispatch(text, integer) from public, anon, authenticated;
revoke all on function public.meta_queue_collect(text) from public, anon, authenticated;
revoke all on function public.meta_drain_tick(text, integer, boolean) from public, anon, authenticated;
grant execute on function public.meta_queue_dispatch(text, integer) to service_role;
grant execute on function public.meta_queue_collect(text) to service_role;
grant execute on function public.meta_drain_tick(text, integer, boolean) to service_role;

-- Reset everything the burst wrongly marked failed.
update public.meta_fetch_queue
   set state = 'pending', attempts = 0, rate_limited = 0, not_before = null, error_msg = null
 where state = 'failed' and error_msg like 'http 429%';;