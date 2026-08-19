-- A tick must be bounded work, not "however much has piled up".
--
-- Observed 2026-08-19: with a batch of 40, a single tick spent over 60 seconds parsing ~500 KB
-- JSON pages, overran its one-minute window, and the next tick overlapped it. Meanwhile the
-- requests still queued inside pg_net aged past their 30 second timeout and came back as
-- failures that had nothing to do with the upstream. Throughput collapsed to roughly zero while
-- every component reported success.
--
-- The dispatch side was already bounded. The collect side was not: it processed every response
-- that had arrived, so a burst of arrivals produced an unboundedly long transaction. Capping it
-- makes tick duration a function of the cap rather than of the backlog.

create or replace function public.meta_queue_collect(p_source text, p_limit integer default 20)
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
    limit greatest(1, least(coalesce(p_limit, 20), 100))
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

    -- A pg_net timeout means the request aged out in the local queue, not that the upstream
    -- refused us. Requeue without consuming an attempt, or a slow tick would permanently fail
    -- rows that were never actually sent.
    if r.status_code is null and coalesce(r.error_msg, '') like 'Timeout of%' then
      update public.meta_fetch_queue q
         set state = 'pending', request_id = null,
             attempts = greatest(0, q.attempts - 1),
             error_msg = 'pg_net timeout, requeued', updated_at = now()
       where q.source_id = p_source and q.seq = r.seq;
      v_failed := v_failed + 1;
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

comment on function public.meta_queue_collect(text, integer) is
  'Loads up to p_limit responses through the canonical loader for that source. The cap bounds tick duration so a backlog cannot produce a transaction that outlives its scheduling window. A pg_net timeout requeues without consuming a retry attempt, because it means the request aged out locally rather than being refused upstream.';

create or replace function public.meta_drain_tick(p_source text, p_batch integer default 20, p_prune boolean default false)
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
  -- Collect at most one batch worth, so tick duration tracks the batch size.
  select c.loaded, c.failed, c.throttled into v_loaded, v_failed, v_thr
  from public.meta_queue_collect(p_source, p_batch) c;

  select count(*)::integer into v_inflight
  from public.meta_fetch_queue q where q.source_id = p_source and q.state = 'sent';

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

drop function if exists public.meta_queue_collect(text);

revoke all on function public.meta_queue_collect(text, integer) from public, anon, authenticated;
revoke all on function public.meta_drain_tick(text, integer, boolean) from public, anon, authenticated;
grant execute on function public.meta_queue_collect(text, integer) to service_role;
grant execute on function public.meta_drain_tick(text, integer, boolean) to service_role;
