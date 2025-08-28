-- Enhanced MTG Deckbuilder Database Schema

-- Cards table for comprehensive Scryfall data
CREATE TABLE IF NOT EXISTS public.cards (
  id text PRIMARY KEY,  -- Scryfall id
  oracle_id text NOT NULL,
  name text NOT NULL,
  set_code text NOT NULL,
  collector_number text,
  layout text DEFAULT 'normal',
  type_line text NOT NULL,
  cmc numeric DEFAULT 0,
  colors text[] DEFAULT '{}',
  color_identity text[] DEFAULT '{}',
  oracle_text text,
  mana_cost text,
  power text,
  toughness text,
  loyalty text,
  keywords text[] DEFAULT '{}',
  legalities jsonb DEFAULT '{}',
  image_uris jsonb DEFAULT '{}',
  prices jsonb DEFAULT '{}',
  is_legendary boolean DEFAULT false,
  is_reserved boolean DEFAULT false,
  rarity text DEFAULT 'common',
  tags text[] DEFAULT '{}',  -- Derived by tagger
  faces jsonb,  -- For double-faced cards
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cards_oracle_id ON public.cards(oracle_id);
CREATE INDEX IF NOT EXISTS idx_cards_name ON public.cards(name);
CREATE INDEX IF NOT EXISTS idx_cards_set_code ON public.cards(set_code);
CREATE INDEX IF NOT EXISTS idx_cards_type_line ON public.cards(type_line);
CREATE INDEX IF NOT EXISTS idx_cards_colors ON public.cards USING GIN(colors);
CREATE INDEX IF NOT EXISTS idx_cards_color_identity ON public.cards USING GIN(color_identity);
CREATE INDEX IF NOT EXISTS idx_cards_legalities ON public.cards USING GIN(legalities);
CREATE INDEX IF NOT EXISTS idx_cards_tags ON public.cards USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_cards_cmc ON public.cards(cmc);
CREATE INDEX IF NOT EXISTS idx_cards_rarity ON public.cards(rarity);

-- Enable RLS
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

-- Cards are publicly readable
CREATE POLICY "Cards are publicly readable" 
ON public.cards 
FOR SELECT 
USING (true);

-- Add admin role to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Build logs for tracking deck construction
CREATE TABLE IF NOT EXISTS public.build_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid REFERENCES public.user_decks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  seed text,
  changes jsonb DEFAULT '[]',  -- [{op:'add'|'remove'|'swap', name, role, reason, impact}]
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.build_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own build logs" 
ON public.build_logs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own build logs" 
ON public.build_logs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Favorites table
CREATE TABLE IF NOT EXISTS public.favorite_decks (
  user_id uuid NOT NULL,
  deck_id uuid REFERENCES public.user_decks(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, deck_id)
);

ALTER TABLE public.favorite_decks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own favorites" 
ON public.favorite_decks 
FOR ALL 
USING (auth.uid() = user_id);

-- Tag overrides for custom card tagging
CREATE TABLE IF NOT EXISTS public.tag_overrides (
  oracle_id text PRIMARY KEY,
  tags text[] DEFAULT '{}',
  updated_by uuid,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tag_overrides ENABLE ROW LEVEL SECURITY;

-- Only admins can manage tag overrides
CREATE POLICY "Admins can manage tag overrides" 
ON public.tag_overrides 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- Everyone can read tag overrides
CREATE POLICY "Tag overrides are publicly readable" 
ON public.tag_overrides 
FOR SELECT 
USING (true);

-- Sync status tracking
CREATE TABLE IF NOT EXISTS public.sync_status (
  id text PRIMARY KEY,  -- 'scryfall_cards', 'scryfall_sets', etc.
  last_sync timestamptz,
  status text DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed'
  error_message text,
  records_processed integer DEFAULT 0,
  total_records integer DEFAULT 0
);

ALTER TABLE public.sync_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sync status is publicly readable" 
ON public.sync_status 
FOR SELECT 
USING (true);

-- Only admins can update sync status
CREATE POLICY "Admins can update sync status" 
ON public.sync_status 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for cards table
CREATE TRIGGER update_cards_updated_at
  BEFORE UPDATE ON public.cards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial sync status records
INSERT INTO public.sync_status (id, status) 
VALUES 
  ('scryfall_cards', 'pending'),
  ('scryfall_sets', 'pending')
ON CONFLICT (id) DO NOTHING;