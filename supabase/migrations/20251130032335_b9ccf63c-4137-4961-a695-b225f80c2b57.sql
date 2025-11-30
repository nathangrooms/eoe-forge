-- Add price alert columns to wishlist table
ALTER TABLE public.wishlist 
ADD COLUMN IF NOT EXISTS target_price_usd numeric,
ADD COLUMN IF NOT EXISTS alert_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS last_notified_at timestamp with time zone;

-- Add index for efficient alert checking
CREATE INDEX IF NOT EXISTS idx_wishlist_alerts 
ON public.wishlist(user_id, alert_enabled) 
WHERE alert_enabled = true AND target_price_usd IS NOT NULL;