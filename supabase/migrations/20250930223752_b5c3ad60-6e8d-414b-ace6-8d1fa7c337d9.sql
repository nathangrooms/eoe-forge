-- Add archetype column to user_decks table
ALTER TABLE user_decks ADD COLUMN IF NOT EXISTS archetype TEXT;

-- Add index for faster archetype lookups
CREATE INDEX IF NOT EXISTS idx_user_decks_archetype ON user_decks(archetype) WHERE archetype IS NOT NULL;