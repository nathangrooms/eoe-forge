-- Storage: make slots addressable, and make MOVING a card one action.
--
-- Two facts this migration is built on, both measured 2026-08-19:
--   * `storage_slots` already held 6 rows (six colour dividers in one bulk box)
--     and `storage_items.slot_id` was non-null on ZERO of them. The schema had
--     the concept; nothing ever wrote it and nothing ever drew it.
--   * There was no way to move a card between containers at all. The only
--     available path was unassign-then-assign, which is two writes with no
--     transaction around them: a failure between the two loses the card, and
--     the re-add re-derives the printing rather than carrying it.
--
-- So: a pocket address for binder pages, integrity constraints that make an
-- impossible arrangement impossible in the database rather than only in the UI,
-- and `storage_move_cards`, which does a whole move inside one statement.

/* ---------------------------------------------------------------- pockets */

-- A binder page has nine pockets and a card sits in one of them. `slot_id` is
-- the page; `pocket` is which pocket on that page. Null means "filed on this
-- page but not in a particular pocket", which has to stay legal: a user who
-- does not care about pocket order must never be forced to pick one.
alter table public.storage_items
  add column if not exists pocket integer;

comment on column public.storage_items.pocket is
  'Pocket 1-9 within the binder page named by slot_id. Null means filed without a specific pocket.';

do $$ begin
  alter table public.storage_items
    add constraint storage_items_pocket_range check (pocket is null or pocket between 1 and 9);
exception when duplicate_object then null; end $$;

-- A pocket without a page is an address with no street.
do $$ begin
  alter table public.storage_items
    add constraint storage_items_pocket_needs_slot check (pocket is null or slot_id is not null);
exception when duplicate_object then null; end $$;

-- A pocket physically holds one card. Three copies "in pocket 4" is not a thing
-- that can be true of a real binder, so the database refuses to record it; the
-- move function splits the stack instead.
do $$ begin
  alter table public.storage_items
    add constraint storage_items_pocket_holds_one check (pocket is null or qty = 1);
exception when duplicate_object then null; end $$;

-- Two cards cannot be in the same pocket either.
create unique index if not exists storage_items_one_card_per_pocket
  on public.storage_items (slot_id, pocket)
  where pocket is not null;

/* --------------------------------------------------------- one stack, once */

-- Copies of the same printing and finish, in the same place, are ONE stack with
-- a qty. `assignCard` already tried to enforce this by reading before writing,
-- which is a race: two quick clicks could both miss and both insert, and the
-- container would then show the same card twice with the copies split across
-- rows. Verified zero existing violations before adding this.
create unique index if not exists storage_items_one_stack_per_place
  on public.storage_items (
    container_id,
    coalesce(slot_id, '00000000-0000-0000-0000-000000000000'::uuid),
    card_id,
    foil
  )
  where pocket is null;

-- Slot order is the slot's identity for a binder (page 3 is the third page), so
-- two slots cannot share a position. Verified zero existing violations.
create unique index if not exists storage_slots_one_per_position
  on public.storage_slots (container_id, position);

/* ------------------------------------------------------------ adding slots */

/**
 * Append a page or a divider, numbered from what is already there.
 *
 * Position is assigned inside the statement rather than by the client reading
 * max(position) and writing it back, which two tabs can both win.
 */
create or replace function public.storage_add_slot(p_container uuid, p_name text)
returns public.storage_slots
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_owner uuid;
  v_slot public.storage_slots;
begin
  if auth.uid() is null then
    raise exception 'You are not signed in';
  end if;

  select user_id into v_owner from public.storage_containers where id = p_container;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'That container is not yours';
  end if;

  insert into public.storage_slots (container_id, name, position)
  select p_container,
         coalesce(nullif(btrim(p_name), ''), 'Section'),
         coalesce(max(position), -1) + 1
    from public.storage_slots
   where container_id = p_container
  returning * into v_slot;

  return v_slot;
end;
$fn$;

/* -------------------------------------------------------------- the move */

