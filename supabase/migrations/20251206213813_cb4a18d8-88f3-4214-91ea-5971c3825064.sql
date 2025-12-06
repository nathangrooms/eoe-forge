-- Add column to store EDH analysis data for Commander decks
ALTER TABLE public.user_decks 
ADD COLUMN edh_analysis JSONB DEFAULT NULL,
ADD COLUMN edh_analysis_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN edh_cards_hash TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.user_decks.edh_analysis IS 'Cached EDH power level analysis from edhpowerlevel.com';
COMMENT ON COLUMN public.user_decks.edh_analysis_updated_at IS 'Last time EDH analysis was fetched';
COMMENT ON COLUMN public.user_decks.edh_cards_hash IS 'Hash of card names to detect changes for refresh';