import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { card_id, oracle_id, card_name } = await req.json();

    if (!card_id) {
      return new Response(
        JSON.stringify({ error: 'card_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Capturing price for card: ${card_name || card_id}`);

    // Fetch current price from Scryfall
    const scryfallResponse = await fetch(`https://api.scryfall.com/cards/${card_id}`);
    
    if (!scryfallResponse.ok) {
      console.error('Scryfall API error:', scryfallResponse.status);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch card from Scryfall' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cardData = await scryfallResponse.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date().toISOString().split('T')[0];

    // Upsert price snapshot
    const { data, error } = await supabase
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
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to save price snapshot' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Price captured for ${cardData.name}: $${cardData.prices?.usd || 'N/A'}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        snapshot: data,
        current_price: cardData.prices?.usd
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in capture-card-price:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});