-- Create a test deck for the admin user with proper array syntax
INSERT INTO user_decks (user_id, name, format, colors, power_level, description, is_public)
VALUES (
  'f8d0d742-e943-4237-8639-c32c532b56c8',
  'Test Commander Deck',
  'commander',
  ARRAY['R', 'G'],
  6,
  'A test deck for debugging',
  false
);

-- Add a few test cards to the deck
INSERT INTO deck_cards (deck_id, card_id, card_name, quantity, is_commander, is_sideboard)
SELECT 
  ud.id,
  'test-card-1',
  'Lightning Bolt',
  4,
  false,
  false
FROM user_decks ud 
WHERE ud.user_id = 'f8d0d742-e943-4237-8639-c32c532b56c8' 
AND ud.name = 'Test Commander Deck';

-- Verify the deck was created
SELECT id, name, format, colors FROM user_decks WHERE user_id = 'f8d0d742-e943-4237-8639-c32c532b56c8';