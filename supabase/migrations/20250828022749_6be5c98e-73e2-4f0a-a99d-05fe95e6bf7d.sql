-- Create universal cards table for all MTG printings
CREATE TABLE IF NOT EXISTS cards (
  id text PRIMARY KEY,                 -- scryfall id (printing-specific)
  oracle_id text NOT NULL,             -- scryfall oracle id (card identity)
  name text NOT NULL,
  set_code text NOT NULL,
  collector_number text,
  colors text[],
  color_identity text[],
  cmc numeric DEFAULT 0,
  type_line text,
  oracle_text text,
  keywords text[],
  legalities jsonb DEFAULT '{}',
  image_uris jsonb DEFAULT '{}',
  is_legendary boolean DEFAULT false,
  prices jsonb DEFAULT '{}',
  rarity text DEFAULT 'common',
  updated_at timestamptz DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_cards_oracle ON cards(oracle_id);
CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
CREATE INDEX IF NOT EXISTS idx_cards_set ON cards(set_code);
CREATE INDEX IF NOT EXISTS idx_cards_colors ON cards USING GIN(colors);
CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(type_line);

-- Enable text search on card names (requires pg_trgm extension)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_cards_name_trgm ON cards USING gin (name gin_trgm_ops);

-- Enable RLS on cards table
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;

-- Create policy for cards (publicly readable)
CREATE POLICY "Cards are publicly readable" ON cards FOR SELECT USING (true);

-- Update existing user_collections table to ensure proper structure
-- (it already exists, so just ensure constraints)
ALTER TABLE user_collections 
  ADD CONSTRAINT fk_user_collections_card_id 
  FOREIGN KEY (card_id) REFERENCES cards(id) 
  ON DELETE RESTRICT;

-- Create updated_at trigger for cards
CREATE OR REPLACE FUNCTION update_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cards_updated_at
  BEFORE UPDATE ON cards
  FOR EACH ROW
  EXECUTE FUNCTION update_cards_updated_at();