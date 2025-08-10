-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
CREATE POLICY "Public profiles are viewable by everyone" 
ON public.profiles 
FOR SELECT 
USING (true);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = id);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create user_collections table to store user's card collections
CREATE TABLE public.user_collections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  card_name TEXT NOT NULL,
  set_code TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  foil INTEGER NOT NULL DEFAULT 0,
  condition TEXT NOT NULL DEFAULT 'near_mint',
  price_usd DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS on user_collections
ALTER TABLE public.user_collections ENABLE ROW LEVEL SECURITY;

-- Create policies for user_collections
CREATE POLICY "Users can view their own collection" 
ON public.user_collections 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert into their own collection" 
ON public.user_collections 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own collection" 
ON public.user_collections 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete from their own collection" 
ON public.user_collections 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create user_decks table
CREATE TABLE public.user_decks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'standard',
  power_level INTEGER NOT NULL DEFAULT 6,
  colors TEXT[] NOT NULL DEFAULT '{}',
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS on user_decks
ALTER TABLE public.user_decks ENABLE ROW LEVEL SECURITY;

-- Create policies for user_decks
CREATE POLICY "Users can view their own decks" 
ON public.user_decks 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Everyone can view public decks" 
ON public.user_decks 
FOR SELECT 
USING (is_public = true);

CREATE POLICY "Users can manage their own decks" 
ON public.user_decks 
FOR ALL 
USING (auth.uid() = user_id);

-- Create deck_cards table
CREATE TABLE public.deck_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deck_id UUID NOT NULL REFERENCES public.user_decks ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  card_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  is_commander BOOLEAN NOT NULL DEFAULT false,
  is_sideboard BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS on deck_cards
ALTER TABLE public.deck_cards ENABLE ROW LEVEL SECURITY;

-- Create policies for deck_cards
CREATE POLICY "Users can view deck cards for their decks" 
ON public.deck_cards 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_decks 
    WHERE id = deck_cards.deck_id 
    AND (user_id = auth.uid() OR is_public = true)
  )
);

CREATE POLICY "Users can manage cards in their own decks" 
ON public.deck_cards 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.user_decks 
    WHERE id = deck_cards.deck_id 
    AND user_id = auth.uid()
  )
);

-- Add indexes for performance
CREATE INDEX idx_user_collections_user_id ON public.user_collections(user_id);
CREATE INDEX idx_user_collections_card_id ON public.user_collections(card_id);
CREATE INDEX idx_user_decks_user_id ON public.user_decks(user_id);
CREATE INDEX idx_deck_cards_deck_id ON public.deck_cards(deck_id);