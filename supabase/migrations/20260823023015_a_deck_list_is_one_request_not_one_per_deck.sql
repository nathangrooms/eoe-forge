-- ============================================================================
-- A deck list is one request, not one per deck
-- ============================================================================
--
-- THE PROBLEM
-- ---------------------------------------------------------------------------
-- `/decks` called `compute_deck_summary` once per deck and then wrote a power
-- score once per deck. Measured in a browser against a built bundle: 57
-- requests for 9 decks, 145 for 25, about 5.2 per deck on top of a fixed cost.
-- It grows with exactly the thing the product wants people to have more of, and
-- per-row loops are what took this database down twice.
--
-- `Promise.all` around a per-row call is still a per-row call. It only makes
-- the calls arrive together, which is worse for the database, not better.
--
-- WHAT THIS ADDS
-- ---------------------------------------------------------------------------
-- Two functions that take a LIST.
--
--   * `compute_deck_summaries(uuid[])` returns the same payload as
--     `compute_deck_summary(uuid)`, once per id, as a jsonb array. It does not
--     reimplement anything: it calls the existing function, so the summary can
--     never drift between the one-deck path and the many-deck path, and the
--     visibility gate inside that function still decides every row.
--
--   * `persist_deck_power_batch(jsonb)` writes the background rescore for many
--     decks in one statement instead of a read and a write per deck. It is
--     SECURITY INVOKER, so RLS on `user_decks` applies to the caller, and it
--     also names `user_id = auth.uid()` outright rather than relying on the
--     policy alone.
--
-- Both cap the list. A caller with a thousand decks chunks, rather than asking
-- the database to walk a thousand decks inside one statement timeout.
--
-- GRANTS
-- ---------------------------------------------------------------------------
-- Both functions are NEW. A new function is granted to PUBLIC at creation by
-- Postgres, and this project has been caught by that four times, so both revoke
-- from `public, anon, authenticated` and then grant back only to
-- `authenticated`. Revoking from `anon` alone would have left PUBLIC's grant
-- standing and changed nothing.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Every summary the deck list needs, in one call
-- ---------------------------------------------------------------------------

create or replace function public.compute_deck_summaries(p_deck_ids uuid[])
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
as $function$
declare
  ids uuid[] := coalesce(p_deck_ids, '{}'::uuid[]);
  one_id uuid;
  one jsonb;
  out_rows jsonb := '[]'::jsonb;
begin
  if cardinality(ids) = 0 then
    return out_rows;
  end if;

  if cardinality(ids) > 200 then
    raise exception 'compute_deck_summaries takes at most 200 deck ids, got %', cardinality(ids);
  end if;

  -- In the order given, so the caller's sort survives the round trip.
  foreach one_id in array ids loop
    -- `compute_deck_summary` is SECURITY DEFINER and carries its own visibility
    -- gate: owner, published deck, or service_role, and NULL for anybody else.
    -- Calling it keeps that gate in force for every id here.
    one := public.compute_deck_summary(one_id);
    if one is not null then
      out_rows := out_rows || jsonb_build_array(one);
    end if;
  end loop;

  return out_rows;
end;
$function$;

comment on function public.compute_deck_summaries(uuid[]) is
  'Every deck summary the deck list needs, in one request. Delegates to compute_deck_summary so the payload and its visibility gate cannot drift.';

-- ---------------------------------------------------------------------------
-- 2. The background rescore, written once for the whole pass
-- ---------------------------------------------------------------------------

create or replace function public.persist_deck_power_batch(p_scores jsonb)
returns integer
language plpgsql
volatile
security invoker
set search_path to 'public'
as $function$
declare
  entry jsonb;
  written integer := 0;
  entries integer;
begin
  if p_scores is null or jsonb_typeof(p_scores) <> 'array' then
    return 0;
  end if;

  entries := jsonb_array_length(p_scores);
  if entries = 0 then
    return 0;
  end if;

  if entries > 200 then
    raise exception 'persist_deck_power_batch takes at most 200 decks, got %', entries;
  end if;

  for entry in select value from jsonb_array_elements(p_scores) loop
    if entry ->> 'deck_id' is null or entry -> 'deckmatrix' is null then
      continue;
    end if;

    update user_decks
       set edh_analysis = coalesce(
             case
               when jsonb_typeof(edh_analysis) = 'object' then edh_analysis
               else '{}'::jsonb
             end,
             '{}'::jsonb
           ) || jsonb_build_object('deckmatrix', entry -> 'deckmatrix'),
           -- The legacy integer column, mirrored so anything still reading it
           -- gets a number that at least came from this engine. Same clamp the
           -- client applies.
           power_level = greatest(1, least(10, coalesce((entry ->> 'power_level')::numeric, power_level)))
     where id = (entry ->> 'deck_id')::uuid
       -- RLS already scopes this to the caller. Said outright as well, because
       -- a policy is not the place to learn what a function is allowed to do.
       and user_id = (select auth.uid());

    if found then
      written := written + 1;
    end if;
  end loop;

  return written;
end;
$function$;

comment on function public.persist_deck_power_batch(jsonb) is
  'Write the deck power backfill for many decks in one statement. Merges into edh_analysis so the scraper keys survive. SECURITY INVOKER: RLS decides which decks the caller may write.';

-- ---------------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------------

revoke all on function public.compute_deck_summaries(uuid[]) from public, anon, authenticated;
revoke all on function public.persist_deck_power_batch(jsonb) from public, anon, authenticated;

grant execute on function public.compute_deck_summaries(uuid[]) to authenticated;
grant execute on function public.persist_deck_power_batch(jsonb) to authenticated;
