-- A database-native ingestion path, built on pg_net.
--
-- The edge functions are the manual and admin trigger path. This is the unattended one, and it
-- exists because it needs no secret anywhere: pg_cron calls it directly, so there is no service
-- role key sitting in a cron command string. (This database previously had a hardcoded anon JWT
-- in a cron command for exactly that reason; not repeating it.)
--
-- The queue IS the resume pointer. A row's state is durable, so an interrupted run resumes by
-- definition rather than by remembering an offset. There is no separate cursor to leak.

create table if not exists public.meta_fetch_queue (
  source_id   text    not null references public.meta_sources(id) on delete cascade,
  seq         integer not null,
  url         text    not null,
  ref         text    not null,
  state       text    not null default 'pending',
  request_id  bigint,
  attempts    integer not null default 0,
  error_msg   text,
  updated_at  timestamptz not null default now(),
  primary key (source_id, seq),
  constraint meta_fetch_queue_state_ck check (state in ('pending','sent','done','failed','skipped'))
);

comment on table public.meta_fetch_queue is
  'Work queue for external fetches. One row per HTTP request the ingest needs to make. State is the resume pointer: pending rows are outstanding work, so an interrupted run resumes with no cursor arithmetic. `ref` is the source-specific identity of the thing being fetched (an offset for Commander Spellbook, a deck file name for MTGJSON).';

create index if not exists idx_meta_fetch_queue_state on public.meta_fetch_queue (source_id, state, seq);

alter table public.meta_fetch_queue enable row level security;
drop policy if exists meta_fetch_queue_read on public.meta_fetch_queue;
create policy meta_fetch_queue_read on public.meta_fetch_queue for select to public using (true);
drop policy if exists meta_fetch_queue_write on public.meta_fetch_queue;
create policy meta_fetch_queue_write on public.meta_fetch_queue for all to service_role using (true) with check (true);
revoke insert, update, delete, truncate on public.meta_fetch_queue from anon, authenticated;

-- The User-Agent every outbound request carries. Identifying the client honestly with a contact
-- address is a term of several sources and is what lets an operator email us rather than
-- silently block us. Never send a generic or spoofed agent.
create or replace function public.meta_user_agent()
returns text language sql immutable
as $$ select 'DeckMatrix/1.0 (+https://deckmatrix.com; contact: nathan@pilotdigital.agency)'::text $$;

-- ---------------------------------------------------------------------------
-- Dispatch: send the next batch of pending requests.
-- ---------------------------------------------------------------------------

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

comment on function public.meta_queue_dispatch(text, integer) is
  'Issues up to p_batch outstanding requests through pg_net. Batch size is the rate limit: keep it modest so a volunteer-run API is never hit hard. Responses are picked up by meta_queue_collect.';

-- ---------------------------------------------------------------------------
-- Collect: load whatever has come back, through the canonical loaders.
-- ---------------------------------------------------------------------------

create or replace function public.meta_queue_collect(p_source text)
returns table (loaded integer, failed integer, still_sent integer)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r        record;
  v_run    bigint;
  v_loaded integer := 0;
  v_failed integer := 0;
  v_body   jsonb;
begin
  select run_id into v_run from public.meta_ingest_runs where source_id = p_source;

  for r in
    select q.seq, q.ref, q.request_id, resp.status_code, resp.content, resp.error_msg
    from public.meta_fetch_queue q
    join net._http_response resp on resp.id = q.request_id
    where q.source_id = p_source and q.state = 'sent'
    order by q.seq
  loop
    if r.status_code is null or r.status_code >= 400 then
      -- Left as 'pending' rather than 'failed' when it is worth retrying, so transient upstream
      -- errors self-heal on the next dispatch instead of silently dropping a page.
      update public.meta_fetch_queue q
         set state = case when q.attempts >= 3 then 'failed' else 'pending' end,
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
         set state = 'done', error_msg = null, updated_at = now()
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
    select v_loaded, v_failed,
           (select count(*)::integer from public.meta_fetch_queue q
             where q.source_id = p_source and q.state = 'sent');
end;
$fn$;

comment on function public.meta_queue_collect(text) is
  'Loads every response that has arrived, through the canonical loader for that source. A failed fetch goes back to pending for up to three attempts rather than being dropped, so a transient upstream error cannot quietly leave a hole in the corpus.';

-- ---------------------------------------------------------------------------
-- Finish: only when the queue is genuinely empty.
-- ---------------------------------------------------------------------------

create or replace function public.meta_queue_finish_if_drained(p_source text, p_prune boolean default false)
returns table (drained boolean, outstanding integer, final_status text, cursor_after text)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_outstanding integer;
begin
  select count(*)::integer into v_outstanding
  from public.meta_fetch_queue q
  where q.source_id = p_source and q.state in ('pending','sent');

  if v_outstanding > 0 then
    return query
      select false, v_outstanding, ir.status, ir.cursor
      from public.meta_ingest_runs ir where ir.source_id = p_source;
    return;
  end if;

  -- COMPLETION PATH. meta_finish_ingest clears the resume pointer as part of the same call,
  -- enforced by the trigger on meta_ingest_runs, so a completed sweep cannot leave a stale
  -- cursor behind. That failure is what froze this project's Scryfall card sync for months.
  perform public.meta_finish_ingest(p_source, p_prune);

  return query
    select true, 0, ir.status, ir.cursor
    from public.meta_ingest_runs ir where ir.source_id = p_source;
end;
$fn$;

revoke all on function public.meta_queue_dispatch(text, integer) from public, anon, authenticated;
revoke all on function public.meta_queue_collect(text) from public, anon, authenticated;
revoke all on function public.meta_queue_finish_if_drained(text, boolean) from public, anon, authenticated;
grant execute on function public.meta_queue_dispatch(text, integer) to service_role;
grant execute on function public.meta_queue_collect(text) to service_role;
grant execute on function public.meta_queue_finish_if_drained(text, boolean) to service_role;
grant execute on function public.meta_user_agent() to anon, authenticated, service_role;;