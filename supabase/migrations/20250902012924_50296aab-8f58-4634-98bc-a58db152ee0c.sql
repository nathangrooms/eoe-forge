-- First, let's create a simple function to get wishlist count for a deck's missing cards
CREATE OR REPLACE FUNCTION get_deck_wishlist_count(deck_id_param uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    wishlist_count INTEGER DEFAULT 0;
    user_uuid UUID;
BEGIN
    user_uuid := auth.uid();
    
    IF user_uuid IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Count cards that are in the deck but not in user's collection and are on wishlist
    SELECT COUNT(DISTINCT dc.card_id) INTO wishlist_count
    FROM deck_cards dc
    LEFT JOIN user_collections uc ON uc.card_id = dc.card_id AND uc.user_id = user_uuid
    INNER JOIN wishlist w ON w.card_id = dc.card_id AND w.user_id = user_uuid
    WHERE dc.deck_id = deck_id_param 
      AND uc.card_id IS NULL; -- Cards not in collection
    
    RETURN COALESCE(wishlist_count, 0);
END;
$$;