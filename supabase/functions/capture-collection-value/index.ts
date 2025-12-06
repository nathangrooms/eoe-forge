import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[capture-collection-value] Starting daily snapshot capture...');

    // Parse request body for optional user_id filter (for manual triggers)
    let targetUserId: string | null = null;
    try {
      const body = await req.json();
      targetUserId = body?.user_id || null;
    } catch {
      // No body or invalid JSON - process all users
    }

    // Get all users with collections (or specific user if provided)
    let query = supabase
      .from('user_collections')
      .select('user_id, card_id, quantity')
      .order('user_id');

    if (targetUserId) {
      query = query.eq('user_id', targetUserId);
    }

    const { data: collections, error: collectionsError } = await query;

    if (collectionsError) {
      console.error('[capture-collection-value] Error fetching collections:', collectionsError);
      throw collectionsError;
    }

    if (!collections || collections.length === 0) {
      console.log('[capture-collection-value] No collections found');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No collections to process',
        snapshotsCreated: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Group by user
    const userCollections: Record<string, { cardIds: string[], quantities: Record<string, number> }> = {};
    for (const item of collections) {
      if (!userCollections[item.user_id]) {
        userCollections[item.user_id] = { cardIds: [], quantities: {} };
      }
      userCollections[item.user_id].cardIds.push(item.card_id);
      userCollections[item.user_id].quantities[item.card_id] = 
        (userCollections[item.user_id].quantities[item.card_id] || 0) + item.quantity;
    }

    console.log(`[capture-collection-value] Processing ${Object.keys(userCollections).length} users`);

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const snapshots: any[] = [];

    // Process each user
    for (const [userId, userData] of Object.entries(userCollections)) {
      const uniqueCardIds = [...new Set(userData.cardIds)];
      
      // Fetch current prices for all cards in chunks
      let totalValue = 0;
      const chunkSize = 100;
      
      for (let i = 0; i < uniqueCardIds.length; i += chunkSize) {
        const chunk = uniqueCardIds.slice(i, i + chunkSize);
        const { data: cards, error: cardsError } = await supabase
          .from('cards')
          .select('id, prices')
          .in('id', chunk);

        if (cardsError) {
          console.error(`[capture-collection-value] Error fetching cards for user ${userId}:`, cardsError);
          continue;
        }

        for (const card of cards || []) {
          const price = parseFloat(card.prices?.usd || '0');
          const quantity = userData.quantities[card.id] || 0;
          totalValue += price * quantity;
        }
      }

      // Calculate totals
      const cardCount = Object.values(userData.quantities).reduce((sum, qty) => sum + qty, 0);
      const uniqueCardCount = uniqueCardIds.length;

      snapshots.push({
        user_id: userId,
        snapshot_date: today,
        total_value_usd: Math.round(totalValue * 100) / 100, // Round to 2 decimal places
        card_count: cardCount,
        unique_card_count: uniqueCardCount,
      });

      console.log(`[capture-collection-value] User ${userId}: $${totalValue.toFixed(2)} (${cardCount} cards)`);
    }

    // Upsert snapshots (update if exists for today, insert if not)
    if (snapshots.length > 0) {
      const { error: upsertError } = await supabase
        .from('collection_value_history')
        .upsert(snapshots, { 
          onConflict: 'user_id,snapshot_date',
          ignoreDuplicates: false 
        });

      if (upsertError) {
        console.error('[capture-collection-value] Error upserting snapshots:', upsertError);
        throw upsertError;
      }
    }

    console.log(`[capture-collection-value] Successfully created ${snapshots.length} snapshots`);

    return new Response(JSON.stringify({ 
      success: true, 
      snapshotsCreated: snapshots.length,
      date: today 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[capture-collection-value] Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
