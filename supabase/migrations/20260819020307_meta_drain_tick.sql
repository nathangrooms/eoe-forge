-- One tick of the ingest loop, sized so it is safe to run every minute from pg_cron.
--
-- Collect first, then dispatch. Within a single transaction the collect sees the PREVIOUS
-- tick's responses, which are committed, and the dispatch it issues becomes visible to the
-- pg_net worker only after this transaction commits. That ordering is what makes the loop work
-- at all, and it is why dispatch and collect cannot be merged into one call.
--
-- The batch is the rate limit. pg_net was measured moving about 1.3 requests per second against
-- Commander Spellbook, so a batch of 80 per minute keeps in-flight work bounded instead of
-- letting a backlog build until requests start timing out. Do not raise it to "go faster": the
-- corpus is served by a small volunteer project and there is no deadline here worth being rude
-- over.

create or replace function public.meta_drain_tick(p_source text, p_batch integer default 80, p_prune boolean default false)
returns table (loaded integer, failed integer, dispatched integer, outstanding integer, drained boolean)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_loaded integer := 0;
  v_failed integer := 0;
  v_disp   integer := 0;
  v_out    integer;
  v_drained boolean := false;
  v_inflight integer;
begin
  select c.loaded, c.failed into v_loaded, v_failed
  from public.meta_queue_collect(p_source) c;

  select count(*)::integer into v_inflight
  from public.meta_fetch_queue q where q.source_id = p_source and q.state = 'sent';

  -- Only top up to the batch ceiling, so a slow upstream throttles us automatically rather
  -- than accumulating requests that will time out before pg_net reaches them.
  if v_inflight < p_batch then
    select public.meta_queue_dispatch(p_source, p_batch - v_inflight) into v_disp;
  end if;

  select count(*)::integer into v_out
  from public.meta_fetch_queue q where q.source_id = p_source and q.state in ('pending','sent');

  if v_out = 0 then
    select f.drained into v_drained
    from public.meta_queue_finish_if_drained(p_source, p_prune) f;
  end if;

  return query select v_loaded, v_failed, v_disp, v_out, coalesce(v_drained, false);
end;
$fn$;

comment on function public.meta_drain_tick(text, integer, boolean) is
  'One minute of ingestion: collect what came back, top the in-flight set back up to the batch ceiling, and finish the run if the queue has drained. Safe to schedule every minute and a no-op once the queue is empty.';

revoke all on function public.meta_drain_tick(text, integer, boolean) from public, anon, authenticated;
grant execute on function public.meta_drain_tick(text, integer, boolean) to service_role;;