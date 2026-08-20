-- ---------------------------------------------------------------------------
-- The catalogue holds only real printings
-- ---------------------------------------------------------------------------
--
-- WHAT WAS WRONG
-- --------------
-- Five rows in `public.cards` were written by the seed migration
-- `20250828195035_60d0e5ea-5c29-48b7-8511-f28e18d0259a.sql` and never came from
-- Scryfall. Their primary keys are slugs, not Scryfall ids:
--
--   black-lotus, counterspell-lea, force-of-will, lightning-bolt-lea, tarmogoyf
--
-- Each also carries an invented `oracle_id`. That is the part that hurts. The
-- ids are shaped like UUIDs, so a sweep for a malformed oracle_id finds nothing,
-- but none of them is the oracle_id Scryfall gives the card. Measured before
-- this migration:
--
--   name            real oracle_id                        real printings
--   Black Lotus     5089ec1a-f881-4d55-af14-5d996171203b   4
--   Counterspell    cc187110-1148-4090-bbb8-e205694a39f5  63
--   Force of Will   956381ba-6d37-4a8a-846c-bad79222dbee  12
--   Lightning Bolt  4457ed35-7c10-48c8-9776-456485fdf070  54
--   Tarmogoyf       45900b2f-f6a9-4c42-9642-008f3c1cf6dd  11
--
-- Because `cards_unique` is one row per oracle_id, an invented oracle_id buys
-- the seed row its own row in the view. Both rows carry the same name, so they
-- are perfect trigram twins, and `resolve_card_names` had no honest way to tell
-- them apart. The typo "Lightnig Bolt" resolved to `lightning-bolt-lea`, and
-- accepting it puts an id on a proxy list that nothing else can resolve.
--
-- The seed rows are wrong on their own terms as well. Every one names a set it
-- does not show: `black-lotus` claims LEA and its art is the Vintage Masters
-- printing, `counterspell-lea` and `lightning-bolt-lea` claim LEA and show
-- Masters 25, `force-of-will` claims ALL and shows Double Masters. Collector
-- numbers and prices are invented too, so nothing in the row records a choice a
-- user made and nothing in it is worth keeping.
--
-- WHAT THIS DOES
-- --------------
-- 1. Moves every reference off the seed rows and onto the printing that
--    `cards_unique` already chooses for the real card, which is the same
--    printing search, deck building and the resolver would hand back. The
--    target is derived here rather than typed in, so the file states no id it
--    did not look up.
-- 2. Deletes the seed rows. `deck_cards.card_id` references `cards(id)` with
--    ON DELETE CASCADE, so the order matters: a delete first would have taken
--    a user's deck slot with it silently.
-- 3. Repairs the rows that point at a slug that was never in `cards` at all.
--    One wishlist row and one proxy list row both hold the literal text
--    `sol-ring`, which is a name key, not an id.
-- 4. Adds the check constraints that make the whole class impossible. The sync
--    writes `id: card.id` and `oracle_id: card.oracle_id || card.id`
--    (supabase/functions/scryfall-sync/index.ts:440), both always Scryfall
--    UUIDs, so nothing the sync produces can trip them.
--
-- WHAT THIS DOES NOT DO
-- ---------------------
-- It does not refresh `cards_unique`. A concurrent refresh was measured at
-- 180,682 ms on 2026-08-20 over 97,140 printings, which is far past any request
-- timeout, so this file records the request the way every other caller does and
-- the refresh is run separately. Until that refresh lands the view still serves
-- the five deleted rows.
--
-- Ten further wishlist rows point at Scryfall ids that are not in `cards`
-- (Demonic Consultation, Underground Sea, Volcanic Island, Lion's Eye Diamond,
-- Scrubland, Intuition, Plateau, Mox Diamond, Tundra, Lotus Petal, all one
-- user, all created 2025-09-02). Those are stale printings rather than invented
-- ones and they are left alone here.
--
-- Everything below is safe to run twice. On a second run the mapping table
-- comes back empty and every statement matches nothing.

-- ------------------------------------------------------ the five, and the map

drop table if exists _fake_printings;

