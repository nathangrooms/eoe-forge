-- Create a function to get missing cards for a deck
CREATE OR REPLACE FUNCTION get_missing_cards_for_deck(deck_id_param uuid, user_id_param uuid)
RETURNS TABLE(card_id text, card_name text, quantity integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dc.card_id,
        dc.card_name,
        dc.quantity
    FROM deck_cards dc
    LEFT JOIN user_collections uc ON (uc.card_id = dc.card_id AND uc.user_id = user_id_param)
    WHERE dc.deck_id = deck_id_param 
      AND uc.card_id IS NULL; -- Cards not in user's collection
END;
$$;