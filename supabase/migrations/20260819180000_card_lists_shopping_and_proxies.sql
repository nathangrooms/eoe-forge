-- One list primitive, two instances: the shopping list and the proxy list.
--
-- WHY ONE TABLE AND NOT TWO
-- -------------------------
-- A shopping list and a proxy list are the same object. Both are a user-curated
-- set of cards, added to from anywhere in the product, each entry carrying a
-- quantity and a chosen printing, and both end in an action. The action is the
-- only real difference: shopping buys, proxies print. Writing them as two
-- parallel schemas guarantees they drift, and drift is exactly what produced
-- nine power implementations in this project. So there is one pair of tables
-- and a `kind`.
--
-- WHAT IS DIFFERENT, AND HOW THE DATABASE KNOWS
-- ---------------------------------------------
-- Shopping has a lifecycle: want -> bought -> arrived -> filed. Proxies do not;
-- a proxy list is print, done. That is enforced here rather than left to the
-- interface: `card_list_items` carries the list's `kind` under a composite
-- foreign key, so a check constraint can refuse any status other than 'want' on
-- a proxy row. A bug in the client cannot put a proxy "in the post".
--
-- WHY THE LIFECYCLE IS STATE ON A ROW AND NOT A UI MODE
-- -----------------------------------------------------
-- "I bought this three weeks ago and it never turned up" is a fact about the
-- world, and the product should hold it. Each transition writes its own
-- timestamp (`bought_at`, `arrived_at`, `filed_at`) and the status column is
-- constrained to agree with them, so a row can never claim to have arrived
-- without saying when. "Arriving" is not a fifth status: it is the state of
-- having bought something that has not landed, which is exactly
-- `status = 'bought'`. Adding a separate status would be a step a user has to
-- click through that records nothing new.
--
-- WHAT WAS PAID IS NOT WHAT IT IS WORTH
-- -------------------------------------
-- `paid_unit` / `paid_currency` record the price actually paid, per copy, in
-- the money it was paid in. That is a different fact from today's market price
-- and both matter, so neither overwrites the other. The pair is constrained to
-- travel together: a number with no currency is not a price. Both are nullable,
-- because "bought in a bundle and I do not know the per-card price" is a real
-- situation, and unknown is not zero.
--
-- WHY card_id IS NOT A FOREIGN KEY TO cards
-- -----------------------------------------
-- Same reason `deck_cards.card_id` is not. Lists take entries from text
-- imports, from search results resolved against Scryfall directly, and from
-- decks whose `card_id` was never a Scryfall id. A foreign key would reject
-- those at the point the user is trying to write something down. `oracle_id` is
-- copied in where we can resolve it, purely so printings of one card can be
-- grouped for display.

-- ---------------------------------------------------------------- the lists

create table if not exists public.card_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('shopping', 'proxy')),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Redundant on its own (id is already unique) but it is what lets an item row
  -- carry the list's kind under a composite foreign key, which is what makes
  -- the proxy-has-no-lifecycle check below possible at all.
  unique (id, kind)
);

-- The owner asked for "one shopping list per user", so the database says so
-- rather than the client remembering to.
create unique index if not exists card_lists_one_per_user_kind
  on public.card_lists (user_id, kind);

-- ---------------------------------------------------------------- the items

