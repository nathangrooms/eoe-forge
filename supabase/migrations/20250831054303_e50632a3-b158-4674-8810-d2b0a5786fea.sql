-- Create activity_log table for tracking user actions
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_user_time ON public.activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type ON public.activity_log(type);

-- Enable RLS
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own activity" 
ON public.activity_log 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own activity" 
ON public.activity_log 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Add constraint for activity types
ALTER TABLE public.activity_log 
ADD CONSTRAINT check_activity_type 
CHECK (type IN ('deck_created', 'deck_updated', 'deck_favorited', 'card_added', 'collection_import', 'wishlist_added', 'listing_created', 'ai_build_run'));