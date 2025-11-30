-- Create table for card condition photos
CREATE TABLE IF NOT EXISTS public.card_condition_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_item_id UUID NOT NULL,
  user_id UUID NOT NULL,
  photo_url TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.card_condition_photos ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own card photos"
  ON public.card_condition_photos
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upload their own card photos"
  ON public.card_condition_photos
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own card photos"
  ON public.card_condition_photos
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own card photos"
  ON public.card_condition_photos
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_card_condition_photos_collection_item ON public.card_condition_photos(collection_item_id);
CREATE INDEX idx_card_condition_photos_user ON public.card_condition_photos(user_id);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_card_condition_photos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_card_condition_photos_updated_at
  BEFORE UPDATE ON public.card_condition_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_card_condition_photos_updated_at();

-- Create table for price alerts
CREATE TABLE IF NOT EXISTS public.price_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  card_id TEXT NOT NULL,
  card_name TEXT NOT NULL,
  target_price DECIMAL(10, 2) NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('below', 'above')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own price alerts"
  ON public.price_alerts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own price alerts"
  ON public.price_alerts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own price alerts"
  ON public.price_alerts
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own price alerts"
  ON public.price_alerts
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_price_alerts_user ON public.price_alerts(user_id);
CREATE INDEX idx_price_alerts_card ON public.price_alerts(card_id);
CREATE INDEX idx_price_alerts_active ON public.price_alerts(is_active) WHERE is_active = true;

-- Create trigger for updated_at
CREATE TRIGGER update_price_alerts_updated_at
  BEFORE UPDATE ON public.price_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();