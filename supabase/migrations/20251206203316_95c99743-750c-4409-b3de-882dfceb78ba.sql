-- Update compute_deck_summary to include proper color identity legality checks
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
    mana_sources JSONB DEFAULT '{"W": 0, "U": 0, "B": 0, "R": 0, "G": 0, "C": 0}';
    total_value NUMERIC DEFAULT 0;
    is_favorite BOOLEAN DEFAULT false;
    commander_info JSONB DEFAULT NULL;
    commander_identity TEXT[] DEFAULT '{}';
    lands_count INTEGER DEFAULT 0;
    creatures_count INTEGER DEFAULT 0;
    instants_count INTEGER DEFAULT 0;
    sorceries_count INTEGER DEFAULT 0;
    artifacts_count INTEGER DEFAULT 0;
    enchantments_count INTEGER DEFAULT 0;
    planeswalkers_count INTEGER DEFAULT 0;
    battles_count INTEGER DEFAULT 0;
    avg_cmc NUMERIC DEFAULT 0;
    owned_count INTEGER DEFAULT 0;
    owned_pct NUMERIC DEFAULT 0;
    curve_0_1 INTEGER DEFAULT 0;
    curve_2 INTEGER DEFAULT 0;
    curve_3 INTEGER DEFAULT 0;
    curve_4 INTEGER DEFAULT 0;
    curve_5 INTEGER DEFAULT 0;
    curve_6_7 INTEGER DEFAULT 0;
    curve_8_9 INTEGER DEFAULT 0;
    curve_10_plus INTEGER DEFAULT 0;
    legality_ok BOOLEAN DEFAULT true;
    legality_issues JSONB DEFAULT '[]'::jsonb;
    identity_violations JSONB;
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
    
    -- Get commander info and color identity if exists
    SELECT jsonb_build_object(
        'name', dc.card_name,
        'image', CASE 
            WHEN c.image_uris ? 'normal' THEN c.image_uris->>'normal'
            WHEN c.image_uris ? 'large' THEN c.image_uris->>'large'
            ELSE 'https://cards.scryfall.io/normal/front/' || substr(dc.card_id, 1, 1) || '/' || substr(dc.card_id, 2, 1) || '/' || dc.card_id || '.jpg'
        END,
        'image_uris', c.image_uris
    ), COALESCE(c.color_identity, '{}')
    INTO commander_info, commander_identity
    FROM deck_cards dc
    LEFT JOIN cards c ON c.id = dc.card_id
    WHERE dc.deck_id = compute_deck_summary.deck_id AND dc.is_commander = true
    LIMIT 1;
    
    -- Check color identity violations for Commander format
    IF deck_record.format = 'commander' AND commander_info IS NOT NULL AND array_length(commander_identity, 1) IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'card_name', dc.card_name,
                'card_colors', c.color_identity,
                'violation', 'Card color identity not in commander identity'
            )
        ), '[]'::jsonb)
        INTO identity_violations
        FROM deck_cards dc
        LEFT JOIN cards c ON c.id = dc.card_id
        WHERE dc.deck_id = compute_deck_summary.deck_id
          AND dc.is_commander = false
          AND c.color_identity IS NOT NULL
          AND NOT (c.color_identity <@ commander_identity);
        
        IF jsonb_array_length(identity_violations) > 0 THEN
            legality_ok := false;
            -- Build human-readable issues list
            SELECT COALESCE(jsonb_agg(
                (v->>'card_name') || ' has colors outside commander identity'
            ), '[]'::jsonb)
            INTO legality_issues
            FROM jsonb_array_elements(identity_violations) v;
        END IF;
    END IF;
    
    -- Calculate comprehensive metrics including proper price handling
    SELECT 
        COALESCE(SUM(CASE WHEN LOWER(c.type_line) LIKE '%land%' THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(c.type_line) LIKE '%creature%' THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(c.type_line) LIKE '%instant%' THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(c.type_line) LIKE '%sorcery%' THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(c.type_line) LIKE '%artifact%' AND LOWER(c.type_line) NOT LIKE '%creature%' THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(c.type_line) LIKE '%enchantment%' THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(c.type_line) LIKE '%planeswalker%' THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(c.type_line) LIKE '%battle%' THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(
            CASE 
                WHEN c.prices->>'usd' IS NOT NULL AND c.prices->>'usd' != '' 
                THEN (c.prices->>'usd')::numeric * dc.quantity 
                ELSE 0 
            END
        ), 0),
        COALESCE(SUM(c.cmc * dc.quantity) / NULLIF(SUM(dc.quantity), 0), 0)
    INTO lands_count, creatures_count, instants_count, sorceries_count, artifacts_count, enchantments_count, planeswalkers_count, battles_count, total_value, avg_cmc
    FROM deck_cards dc
    LEFT JOIN cards c ON c.id = dc.card_id
    WHERE dc.deck_id = compute_deck_summary.deck_id;
    
    -- Calculate mana curve
    SELECT 
        COALESCE(SUM(CASE WHEN c.cmc <= 1 THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN c.cmc = 2 THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN c.cmc = 3 THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN c.cmc = 4 THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN c.cmc = 5 THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN c.cmc BETWEEN 6 AND 7 THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN c.cmc BETWEEN 8 AND 9 THEN dc.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN c.cmc >= 10 THEN dc.quantity ELSE 0 END), 0)
    INTO curve_0_1, curve_2, curve_3, curve_4, curve_5, curve_6_7, curve_8_9, curve_10_plus
    FROM deck_cards dc
    LEFT JOIN cards c ON c.id = dc.card_id
    WHERE dc.deck_id = compute_deck_summary.deck_id;
    
    -- Calculate mana sources correctly
    SELECT jsonb_build_object(
        'W', COALESCE(SUM(CASE 
            WHEN LOWER(c.type_line) LIKE '%plains%' 
                OR (LOWER(c.type_line) LIKE '%land%' AND (c.colors @> ARRAY['W'] OR c.mana_cost LIKE '%{W}%'))
            THEN dc.quantity ELSE 0 END), 0),
        'U', COALESCE(SUM(CASE 
            WHEN LOWER(c.type_line) LIKE '%island%' 
                OR (LOWER(c.type_line) LIKE '%land%' AND (c.colors @> ARRAY['U'] OR c.mana_cost LIKE '%{U}%'))
            THEN dc.quantity ELSE 0 END), 0),
        'B', COALESCE(SUM(CASE 
            WHEN LOWER(c.type_line) LIKE '%swamp%' 
                OR (LOWER(c.type_line) LIKE '%land%' AND (c.colors @> ARRAY['B'] OR c.mana_cost LIKE '%{B}%'))
            THEN dc.quantity ELSE 0 END), 0),
        'R', COALESCE(SUM(CASE 
            WHEN LOWER(c.type_line) LIKE '%mountain%' 
                OR (LOWER(c.type_line) LIKE '%land%' AND (c.colors @> ARRAY['R'] OR c.mana_cost LIKE '%{R}%'))
            THEN dc.quantity ELSE 0 END), 0),
        'G', COALESCE(SUM(CASE 
            WHEN LOWER(c.type_line) LIKE '%forest%' 
                OR (LOWER(c.type_line) LIKE '%land%' AND (c.colors @> ARRAY['G'] OR c.mana_cost LIKE '%{G}%'))
            THEN dc.quantity ELSE 0 END), 0),
        'C', COALESCE(SUM(CASE 
            WHEN LOWER(c.type_line) LIKE '%land%' 
                AND (c.colors IS NULL OR array_length(c.colors, 1) IS NULL OR array_length(c.colors, 1) = 0)
                AND c.mana_cost NOT LIKE '%{W}%' AND c.mana_cost NOT LIKE '%{U}%' 
                AND c.mana_cost NOT LIKE '%{B}%' AND c.mana_cost NOT LIKE '%{R}%' AND c.mana_cost NOT LIKE '%{G}%'
            THEN dc.quantity ELSE 0 END), 0)
    ) INTO mana_sources
    FROM deck_cards dc
    LEFT JOIN cards c ON c.id = dc.card_id
    WHERE dc.deck_id = compute_deck_summary.deck_id;
    
    -- Calculate collection ownership percentage
    IF auth.uid() IS NOT NULL THEN
        SELECT 
            COALESCE(SUM(CASE WHEN uc.card_id IS NOT NULL THEN dc.quantity ELSE 0 END), 0),
            CASE WHEN SUM(dc.quantity) > 0 THEN 
                (SUM(CASE WHEN uc.card_id IS NOT NULL THEN dc.quantity ELSE 0 END)::numeric / SUM(dc.quantity)::numeric) * 100 
            ELSE 0 END
        INTO owned_count, owned_pct
        FROM deck_cards dc
        LEFT JOIN user_collections uc ON uc.card_id = dc.card_id AND uc.user_id = auth.uid()
        WHERE dc.deck_id = compute_deck_summary.deck_id;
        
        -- Check if favorited
        SELECT EXISTS(
            SELECT 1 FROM favorite_decks 
            WHERE favorite_decks.deck_id = compute_deck_summary.deck_id 
            AND favorite_decks.user_id = auth.uid()
        ) INTO is_favorite;
    END IF;
    
    -- Build curve analysis
    curve_data := jsonb_build_object(
        '0-1', curve_0_1,
        '2', curve_2,
        '3', curve_3,
        '4', curve_4,
        '5', curve_5,
        '6-7', curve_6_7,
        '8-9', curve_8_9,
        '10+', curve_10_plus
    );
    
    -- Get detailed card data
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
                'color_identity', COALESCE(c.color_identity, '{}'),
                'prices', COALESCE(c.prices, '{}'),
                'rarity', COALESCE(c.rarity, 'common')
            )
        )
    ), '[]'::jsonb) INTO cards_data
    FROM deck_cards dc
    LEFT JOIN cards c ON c.id = dc.card_id
    WHERE dc.deck_id = compute_deck_summary.deck_id;
    
    -- Build result
    result := jsonb_build_object(
        'id', deck_record.id,
        'name', deck_record.name,
        'format', deck_record.format,
        'colors', deck_record.colors,
        'identity', commander_identity,
        'power_level', deck_record.power_level,
        'description', COALESCE(deck_record.description, ''),
        'is_public', deck_record.is_public,
        'created_at', deck_record.created_at,
        'updatedAt', deck_record.updated_at,
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
        'curve', jsonb_build_object(
            'bins', curve_data
        ),
        'mana', jsonb_build_object(
            'sources', mana_sources,
            'untappedPctByTurn', jsonb_build_object('t1', 95, 't2', 90, 't3', 85)
        ),
        'legality', jsonb_build_object(
            'ok', legality_ok,
            'issues', legality_issues
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
            'ownedPct', owned_pct,
            'missing', card_count - owned_count
        ),
        'tags', '[]'::jsonb,
        'favorite', is_favorite,
        'cards', cards_data
    );
    
    RETURN result;
END;
$function$;