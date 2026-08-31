-- New cards get facets without anyone asking.
--
-- The owner, 31 Aug 2026: "we need to be prepared for when new cards come in
-- that this happens automatically for those new cards".
--
-- WHAT WAS ACTUALLY MISSING. `card_facet_memo` holds 33,032 rows, every one of
-- them written between 07:45:01 and 07:46:05 on 30 Aug 2026, by hand. Nothing
-- has written it since and nothing was scheduled to. `cron.job` carries six
-- jobs and none of them names it.
--
-- So the nightly `scryfall-sync` writes a new set into `cards`, the 06:00
-- `cards-unique-refresh` carries those cards into `cards_unique` and
-- `cards_pool`, and `cards_pool` LEFT JOINs the memo — so every new card
-- arrives in the pool the deck generator reads with `facets = NULL`. A card
-- with no facets is not a card the ranker treats cautiously; it is a card that
-- reads as DOING NOTHING, which is indistinguishable from Bone Saw. Every card
-- of the next set would have been invisible to commander fit, to the
-- optimiser's `planFit`, and to every suggestion surface, silently, until
-- somebody remembered to run the fill by hand.
--
-- Tags do not have this problem: `cards_apply_role_tags` is a trigger, so a
-- card is tagged as it is written. Facets could not be, because the compiler
-- is TypeScript and lives in an edge function. This is the nearest automatic
-- equivalent: a scheduled top-up that costs nothing when there is nothing to do.
--
-- THREE PIECES.
--
--   card_facet_gap()          how many cards have no facets at the version the
--                             memo is currently being written at.
--   cards_missing_facets()    those cards, oldest oracle_id first, so the edge
--                             function can ask for exactly the gap instead of
--                             walking 33,032 rows to find 300.
--   fill_card_facets_if_needed()  one HTTP call, only when the gap is not zero.
--
-- WHY THE VERSION IS READ AND NOT WRITTEN DOWN. CLAUDE.md already records that
-- the compiler version is pinned in three places and that a reader on one
-- version and a writer on another fails SILENTLY. A fourth hardcoded copy here
-- would be a fourth thing to forget. `max(compiler_version)` is what the writer
-- last wrote, so on a version bump the first write moves it, the gap becomes
-- the whole catalogue, and this job closes it over the following hours without
-- anybody being told to.

-- ---------------------------------------------------------------- the gap ---

create or replace function public.card_facet_current_version()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(compiler_version), 0)::int from public.card_facet_memo;
$$;

comment on function public.card_facet_current_version() is
  'The compiler version the memo is being written at. Read, never hardcoded: a fourth copy of this number is a fourth thing to forget on a bump.';

create or replace function public.card_facet_gap()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.cards_unique u
  where not exists (
    select 1
    from public.card_facet_memo m
    where m.oracle_id = u.oracle_id
      and m.compiler_version = public.card_facet_current_version()
  );
$$;

comment on function public.card_facet_gap() is
  'Cards with no behaviour facets at the current compiler version. Non-zero means the deck generator is reading some cards as doing nothing.';

-- --------------------------------------------------- exactly the gap, paged ---

