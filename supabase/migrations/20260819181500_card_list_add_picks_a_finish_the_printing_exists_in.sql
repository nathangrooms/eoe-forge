-- Adding a card defaults to a plain copy, and some printings were never made
-- as one.
--
-- Craterhoof Behemoth `cmm` is the case that found this, on the first
-- screenshot run rather than in review: `finishes` is `['etched']` and the only
-- price on the row is `usd_etched`. A list row asking for a non-foil copy of
-- that printing is asking for something that does not exist, so the price panel
-- correctly reported no price and the shopping total correctly left the card
-- out, and the player was looking at a card the product could not price and
-- could not explain why.
--
-- So when the caller takes the default and the printing does not offer it, and
-- the printing offers exactly one finish, that is the finish. Only that case: a
-- printing made in both normal and foil keeps the default, because there the
-- default is a real choice rather than an impossible one. An explicit finish
-- from the caller is never overridden.
--
-- Verified against the live database as the `authenticated` role: the etched
-- only printing resolves to 'etched', a printing made in both keeps 'nonfoil',
-- and an explicit 'foil' survives.

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
  v_finish text;
  v_finishes text[];
begin
  if coalesce(p_quantity, 0) < 1 then
    raise exception 'A list entry needs at least one copy.' using errcode = '22023';
  end if;
  if coalesce(p_card_id, '') = '' or coalesce(p_card_name, '') = '' then
    raise exception 'A list entry needs a card.' using errcode = '22023';
  end if;

  v_list := card_list_ensure(p_kind);
  v_finish := coalesce(p_finish, 'nonfoil');

  select oracle_id, finishes into v_oracle, v_finishes from cards where id = p_card_id;
  v_oracle := coalesce(p_oracle_id, v_oracle);

  if v_finish = 'nonfoil'
     and v_finishes is not null
     and array_length(v_finishes, 1) = 1
     and not ('nonfoil' = any (v_finishes))
     and v_finishes[1] in ('foil', 'etched')
  then
    v_finish := v_finishes[1];
  end if;

  update card_list_items
     set quantity = quantity + p_quantity,
         source_deck_id = coalesce(source_deck_id, p_source_deck_id),
         note = coalesce(p_note, note)
   where list_id = v_list
     and card_id = p_card_id
     and finish = v_finish
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
    v_finish, p_quantity, coalesce(p_source, 'manual'), p_source_deck_id, p_note
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.card_list_add is
  'Add copies of a printing to the caller''s list, raising the quantity if it is already there. Falls to the printing''s only finish when a plain copy was never made.';
