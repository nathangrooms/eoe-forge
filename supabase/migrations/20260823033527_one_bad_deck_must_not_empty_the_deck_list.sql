-- ============================================================================
-- One bad deck must not empty the deck list
-- ============================================================================
--
-- WHAT WENT WRONG
-- ---------------------------------------------------------------------------
-- Before the batching, `/decks` called `compute_deck_summary` once per deck
-- inside a `Promise.all`, and each call was wrapped in its own try/catch that
-- returned null. A deck whose summary raised cost you THAT TILE. The list still
-- drew.
--
-- `compute_deck_summaries` replaced twenty five calls with one, which is the
-- whole point, but it also put twenty five decks behind a single exception: one
-- deck that raises now takes the entire page into its error boundary. A cheaper
-- page that shows nothing is not a cheaper page.
--
-- WHAT THIS CHANGES
-- ---------------------------------------------------------------------------
-- The per-id call runs inside its own exception block, the same way
-- `storage_move_cards_batch` runs each move inside one. A deck that raises is
-- skipped, exactly as `catch → return null → filter(Boolean)` skipped it, and
-- the other twenty four still draw.
--
-- Nothing else moves. The payload, the order, and the visibility gate inside
-- `compute_deck_summary` are untouched: this still delegates, so the one-deck
-- and many-deck paths cannot drift.
--
-- GRANTS
-- ---------------------------------------------------------------------------
-- `create or replace` KEEPS the existing ACL, so the revoke from
-- `public, anon, authenticated` and the grant to `authenticated` that created
-- this function still stand. They are repeated anyway: this project has been
-- caught four times by a function that was public, and a repeat costs nothing.
-- ============================================================================

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
    begin
      -- `compute_deck_summary` is SECURITY DEFINER and carries its own
      -- visibility gate: owner, published deck, or service_role, and NULL for
      -- anybody else. Calling it keeps that gate in force for every id here.
      one := public.compute_deck_summary(one_id);
      if one is not null then
        out_rows := out_rows || jsonb_build_array(one);
      end if;
    exception when others then
      -- One deck, one tile. The list is what the page is for.
      raise warning 'compute_deck_summaries skipped % : %', one_id, sqlerrm;
    end;
  end loop;

  return out_rows;
end;
$function$;

comment on function public.compute_deck_summaries(uuid[]) is
  'Every deck summary the deck list needs, in one request. Delegates to compute_deck_summary so the payload and its visibility gate cannot drift, and skips a deck that raises rather than failing the whole list.';

revoke all on function public.compute_deck_summaries(uuid[]) from public, anon, authenticated;
grant execute on function public.compute_deck_summaries(uuid[]) to authenticated;