create table if not exists public.card_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.card_lists(id) on delete cascade,
  -- Denormalised so every policy on this table is a plain `auth.uid() = user_id`
  -- rather than a subquery per row.
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('shopping', 'proxy')),
  foreign key (list_id, kind) references public.card_lists (id, kind) on delete cascade,

  -- The printing the user chose. Not a foreign key: see the header.
  card_id text not null,
  oracle_id text,
  card_name text not null,
  finish text not null default 'nonfoil' check (finish in ('nonfoil', 'foil', 'etched')),
  quantity integer not null default 1 check (quantity > 0),
  note text,

  -- Why the card is here. A player buying decides differently when a card is
  -- needed by three decks than when they idly wishlisted it, so the reason is
  -- data, not decoration.
  source text not null default 'manual'
    check (source in ('manual', 'wishlist', 'deck', 'suggestion', 'marketplace')),
  source_deck_id uuid references public.user_decks(id) on delete set null,

  status text not null default 'want'
    check (status in ('want', 'bought', 'arrived', 'filed', 'cancelled')),
  -- A proxy list is print, done. No proxy row may ever hold a buying state.
  constraint card_list_items_proxies_have_no_lifecycle
    check (kind = 'shopping' or status = 'want'),

  paid_unit numeric(10, 2) check (paid_unit is null or paid_unit > 0),
  paid_currency text check (paid_currency in ('USD', 'EUR')),
  constraint card_list_items_paid_is_a_pair
    check ((paid_unit is null) = (paid_currency is null)),

  bought_at timestamptz,
  arrived_at timestamptz,
  filed_at timestamptz,

  -- A parcel does not always hold what was ordered. When the copy that turned
  -- up is a different printing or a different finish, that is recorded rather
  -- than quietly filed as the thing that was ordered.
  arrived_card_id text,
  arrived_finish text check (arrived_finish in ('nonfoil', 'foil', 'etched')),

  filed_container_id uuid references public.storage_containers(id) on delete set null,
  filed_deck_id uuid references public.user_decks(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The status and the dates cannot disagree. Without this a row could say
  -- "arrived" and hold no arrival date, and the purchase history would be a
  -- set of claims with no times attached.
  constraint card_list_items_dates_match_status check (
    (status <> 'want' or (bought_at is null and arrived_at is null and filed_at is null))
    and (status not in ('bought', 'arrived', 'filed') or bought_at is not null)
    and (status not in ('arrived', 'filed') or arrived_at is not null)
    and (status <> 'filed' or filed_at is not null)
  )
);

-- One row per printing per finish while it is still wanted. Adding a card that
-- is already on the list raises its quantity instead of making a second row,
-- because two rows for one printing is two shopping decisions about one card.
-- Restricted to 'want' on purpose: once a copy is bought it becomes its own
-- record of that purchase, and wanting another copy of the same card afterwards
-- has to be allowed.
create unique index if not exists card_list_items_one_wanted_row_per_printing
  on public.card_list_items (list_id, card_id, finish)
  where status = 'want';

create index if not exists card_list_items_by_list_status
  on public.card_list_items (list_id, status);
create index if not exists card_list_items_by_user_status
  on public.card_list_items (user_id, status);
create index if not exists card_list_items_by_card
  on public.card_list_items (card_id);
-- Drives the "arriving" strip on the collection page.
create index if not exists card_list_items_in_transit
  on public.card_list_items (user_id, bought_at)
  where status in ('bought', 'arrived');

drop trigger if exists card_lists_touch on public.card_lists;
create trigger card_lists_touch before update on public.card_lists
  for each row execute function public.touch_updated_at();

drop trigger if exists card_list_items_touch on public.card_list_items;
create trigger card_list_items_touch before update on public.card_list_items
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------- access
--
-- Two layers, deliberately. The privilege layer says anon has no business here
-- at all; the policy layer says a signed-in user sees only their own rows.
--
-- The grant is revoked at TABLE level, not per column. `docs/overhaul/RLS-AUDIT.md`
-- records the trap: a column-level revoke does nothing while a table-level
-- grant is standing, because the table grant already covers every column.
-- Supabase's default privileges hand new public tables to `anon` on creation,
-- so this revoke is doing real work rather than restating a default.

revoke all on public.card_lists from anon, public;
revoke all on public.card_list_items from anon, public;
grant select, insert, update, delete on public.card_lists to authenticated;
grant select, insert, update, delete on public.card_list_items to authenticated;

alter table public.card_lists enable row level security;
alter table public.card_list_items enable row level security;

drop policy if exists "Owners read their card lists" on public.card_lists;
create policy "Owners read their card lists" on public.card_lists
  for select to authenticated using (auth.uid() = user_id);

-- Every write policy carries its own WITH CHECK. Postgres silently reuses
-- USING as the check when one is missing, which is how the `profiles`
-- privilege escalation in the RLS audit came about.
drop policy if exists "Owners create their card lists" on public.card_lists;
create policy "Owners create their card lists" on public.card_lists
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Owners update their card lists" on public.card_lists;
create policy "Owners update their card lists" on public.card_lists
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Owners delete their card lists" on public.card_lists;
create policy "Owners delete their card lists" on public.card_lists
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Owners read their card list items" on public.card_list_items;
create policy "Owners read their card list items" on public.card_list_items
  for select to authenticated using (auth.uid() = user_id);

