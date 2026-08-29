-- 793 lands disagreed with themselves about what they tap for.
--
-- What a land taps for is a property of the CARD. Every printing of Command
-- Tower taps for the same mana; the borderless one does not tap differently
-- from the retro frame. But `produced_mana` is stored per PRINTING, and the
-- catalogue changed from one printing per card to all of them, so a card can
-- now hold the answer on the printing that was already here and nothing on the
-- fourteen that arrived later.
--
-- Measured before this ran, over 1,213 distinct lands:
--
--   53   no printing knows                        a real gap, untouched here
--   793  SOME printings know and others do not    this migration
--
-- The 5,728 figure quoted earlier was PRINTINGS, which overstates the problem
-- by counting the same card many times. The owner caught it: the growth from
-- 34,088 rows to 98,041 is mainly alternative art, and distinct cards barely
-- moved, 33,037 to 33,032.
--
-- WHY IT MATTERS AND IS NOT COSMETIC. `cards_unique` holds ONE printing per
-- oracle_id, chosen by cheapest USD price. Nothing in that choice knows about
-- `produced_mana`, so for these 793 the representative row is a coin flip
-- between a printing that knows and one that does not. When it lands on an
-- unknown one the app treats a fully understood land as unclassified: Tutor
-- withholds the mana breakdown, and the land engine cannot see what the land
-- makes. The data was there the whole time, on a row nobody read.
--
-- Every printing of a card takes the union of what any printing knows. Union
-- rather than "copy the first one found", because a card really can have
-- printings whose stored arrays differ in order or completeness, and taking
-- the union cannot lose a colour that some row asserted.

WITH known AS (
  SELECT oracle_id,
         (SELECT array_agg(DISTINCT m ORDER BY m)
            FROM unnest(array_agg(produced_mana)) AS a(arr),
                 unnest(arr) AS u(m)) AS all_mana
    FROM public.cards
   WHERE oracle_id IS NOT NULL
     AND produced_mana IS NOT NULL
     AND produced_mana <> '{}'
   GROUP BY oracle_id
)
UPDATE public.cards c
   SET produced_mana = k.all_mana
  FROM known k
 WHERE c.oracle_id = k.oracle_id
   AND (c.produced_mana IS NULL OR c.produced_mana = '{}')
   AND k.all_mana IS NOT NULL;
