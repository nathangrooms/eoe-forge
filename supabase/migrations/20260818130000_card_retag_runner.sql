-- ============================================================================
-- Bulk re-tag runner.
--
-- Classifying one card costs ~31 ms. That is not the regexes matching, it is
-- Postgres recompiling them: RE_CACHE_SIZE is 32 and derive_card_tags uses ~70
-- distinct patterns, so a sequential pass evicts every pattern before it is
-- reused and each row pays 70 compiles. 34,088 rows is therefore ~18 minutes of
-- database time — far past any HTTP client's patience.
--
-- So the pass runs detached, on pg_cron, against a progress row. Each tick
-- takes a time budget, walks a keyset page at a time, records where it got to,
-- and unschedules the job once the table is clean. Interrupt it anywhere and
-- the next tick resumes from `last_id`; run it again from scratch with
-- retag_all_cards(p_restart => true).
--
-- Ongoing tagging does NOT go through here — the cards_apply_role_tags trigger
-- tags each row on write, and scryfall-sync calls retag_cards() on the ids it
-- just upserted. This runner exists for the initial backfill and for whenever
-- TAG_RULES changes and the whole catalogue needs reclassifying.
-- ============================================================================

create table if not exists public.card_retag_progress (
  -- Single row: `id` is constrained to true so a second insert cannot exist.
  id         boolean primary key default true check (id),
  last_id    text        not null default '',
  scanned    integer     not null default 0,
  changed    integer     not null default 0,
  done       boolean     not null default false,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.card_retag_progress is
  'Resume point for the bulk card re-tag. One row. Read it to see how far the pg_cron job has got.';

alter table public.card_retag_progress enable row level security;
-- No policies: the runner is service-role only. RLS on with zero policies means
-- anon and authenticated cannot read or write it, which is the intent.

-- The default budget is deliberately below the 120 s statement_timeout this
-- database applies. `SET LOCAL statement_timeout` inside the function does NOT
-- help: the timer is armed when the calling statement starts, and raising the
-- setting afterwards never re-arms it — the first attempt at a 240 s budget was
-- killed at exactly 120 s. A caller that wants longer ticks must widen the
-- timeout in its own session BEFORE the call, which is what the pg_cron job
-- command does:
--     set statement_timeout = 0; select public.retag_all_cards(240, 500);
create or replace function public.retag_all_cards(
  p_budget_seconds integer default 100,
  p_page           integer default 500,
  p_restart        boolean default false
) returns public.card_retag_progress
language plpgsql
as $fn$
declare
  v_deadline timestamptz := clock_timestamp() + make_interval(secs => p_budget_seconds);
  v_state    public.card_retag_progress;
  r          record;
begin
  insert into public.card_retag_progress (id) values (true) on conflict (id) do nothing;

  if p_restart then
    update public.card_retag_progress
       set last_id = '', scanned = 0, changed = 0, done = false,
           started_at = now(), updated_at = now()
     where id;
  end if;

  select * into v_state from public.card_retag_progress where id;
  if v_state.done then
    return v_state;
  end if;

  loop
    select * into r from public.retag_cards_batch(p_page, v_state.last_id);

    v_state.scanned := v_state.scanned + r.scanned;
    v_state.changed := v_state.changed + r.changed;
    v_state.last_id := r.last_id;
    v_state.done    := not r.remaining;

    update public.card_retag_progress
       set last_id = v_state.last_id,
           scanned = v_state.scanned,
           changed = v_state.changed,
           done    = v_state.done,
           -- clock_timestamp(), not now(): now() is frozen at the start of the
           -- transaction, and one tick IS one transaction, so `updated_at` would
           -- report when the tick began and never move for four minutes.
           updated_at = clock_timestamp()
     where id;

    exit when v_state.done or clock_timestamp() > v_deadline;
  end loop;

  -- Stop costing a worker every minute once there is nothing left to do. The
  -- job may already be gone if a human unscheduled it, hence the swallow.
  if v_state.done then
    begin
      perform cron.unschedule('deckmatrix-retag-cards');
    exception when others then
      null;
    end;
  end if;

  return v_state;
end;
$fn$;

comment on function public.retag_all_cards(integer, integer, boolean) is
  'Resumable bulk re-tag driven by pg_cron. Re-runnable: retag_all_cards(p_restart => true) starts over.';

grant execute on function public.retag_all_cards(integer, integer, boolean) to service_role;

-- Kick off the backfill. The job widens statement_timeout in its own session
-- first (see the note above), takes a 240 s slice per tick, and unschedules
-- itself from inside retag_all_cards once the table is clean — so this is a
-- one-shot backfill expressed as a repeating job, not a permanent cron entry.
--
-- To reclassify the catalogue again after changing TAG_RULES:
--   select public.retag_all_cards(p_restart => true);
--   select cron.schedule('deckmatrix-retag-cards', '* * * * *',
--     $job$set statement_timeout = 0; select public.retag_all_cards(240, 500)$job$);
do $$
begin
  perform cron.unschedule('deckmatrix-retag-cards');
exception when others then
  null;
end $$;

select cron.schedule(
  'deckmatrix-retag-cards',
  '* * * * *',
  $job$set statement_timeout = 0; select public.retag_all_cards(240, 500)$job$
);
