-- Create Syr Vondam deck for the admin user
INSERT INTO user_decks (user_id, name, format, colors, power_level, description, is_public)
VALUES (
  'f8d0d742-e943-4237-8639-c32c532b56c8',
  'Syr Vondam, Sunstar Exemplar',
  'commander',
  ARRAY['W', 'B'],
  6,
  'Commander deck built around Syr Vondam',
  false
);

-- Add Syr Vondam as commander
INSERT INTO deck_cards (deck_id, card_id, card_name, quantity, is_commander, is_sideboard)
SELECT 
  ud.id,
  '49554198-549b-4066-86ce-77a03fda0a2f',
  'Syr Vondam, Sunstar Exemplar',
  1,
  true,
  false
FROM user_decks ud 
WHERE ud.user_id = 'f8d0d742-e943-4237-8639-c32c532b56c8' 
AND ud.name = 'Syr Vondam, Sunstar Exemplar';

-- Add sample cards to reach 7 total cards (6 more cards)
INSERT INTO deck_cards (deck_id, card_id, card_name, quantity, is_commander, is_sideboard)
SELECT 
  ud.id,
  'plains-basic',
  'Plains',
  3,
  false,
  false
FROM user_decks ud 
WHERE ud.user_id = 'f8d0d742-e943-4237-8639-c32c532b56c8' 
AND ud.name = 'Syr Vondam, Sunstar Exemplar'

UNION ALL

SELECT 
  ud.id,
  'swamp-basic',
  'Swamp',
  2,
  false,
  false
FROM user_decks ud 
WHERE ud.user_id = 'f8d0d742-e943-4237-8639-c32c532b56c8' 
AND ud.name = 'Syr Vondam, Sunstar Exemplar'

UNION ALL

SELECT 
  ud.id,
  'sol-ring',
  'Sol Ring',
  1,
  false,
  false
FROM user_decks ud 
WHERE ud.user_id = 'f8d0d742-e943-4237-8639-c32c532b56c8' 
AND ud.name = 'Syr Vondam, Sunstar Exemplar';

-- Remove the test deck
DELETE FROM deck_cards WHERE deck_id = 'bc6195ce-453f-41bd-a9c5-c1bd5ddfc93d';
DELETE FROM user_decks WHERE id = 'bc6195ce-453f-41bd-a9c5-c1bd5ddfc93d';