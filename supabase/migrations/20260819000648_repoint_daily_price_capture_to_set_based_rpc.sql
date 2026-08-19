-- Price-history coverage was 701 of 34,088 cards (2%), and 14 of the 583 cards
-- users actually own / wishlist / deck / list.
--
-- Cause: cron job 1 POSTed the `daily-price-capture` edge function, which
-- fetched Scryfall ONE CARD AT A TIME with a 125 ms delay (8 req/s). Its
-- default limit is 5000 cards => 625 s of sleeping alone, against an edge
-- wall clock of ~150 s. The function therefore died mid-loop after ~400 cards
-- every single night. The `hasMore` self-chaining that would have advanced the
-- offset sits AFTER the loop, so it never executed: the offset never left 0 and
-- the same first ~400 cards (ordered by `id`) were re-captured forever. Its
-- BATCH_SIZE = 75 constant (Scryfall's bulk /cards/collection limit) was
-- declared and never referenced.
--
-- The Scryfall traffic was never needed: `scryfall-sync` already refreshes
-- cards.prices nightly (33,903 of 34,088 rows touched within 2 days), so the
-- snapshot is a pure INSERT ... SELECT over a table we already have.
-- public.capture_daily_prices() does exactly that: measured 2,884 rows in 2.5 s.
--
-- COVERAGE POLICY (deliberate, not a silent cap):
--   Guaranteed  - every card in user_collections, wishlist, deck_cards or
--                 listings. These are the cards whose value the product
--                 actually reports, so they must never lack history.
--   Plus        - every card priced >= $5 USD (2,464 today), where price
--                 movement is material and price-drop-alerts needs a baseline.
--   Excluded    - the ~31k bulk-common tail. Snapshotting all 34,088 nightly
--                 costs ~5.1 GB/year at the measured 410 bytes/row (incl.
--                 indexes) to track cards that are worth cents and that no
--                 user holds. The chosen scope costs ~430 MB/year.
--   Scope widens automatically: the moment a user adds a card to a collection,
--   wishlist, deck or listing it enters the set on the next nightly run.
select cron.alter_job(
  1,
  command => $$select public.capture_daily_prices('relevant', 5)$$
);
