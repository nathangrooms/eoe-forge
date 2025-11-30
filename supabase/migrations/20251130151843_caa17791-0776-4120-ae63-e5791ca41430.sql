-- Add wishlist categories support
ALTER TABLE public.wishlist 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- Add wishlist sharing support
CREATE TABLE IF NOT EXISTS public.wishlist_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  share_slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  view_count INTEGER NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.wishlist_shares ENABLE ROW LEVEL SECURITY;

-- RLS policies for wishlist_shares
CREATE POLICY "Users can manage their own wishlist shares"
ON public.wishlist_shares
FOR ALL
USING (auth.uid() = user_id);

CREATE POLICY "Public wishlist shares are viewable by everyone"
ON public.wishlist_shares
FOR SELECT
USING (is_public = true);

-- Add system notifications table
CREATE TABLE IF NOT EXISTS public.system_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for system_notifications
CREATE POLICY "Users can view their own notifications"
ON public.system_notifications
FOR SELECT
USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update their own notifications"
ON public.system_notifications
FOR UPDATE
USING (auth.uid() = user_id);

-- Add deck performance tracking
CREATE TABLE IF NOT EXISTS public.deck_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deck_id UUID NOT NULL REFERENCES public.user_decks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  opponent_deck_name TEXT,
  opponent_commander TEXT,
  result TEXT NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
  notes TEXT,
  played_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deck_matches ENABLE ROW LEVEL SECURITY;

-- RLS policies for deck_matches
CREATE POLICY "Users can manage matches for their own decks"
ON public.deck_matches
FOR ALL
USING (auth.uid() = user_id);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_wishlist_category ON public.wishlist(category);
CREATE INDEX IF NOT EXISTS idx_wishlist_shares_slug ON public.wishlist_shares(share_slug);
CREATE INDEX IF NOT EXISTS idx_wishlist_shares_user_id ON public.wishlist_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_system_notifications_user_id ON public.system_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_system_notifications_created_at ON public.system_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deck_matches_deck_id ON public.deck_matches(deck_id);
CREATE INDEX IF NOT EXISTS idx_deck_matches_user_id ON public.deck_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_deck_matches_played_at ON public.deck_matches(played_at DESC);