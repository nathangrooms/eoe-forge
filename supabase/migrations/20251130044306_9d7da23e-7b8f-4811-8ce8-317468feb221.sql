-- Step 1: Delete orphaned deck_cards that reference non-existent cards
DELETE FROM deck_cards
WHERE card_id NOT IN (SELECT id FROM cards);

-- Step 2: Add foreign key constraint
ALTER TABLE deck_cards 
ADD CONSTRAINT deck_cards_card_id_fkey 
FOREIGN KEY (card_id) 
REFERENCES cards(id) 
ON DELETE CASCADE;

-- Step 3: Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_deck_cards_card_id ON deck_cards(card_id);