create temporary table _fake_printings as
select
  f.id        as fake_id,
  f.oracle_id as fake_oracle_id,
  f.name      as name,
  r.id        as real_id,
  r.oracle_id as real_oracle_id
from public.cards f
join public.cards_unique r
  on r.name = f.name
 and r.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
where f.id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- A seed row that resolves to no real card, or to more than one, is not
-- something to guess at. Stop instead, with the row named.
do $$
declare
  v_unresolved text;
  v_ambiguous  text;
begin
  select string_agg(c.id, ', ' order by c.id) into v_unresolved
  from public.cards c
  where c.id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and not exists (select 1 from _fake_printings m where m.fake_id = c.id);

  if v_unresolved is not null then
    raise exception 'no real card carries the same name as: %', v_unresolved;
  end if;

  select string_agg(x.fake_id, ', ' order by x.fake_id) into v_ambiguous
  from (select fake_id from _fake_printings group by fake_id having count(*) > 1) x;

  if v_ambiguous is not null then
    raise exception 'more than one real card carries the same name as: %', v_ambiguous;
  end if;
end $$;

-- ------------------------------------------------------------------ the decks
--
-- `deck_cards` is unique on (deck_id, card_id). A deck that already holds the
-- real printing absorbs the quantity rather than losing it to a conflict.

update public.deck_cards k
   set quantity = k.quantity + d.quantity
  from public.deck_cards d
  join _fake_printings m on m.fake_id = d.card_id
 where k.deck_id = d.deck_id
   and k.card_id = m.real_id;

delete from public.deck_cards d
 using _fake_printings m
 where d.card_id = m.fake_id
   and exists (
     select 1 from public.deck_cards k
      where k.deck_id = d.deck_id and k.card_id = m.real_id
   );

update public.deck_cards d
   set card_id = m.real_id
  from _fake_printings m
 where d.card_id = m.fake_id;

update public.deck_maybeboard d
   set card_id = m.real_id
  from _fake_printings m
 where d.card_id = m.fake_id;

-- --------------------------------------------- the shopping and proxy lists
--
-- `card_list_items` is unique on (list_id, card_id, finish) for wanted rows
-- only, so the merge is scoped the same way. `oracle_id` travels with the
-- card_id: leaving the invented one behind would keep the row pointing at a
-- card that no longer exists.

update public.card_list_items k
   set quantity   = k.quantity + i.quantity,
       updated_at = now()
  from public.card_list_items i
  join _fake_printings m on m.fake_id = i.card_id
 where k.list_id = i.list_id
   and k.card_id = m.real_id
   and k.finish  = i.finish
   and k.status  = 'want'
   and i.status  = 'want';

delete from public.card_list_items i
 using _fake_printings m
 where i.card_id = m.fake_id
   and i.status = 'want'
   and exists (
     select 1 from public.card_list_items k
      where k.list_id = i.list_id
        and k.card_id = m.real_id
        and k.finish  = i.finish
        and k.status  = 'want'
   );

update public.card_list_items i
   set card_id    = m.real_id,
       oracle_id  = m.real_oracle_id,
       updated_at = now()
  from _fake_printings m
 where i.card_id = m.fake_id;

update public.card_list_items i
   set arrived_card_id = m.real_id,
       updated_at      = now()
  from _fake_printings m
 where i.arrived_card_id = m.fake_id;

-- ------------------------------------------ collections, storage, marketplace
--
-- All four measured empty on 2026-08-20. They are written anyway because the
-- next environment this file runs in will not have measured the same.

update public.user_collections u
   set card_id = m.real_id
  from _fake_printings m
 where u.card_id = m.fake_id;

update public.storage_items s
   set card_id = m.real_id
  from _fake_printings m
 where s.card_id = m.fake_id;

update public.listings l
   set card_id = m.real_id
  from _fake_printings m
 where l.card_id = m.fake_id;

update public.price_alerts a
   set card_id = m.real_id
  from _fake_printings m
 where a.card_id = m.fake_id;

