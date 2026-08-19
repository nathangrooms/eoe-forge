-- A card's page or divider has to be a page or divider OF THE BOX IT IS IN.
--
-- `storage_move_cards` already refuses a slot from the wrong container:
--
--     raise exception 'That section is not in the container you are moving to';
--
-- but that guard only exists inside the move function. Every other write to
-- `storage_items` goes through PostgREST as a plain insert or update, and
-- nothing there checked it:
--
--   * `StorageAPI.assignCard` inserts `{ container_id, slot_id, ... }` from
--     whatever the caller passed, and it is the call behind adding a card, the
--     quick-add panel, and the exported `fileCardsIntoContainer` that the
--     shopping list uses for its "arrived" step.
--   * the RLS policy on `storage_items` has WITH CHECK on `container_id` only,
--     so `slot_id` was never anybody's business. A row could name a slot in
--     another container, and even a slot in ANOTHER USER'S container: the
--     unique index `storage_items_one_card_per_pocket` is keyed on
--     (slot_id, pocket) with no user in it, so a foreign row sitting in someone
--     else's pocket 3 would make their own card refuse to file there.
--
-- A foreign key cannot say this on its own, because the constraint is between
-- two columns of this row and a column of another table. A trigger can, and it
-- runs on every path, including the ones written after today.

create or replace function public.storage_items_slot_matches_container()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_slot_container uuid;
begin
  if new.slot_id is null then
    return new;
  end if;

  select container_id into v_slot_container
    from public.storage_slots
   where id = new.slot_id;

  if v_slot_container is null or v_slot_container <> new.container_id then
    raise exception 'That section is not in the container this card is in'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

drop trigger if exists storage_items_slot_matches_container on public.storage_items;
create trigger storage_items_slot_matches_container
  before insert or update of slot_id, container_id on public.storage_items
  for each row
  execute function public.storage_items_slot_matches_container();

-- Verified before adding: no existing row breaks this.
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
    from public.storage_items i
    join public.storage_slots s on s.id = i.slot_id
   where s.container_id <> i.container_id;
  if v_bad > 0 then
    raise exception 'refusing to add the guard: % existing rows already name a slot in another container', v_bad;
  end if;
end $$;
