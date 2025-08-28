-- Add foreign key constraint between user_collections.card_id and cards.id
ALTER TABLE user_collections 
ADD CONSTRAINT fk_user_collections_card_id 
FOREIGN KEY (card_id) REFERENCES cards(id);

-- Create index for better performance on the foreign key
CREATE INDEX IF NOT EXISTS idx_user_collections_card_id ON user_collections(card_id);