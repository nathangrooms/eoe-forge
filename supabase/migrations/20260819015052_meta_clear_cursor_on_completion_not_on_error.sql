-- The cursor-clearing trigger was too aggressive: it nulled the resume pointer on ANY status
-- that was not 'running', which includes 'error'. That would have made a failed run restart
-- from zero instead of resuming, turning one transient 500 from an upstream API into a full
-- re-fetch of ~1,041 pages.
--
-- The rule is specifically the COMPLETION path. A run that finished has nothing left to point
-- at. A run that failed has everything left to point at, and its cursor is the only thing that
-- makes the retry cheap.

create or replace function public.meta_ingest_runs_clear_cursor()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  -- 'done'  = completed sweep, pointer is meaningless and must not survive.
  -- 'idle'  = never started or deliberately reset.
  -- 'error' = KEEP the cursor. The next run resumes from it instead of starting over.
  if new.status in ('done', 'idle') then
    new.cursor := null;
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

comment on function public.meta_ingest_runs_clear_cursor() is
  'Clears meta_ingest_runs.cursor on the completion path only (status done or idle). Deliberately preserves it on status error so a failed sweep resumes rather than restarting.';;