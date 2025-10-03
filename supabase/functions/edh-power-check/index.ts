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
    console.log('EDH Power Level URL:', url);

    // Use a headless browser service to render JavaScript and get the power level
    // We'll use browserless.io's free tier endpoint
    console.log('Attempting to render page with JavaScript execution...');
    
    try {
      // Try using a rendering service that executes JavaScript
      const renderResponse = await fetch('https://chrome.browserless.io/content?token=free', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url,
          waitFor: 5000, // Wait 5 seconds for JavaScript to execute
        })
      });

      if (renderResponse.ok) {
        const renderedHtml = await renderResponse.text();
        console.log('Rendered HTML length:', renderedHtml.length);
        
        // Extract power level from the rendered HTML using regex on the raw string
        const content = renderedHtml;
        const powerPatterns = [
          /power\s*level[:\s]+(\d+\.?\d*)/i,
          /rating[:\s]+(\d+\.?\d*)\s*\/\s*10/i,
          /score[:\s]+(\d+\.?\d*)/i,
          /(\d+\.?\d*)\s*\/\s*10\s*\(?\s*power\s*level\s*\)?/i,
        ];
        
        let powerLevel = null as number | null;
        for (const pattern of powerPatterns) {
          const match = content.match(pattern);
          if (match && match[1]) {
            const val = parseFloat(match[1]);
            if (!Number.isNaN(val) && val >= 0 && val <= 10) {
              powerLevel = val;
              console.log('Found power level in rendered content:', powerLevel);
              break;
            }
          }
        }
        
        if (powerLevel !== null) {
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
        }
      } else {
        console.error('Rendering service failed:', renderResponse.status);
      }
    } catch (renderError) {
      console.error('Error using rendering service:', renderError);
    }

    // Fallback: Try direct fetch and aggressive pattern matching
    console.log('Falling back to direct fetch...');
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
    
    let powerLevel = null;

    // Try extracting from script tags - edhpowerlevel likely calculates it in JS
    const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of scriptMatches) {
      const scriptContent = match[1];
      
      // Look for power level assignments or calculations
      const patterns = [
        /powerLevel\s*[=:]\s*(\d+\.?\d*)/i,
        /power\s*[=:]\s*(\d+\.?\d*)/i,
        /"power":\s*(\d+\.?\d*)/i,
        /'power':\s*(\d+\.?\d*)/i,
      ];
      
      for (const pattern of patterns) {
        const valueMatch = scriptContent.match(pattern);
        if (valueMatch && valueMatch[1]) {
          const val = parseFloat(valueMatch[1]);
          if (val >= 0 && val <= 10) {
            powerLevel = val;
            console.log('Found power level in script:', powerLevel);
            break;
          }
        }
      }
      if (powerLevel !== null) break;
    }

    console.log('Final extracted power level:', powerLevel);

    // If we still couldn't find it, log for debugging
    if (powerLevel === null) {
      console.log('Could not extract power level. URL:', url);
      console.log('Sample HTML (first 1000 chars):', html.substring(0, 1000));
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
