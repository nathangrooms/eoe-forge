-- Remove the duplicate foreign key constraint
-- We'll keep the first one (deck_cards_deck_id_fkey) and remove the custom one
ALTER TABLE deck_cards DROP CONSTRAINT IF EXISTS fk_deck_cards_deck_id;