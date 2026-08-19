-- A bulk add has to remember which deck asked for the cards.
--
-- WHY THIS EXISTS
-- ---------------
-- `MissingCardsPanel` puts a whole deck's shortfall on the shopping list. It
-- used to do that with one `card_list_add` per card, which made a fifty card
-- shortfall fifty round trips, and per-card loops are the shape that has taken
-- this project down twice. Moving it onto `card_list_add_many` fixes the
-- traffic, and on its own it would have quietly lost something: the single-card
-- verb takes `p_source_deck_id` and the bulk one did not.
--
-- That column is not decoration. `FileArrivalPanel` reads `source_deck_id` to
-- preselect the deck when a bought card turns up, so "these are for Atraxa"
-- survives the weeks between ordering and the parcel arriving. Dropping it
-- would have swapped a visible bug for an invisible one.
--
-- WHY A DROP AND NOT JUST A REPLACE
-- ---------------------------------
-- Adding a fourth parameter with a default creates a SECOND function rather
-- than replacing the first, and a three-argument call would then be ambiguous
-- between them. So the old signature goes first. Nothing outside this project
-- calls it and `anon` has never held execute on it.

drop function if exists public.card_list_add_many(text, jsonb, text);

create or replace function public.card_list_add_many(
  p_kind text,
  p_items jsonb,
  p_source text default 'manual',
  p_source_deck_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_list uuid;
  v_rows integer;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'A bulk add needs a list of cards.' using errcode = '22023';
  end if;

  v_list := card_list_ensure(p_kind);

  with raw as (
    select
      btrim(coalesce(e ->> 'card_id', '')) as card_id,
      btrim(coalesce(e ->> 'card_name', '')) as card_name,
      nullif(btrim(coalesce(e ->> 'oracle_id', '')), '') as oracle_id,
      greatest(1, coalesce(nullif(e ->> 'quantity', '')::int, 1)) as quantity,
      coalesce(nullif(btrim(coalesce(e ->> 'finish', '')), ''), 'nonfoil') as finish
    from jsonb_array_elements(p_items) e
  ),
  valid as (
    select * from raw where card_id <> '' and card_name <> ''
  ),
  settled as (
    select
      v.card_id,
      v.card_name,
      coalesce(v.oracle_id, c.oracle_id) as oracle_id,
      v.quantity,
      case
        when v.finish = 'nonfoil'
         and c.finishes is not null
         and array_length(c.finishes, 1) = 1
         and not ('nonfoil' = any (c.finishes))
         and c.finishes[1] in ('foil', 'etched')
        then c.finishes[1]
        else v.finish
      end as finish
    from valid v
    left join cards c on c.id = v.card_id
  ),
  -- Duplicates WITHIN the payload are summed first, because ON CONFLICT cannot
  -- touch the same row twice in one statement, and a paste that lists Sol Ring
  -- under two headings is a normal paste.
  grouped as (
    select
      card_id,
      finish,
      min(card_name) as card_name,
      min(oracle_id) as oracle_id,
      sum(quantity)::int as quantity
    from settled
    group by card_id, finish
  )
  insert into card_list_items (
    list_id, user_id, kind, card_id, oracle_id, card_name,
    finish, quantity, source, source_deck_id
  )
  select
    v_list, auth.uid(), p_kind, g.card_id, g.oracle_id, g.card_name,
    g.finish, g.quantity, coalesce(p_source, 'manual'), p_source_deck_id
  from grouped g
  on conflict (list_id, card_id, finish) where status = 'want'
  -- The deck is filled in only where the row did not already name one, exactly
  -- as `card_list_add` does it. A card first added for Atraxa and later needed
  -- by a second deck keeps the deck it was first written down for, rather than
  -- having it overwritten by whichever deck asked most recently.
  do update set
    quantity = card_list_items.quantity + excluded.quantity,
    source_deck_id = coalesce(card_list_items.source_deck_id, excluded.source_deck_id);

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

comment on function public.card_list_add_many(text, jsonb, text, uuid) is
  'Put a whole list of cards on one of the caller''s lists in a single statement, raising quantities where a card is already there.';

revoke all on function public.card_list_add_many(text, jsonb, text, uuid) from anon, public;
grant execute on function public.card_list_add_many(text, jsonb, text, uuid) to authenticated;
