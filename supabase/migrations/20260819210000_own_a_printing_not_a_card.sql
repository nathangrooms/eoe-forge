-- You own a printing, not a card.
--
-- WHAT CHANGED UNDER THIS
-- -----------------------
-- Until 19 Aug 2026 `cards` held one printing of every card, because the sync
-- asked Scryfall for `unique=cards`. So the printing id on a collection row or
-- a listing was never a choice anybody made: it was whichever row survived. Now
-- the catalogue holds every printing, and printings of one card differ
-- enormously in price.
--
-- That turns an old silence into a lie. Summing a collection at the price of an
-- arbitrary printing produces a confident number that is not the owner's
-- number, and nothing on screen admits it. These two objects are what let the
-- product admit it.
--
-- WHY A FLAG AND NOT A GUESS
-- --------------------------
-- Every existing row already points at a real printing, so there is no way to
-- tell from the data alone whether a human chose it. `printing_chosen` records
-- the fact going forward and starts false on everything that exists, which is
-- the honest reading: none of those rows were chosen against a catalogue that
-- had alternatives, because at the time it did not.
--
-- False does NOT mean the value is unknowable. A card that exists in exactly
-- one printing has nothing to choose, and `card_printing_spread` is how the
-- app tells that case apart from a real question. Without it a collection of
-- single-printing cards would report "nothing confirmed" and look broken while
-- being completely knowable.

-- ------------------------------------------------------- did somebody choose?

alter table public.user_collections
  add column if not exists printing_chosen boolean not null default false;

comment on column public.user_collections.printing_chosen is
  'True once the owner said which printing this row is. False means the printing was assigned by a name lookup, so its price is a sample from a range and must not be presented as this collection''s value. Existing rows start false because the catalogue held one printing per card when they were written.';

alter table public.listings
  add column if not exists printing_chosen boolean not null default false;

comment on column public.listings.printing_chosen is
  'True once the seller said which printing is in the sleeve. A listing is always for one printing, so a false here is a listing that has not yet said which, and the interface asks before it goes public.';