-- The insert check tests the parent list as well as the denormalised user_id.
-- Without it, a caller could write their own user_id onto a row pointed at
-- somebody else's list and have it pass.
drop policy if exists "Owners create their card list items" on public.card_list_items;
create policy "Owners create their card list items" on public.card_list_items
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.card_lists l
      where l.id = list_id and l.user_id = auth.uid()
    )
  );

drop policy if exists "Owners update their card list items" on public.card_list_items;
create policy "Owners update their card list items" on public.card_list_items
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.card_lists l
      where l.id = list_id and l.user_id = auth.uid()
    )
  );

drop policy if exists "Owners delete their card list items" on public.card_list_items;
create policy "Owners delete their card list items" on public.card_list_items
  for delete to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------- the verbs
--
-- Every function below is SECURITY INVOKER. They are conveniences that wrap
-- several statements in one round trip, not privilege escalations: each one
-- runs as the caller and is filtered by exactly the policies above. Nothing
-- here can read or write a row the caller could not have reached with plain
-- SQL. That is why none of them takes a user id as an argument.

create or replace function public.card_list_ensure(p_kind text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in to use a list.' using errcode = '42501';
  end if;
  if p_kind not in ('shopping', 'proxy') then
    raise exception 'Unknown list kind: %', p_kind using errcode = '22023';
  end if;

  select id into v_id from card_lists where user_id = auth.uid() and kind = p_kind;
  if v_id is not null then
    return v_id;
  end if;

  insert into card_lists (user_id, kind, name)
  values (
    auth.uid(),
    p_kind,
    case p_kind when 'shopping' then 'Shopping list' else 'Proxy list' end
  )
  -- Two tabs adding a first card at the same moment must not collide.
  on conflict (user_id, kind) do update set updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.card_list_ensure(text) is
  'The caller''s list of this kind, created on first use. One per user per kind.';

create or replace function public.card_list_add(
  p_kind text,
  p_card_id text,
  p_card_name text,
  p_quantity integer default 1,
  p_finish text default 'nonfoil',
  p_source text default 'manual',
  p_source_deck_id uuid default null,
  p_oracle_id text default null,
  p_note text default null
)
returns public.card_list_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_list uuid;
  v_row card_list_items;
  v_oracle text;
begin
  if coalesce(p_quantity, 0) < 1 then
    raise exception 'A list entry needs at least one copy.' using errcode = '22023';
  end if;
  if coalesce(p_card_id, '') = '' or coalesce(p_card_name, '') = '' then
    raise exception 'A list entry needs a card.' using errcode = '22023';
  end if;

  v_list := card_list_ensure(p_kind);
  v_oracle := coalesce(p_oracle_id, (select oracle_id from cards where id = p_card_id));

  update card_list_items
     set quantity = quantity + p_quantity,
         source_deck_id = coalesce(source_deck_id, p_source_deck_id),
         note = coalesce(p_note, note)
   where list_id = v_list
     and card_id = p_card_id
     and finish = p_finish
     and status = 'want'
  returning * into v_row;

  if found then
    return v_row;
  end if;

  insert into card_list_items (
    list_id, user_id, kind, card_id, oracle_id, card_name,
    finish, quantity, source, source_deck_id, note
  )
  values (
    v_list, auth.uid(), p_kind, p_card_id, v_oracle, p_card_name,
    p_finish, p_quantity, coalesce(p_source, 'manual'), p_source_deck_id, p_note
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.card_list_add is
  'Add copies of a printing to the caller''s list, raising the quantity if it is already there.';

-- Marking part of a line bought splits the line, because the two halves are now
-- different facts: one has a price and a date, the other is still a want.
create or replace function public.card_list_mark_bought(
  p_item_id uuid,
  p_quantity integer default null,
  p_paid_unit numeric default null,
  p_paid_currency text default null,
  p_bought_at timestamptz default now()
)
returns public.card_list_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item card_list_items;
  v_qty integer;
  v_row card_list_items;
begin
  select * into v_item from card_list_items where id = p_item_id;
  if not found then
    raise exception 'That list entry is not there any more.' using errcode = 'P0002';
  end if;
  if v_item.kind <> 'shopping' then
    raise exception 'Only shopping list entries can be bought.' using errcode = '22023';
  end if;
  if v_item.status <> 'want' then
    raise exception 'That entry is already marked as %.', v_item.status using errcode = '22023';
  end if;
  if (p_paid_unit is null) <> (p_paid_currency is null) then
    raise exception 'A price needs the money it was paid in.' using errcode = '22023';
  end if;

  v_qty := least(coalesce(p_quantity, v_item.quantity), v_item.quantity);
  if v_qty < 1 then
    raise exception 'Buying needs at least one copy.' using errcode = '22023';
  end if;

  if v_qty < v_item.quantity then
    update card_list_items set quantity = quantity - v_qty where id = v_item.id;

    insert into card_list_items (
      list_id, user_id, kind, card_id, oracle_id, card_name, finish, quantity,
      note, source, source_deck_id, status, paid_unit, paid_currency, bought_at
    )
    values (
      v_item.list_id, v_item.user_id, v_item.kind, v_item.card_id, v_item.oracle_id,
      v_item.card_name, v_item.finish, v_qty, v_item.note, v_item.source,
      v_item.source_deck_id, 'bought', p_paid_unit, p_paid_currency,
      coalesce(p_bought_at, now())
    )
    returning * into v_row;
    return v_row;
  end if;

  update card_list_items
     set status = 'bought',
         paid_unit = p_paid_unit,
         paid_currency = p_paid_currency,
         bought_at = coalesce(p_bought_at, now())
   where id = v_item.id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.card_list_mark_bought is
  'Record a purchase: how many copies, what was paid per copy, and when. Splits the line on a partial buy.';

create or replace function public.card_list_mark_arrived(
  p_item_id uuid,
  p_arrived_card_id text default null,
  p_arrived_finish text default null,
  p_arrived_at timestamptz default now()
)
returns public.card_list_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item card_list_items;
  v_row card_list_items;
begin
  select * into v_item from card_list_items where id = p_item_id;
  if not found then
    raise exception 'That list entry is not there any more.' using errcode = 'P0002';
  end if;
  if v_item.status <> 'bought' then
    raise exception 'Only something you have bought can arrive.' using errcode = '22023';
  end if;

  update card_list_items
     set status = 'arrived',
         arrived_at = coalesce(p_arrived_at, now()),
         -- Stored only when it genuinely differs, so "arrived as ordered" and
         -- "arrived as something else" stay distinguishable in the data.
         arrived_card_id = case
           when p_arrived_card_id is null or p_arrived_card_id = v_item.card_id then null
           else p_arrived_card_id end,
         arrived_finish = case
           when p_arrived_finish is null or p_arrived_finish = v_item.finish then null
           else p_arrived_finish end
   where id = v_item.id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.card_list_mark_arrived is
  'Mark a bought entry as in hand, recording the printing that actually turned up when it differs.';

-- Filing is the one verb that writes outside these tables, so it is written
-- once here rather than as three client round trips that can half-succeed.
create or replace function public.card_list_file(
  p_item_id uuid,
  p_to_collection boolean default true,
  p_container_id uuid default null,
  p_deck_id uuid default null
)
returns public.card_list_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item card_list_items;
  v_row card_list_items;
  v_card text;
  v_finish text;
  v_foil boolean;
  v_name text;
  v_set text;
  v_existing uuid;
begin
  select * into v_item from card_list_items where id = p_item_id;
  if not found then
    raise exception 'That list entry is not there any more.' using errcode = 'P0002';
  end if;
  if v_item.status <> 'arrived' then
    raise exception 'Mark it as arrived before filing it away.' using errcode = '22023';
  end if;

  -- Everything below files the copy that actually turned up, not the one that
  -- was ordered.
  v_card := coalesce(v_item.arrived_card_id, v_item.card_id);
  v_finish := coalesce(v_item.arrived_finish, v_item.finish);
  v_foil := v_finish <> 'nonfoil';

  select name, set_code into v_name, v_set from cards where id = v_card;
  v_name := coalesce(v_name, v_item.card_name);

  if p_to_collection then
    if v_set is null then
      raise exception
        'We do not hold this printing in the card catalogue, so it cannot be added to your collection yet.'
        using errcode = '22023';
    end if;

    -- `user_collections` has no unique key on (user_id, card_id) — checked on
    -- the live database — so an ON CONFLICT upsert here would raise rather than
    -- merge. Find the row and add to it, or write a new one.
    select id into v_existing
      from user_collections
     where user_id = v_item.user_id and card_id = v_card
     order by created_at
     limit 1;

    if v_existing is not null then
      update user_collections
         set quantity = quantity + case when v_foil then 0 else v_item.quantity end,
             foil = foil + case when v_foil then v_item.quantity else 0 end
       where id = v_existing;
    else
      insert into user_collections (user_id, card_id, card_name, set_code, quantity, foil)
      values (
        v_item.user_id, v_card, v_name, v_set,
        case when v_foil then 0 else v_item.quantity end,
        case when v_foil then v_item.quantity else 0 end
      );
    end if;
  end if;

  if p_container_id is not null then
    -- Ownership of the container is enforced by storage_items' own policy,
    -- which keys on the container's user_id. A forged id fails there.
    insert into storage_items (container_id, card_id, qty, foil)
    values (p_container_id, v_card, v_item.quantity, v_foil)
    on conflict (container_id, coalesce(slot_id, '00000000-0000-0000-0000-000000000000'::uuid), card_id, foil)
      where pocket is null
      do update set qty = storage_items.qty + excluded.qty;
  end if;

  if p_deck_id is not null then
    insert into deck_cards (deck_id, card_id, card_name, quantity)
    values (p_deck_id, v_card, v_name, v_item.quantity)
    on conflict (deck_id, card_id)
      do update set quantity = deck_cards.quantity + excluded.quantity;
  end if;

  update card_list_items
     set status = 'filed',
         filed_at = now(),
         filed_container_id = p_container_id,
         filed_deck_id = p_deck_id
   where id = v_item.id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.card_list_file is
  'Put an arrived card away: into the collection, a storage box, and a deck. Any of the three is optional.';

-- Undo. Someone ticks the wrong row on a list of twenty and needs it back.
create or replace function public.card_list_reset(p_item_id uuid)
returns public.card_list_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row card_list_items;
begin
  update card_list_items
     set status = 'want',
         paid_unit = null,
         paid_currency = null,
         bought_at = null,
         arrived_at = null,
         filed_at = null,
         arrived_card_id = null,
         arrived_finish = null,
         filed_container_id = null,
         filed_deck_id = null
   where id = p_item_id and status <> 'filed'
  returning * into v_row;

  if not found then
    raise exception
      'That entry has already been filed away, so putting it back would need the collection changed too.'
      using errcode = '22023';
  end if;
  return v_row;
end;
$$;

comment on function public.card_list_reset is
  'Put an entry back to wanted. Refuses once it has been filed, because filing already changed the collection.';

revoke all on function public.card_list_ensure(text) from anon, public;
revoke all on function public.card_list_add(text, text, text, integer, text, text, uuid, text, text) from anon, public;
revoke all on function public.card_list_mark_bought(uuid, integer, numeric, text, timestamptz) from anon, public;
revoke all on function public.card_list_mark_arrived(uuid, text, text, timestamptz) from anon, public;
revoke all on function public.card_list_file(uuid, boolean, uuid, uuid) from anon, public;
revoke all on function public.card_list_reset(uuid) from anon, public;

grant execute on function public.card_list_ensure(text) to authenticated;
grant execute on function public.card_list_add(text, text, text, integer, text, text, uuid, text, text) to authenticated;
grant execute on function public.card_list_mark_bought(uuid, integer, numeric, text, timestamptz) to authenticated;
grant execute on function public.card_list_mark_arrived(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.card_list_file(uuid, boolean, uuid, uuid) to authenticated;
grant execute on function public.card_list_reset(uuid) to authenticated;
