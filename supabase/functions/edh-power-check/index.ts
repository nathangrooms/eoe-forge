import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { decklist } = await req.json();
    console.log('Checking EDH power level for decklist');

    // Build the edhpowerlevel.com URL
    let decklistParam = '';
    
    // Commander
    if (decklist.commander) {
      decklistParam += `1x+${encodeURIComponent(decklist.commander.name)}~`;
    }
    
    // Cards
    if (decklist.cards && Array.isArray(decklist.cards)) {
      decklist.cards.forEach((card: any) => {
        const quantity = card.quantity || 1;
        decklistParam += `${quantity}x+${encodeURIComponent(card.name)}~`;
      });
    }
    
    // Remove trailing ~
    if (decklistParam.endsWith('~')) {
      decklistParam = decklistParam.slice(0, -1);
    }
    
    const url = `https://edhpowerlevel.com/?d=${decklistParam}`;
    console.log('Fetching from:', url);

    // Fetch the page
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const html = await response.text();
    
    // Parse the power level from the HTML
    // Look for the power level display - adjust regex based on actual HTML structure
    const powerLevelMatch = html.match(/power[- ]?level["\s:]+(\d+\.?\d*)/i) || 
                           html.match(/score["\s:]+(\d+\.?\d*)/i) ||
                           html.match(/rating["\s:]+(\d+\.?\d*)/i);
    
    // Also try to find it in JSON data if embedded
    const jsonMatch = html.match(/powerLevel["\s:]+(\d+\.?\d*)/i);
    
    let powerLevel = null;
    if (powerLevelMatch && powerLevelMatch[1]) {
      powerLevel = parseFloat(powerLevelMatch[1]);
    } else if (jsonMatch && jsonMatch[1]) {
      powerLevel = parseFloat(jsonMatch[1]);
    }

    // Try alternative patterns
    if (!powerLevel) {
      // Look for number patterns near "power" text
      const altMatch = html.match(/(\d+\.?\d*)\s*\/\s*10/);
      if (altMatch && altMatch[1]) {
        powerLevel = parseFloat(altMatch[1]);
      }
    }

    console.log('Extracted power level:', powerLevel);

    return new Response(
      JSON.stringify({
        success: true,
        powerLevel,
        url,
        source: 'edhpowerlevel.com'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error checking EDH power level:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        powerLevel: null
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
