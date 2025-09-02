-- Create a test deck for the admin user
INSERT INTO user_decks (user_id, name, format, colors, power_level, description, is_public)
VALUES (
  'f8d0d742-e943-4237-8639-c32c532b56c8',
  'Test Commander Deck',
  'commander',
  '["R", "G"]',
  6,
  'A test deck for debugging',
  false
);

-- Get the deck ID for reference
SELECT id, name FROM user_decks WHERE user_id = 'f8d0d742-e943-4237-8639-c32c532b56c8';