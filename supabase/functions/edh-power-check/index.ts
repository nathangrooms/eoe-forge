import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const fetchWithTimeout = async (resource: string | URL, options: any = {}, timeout = 10000) => {
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

  // Look for the results dashboard section
  // Power Level: class="res-power-level" with value like "1.43"
  const powerMatch = html.match(/res-power-level[\s\S]*?text-total[^>]*>([0-9]+(?:\.[0-9]+)?)/i);
  if (powerMatch) {
    metrics.powerLevel = parseFloat(powerMatch[1]);
  }

  // Tipping Point: class="res-tipping-point" 
  const tippingMatch = html.match(/res-tipping-point[\s\S]*?text-total[^>]*>([0-9]+(?:\.[0-9]+)?)/i);
  if (tippingMatch) {
    metrics.tippingPoint = parseFloat(tippingMatch[1]);
  }

  // Efficiency: class="res-efficiency"
  const efficiencyMatch = html.match(/res-efficiency[\s\S]*?text-total[^>]*>([0-9]+(?:\.[0-9]+)?)/i);
  if (efficiencyMatch) {
    metrics.efficiency = parseFloat(efficiencyMatch[1]);
  }

  // Impact: class="res-impact"
  const impactMatch = html.match(/res-impact[\s\S]*?text-total[^>]*>([0-9]+(?:\.[0-9]+)?)/i);
  if (impactMatch) {
    metrics.impact = parseFloat(impactMatch[1]);
  }

  // Score: class="res-score"
  const scoreMatch = html.match(/res-score[\s\S]*?text-total[^>]*>([0-9]+(?:\.[0-9]+)?)/i);
  if (scoreMatch) {
    metrics.score = parseFloat(scoreMatch[1]);
  }

  // Playability: class="res-playability"
  const playabilityMatch = html.match(/res-playability[\s\S]*?text-total[^>]*>([0-9]+(?:\.[0-9]+)?)/i);
  if (playabilityMatch) {
    metrics.playability = parseFloat(playabilityMatch[1]);
  }

  // Fallback patterns if the specific class patterns don't match
  if (metrics.powerLevel === null) {
    // Try finding Power Level text followed by number
    const fallbackPower = html.match(/Power\s*Level[\s\S]*?(\d+(?:\.\d+)?)\s*<[^>]*>?\s*\/\s*10/i);
    if (fallbackPower) {
      metrics.powerLevel = parseFloat(fallbackPower[1]);
    }
  }

  if (metrics.efficiency === null) {
    const fallbackEff = html.match(/Efficiency[\s\S]*?(\d+(?:\.\d+)?)\s*<[^>]*>?\s*\/\s*10/i);
    if (fallbackEff) {
      metrics.efficiency = parseFloat(fallbackEff[1]);
    }
  }

  if (metrics.score === null) {
    const fallbackScore = html.match(/Score[\s\S]*?(\d+(?:\.\d+)?)\s*<[^>]*>?\s*\/\s*1000/i);
    if (fallbackScore) {
      metrics.score = parseFloat(fallbackScore[1]);
    }
  }

  if (metrics.playability === null) {
    const fallbackPlay = html.match(/Playability[\s\S]*?(\d+(?:\.\d+)?)\s*%/i);
    if (fallbackPlay) {
      metrics.playability = parseFloat(fallbackPlay[1]);
    }
  }

  return metrics;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log('EDH Power Check - Request body keys:', Object.keys(body));
    
    // Handle both formats:
    // Format 1: { decklist: { cards: [...], commander: {...} } }
    // Format 2: { cards: [...], commander: "..." }
    let cards: string[] = [];
    let commanderName: string | null = null;

    if (body.decklist) {
      // Format 1
      const decklist = body.decklist;
      commanderName = decklist.commander?.name || null;
      cards = (decklist.cards || []).map((c: any) => c.name || c).filter(Boolean);
    } else if (body.cards) {
      // Format 2
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

    // Build decklist parameter
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
        continue; // Skip commander from main list
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

    // Cap length
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
    const url = `https://edhpowerlevel.com/?d=${decklistParam}`;
    console.log('EDH Power Level URL length:', url.length);

    let metrics = {
      powerLevel: null as number | null,
      tippingPoint: null as number | null,
      efficiency: null as number | null,
      impact: null as number | null,
      score: null as number | null,
      playability: null as number | null,
    };

    // Try browserless.io first for JS rendering
    try {
      console.log('Attempting browserless.io render...');
      const renderResponse = await fetchWithTimeout('https://chrome.browserless.io/content?token=free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, waitFor: 5000 })
      }, 8000);

      if (renderResponse.ok) {
        const html = await renderResponse.text();
        console.log('Browserless HTML length:', html.length);
        metrics = extractEdhMetrics(html);
        console.log('Extracted metrics:', metrics);
      }
    } catch (e) {
      console.error('Browserless error:', e);
    }

    // Fallback: direct fetch
    if (metrics.powerLevel === null) {
      try {
        console.log('Trying direct fetch...');
        const response = await fetchWithTimeout(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          }
        }, 8000);

        if (response.ok) {
          const html = await response.text();
          console.log('Direct fetch HTML length:', html.length);
          const directMetrics = extractEdhMetrics(html);
          if (directMetrics.powerLevel !== null) {
            metrics = directMetrics;
          }
        }
      } catch (e) {
        console.error('Direct fetch error:', e);
      }
    }

    // Fallback: r.jina.ai
    if (metrics.powerLevel === null) {
      try {
        console.log('Trying r.jina.ai...');
        const jinaRes = await fetchWithTimeout(`https://r.jina.ai/${url}`, {}, 8000);
        if (jinaRes.ok) {
          const text = await jinaRes.text();
          console.log('Jina text length:', text.length);
          
          // Parse text-based output
          const powerMatch = text.match(/Power\s*Level[:\s]*(\d+(?:\.\d+)?)/i);
          if (powerMatch) metrics.powerLevel = parseFloat(powerMatch[1]);
          
          const tippingMatch = text.match(/Tipping\s*Point[:\s]*(\d+(?:\.\d+)?)/i);
          if (tippingMatch) metrics.tippingPoint = parseFloat(tippingMatch[1]);
          
          const effMatch = text.match(/Efficiency[:\s]*(\d+(?:\.\d+)?)/i);
          if (effMatch) metrics.efficiency = parseFloat(effMatch[1]);
          
          const impactMatch = text.match(/Impact[:\s]*(\d+(?:\.\d+)?)/i);
          if (impactMatch) metrics.impact = parseFloat(impactMatch[1]);
          
          const scoreMatch = text.match(/Score[:\s]*(\d+(?:\.\d+)?)/i);
          if (scoreMatch) metrics.score = parseFloat(scoreMatch[1]);
          
          const playMatch = text.match(/Playability[:\s]*(\d+(?:\.\d+)?)/i);
          if (playMatch) metrics.playability = parseFloat(playMatch[1]);
        }
      } catch (e) {
        console.error('Jina error:', e);
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
