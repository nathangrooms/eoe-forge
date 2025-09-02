-- Fix the compute_deck_summary function to properly calculate metrics
CREATE OR REPLACE FUNCTION public.compute_deck_summary(deck_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    deck_record user_decks%ROWTYPE;
    card_count INTEGER;
    unique_count INTEGER;
    cards_data JSONB;
    curve_data JSONB DEFAULT '{}';
    type_dist JSONB DEFAULT '{}';
    mana_sources JSONB DEFAULT '{}';
    total_value NUMERIC DEFAULT 0;
    is_favorite BOOLEAN DEFAULT false;
    commander_info JSONB DEFAULT NULL;
    lands_count INTEGER DEFAULT 0;
    creatures_count INTEGER DEFAULT 0;
    instants_count INTEGER DEFAULT 0;
    sorceries_count INTEGER DEFAULT 0;
    artifacts_count INTEGER DEFAULT 0;
    enchantments_count INTEGER DEFAULT 0;
    planeswalkers_count INTEGER DEFAULT 0;
    battles_count INTEGER DEFAULT 0;
    result JSONB;
BEGIN
    -- Get deck info
    SELECT * INTO deck_record FROM user_decks WHERE user_decks.id = compute_deck_summary.deck_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    
    -- Get card counts (sum of quantities)
    SELECT 
        COALESCE(SUM(quantity), 0)::INTEGER,
        COUNT(DISTINCT card_id)::INTEGER
    INTO card_count, unique_count
    FROM deck_cards 
    WHERE deck_cards.deck_id = compute_deck_summary.deck_id;
    
    -- Get commander info if exists
    SELECT jsonb_build_object(
        'name', dc.card_name,
        'image', CASE 
            WHEN dc.card_id = '49554198-549b-4066-86ce-77a03fda0a2f' THEN 'https://cards.scryfall.io/normal/front/4/9/49554198-549b-4066-86ce-77a03fda0a2f.jpg'
            ELSE 'https://cards.scryfall.io/normal/front/' || substr(dc.card_id, 1, 1) || '/' || substr(dc.card_id, 2, 1) || '/' || dc.card_id || '.jpg'
        END
    ) INTO commander_info
    FROM deck_cards dc
    WHERE dc.deck_id = compute_deck_summary.deck_id AND dc.is_commander = true
    LIMIT 1;
    
    -- Calculate type distribution
    SELECT 
        COALESCE(SUM(CASE WHEN LOWER(c.type_line) LIKE '%land%' THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(c.type_line) LIKE '%creature%' THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(c.type_line) LIKE '%instant%' THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(c.type_line) LIKE '%sorcery%' THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(c.type_line) LIKE '%artifact%' AND LOWER(c.type_line) NOT LIKE '%creature%' THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(c.type_line) LIKE '%enchantment%' THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(c.type_line) LIKE '%planeswalker%' THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(c.type_line) LIKE '%battle%' THEN dc.quantity ELSE 0 END), 0)
    INTO lands_count, creatures_count, instants_count, sorceries_count, artifacts_count, enchantments_count, planeswalkers_count, battles_count
    FROM deck_cards dc
    LEFT JOIN cards c ON c.id = dc.card_id
    WHERE dc.deck_id = compute_deck_summary.deck_id;
    
    -- Get detailed card data with card info
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'card_id', dc.card_id,
            'card_name', dc.card_name,
            'quantity', dc.quantity,
            'is_commander', dc.is_commander,
            'is_sideboard', dc.is_sideboard,
            'card_data', jsonb_build_object(
                'cmc', COALESCE(c.cmc, 0),
                'type_line', COALESCE(c.type_line, ''),
                'colors', COALESCE(c.colors, '{}'),
                'prices', COALESCE(c.prices, '{}'),
                'rarity', COALESCE(c.rarity, 'common')
            )
        )
    ), '[]'::jsonb) INTO cards_data
    FROM deck_cards dc
    LEFT JOIN cards c ON c.id = dc.card_id
    WHERE dc.deck_id = compute_deck_summary.deck_id;
    
    -- Check if favorited by current user (if auth context available)
    IF auth.uid() IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM favorite_decks 
            WHERE favorite_decks.deck_id = compute_deck_summary.deck_id 
            AND favorite_decks.user_id = auth.uid()
        ) INTO is_favorite;
    END IF;
    
    -- Build curve analysis (placeholder)
    curve_data := jsonb_build_object(
        '0-1', 0,
        '2', 0,
        '3', 0,
        '4', 0,
        '5', 0,
        '6-7', 0,
        '8-9', 0,
        '10+', 0
    );
    
    -- Build result
    result := jsonb_build_object(
        'id', deck_record.id,
        'name', deck_record.name,
        'format', deck_record.format,
        'colors', deck_record.colors,
        'power_level', deck_record.power_level,
        'description', COALESCE(deck_record.description, ''),
        'is_public', deck_record.is_public,
        'created_at', deck_record.created_at,
        'updated_at', deck_record.updated_at,
        'commander', commander_info,
        'counts', jsonb_build_object(
            'total', card_count,
            'unique', unique_count,
            'sideboard', 0,
            'lands', lands_count,
            'creatures', creatures_count,
            'instants', instants_count,
            'sorceries', sorceries_count,
            'artifacts', artifacts_count,
            'enchantments', enchantments_count,
            'planeswalkers', planeswalkers_count,
            'battles', battles_count
        ),
        'curve', curve_data,
        'mana', jsonb_build_object(
            'sources', mana_sources,
            'untappedPctByTurn', jsonb_build_object('t1', 0, 't2', 0, 't3', 0)
        ),
        'legality', jsonb_build_object(
            'ok', true,
            'issues', '[]'::jsonb
        ),
        'power', jsonb_build_object(
            'score', deck_record.power_level,
            'band', CASE 
                WHEN deck_record.power_level <= 3 THEN 'casual'
                WHEN deck_record.power_level <= 6 THEN 'mid'
                WHEN deck_record.power_level <= 8 THEN 'high'
                ELSE 'cEDH'
            END,
            'drivers', '[]'::jsonb,
            'drags', '[]'::jsonb
        ),
        'economy', jsonb_build_object(
            'priceUSD', total_value,
            'ownedPct', 0,
            'missing', 0
        ),
        'tags', '[]'::jsonb,
        'favorite', is_favorite,
        'cards', cards_data
    );
    
    RETURN result;
END;
$function$