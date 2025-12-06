-- Create table for individual card price history
CREATE TABLE public.card_price_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id TEXT NOT NULL,
  oracle_id TEXT NOT NULL,
  card_name TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  price_usd NUMERIC,
  price_usd_foil NUMERIC,
  price_eur NUMERIC,
  price_eur_foil NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint to prevent duplicate snapshots
CREATE UNIQUE INDEX idx_card_price_history_card_date ON public.card_price_history(card_id, snapshot_date);

-- Create index for querying by oracle_id (all printings of same card)
CREATE INDEX idx_card_price_history_oracle_date ON public.card_price_history(oracle_id, snapshot_date);

-- Create index for date range queries
CREATE INDEX idx_card_price_history_date ON public.card_price_history(snapshot_date DESC);

-- Enable RLS
ALTER TABLE public.card_price_history ENABLE ROW LEVEL SECURITY;

-- Allow public read access (price data is not user-specific)
CREATE POLICY "Card price history is publicly readable"
ON public.card_price_history
FOR SELECT
USING (true);

-- Allow service role to manage price history
CREATE POLICY "Service role can manage card price history"
ON public.card_price_history
FOR ALL
USING (true)
WITH CHECK (true);