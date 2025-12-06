-- Create table to store daily collection value snapshots
CREATE TABLE public.collection_value_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  total_value_usd NUMERIC NOT NULL DEFAULT 0,
  card_count INTEGER NOT NULL DEFAULT 0,
  unique_card_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint to prevent duplicate snapshots for same user/date
CREATE UNIQUE INDEX idx_collection_value_history_user_date 
ON public.collection_value_history (user_id, snapshot_date);

-- Create index for efficient date range queries
CREATE INDEX idx_collection_value_history_date 
ON public.collection_value_history (user_id, snapshot_date DESC);

-- Enable Row Level Security
ALTER TABLE public.collection_value_history ENABLE ROW LEVEL SECURITY;

-- Users can only view their own history
CREATE POLICY "Users can view their own collection value history" 
ON public.collection_value_history 
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can insert their own history (for manual triggers)
CREATE POLICY "Users can insert their own collection value history" 
ON public.collection_value_history 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Service role can manage all records (for cron job)
CREATE POLICY "Service role can manage collection value history" 
ON public.collection_value_history 
FOR ALL 
USING (true)
WITH CHECK (true);