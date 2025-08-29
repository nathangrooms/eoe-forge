import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function testScryfallAPI() {
  console.log('🧪 Testing Scryfall API connectivity...');
  
  try {
    // Test basic API connection
    console.log('📡 Testing basic API endpoint...');
    const apiResponse = await fetch('https://api.scryfall.com/cards/random');
    console.log(`✅ Random card API status: ${apiResponse.status}`);
    
    if (apiResponse.ok) {
      const randomCard = await apiResponse.json();
      console.log(`🃏 Retrieved random card: ${randomCard.name} from ${randomCard.set_name}`);
    }
    
    // Test bulk data endpoint
    console.log('📦 Testing bulk data endpoint...');
    const bulkResponse = await fetch('https://api.scryfall.com/bulk-data');
    console.log(`✅ Bulk data API status: ${bulkResponse.status}`);
    
    if (bulkResponse.ok) {
      const bulkData = await bulkResponse.json();
      console.log(`📊 Found ${bulkData.data?.length || 0} bulk data types`);
      
      const defaultCards = bulkData.data.find((item: any) => item.type === 'default_cards');
      if (defaultCards) {
        console.log(`🎯 Default cards found:`);
        console.log(`   - Size: ${defaultCards.size || 'unknown'} cards`);
        console.log(`   - Compressed: ${defaultCards.compressed_size ? (defaultCards.compressed_size / 1024 / 1024).toFixed(1) + 'MB' : 'unknown'}`);
        console.log(`   - Updated: ${defaultCards.updated_at}`);
        console.log(`   - URI: ${defaultCards.download_uri}`);
        
        // Test download URI (just headers, not full download)
        console.log('🔍 Testing download URI...');
        const downloadResponse = await fetch(defaultCards.download_uri, { method: 'HEAD' });
        console.log(`✅ Download URI status: ${downloadResponse.status}`);
        console.log(`📦 Content-Length: ${downloadResponse.headers.get('content-length') || 'unknown'}`);
        console.log(`📄 Content-Type: ${downloadResponse.headers.get('content-type') || 'unknown'}`);
      } else {
        console.error('❌ Default cards not found in bulk data');
        console.log('Available types:', bulkData.data.map((d: any) => d.type));
      }
    }
    
    return {
      success: true,
      message: 'Scryfall API test completed successfully'
    };
    
  } catch (error) {
    console.error('❌ Scryfall API test failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Starting Scryfall API test...');
    const result = await testScryfallAPI();
    
    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: result.success ? 200 : 500
      }
    );
    
  } catch (error) {
    console.error('💥 Test function error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});