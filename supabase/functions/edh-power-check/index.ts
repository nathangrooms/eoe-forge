import { serve } from "https://deno.land/std@0.168.0/http/server.ts";


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const fetchWithTimeout = async (resource: string | URL, options: any = {}, timeout = 8000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(resource as any, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
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

// Helpers: clean and encode names, replace spaces with + and strip trailing (commander)
const cleanName = (name: string) => name.replace(/\s*\(commander\)\s*$/i, '').trim();
const encodeName = (name: string) =>
  encodeURIComponent(cleanName(name)).replace(/%20/g, '+');

// Aggregate cards by name (sum quantities), exclude commander to avoid duplicates
const parts: string[] = [];
const seen = new Map<string, { name: string; qty: number }>();
const commanderNameRaw = decklist.commander?.name ? cleanName(decklist.commander.name) : null;
if (decklist.cards && Array.isArray(decklist.cards)) {
  for (const card of decklist.cards) {
    if (!card?.name) continue;
    const cleaned = cleanName(card.name);
    if (commanderNameRaw && cleaned.toLowerCase() === commanderNameRaw.toLowerCase()) continue;
    const key = cleaned.toLowerCase();
    const qty = card.quantity || 1;
    if (!seen.has(key)) seen.set(key, { name: cleaned, qty });
    else seen.get(key)!.qty += qty;
  }
}

// Commander first with double tilde separator
if (decklist.commander?.name) {
  const commanderName = encodeName(decklist.commander.name);
  decklistParam += `1x+${commanderName}~~`;
}

// Build parts preserving insertion order
for (const { name, qty } of seen.values()) {
  parts.push(`${qty}x+${encodeName(name)}`);
}

// Cap items and URL length to avoid browser cut-offs, always end with sentinel
const MAX_ITEMS = 100; // EDH typical size
let limitedParts = parts.slice(0, MAX_ITEMS);
const MAX_LEN = 7000;
const sentinel = '~Z~';
let combinedBody = limitedParts.join('~');
let combined = decklistParam + combinedBody + sentinel;
while ((decklistParam.length + combinedBody.length + sentinel.length) > MAX_LEN && limitedParts.length > 0) {
  limitedParts.pop();
  combinedBody = limitedParts.join('~');
  combined = decklistParam + combinedBody + sentinel;
}

decklistParam = combined;
    
    const url = `https://edhpowerlevel.com/?d=${decklistParam}`;
    console.log('EDH Power Level URL:', url);

    // Use a headless browser service to render JavaScript and get the power level
    // We'll use browserless.io's free tier endpoint
    console.log('Attempting to render page with JavaScript execution...');
    
    try {
      // Try using a rendering service that executes JavaScript
      const renderResponse = await fetchWithTimeout('https://chrome.browserless.io/content?token=free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, waitFor: 6000 })
      }, 6000);

      if (renderResponse.ok) {
        const renderedHtml = await renderResponse.text();
        console.log('Rendered HTML length:', renderedHtml.length);
        
        // Extract power level from the rendered HTML using regex on the raw string
        const content = renderedHtml;
        const powerPatterns = [
          /power\s*level[^0-9]{0,10}(\d+(?:[.,]\d+)?)/i,
          /rating[^0-9]{0,10}(\d+(?:[.,]\d+)?)\s*\/\s*10/i,
          /score[^0-9]{0,10}(\d+(?:[.,]\d+)?)/i,
          /(\d+(?:[.,]\d+)?)\s*\/\s*10\s*\(?\s*power\s*level\s*\)?/i,
          /"powerLevel"\s*:\s*(\d+(?:\.\d+)?)/i,
          /"rating"\s*:\s*(\d+(?:\.\d+)?)/i,
          /"score"\s*:\s*(\d+(?:\.\d+)?)/i,
        ];
        
        let powerLevel = null as number | null;
        for (const pattern of powerPatterns) {
          const match = content.match(pattern);
          if (match && match[1]) {
            const normalized = match[1].replace(',', '.');
            const val = parseFloat(normalized);
            if (!Number.isNaN(val) && val >= 0 && val <= 10) {
              powerLevel = val;
              console.log('Found power level in rendered content:', powerLevel);
              break;
            }
          }
        }

        // Also scan any inline scripts for JSON/state variables if not found yet
        if (powerLevel === null) {
          const scriptMatches = renderedHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
          for (const m of scriptMatches) {
            const sc = m[1];
            const scriptPatterns = [
              /powerLevel\s*[=:\s]\s*(\d+(?:\.\d+)?)/i,
              /\"powerLevel\"\s*:\s*(\d+(?:\.\d+)?)/i,
              /rating\s*[=:\s]\s*(\d+(?:\.\d+)?)/i,
              /\"rating\"\s*:\s*(\d+(?:\.\d+)?)/i,
              /score\s*[=:\s]\s*(\d+(?:\.\d+)?)/i,
              /\"score\"\s*:\s*(\d+(?:\.\d+)?)/i,
              /(\d+(?:[.,]\d+)?)\s*\/\s*10/i,
            ];
            for (const p of scriptPatterns) {
              const mm = sc.match(p);
              if (mm && mm[1]) {
                const val = parseFloat(mm[1].replace(',', '.'));
                if (!Number.isNaN(val) && val >= 0 && val <= 10) {
                  powerLevel = val;
                  console.log('Found power level in rendered script:', powerLevel);
                  break;
                }
              }
            }
            if (powerLevel !== null) break;
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
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    }, 8000);

    let html = '';
    let powerLevel: number | null = null;
    if (response && response.ok) {
      html = await response.text();
      console.log('HTML length:', html.length);
      
      // First, scan the whole HTML for obvious patterns
      const htmlPatterns = [
        /power\s*level[^0-9]{0,10}(\d+(?:[.,]\d+)?)/i,
        /rating[^0-9]{0,10}(\d+(?:[.,]\d+)?)\s*\/\s*10/i,
        /(\d+(?:[.,]\d+)?)\s*\/\s*10\s*\(?\s*power\s*level\s*\)?/i,
        /"powerLevel"\s*:\s*(\d+(?:\.\d+)?)/i,
        /"rating"\s*:\s*(\d+(?:\.\d+)?)/i,
        /"score"\s*:\s*(\d+(?:\.\d+)?)/i,
      ];
      for (const p of htmlPatterns) {
        const m = html.match(p);
        if (m && m[1]) {
          const val = parseFloat(m[1].replace(',', '.'));
          if (!Number.isNaN(val) && val >= 0 && val <= 10) {
            powerLevel = val;
            console.log('Found power level in HTML:', powerLevel);
            break;
          }
        }
      }
      
      // Try extracting from script tags - edhpowerlevel likely calculates it in JS
      if (powerLevel === null) {
        const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
        for (const match of scriptMatches) {
          const scriptContent = match[1];
          
          // Look for power level assignments or calculations
          const patterns = [
            /powerLevel\s*[=:\s]\s*(\d+(?:\.\d+)?)/i,
            /power\s*[=:\s]\s*(\d+(?:\.\d+)?)/i,
            /\"powerLevel\"\s*:\s*(\d+(?:\.\d+)?)/i,
            /\"power\"\s*:\s*(\d+(?:\.\d+)?)/i,
            /\"rating\"\s*:\s*(\d+(?:\.\d+)?)/i,
            /\"score\"\s*:\s*(\d+(?:\.\d+)?)/i,
            /(\d+(?:[.,]\d+)?)\s*\/\s*10/i,
          ];
          
          for (const pattern of patterns) {
            const valueMatch = scriptContent.match(pattern);
            if (valueMatch && valueMatch[1]) {
              const val = parseFloat(valueMatch[1].replace(',', '.'));
              if (val >= 0 && val <= 10) {
                powerLevel = val;
                console.log('Found power level in script:', powerLevel);
                break;
              }
            }
          }
          if (powerLevel !== null) break;
        }
      }
    } else {
      console.error('Direct fetch failed');
    }

// Third fallback: use r.jina.ai text reader
if (powerLevel === null) {
  try {
    console.log('Trying r.jina.ai fallback...');
    const jinaUrls = [
      `https://r.jina.ai/http://edhpowerlevel.com/?d=${decklistParam}`,
      `https://r.jina.ai/https://edhpowerlevel.com/?d=${decklistParam}`,
    ];
    for (const ju of jinaUrls) {
      const jinaRes = await fetchWithTimeout(ju, {}, 8000);
      if (!jinaRes.ok) continue;
      const text = await jinaRes.text();
      const powerPatterns = [
        /power\s*level[^0-9]{0,10}(\d+(?:[.,]\d+)?)/i,
        /rating[^0-9]{0,10}(\d+(?:[.,]\d+)?)\s*\/\s*10/i,
        /(\d+(?:[.,]\d+)?)\s*\/\s*10\s*\(?\s*power\s*level\s*\)?/i,
      ];
      for (const pattern of powerPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const val = parseFloat(match[1].replace(',', '.'));
          if (!Number.isNaN(val) && val >= 0 && val <= 10) {
            powerLevel = val;
            console.log('Found power level via r.jina.ai:', powerLevel);
            break;
          }
        }
      }
      if (powerLevel !== null) break;
    }
  } catch (e) {
    console.error('r.jina.ai error:', e);
  }
}

    console.log('Final extracted power level:', powerLevel);

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
