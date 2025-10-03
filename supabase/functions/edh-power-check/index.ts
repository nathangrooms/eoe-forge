import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

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
    console.log('EDH Power Level URL:', url);

    // Try fetching with different user agents and wait for JS to render
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });

    if (!response.ok) {
      console.error('Failed to fetch:', response.status, response.statusText);
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const html = await response.text();
    console.log('HTML length:', html.length);
    
    // Parse HTML with DOMParser
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    let powerLevel = null;

    // Strategy 1: Look for data attributes or specific IDs
    const powerElements = doc?.querySelectorAll('[data-power], [id*="power"], [class*="power"]');
    console.log('Found power-related elements:', powerElements?.length || 0);

    // Strategy 2: Look in script tags for JSON data
    const scripts = doc?.querySelectorAll('script');
    if (scripts) {
      for (const script of scripts) {
        const content = script.textContent || '';
        
        // Look for JSON data with power level
        const jsonMatch = content.match(/["']?powerLevel["']?\s*:\s*(\d+\.?\d*)/i);
        if (jsonMatch && jsonMatch[1]) {
          powerLevel = parseFloat(jsonMatch[1]);
          console.log('Found power level in script JSON:', powerLevel);
          break;
        }
        
        // Look for window.data or similar patterns
        const windowDataMatch = content.match(/window\.(data|state|__INITIAL_STATE__)\s*=\s*({[\s\S]*?});/);
        if (windowDataMatch) {
          try {
            const dataStr = windowDataMatch[2];
            // Try to extract power level from the data string
            const pwrMatch = dataStr.match(/["']?(?:power|score|rating)["']?\s*:\s*(\d+\.?\d*)/i);
            if (pwrMatch) {
              powerLevel = parseFloat(pwrMatch[1]);
              console.log('Found power level in window data:', powerLevel);
              break;
            }
          } catch (e) {
            console.error('Error parsing window data:', e);
          }
        }
      }
    }

    // Strategy 3: Simple regex patterns on the full HTML
    if (!powerLevel) {
      const patterns = [
        /power[- ]?level["\s:]+(\d+\.?\d*)/i,
        /score["\s:]+(\d+\.?\d*)/i,
        /rating["\s:]+(\d+\.?\d*)/i,
        /(\d+\.?\d*)\s*\/\s*10/,
        /"power"\s*:\s*(\d+\.?\d*)/i,
        /data-power=["'](\d+\.?\d*)["']/i
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          const val = parseFloat(match[1]);
          // Validate it's a reasonable power level (1-10)
          if (val >= 1 && val <= 10) {
            powerLevel = val;
            console.log('Found power level with pattern:', pattern, '=', powerLevel);
            break;
          }
        }
      }
    }

    console.log('Final extracted power level:', powerLevel);

    // If we still couldn't find it, log part of the HTML for debugging
    if (!powerLevel) {
      console.log('Sample HTML (first 500 chars):', html.substring(0, 500));
    }

    return new Response(
      JSON.stringify({
        success: powerLevel !== null,
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
        status: 200, // Return 200 to not break the flow
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
