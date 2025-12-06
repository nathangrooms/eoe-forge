import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const fetchWithTimeout = async (resource: string | URL, options: any = {}, timeout = 15000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(resource as any, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
};

// Extract all EDH metrics from HTML content
function extractEdhMetrics(html: string) {
  const metrics: {
    powerLevel: number | null;
    tippingPoint: number | null;
    efficiency: number | null;
    impact: number | null;
    score: number | null;
    playability: number | null;
  } = {
    powerLevel: null,
    tippingPoint: null,
    efficiency: null,
    impact: null,
    score: null,
    playability: null,
  };

  console.log('Parsing HTML, length:', html.length);
  
  // Look for the results dashboard section with specific class selectors
  // Power Level: class="res-power-level" contains <span class="text-total...">1.43</span>
  
  // More precise regex that captures the value within the specific result div
  const powerMatch = html.match(/class="[^"]*res-power-level[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*text-total[^"]*"[^>]*>([0-9]+(?:\.[0-9]+)?)/i);
  if (powerMatch) {
    metrics.powerLevel = parseFloat(powerMatch[1]);
    console.log('Found power level:', metrics.powerLevel);
  }

  // Tipping Point
  const tippingMatch = html.match(/class="[^"]*res-tipping-point[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*text-total[^"]*"[^>]*>([0-9]+(?:\.[0-9]+)?)/i);
  if (tippingMatch) {
    metrics.tippingPoint = parseFloat(tippingMatch[1]);
  }

  // Efficiency
  const efficiencyMatch = html.match(/class="[^"]*res-efficiency[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*text-total[^"]*"[^>]*>([0-9]+(?:\.[0-9]+)?)/i);
  if (efficiencyMatch) {
    metrics.efficiency = parseFloat(efficiencyMatch[1]);
  }

  // Impact
  const impactMatch = html.match(/class="[^"]*res-impact[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*text-total[^"]*"[^>]*>([0-9]+(?:\.[0-9]+)?)/i);
  if (impactMatch) {
    metrics.impact = parseFloat(impactMatch[1]);
  }

  // Score
  const scoreMatch = html.match(/class="[^"]*res-score[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*text-total[^"]*"[^>]*>([0-9]+(?:\.[0-9]+)?)/i);
  if (scoreMatch) {
    metrics.score = parseFloat(scoreMatch[1]);
  }

  // Playability (ends with %)
  const playabilityMatch = html.match(/class="[^"]*res-playability[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*text-total[^"]*"[^>]*>([0-9]+(?:\.[0-9]+)?)\s*%?/i);
  if (playabilityMatch) {
    metrics.playability = parseFloat(playabilityMatch[1]);
  }

  // If we couldn't find with class patterns, try simpler text-based patterns
  if (metrics.powerLevel === null) {
    // Try: Power Level followed by number/10
    const fallbackPower = html.match(/Power\s*Level[\s\S]{0,200}?(\d+(?:\.\d+)?)\s*(?:<[^>]*>)*\s*\/\s*10/i);
    if (fallbackPower) {
      metrics.powerLevel = parseFloat(fallbackPower[1]);
      console.log('Fallback power level:', metrics.powerLevel);
    }
  }

  if (metrics.tippingPoint === null) {
    const fallbackTipping = html.match(/Tipping\s*Point[\s\S]{0,200}?<span[^>]*class="[^"]*text-total[^"]*"[^>]*>([0-9]+(?:\.[0-9]+)?)/i);
    if (fallbackTipping) {
      metrics.tippingPoint = parseFloat(fallbackTipping[1]);
    }
  }

  if (metrics.efficiency === null) {
    const fallbackEff = html.match(/Efficiency[\s\S]{0,200}?(\d+(?:\.\d+)?)\s*(?:<[^>]*>)*\s*\/\s*10/i);
    if (fallbackEff) {
      metrics.efficiency = parseFloat(fallbackEff[1]);
    }
  }

  if (metrics.score === null) {
    const fallbackScore = html.match(/Score[\s\S]{0,200}?(\d+(?:\.\d+)?)\s*(?:<[^>]*>)*\s*\/\s*1000/i);
    if (fallbackScore) {
      metrics.score = parseFloat(fallbackScore[1]);
    }
  }

  if (metrics.playability === null) {
    const fallbackPlay = html.match(/(?:Average\s*)?Playability[\s\S]{0,200}?(\d+(?:\.\d+)?)\s*%/i);
    if (fallbackPlay) {
      metrics.playability = parseFloat(fallbackPlay[1]);
    }
  }

  if (metrics.impact === null) {
    const fallbackImpact = html.match(/Impact[\s\S]{0,200}?<span[^>]*class="[^"]*text-total[^"]*"[^>]*>([0-9]+(?:\.[0-9]+)?)/i);
    if (fallbackImpact) {
      metrics.impact = parseFloat(fallbackImpact[1]);
    }
  }

  return metrics;
}

// Parse text-based content (from Jina or plain text)
function parseTextMetrics(text: string) {
  const metrics: {
    powerLevel: number | null;
    tippingPoint: number | null;
    efficiency: number | null;
    impact: number | null;
    score: number | null;
    playability: number | null;
  } = {
    powerLevel: null,
    tippingPoint: null,
    efficiency: null,
    impact: null,
    score: null,
    playability: null,
  };

  // Power Level: 1.43 / 10 or Power Level 1.43
  const powerMatch = text.match(/Power\s*Level[:\s]*(\d+(?:\.\d+)?)/i);
  if (powerMatch) metrics.powerLevel = parseFloat(powerMatch[1]);
  
  // Tipping Point: 4
  const tippingMatch = text.match(/Tipping\s*Point[:\s]*(\d+(?:\.\d+)?)/i);
  if (tippingMatch) metrics.tippingPoint = parseFloat(tippingMatch[1]);
  
  // Efficiency: 5.80 / 10
  const effMatch = text.match(/Efficiency[:\s]*(\d+(?:\.\d+)?)/i);
  if (effMatch) metrics.efficiency = parseFloat(effMatch[1]);
  
  // Impact: 307.16
  const impactMatch = text.match(/Impact[:\s]*(\d+(?:\.\d+)?)/i);
  if (impactMatch) metrics.impact = parseFloat(impactMatch[1]);
  
  // Score: 280 / 1000
  const scoreMatch = text.match(/Score[:\s]*(\d+(?:\.\d+)?)/i);
  if (scoreMatch) metrics.score = parseFloat(scoreMatch[1]);
  
  // Playability: 17.8%
  const playMatch = text.match(/(?:Average\s*)?Playability[:\s]*(\d+(?:\.\d+)?)\s*%?/i);
  if (playMatch) metrics.playability = parseFloat(playMatch[1]);

  return metrics;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log('EDH Power Check - Request body keys:', Object.keys(body));
    
    // Accept a pre-built URL from the client if provided
    let url = body.url || null;
    
    // Handle both formats:
    // Format 1: { decklist: { cards: [...], commander: {...} } }
    // Format 2: { cards: [...], commander: "..." }
    // Format 3: { url: "https://edhpowerlevel.com/?d=..." }
    let cards: string[] = [];
    let commanderName: string | null = null;

    if (!url) {
      if (body.decklist) {
        const decklist = body.decklist;
        commanderName = decklist.commander?.name || null;
        cards = (decklist.cards || []).map((c: any) => c.name || c).filter(Boolean);
      } else if (body.cards) {
        cards = Array.isArray(body.cards) ? body.cards.map((c: any) => typeof c === 'string' ? c : c.name).filter(Boolean) : [];
        commanderName = body.commander || null;
      }

      console.log('Commander:', commanderName);
      console.log('Card count:', cards.length);

      if (cards.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'No cards provided',
            powerLevel: null,
            metrics: null,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Build URL for edhpowerlevel.com
      const cleanName = (name: string) => name.replace(/\s*\(commander\)\s*$/i, '').trim();
      const encodeName = (name: string) => encodeURIComponent(cleanName(name)).replace(/%20/g, '+');

      let decklistParam = '';
      
      // Commander first with double tilde
      if (commanderName) {
        decklistParam += `1x+${encodeName(commanderName)}~~`;
      }

      // Count card occurrences (excluding commander)
      const cardCounts = new Map<string, number>();
      for (const card of cards) {
        const cleaned = cleanName(card);
        if (commanderName && cleaned.toLowerCase() === cleanName(commanderName).toLowerCase()) {
          continue;
        }
        const key = cleaned.toLowerCase();
        cardCounts.set(key, (cardCounts.get(key) || 0) + 1);
      }

      // Build parts
      const parts: string[] = [];
      const addedNames = new Set<string>();
      for (const card of cards) {
        const cleaned = cleanName(card);
        const key = cleaned.toLowerCase();
        if (addedNames.has(key)) continue;
        if (commanderName && key === cleanName(commanderName).toLowerCase()) continue;
        
        const qty = cardCounts.get(key) || 1;
        parts.push(`${qty}x+${encodeName(cleaned)}`);
        addedNames.add(key);
      }

      const MAX_LEN = 7000;
      const sentinel = '~Z~';
      let combinedBody = parts.join('~');
      let combined = decklistParam + combinedBody + sentinel;
      
      let limitedParts = [...parts];
      while ((decklistParam.length + combinedBody.length + sentinel.length) > MAX_LEN && limitedParts.length > 0) {
        limitedParts.pop();
        combinedBody = limitedParts.join('~');
        combined = decklistParam + combinedBody + sentinel;
      }

      decklistParam = combined;
      url = `https://edhpowerlevel.com/?d=${decklistParam}`;
    }
    
    console.log('EDH Power Level URL length:', url.length);
    console.log('URL preview:', url.substring(0, 200));

    let metrics = {
      powerLevel: null as number | null,
      tippingPoint: null as number | null,
      efficiency: null as number | null,
      impact: null as number | null,
      score: null as number | null,
      playability: null as number | null,
    };

    // Try r.jina.ai FIRST - it's more reliable for JavaScript-rendered content
    try {
      console.log('Trying r.jina.ai first...');
      const jinaUrl = `https://r.jina.ai/${url}`;
      const jinaRes = await fetchWithTimeout(jinaUrl, {
        headers: {
          'Accept': 'text/plain',
        }
      }, 12000);
      
      if (jinaRes.ok) {
        const text = await jinaRes.text();
        console.log('Jina response length:', text.length);
        console.log('Jina response preview:', text.substring(0, 500));
        
        metrics = parseTextMetrics(text);
        console.log('Jina parsed metrics:', metrics);
      }
    } catch (e) {
      console.error('Jina error:', e);
    }

    // Fallback: direct fetch (won't get JS-rendered content but worth trying)
    if (metrics.powerLevel === null) {
      try {
        console.log('Trying direct fetch...');
        const response = await fetchWithTimeout(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          }
        }, 10000);

        if (response.ok) {
          const html = await response.text();
          console.log('Direct fetch HTML length:', html.length);
          const directMetrics = extractEdhMetrics(html);
          console.log('Direct fetch metrics:', directMetrics);
          if (directMetrics.powerLevel !== null) {
            metrics = directMetrics;
          }
        }
      } catch (e) {
        console.error('Direct fetch error:', e);
      }
    }

    console.log('Final metrics:', metrics);

    return new Response(
      JSON.stringify({
        success: metrics.powerLevel !== null,
        powerLevel: metrics.powerLevel,
        tippingPoint: metrics.tippingPoint,
        efficiency: metrics.efficiency,
        impact: metrics.impact,
        score: metrics.score,
        playability: metrics.playability,
        url,
        source: 'edhpowerlevel.com'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error checking EDH power level:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        powerLevel: null,
        metrics: null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
