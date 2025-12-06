import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Scryfall allows 10 requests/second - we'll do ~8/sec to be safe
const BATCH_SIZE = 75;
const DELAY_BETWEEN_REQUESTS = 125; // 125ms = 8 req/sec

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureCardPrice(cardId: string, supabase: any, today: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.scryfall.com/cards/${cardId}`);
    if (!response.ok) {
      if (response.status === 404) {
        // Card no longer exists on Scryfall, skip
        return false;
      }
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

  // Check for optional offset parameter for chunked processing
  const url = new URL(req.url);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const limit = parseInt(url.searchParams.get('limit') || '5000');

  console.log(`Starting daily price capture for ${today}, offset: ${offset}, limit: ${limit}`);

  try {
    // Get ALL unique card IDs from the cards table
    const { data: allCards, error: cardsError, count } = await supabase
      .from('cards')
      .select('id', { count: 'exact' })
      .order('id')
      .range(offset, offset + limit - 1);

    if (cardsError) {
      console.error('Error fetching cards:', cardsError);
      throw cardsError;
    }

    const cardIds = allCards?.map((c: any) => c.id) || [];
    console.log(`Processing ${cardIds.length} cards (total in DB: ${count})`);

    if (cardIds.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No more cards to capture', 
          captured: 0,
          offset,
          hasMore: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process cards with rate limiting
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < cardIds.length; i++) {
      const cardId = cardIds[i];
      const success = await captureCardPrice(cardId, supabase, today);
      
      if (success) {
        successCount++;
      } else {
        failCount++;
      }

      // Log progress every 100 cards
      if ((i + 1) % 100 === 0) {
        console.log(`Progress: ${i + 1}/${cardIds.length} (${successCount} success, ${failCount} failed)`);
      }

      // Rate limit delay
      await delay(DELAY_BETWEEN_REQUESTS);
    }

    const hasMore = (offset + limit) < (count || 0);

    console.log(`Batch complete: ${successCount} success, ${failCount} failed. Has more: ${hasMore}`);

    // If there are more cards, trigger next batch
    if (hasMore) {
      const nextOffset = offset + limit;
      console.log(`Triggering next batch at offset ${nextOffset}`);
      
      // Use EdgeRuntime.waitUntil to trigger next batch without blocking response
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/daily-price-capture?offset=${nextOffset}&limit=${limit}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
          }
        }).catch(err => console.error('Failed to trigger next batch:', err))
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        date: today,
        offset,
        processed: cardIds.length,
        captured: successCount,
        failed: failCount,
        totalCards: count,
        hasMore
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