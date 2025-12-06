-- First, clean up duplicate deck_cards by keeping only one entry per deck_id + card_id combination
-- We'll keep the one with the highest quantity and merge quantities from duplicates

-- Create a temp table with the correct data
CREATE TEMP TABLE clean_deck_cards AS
SELECT DISTINCT ON (deck_id, card_id)
    id,
    deck_id,
    card_id,
    card_name,
    -- Sum all quantities for this deck_id + card_id combination
    (SELECT COALESCE(SUM(dc2.quantity), 1) 
     FROM deck_cards dc2 
     WHERE dc2.deck_id = deck_cards.deck_id 
     AND dc2.card_id = deck_cards.card_id) as quantity,
    is_commander,
    is_sideboard,
    created_at
FROM deck_cards
ORDER BY deck_id, card_id, created_at DESC;

-- Delete all existing deck_cards
DELETE FROM deck_cards;

-- Re-insert the cleaned data
INSERT INTO deck_cards (id, deck_id, card_id, card_name, quantity, is_commander, is_sideboard, created_at)
SELECT id, deck_id, card_id, card_name, quantity, is_commander, is_sideboard, created_at
FROM clean_deck_cards;

-- Now add the unique constraint
ALTER TABLE public.deck_cards
ADD CONSTRAINT deck_cards_deck_id_card_id_unique UNIQUE (deck_id, card_id);