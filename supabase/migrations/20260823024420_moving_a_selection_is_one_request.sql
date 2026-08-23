-- ============================================================================
-- Moving a selection of cards is one request
-- ============================================================================
--
-- `StorageMovePanel` called `storage_move_cards` once per item being moved.
-- Cheaper per call than the other per-row loops on this project, because the
-- work is server side, but it is still one round trip per row and it grows with
-- how many cards a person picked. Moving fifty cards was fifty requests.
--
-- This wraps the existing function rather than reimplementing it, exactly the
-- way `compute_deck_summaries` wraps `compute_deck_summary`. The merge and
-- split rules, the ownership checks and the slot-belongs-to-container rule all
-- stay in the one place that already holds them, and cannot drift.
--
-- ONE BAD ROW DOES NOT LOSE THE BATCH
-- ---------------------------------------------------------------------------
-- Each move runs inside its own exception block, so a card that cannot go where
-- it was asked to go comes back with its reason while the rest still move. That
-- is what the loop in the panel did, and the panel shows those reasons.
--
-- GRANTS
-- ---------------------------------------------------------------------------
-- A NEW function is granted to PUBLIC at creation by Postgres. This project has
-- been caught by that four times, so revoke from `public, anon, authenticated`
-- and grant back only to `authenticated`. Revoking from `anon` alone leaves
-- PUBLIC's grant standing and changes nothing.
-- ============================================================================

create or replace function public.storage_move_cards_batch(p_moves jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path to 'public'
as $function$
declare
  move jsonb;
  moves integer;
  landed uuid;
  results jsonb := '[]'::jsonb;
  at integer := 0;
begin
  if p_moves is null or jsonb_typeof(p_moves) <> 'array' then
    return results;
  end if;

  moves := jsonb_array_length(p_moves);
  if moves = 0 then
    return results;
  end if;

  if moves > 500 then
    raise exception 'storage_move_cards_batch takes at most 500 moves, got %', moves;
  end if;

  for move in select value from jsonb_array_elements(p_moves) loop
    begin
      -- `storage_move_cards` is SECURITY DEFINER and checks that the caller
      -- owns both ends of the move. Calling it keeps that check in force.
      landed := public.storage_move_cards(
        (move ->> 'item_id')::uuid,
        (move ->> 'qty')::integer,
        (move ->> 'to_container')::uuid,
        nullif(move ->> 'to_slot', '')::uuid,
        nullif(move ->> 'to_pocket', '')::integer
      );
      results := results || jsonb_build_array(jsonb_build_object(
        'at', at,
        'item_id', move ->> 'item_id',
        'moved_to', landed,
        'error', null
      ));
    exception when others then
      results := results || jsonb_build_array(jsonb_build_object(
        'at', at,
        'item_id', move ->> 'item_id',
        'moved_to', null,
        'error', sqlerrm
      ));
    end;
    at := at + 1;
  end loop;

  return results;
end;
$function$;

comment on function public.storage_move_cards_batch(jsonb) is
  'Move a selection of storage rows in one request. Delegates to storage_move_cards per row so the merge, split and ownership rules cannot drift, and reports a reason per row that could not move.';

revoke all on function public.storage_move_cards_batch(jsonb) from public, anon, authenticated;
grant execute on function public.storage_move_cards_batch(jsonb) to authenticated;
