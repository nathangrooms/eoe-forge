-- Add public sharing columns to user_decks table
ALTER TABLE user_decks 
  ADD COLUMN IF NOT EXISTS public_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS public_show_latest boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS published_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS share_view_count bigint DEFAULT 0;

-- Create deck share events table for analytics
CREATE TABLE IF NOT EXISTS deck_share_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES user_decks(id) ON DELETE CASCADE,
  slug text NOT NULL,
  event text NOT NULL CHECK (event IN ('view', 'copy', 'qr', 'embed')),
  ua_hash text,
  ip_hash text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deck_share_events_deck ON deck_share_events(deck_id, created_at DESC);

-- RLS policies for deck_share_events
ALTER TABLE deck_share_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own deck share events"
  ON deck_share_events FOR SELECT
  USING (deck_id IN (SELECT id FROM user_decks WHERE user_id = auth.uid()));

CREATE POLICY "Service role can insert share events"
  ON deck_share_events FOR INSERT
  WITH CHECK (true);

-- Function to get public deck by slug (security definer for safe anonymous access)
CREATE OR REPLACE FUNCTION public.get_public_deck(deck_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result jsonb;
BEGIN
    -- Get deck summary for public viewing (sanitized)
    SELECT jsonb_build_object(
        'id', ud.id,
        'name', ud.name,
        'format', ud.format,
        'colors', ud.colors,
        'power_level', ud.power_level,
        'description', COALESCE(ud.description, ''),
        'published_at', ud.published_at,
        'updated_at', ud.updated_at,
        'slug', ud.public_slug,
        'view_count', ud.share_view_count
    ) INTO result
    FROM user_decks ud
    WHERE ud.public_slug = deck_slug 
      AND ud.public_enabled = true;
    
    IF result IS NULL THEN
        RETURN NULL;
    END IF;
    
    RETURN result;
END;
$$;

-- Function to increment share view count
CREATE OR REPLACE FUNCTION public.increment_share_views(deck_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE user_decks 
    SET share_view_count = share_view_count + 1
    WHERE public_slug = deck_slug 
      AND public_enabled = true;
END;
$$;