/**
 * Move `p_qty` copies out of one storage row and into a container, and
 * optionally a slot and a pocket. Returns the id of the row they landed in.
 *
 * Why this is a database function and not three client calls: a move must be
 * ONE action. The printing (`card_id`) and the finish (`foil`) are carried
 * across from the source row rather than looked up again, so what arrives is
 * the exact printing that left. Moving 1 of 3 copies splits the stack and
 * leaves 2 behind. Moving all of them repoints the original row, so the row and
 * its `created_at` survive the move rather than being deleted and reborn.
 *
 * Ownership is checked against `auth.uid()` on BOTH ends. It is SECURITY
 * DEFINER only so that the whole thing is one atomic statement under RLS that
 * would otherwise need the caller to re-read rows between writes.
 */
create or replace function public.storage_move_cards(
  p_item_id uuid,
  p_qty integer,
  p_to_container uuid,
  p_to_slot uuid default null,
  p_to_pocket integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_src public.storage_items;
  v_dest_owner uuid;
  v_slot_container uuid;
  v_target uuid;
  v_occupant uuid;
begin
  if v_uid is null then
    raise exception 'You are not signed in';
  end if;

  if p_qty is null or p_qty < 1 then
    raise exception 'Move at least one card';
  end if;

  select i.* into v_src
    from public.storage_items i
    join public.storage_containers c on c.id = i.container_id
   where i.id = p_item_id
     and c.user_id = v_uid
   for update of i;

  if not found then
    raise exception 'That card is not in your storage';
  end if;

  if p_qty > v_src.qty then
    raise exception 'There are only % of those here', v_src.qty;
  end if;

  select user_id into v_dest_owner from public.storage_containers where id = p_to_container;
  if v_dest_owner is null or v_dest_owner <> v_uid then
    raise exception 'That container is not yours';
  end if;

  if p_to_slot is not null then
    select container_id into v_slot_container from public.storage_slots where id = p_to_slot;
    if v_slot_container is null or v_slot_container <> p_to_container then
      raise exception 'That section is not in the container you are moving to';
    end if;
  end if;

  if p_to_pocket is not null then
    if p_to_slot is null then
      raise exception 'A pocket needs a page';
    end if;
    if p_to_pocket < 1 or p_to_pocket > 9 then
      raise exception 'A binder page has nine pockets';
    end if;
    if p_qty <> 1 then
      raise exception 'A pocket holds one card';
    end if;

    select id into v_occupant
      from public.storage_items
     where slot_id = p_to_slot and pocket = p_to_pocket and id <> v_src.id;
    if v_occupant is not null then
      raise exception 'That pocket already has a card in it';
    end if;
  end if;

  -- Already exactly there. Not an error, just nothing to do.
  if v_src.container_id = p_to_container
     and v_src.slot_id is not distinct from p_to_slot
     and v_src.pocket is not distinct from p_to_pocket then
    return v_src.id;
  end if;

  -- Somewhere to merge into? Only unpocketed stacks merge; a pocket holds one
  -- card and the checks above already guarantee that pocket is free.
  if p_to_pocket is null then
    select id into v_target
      from public.storage_items
     where container_id = p_to_container
       and slot_id is not distinct from p_to_slot
       and pocket is null
       and card_id = v_src.card_id
       and foil = v_src.foil
       and id <> v_src.id
     limit 1
     for update;
  end if;

  if v_target is not null then
    update public.storage_items
       set qty = qty + p_qty, updated_at = now()
     where id = v_target;
  elsif p_qty = v_src.qty then
    -- The whole stack, with nothing to merge into: repoint the row itself.
    update public.storage_items
       set container_id = p_to_container,
           slot_id = p_to_slot,
           pocket = p_to_pocket,
           updated_at = now()
     where id = v_src.id;
    return v_src.id;
  else
    insert into public.storage_items (container_id, slot_id, pocket, card_id, qty, foil)
    values (p_to_container, p_to_slot, p_to_pocket, v_src.card_id, p_qty, v_src.foil)
    returning id into v_target;
  end if;

  if p_qty = v_src.qty then
    delete from public.storage_items where id = v_src.id;
  else
    update public.storage_items
       set qty = qty - p_qty, updated_at = now()
     where id = v_src.id;
  end if;

  return v_target;
end;
$fn$;

revoke all on function public.storage_add_slot(uuid, text) from public, anon;
revoke all on function public.storage_move_cards(uuid, integer, uuid, uuid, integer) from public, anon;
grant execute on function public.storage_add_slot(uuid, text) to authenticated;
grant execute on function public.storage_move_cards(uuid, integer, uuid, uuid, integer) to authenticated;
