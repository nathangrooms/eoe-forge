import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  console.log('🌟 Simple sync function called');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Starting direct sync execution...');
    
    // Update status immediately
    const { error: statusError } = await supabase
      .from('sync_status')
      .upsert({
        id: 'scryfall_cards',
        status: 'running',
        records_processed: 0,
        total_records: 100000,
        last_sync: new Date().toISOString(),
        error_message: null
      }, { 
        onConflict: 'id'
      });
    
    if (statusError) {
      console.error('Status update failed:', statusError);
      throw statusError;
    }
    
    console.log('✅ Status updated to running');
    
    // Fetch a small test sample from Scryfall
    console.log('📡 Fetching sample cards from Scryfall...');
    const response = await fetch('https://api.scryfall.com/cards/search?q=set:war&page=1');
    
    if (!response.ok) {
      throw new Error(`Scryfall API failed: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`📦 Retrieved ${data.data?.length || 0} sample cards`);
    
    if (data.data && data.data.length > 0) {
      // Process sample cards
      const cards = data.data.slice(0, 10).map((card: any) => ({
        id: card.id,
        oracle_id: card.oracle_id,
        name: card.name,
        set_code: card.set,
        collector_number: card.collector_number,
        layout: card.layout || 'normal',
        type_line: card.type_line,
        cmc: card.cmc || 0,
        colors: card.colors || [],
        color_identity: card.color_identity || [],
        oracle_text: card.oracle_text,
        mana_cost: card.mana_cost,
        power: card.power,
        toughness: card.toughness,
        loyalty: card.loyalty,
        keywords: card.keywords || [],
        legalities: card.legalities || {},
        image_uris: card.image_uris || {},
        prices: card.prices || {},
        is_legendary: card.type_line.toLowerCase().includes('legendary'),
        is_reserved: card.reserved || false,
        rarity: card.rarity || 'common',
        tags: []
      }));
      
      console.log(`💾 Saving ${cards.length} test cards...`);
      
      const { error: insertError } = await supabase
        .from('cards')
        .upsert(cards, { onConflict: 'id' });
      
      if (insertError) {
        console.error('Insert failed:', insertError);
        throw insertError;
      }
      
      console.log('✅ Test cards saved successfully');
      
      // Update final status
      await supabase
        .from('sync_status')
        .update({
          status: 'completed',
          records_processed: cards.length,
          total_records: cards.length,
          last_sync: new Date().toISOString(),
          error_message: null
        })
        .eq('id', 'scryfall_cards');
      
      console.log('✅ Sync completed successfully');
    }
    
    return new Response(
      JSON.stringify({ 
        message: 'Simple sync completed',
        processed: data.data?.length || 0
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
    
  } catch (error) {
    console.error('💥 Simple sync failed:', error);
    
    // Update error status
    await supabase
      .from('sync_status')
      .update({
        status: 'failed',
        error_message: error.message,
        last_sync: new Date().toISOString()
      })
      .eq('id', 'scryfall_cards');
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});