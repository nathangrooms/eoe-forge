-- A seat screen has to hear somebody arrive.
--
-- `set_online_seat`, `leave_online_table` and `start_online_table` each end with
-- a `realtime.send` on the table's own topic. `create_online_table` and
-- `join_online_table` do not, and joining is precisely the event the people
-- already in the room most need to see. The seat screen would therefore have sat
-- there showing three chairs while a fourth person waited in one of them.
--
-- Fixed on the row rather than in the two function bodies, for the same reason
-- the entry rule is a trigger: there are five ways a seat can change today and
-- there will be more, and a rule copied into each of them is a rule that one of
-- them will be missing.
--
-- Row level here, unlike the lobby nudge in 20260821172232, because the message
-- has to name a table and a statement does not have one. The volume is a
-- message per person sitting down or standing up, which is nothing.

create or replace function public.nudge_the_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table uuid := coalesce(new.table_id, old.table_id);
begin
  perform realtime.send(
    jsonb_build_object('kind', 'lobby'),
    'lobby',
    'game:' || v_table::text,
    true
  );
  return null;
end;
$$;

comment on function public.nudge_the_room() is
  'Tell one table''s room that its seats changed. The room then re-reads online_table_room, which is the only thing that decides what is true.';

drop trigger if exists game_participants_nudge_room on public.game_participants;
create trigger game_participants_nudge_room
  after insert or delete
  or update of ready, deck_id, deck_name, deck_size, commanders, display_name,
               seed_commitment
  on public.game_participants
  for each row execute function public.nudge_the_room();

revoke all on function public.nudge_the_room() from public, anon, authenticated;
