-- Clean up duplicate deck cards and fix the duplicate entries issue
-- First, create a temporary table with unique combinations
CREATE TEMP TABLE unique_deck_cards AS
SELECT DISTINCT ON (deck_id, card_id, is_commander, is_sideboard)
    deck_id,
    card_id,
    card_name,
    quantity,
    is_commander,
    is_sideboard,
    created_at
FROM deck_cards
ORDER BY deck_id, card_id, is_commander, is_sideboard, created_at DESC;

-- Delete all existing deck cards
DELETE FROM deck_cards;

-- Re-insert the unique entries
INSERT INTO deck_cards (deck_id, card_id, card_name, quantity, is_commander, is_sideboard, created_at)
SELECT deck_id, card_id, card_name, quantity, is_commander, is_sideboard, created_at
FROM unique_deck_cards;