update public.wishlist k
   set quantity = k.quantity + w.quantity, updated_at = now()
  from public.wishlist w
  join _fake_printings m on m.fake_id = w.card_id
 where k.user_id = w.user_id
   and k.card_id = m.real_id;

update public.wishlist w
   set card_id = m.real_id, updated_at = now()
  from _fake_printings m
 where w.card_id = m.fake_id
   and not exists (
     select 1 from public.wishlist x
      where x.user_id = w.user_id and x.card_id = m.real_id
   );

delete from public.wishlist w
 using _fake_printings m
 where w.card_id = m.fake_id;

-- ------------------------------------------------------------ the price rows
--
-- Four price points exist against the seed rows, one day each, captured
-- 2026-08-19 from the invented prices the seed wrote ($50,000 for Black Lotus,
-- $1.25 for an Alpha Counterspell). Folding those into a real printing's
-- history would put made up numbers in a price chart, so they are deleted
-- rather than moved.

delete from public.card_price_point p
 using public.card_price_key k, _fake_printings m
 where p.card_key = k.card_key
   and k.card_id  = m.fake_id;

delete from public.card_price_key k
 using _fake_printings m
 where k.card_id = m.fake_id;

-- ------------------------------------------------------------- the seed rows

delete from public.cards c
 using _fake_printings m
 where c.id = m.fake_id;

-- ---------------------------------------------- ids that were never cards
--
-- `sol-ring` is a name key sitting in a card_id column, in one wishlist row and
-- one proxy list row. There is no row in `cards` to migrate from, so the repair
-- goes through the name the row already stores, and only when that name matches
-- exactly one card.

drop table if exists _slug_targets;

create temporary table _slug_targets as
with wanted as (
  select card_name from public.wishlist
   where card_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union
  select card_name from public.card_list_items
   where card_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
select cu.name, min(cu.id) as real_id, min(cu.oracle_id) as real_oracle_id
from public.cards_unique cu
join wanted w on w.card_name = cu.name
group by cu.name
having count(*) = 1;

update public.wishlist w
   set card_id = t.real_id, updated_at = now()
  from _slug_targets t
 where t.name = w.card_name
   and w.card_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and not exists (
     select 1 from public.wishlist x
      where x.user_id = w.user_id and x.card_id = t.real_id
   );

update public.card_list_items i
   set card_id    = t.real_id,
       oracle_id  = t.real_oracle_id,
       updated_at = now()
  from _slug_targets t
 where t.name = i.card_name
   and i.card_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and not exists (
     select 1 from public.card_list_items k
      where k.list_id = i.list_id
        and k.card_id = t.real_id
        and k.finish  = i.finish
        and k.status  = 'want'
   );

-- ------------------------------------------------------------- the guard rail
--
-- Scryfall ids are UUIDs, always. A row whose primary key is not one did not
-- come from Scryfall, and a fabricated oracle_id is what turns a stray row into
-- a second entry in `cards_unique`. NULL stays allowed on oracle_id because the
-- sync would rather record "not known" than guess, and a null does not create a
-- twin.

alter table public.cards
  drop constraint if exists cards_id_is_a_scryfall_uuid;

alter table public.cards
  add constraint cards_id_is_a_scryfall_uuid
  check (id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

comment on constraint cards_id_is_a_scryfall_uuid on public.cards is
  'A card id comes from Scryfall or it does not belong in the catalogue. Five seeded rows with slug ids were removed on 2026-08-20.';

alter table public.cards
  drop constraint if exists cards_oracle_id_is_a_uuid;

alter table public.cards
  add constraint cards_oracle_id_is_a_uuid
  check (oracle_id is null or oracle_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

comment on constraint cards_oracle_id_is_a_uuid on public.cards is
  'An invented oracle_id gives a card a second row in cards_unique and a perfect trigram twin of itself.';

-- ----------------------------------------------------------- ask for the view
--
-- `cards_unique` still holds a row per deleted seed card until it is rebuilt.
-- This is the same request path `refresh_cards_unique` uses when the caller has
-- no time to do the rebuild itself.

update public.cards_unique_refresh_state set requested_at = now() where id;

drop table if exists _fake_printings;
drop table if exists _slug_targets;
