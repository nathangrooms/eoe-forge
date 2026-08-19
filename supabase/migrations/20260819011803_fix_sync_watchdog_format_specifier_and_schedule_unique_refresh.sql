-- The watchdog had never once succeeded.
--
-- `format()` in Postgres accepts only %s, %I, %L and %%. Both return strings
-- used `%.1f`, which is a hard error:
--
--   ERROR: unrecognized format() type specifier "."
--
-- Confirmed in cron.job_run_details: failed every 15 minutes since the job was
-- created, with no exceptions. Worse, `perform trigger_scryfall_sync('resume')`
-- sits BEFORE the throwing return, so the exception rolled the resume back. The
-- watchdog was not merely silent, it undid its own work, which is why
-- sync_status sat 'running' at page 46 for a day.
--
-- The fix is round() to one decimal place passed through %s. Plain %s on a
-- numeric prints full precision, which is why the rounding has to be explicit.
--
-- Applied now, rather than left alone as it deliberately was on 2026-08-19,
-- because a resumable 553-page sync is exactly the thing this job exists to
-- rescue and it cannot finish reliably without it.

create or replace function public.resume_scryfall_sync_if_stalled()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s            public.sync_status%rowtype;
  has_resume   boolean := false;
  stalled_mins numeric;
begin
  select * into s from public.sync_status where id = 'scryfall_cards';
  if not found then
    return 'no sync_status row';
  end if;

  -- Resume state is (unfortunately) stored as JSON in error_message.
  begin
    has_resume := (s.error_message is not null)
              and ((s.error_message)::jsonb ? 'next_page_url')
              and ((s.error_message)::jsonb ->> 'next_page_url') is not null;
  exception when others then
    has_resume := false;
  end;

  stalled_mins := extract(epoch from (now() - coalesce(s.last_sync, now() - interval '1 day'))) / 60;

  -- Mid-run but untouched for >10 minutes: the self-chaining broke.
  if s.status = 'running' and stalled_mins > 10 then
    perform public.trigger_scryfall_sync('resume');
    return format('resumed stalled run (%s min idle)', round(stalled_mins, 1));
  end if;

  -- Flagged finished but still holding a resume pointer: the partial-sync bug.
  if s.status <> 'running' and has_resume then
    perform public.trigger_scryfall_sync('resume');
    return 'resumed incomplete run flagged as finished';
  end if;

  return format('healthy (status=%s, idle=%s min)', s.status, round(stalled_mins, 1));
end
$$;

-- Keep the deduplicated view honest without waiting for a sync.
--
-- Which printing represents a card is decided by price, and prices move every
-- night. `daily-price-capture` runs at 06:00 and the sync at 04:15, so 06:30 is
-- after both. A missed refresh is not a correctness bug in `cards`, only a
-- staleness one in `cards_unique`, so this is cheap insurance rather than a
-- critical path.
select cron.schedule(
  'cards-unique-refresh',
  '30 6 * * *',
  $cron$ select public.refresh_cards_unique(); $cron$
);
