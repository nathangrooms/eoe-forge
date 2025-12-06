import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limit: Scryfall allows 10 requests/second, we'll be conservative
const BATCH_SIZE = 50;
const DELAY_BETWEEN_BATCHES = 6000; // 6 seconds between batches

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureCardPrice(cardId: string, supabase: any, today: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.scryfall.com/cards/${cardId}`);
    if (!response.ok) {
      console.log(`Scryfall error for ${cardId}: ${response.status}`);
      return false;
    }

    const cardData = await response.json();

    await supabase
      .from('card_price_history')
      .upsert({
        card_id: cardData.id,
        oracle_id: cardData.oracle_id,
        card_name: cardData.name,
        snapshot_date: today,
        price_usd: cardData.prices?.usd ? parseFloat(cardData.prices.usd) : null,
        price_usd_foil: cardData.prices?.usd_foil ? parseFloat(cardData.prices.usd_foil) : null,
        price_eur: cardData.prices?.eur ? parseFloat(cardData.prices.eur) : null,
        price_eur_foil: cardData.prices?.eur_foil ? parseFloat(cardData.prices.eur_foil) : null,
      }, {
        onConflict: 'card_id,snapshot_date'
      });

    return true;
  } catch (error) {
    console.error(`Error capturing price for ${cardId}:`, error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const today = new Date().toISOString().split('T')[0];

  console.log(`Starting daily price capture for ${today}`);

  try {
    // Get unique card IDs from multiple sources
    const cardIds = new Set<string>();

    // 1. Cards from user collections
    const { data: collectionCards } = await supabase
      .from('user_collections')
      .select('card_id')
      .limit(500);
    
    collectionCards?.forEach((c: any) => cardIds.add(c.card_id));
    console.log(`Found ${collectionCards?.length || 0} collection cards`);

    // 2. Cards from wishlists
    const { data: wishlistCards } = await supabase
      .from('wishlist')
      .select('card_id')
      .limit(500);
    
    wishlistCards?.forEach((c: any) => cardIds.add(c.card_id));
    console.log(`Found ${wishlistCards?.length || 0} wishlist cards`);

    // 3. Cards already being tracked (previously captured)
    const { data: trackedCards } = await supabase
      .from('card_price_history')
      .select('card_id')
      .order('snapshot_date', { ascending: false })
      .limit(500);
    
    // Get unique card IDs from tracked
    const trackedUnique = new Set(trackedCards?.map((c: any) => c.card_id) || []);
    trackedUnique.forEach(id => cardIds.add(id));
    console.log(`Found ${trackedUnique.size} previously tracked cards`);

    const uniqueCardIds = Array.from(cardIds);
    console.log(`Total unique cards to capture: ${uniqueCardIds.length}`);

    if (uniqueCardIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No cards to capture', captured: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process in batches to respect rate limits
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < uniqueCardIds.length; i += BATCH_SIZE) {
      const batch = uniqueCardIds.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} cards`);

      // Process batch with small delays between each request
      for (const cardId of batch) {
        const success = await captureCardPrice(cardId, supabase, today);
        if (success) {
          successCount++;
        } else {
          failCount++;
        }
        // Small delay between individual requests (100ms = 10 req/sec max)
        await delay(100);
      }

      // Longer delay between batches
      if (i + BATCH_SIZE < uniqueCardIds.length) {
        console.log(`Batch complete. Waiting before next batch...`);
        await delay(DELAY_BETWEEN_BATCHES);
      }
    }

    console.log(`Daily capture complete: ${successCount} success, ${failCount} failed`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        date: today,
        total: uniqueCardIds.length,
        captured: successCount,
        failed: failCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in daily price capture:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});