create or replace function public.cards_missing_facets(
  p_version integer,
  p_after   text default '',
  p_limit   integer default 1000
)
returns table (
  oracle_id      text,
  name           text,
  layout         text,
  type_line      text,
  cmc            numeric,
  colors         text[],
  color_identity text[],
  oracle_text    text,
  mana_cost      text,
  power          text,
  toughness      text,
  keywords       text[],
  faces          jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select u.oracle_id, u.name, u.layout, u.type_line, u.cmc, u.colors, u.color_identity,
         u.oracle_text, u.mana_cost, u.power, u.toughness, u.keywords, u.faces
  from public.cards_unique u
  where u.oracle_id > coalesce(p_after, '')
    and not exists (
      select 1 from public.card_facet_memo m
      where m.oracle_id = u.oracle_id and m.compiler_version = p_version
    )
  order by u.oracle_id
  -- Capped at PostgREST's own db-max-rows. Asking for more returns 1000 and a
  -- caller that reads "fewer rows than I asked for" as "the end" then reports
  -- done after 1,000 of 33,032. That exact bug is written up in the edge
  -- function; the cap is here so the two cannot disagree.
  limit least(greatest(coalesce(p_limit, 1000), 1), 1000);
$$;

comment on function public.cards_missing_facets(integer, text, integer) is
  'Cards with no memo row at p_version, keyset by oracle_id. Lets the fill ask for the gap instead of walking the catalogue to find it.';

revoke all on function public.cards_missing_facets(integer, text, integer) from public, anon, authenticated;
grant execute on function public.cards_missing_facets(integer, text, integer) to service_role;

-- -------------------------------------------------------------- the top-up ---

create or replace function public.fill_card_facets_if_needed(p_batch integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gap     integer;
  v_version integer;
  v_token   uuid;
  v_req     bigint;
begin
  v_version := public.card_facet_current_version();
  v_gap     := public.card_facet_gap();

  -- NOTHING TO DO IS THE COMMON CASE and it must cost nothing. On a normal
  -- night no card is new, the gap is zero, and this returns without opening a
  -- run row or making an HTTP request.
  if v_gap = 0 then
    return jsonb_build_object('gap', 0, 'version', v_version, 'called', false);
  end if;

  -- ONE CALL PER TICK, deliberately. `net.http_post` is fire-and-forget, so
  -- issuing several would race on the same run row and recompute the same
  -- cards. One call of up to 1,000 cards closes any realistic new-set gap in a
  -- single tick, and a version bump converges over the following hours instead
  -- of all at once, which is the gentler shape for a database this size.
  insert into public.facet_memo_runs (max_calls, note)
  values (4, format('automatic top-up: %s cards missing facets at compiler version %s', v_gap, v_version))
  returning run_token into v_token;

  select net.http_post(
    url     := 'https://udnaflcohfyljrsgqggy.supabase.co/functions/v1/facet-memo-fill',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 -- The publishable key, which is client-visible by design and
                 -- is the same one `trigger_scryfall_sync` carries. The gate on
                 -- this function is the run token, not the key.
                 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g'
               ),
    body    := jsonb_build_object('run_token', v_token, 'batch', greatest(least(p_batch, 1000), 1), 'only_missing', true),
    -- pg_net defaults to a FIVE SECOND timeout and the first call took longer
    -- than that, so the request succeeded, the memo was written, and the
    -- response row recorded only 'Timeout of 5000 ms reached'. The work being
    -- right while the record of it says nothing is how a scheduled job fails
    -- for two days unnoticed, which this project has already done once.
    timeout_milliseconds := 120000
  ) into v_req;

  insert into public.dev_logs (level, event, detail, meta)
  values ('info', 'facet memo top-up',
          format('%s cards missing facets at version %s, request %s', v_gap, v_version, v_req),
          jsonb_build_object('gap', v_gap, 'version', v_version, 'request_id', v_req));

  return jsonb_build_object('gap', v_gap, 'version', v_version, 'called', true, 'request_id', v_req);
end $$;

comment on function public.fill_card_facets_if_needed(integer) is
  'Computes facets for cards that have none. No-ops when the gap is zero, so it is safe to schedule often.';

revoke all on function public.fill_card_facets_if_needed(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------- schedule ---
--
-- Every fifteen minutes, and that is affordable precisely because a zero gap
-- costs one indexed count and no HTTP. It is not pinned to just after the
-- nightly sync because `cards_unique` only gains the new cards at the 06:00
-- refresh, and a job that runs before the view it reads has been refreshed
-- would report a zero gap and go back to sleep for a day.
--
-- ONE STATEMENT. A pg_cron command holding two statements is an implicit
-- transaction block, which is what broke the VACUUM jobs; and nothing here
-- needs a raised statement_timeout, so there is nothing to add.
select cron.unschedule('facet-memo-top-up')
where exists (select 1 from cron.job where jobname = 'facet-memo-top-up');

select cron.schedule('facet-memo-top-up', '*/15 * * * *',
                     $cron$select public.fill_card_facets_if_needed(1000);$cron$);
