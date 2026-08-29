-- 3,882 basic lands did not say what they tap for.
--
-- `cards.produced_mana` is what classifies a land, and it is what Tutor reads to
-- give a mana breakdown. Section 10b of CLAUDE.md records that lands used to be
-- bucketed by `card.colors`, which is empty for every land ever printed, and
-- that the fix was to read `produced_mana` instead. That fix is only as good as
-- the column, and the column is populated by the Scryfall sync.
--
-- The catalogue then went from one printing per card to every printing, 34,088
-- rows to 98,041, and the new rows arrived without it. Measured today: 9,640
-- lands have no `produced_mana`, and 3,882 of those are BASIC lands.
--
-- A basic land is the one case that needs no derivation and no guess. The type
-- line names the basic type and the basic type IS the mana: a Mountain taps for
-- R, by the rules, always. So this reads the type line and writes the answer.
--
-- Every basic type is checked independently rather than matched as a whole,
-- because a type line can carry more than one. Dryad Arbor is a Forest that is
-- also a creature; a Snow-Covered Mountain is still a Mountain; and the dual
-- basics printed in some sets name two.
--
-- Wastes is included and produces colourless, which is why the column is an
-- array of text rather than of colours.
--
-- THE OTHER 5,758 ARE NOT TOUCHED. A nonbasic land says what it taps for in its
-- rules text, and reading that is a parsing job with a wrong answer available at
-- every step. Getting a land's colours wrong is worse than not knowing them:
-- Tutor withholds the breakdown when a land is unclassified, which is honest,
-- and would print a confident wrong one if this guessed. That work needs the
-- ability compiler, not a LIKE.

UPDATE public.cards
   SET produced_mana = (
     SELECT array_agg(m ORDER BY m)
     FROM (
       SELECT 'W' AS m WHERE type_line ILIKE '%Plains%'
       UNION SELECT 'U' WHERE type_line ILIKE '%Island%'
       UNION SELECT 'B' WHERE type_line ILIKE '%Swamp%'
       UNION SELECT 'R' WHERE type_line ILIKE '%Mountain%'
       UNION SELECT 'G' WHERE type_line ILIKE '%Forest%'
       UNION SELECT 'C' WHERE type_line ILIKE '%Wastes%'
     ) picked
   )
 WHERE type_line ILIKE '%Basic%Land%'
   AND (produced_mana IS NULL OR produced_mana = '{}')
   AND (
     type_line ILIKE '%Plains%' OR type_line ILIKE '%Island%' OR
     type_line ILIKE '%Swamp%'  OR type_line ILIKE '%Mountain%' OR
     type_line ILIKE '%Forest%' OR type_line ILIKE '%Wastes%'
   );
