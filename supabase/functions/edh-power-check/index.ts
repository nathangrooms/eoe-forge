import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const fetchWithTimeout = async (resource: string | URL, options: any = {}, timeout = 20000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(resource as any, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
};

interface EdhMetrics {
  powerLevel: number | null;
  tippingPoint: number | null;
  efficiency: number | null;
  impact: number | null;
  score: number | null;
  playability: number | null;
}

interface BracketData {
  recommended: number | null;
  minimum: number | null;
  extraTurns: number;
  massLandDenial: number;
  earlyTwoCardCombos: number;
  lateTwoCardCombos: number;
  gameChangers: number;
}

interface CardAnalysis {
  name: string;
  isCommander: boolean;
  color: string;
  playability: number | null;
  impact: number;
  isGameChanger: boolean;
}

interface LandAnalysis {
  landCount: number;
  nonLandCount: number;
  manaScrewPct: number | null;
  manaFloodPct: number | null;
  sweetSpotPct: number | null;
}

// Parse all metrics from text content
function parseAllData(text: string): {
  metrics: EdhMetrics;
  bracket: BracketData | null;
  cardAnalysis: CardAnalysis[];
  landAnalysis: LandAnalysis | null;
} {
  console.log('Parsing full EDH data, text length:', text.length);
  
  // Initialize metrics
  const metrics: EdhMetrics = {
    powerLevel: null,
    tippingPoint: null,
    efficiency: null,
    impact: null,
    score: null,
    playability: null,
  };

  // Power Level: "Power Level1.43/ 10" or "⚡Power Level1.43/ 10"
  const powerMatch = text.match(/Power\s*Level[:\s]*(\d+(?:\.\d+)?)\s*(?:\/\s*10)?/i);
  if (powerMatch) {
    metrics.powerLevel = parseFloat(powerMatch[1]);
    console.log('Found power level:', metrics.powerLevel);
  }
  
  // Tipping Point: "Tipping Point3" or "⚖️Tipping Point3"
  const tippingMatch = text.match(/Tipping\s*Point[:\s]*(\d+(?:\.\d+)?)/i);
  if (tippingMatch) {
    metrics.tippingPoint = parseFloat(tippingMatch[1]);
  }
  
  // Efficiency: "Efficiency5.80/ 10"
  const effMatch = text.match(/Efficiency[:\s]*(\d+(?:\.\d+)?)\s*(?:\/\s*10)?/i);
  if (effMatch) {
    metrics.efficiency = parseFloat(effMatch[1]);
  }
  
  // Impact: "Impact307.16" or "💥Impact307.16"
  // Be careful not to match "Total Impact" or other variations
  const impactMatch = text.match(/(?:^|[^\w])Impact[:\s]*(\d+(?:\.\d+)?)/im);
  if (impactMatch) {
    metrics.impact = parseFloat(impactMatch[1]);
  }
  
  // Score: "Score280/ 1000"
  const scoreMatch = text.match(/Score[:\s]*(\d+(?:\.\d+)?)\s*(?:\/\s*1000)?/i);
  if (scoreMatch) {
    metrics.score = parseFloat(scoreMatch[1]);
  }
  
  // Playability: "Average Playability17.8%"
  const playMatch = text.match(/(?:Average\s*)?Playability[:\s]*(\d+(?:\.\d+)?)\s*%/i);
  if (playMatch) {
    metrics.playability = parseFloat(playMatch[1]);
  }

  // Parse Bracket Data
  let bracket: BracketData | null = null;
  
  // Recommended Bracket: "Recommended Bracket: 1" or "Recommended Bracket1"
  const recBracketMatch = text.match(/Recommended\s*Bracket[:\s]*(\d)/i);
  const minBracketMatch = text.match(/Minimum\s*Bracket[:\s]*(\d)/i);
  
  // Also try "Commander Bracket: 1" format
  const cmdBracketMatch = text.match(/Commander\s*Bracket[:\s]*(\d)/i);
  
  if (recBracketMatch || minBracketMatch || cmdBracketMatch) {
    bracket = {
      recommended: recBracketMatch ? parseInt(recBracketMatch[1]) : (cmdBracketMatch ? parseInt(cmdBracketMatch[1]) : null),
      minimum: minBracketMatch ? parseInt(minBracketMatch[1]) : null,
      extraTurns: 0,
      massLandDenial: 0,
      earlyTwoCardCombos: 0,
      lateTwoCardCombos: 0,
      gameChangers: 0,
    };
    
    // Requirement Tracker parsing
    const extraTurnsMatch = text.match(/Extra\s*Turns[:\s]*(\d+)/i);
    if (extraTurnsMatch) bracket.extraTurns = parseInt(extraTurnsMatch[1]);
    
    const mldMatch = text.match(/Mass\s*Land\s*Denial[:\s]*(\d+)/i);
    if (mldMatch) bracket.massLandDenial = parseInt(mldMatch[1]);
    
    const earlyComboMatch = text.match(/Early\s*2-Card\s*Combos[:\s]*(\d+)/i);
    if (earlyComboMatch) bracket.earlyTwoCardCombos = parseInt(earlyComboMatch[1]);
    
    const lateComboMatch = text.match(/Late\s*2-Card\s*Combos[:\s]*(\d+)/i);
    if (lateComboMatch) bracket.lateTwoCardCombos = parseInt(lateComboMatch[1]);
    
    const gameChangersMatch = text.match(/Game\s*Changers[:\s]*(\d+)/i);
    if (gameChangersMatch) bracket.gameChangers = parseInt(gameChangersMatch[1]);
    
    console.log('Parsed bracket:', bracket);
  }

  // Parse Land Analysis
  let landAnalysis: LandAnalysis | null = null;
  
  const landCountMatch = text.match(/(\d+)\s*lands?\s*(?:or\s*MDFC)?/i);
  const nonLandMatch = text.match(/(\d+)\s*non-lands?/i);
  const manaScrewMatch = text.match(/Mana\s*Screw[:\s\n]*(?:\*\*)?(\d+(?:\.\d+)?)\s*%/i);
  const manaFloodMatch = text.match(/Mana\s*Flood[:\s\n]*(?:\*\*)?(\d+(?:\.\d+)?)\s*%/i);
  const sweetSpotMatch = text.match(/Sweet\s*Spot[:\s\n]*(?:\*\*)?(\d+(?:\.\d+)?)\s*%/i);
  
  if (landCountMatch || manaScrewMatch || manaFloodMatch) {
    landAnalysis = {
      landCount: landCountMatch ? parseInt(landCountMatch[1]) : 0,
      nonLandCount: nonLandMatch ? parseInt(nonLandMatch[1]) : 0,
      manaScrewPct: manaScrewMatch ? parseFloat(manaScrewMatch[1]) : null,
      manaFloodPct: manaFloodMatch ? parseFloat(manaFloodMatch[1]) : null,
      sweetSpotPct: sweetSpotMatch ? parseFloat(sweetSpotMatch[1]) : null,
    };
    console.log('Parsed land analysis:', landAnalysis);
  }

  // Parse Card Table
  // Format: "| Qty | Name | 🎨 | 🕹️ | 💥 |" followed by rows like "| 👑 | Card Name | B | NaN% | 9.65 |"
  const cardAnalysis: CardAnalysis[] = [];
  
  // Look for the table section
  const tableMatch = text.match(/\|\s*Qty.*?\|\s*Name.*?\|[\s\S]*?(?=\n\n|\n#|$)/i);
  if (tableMatch) {
    const tableText = tableMatch[0];
    // Match individual rows: | 👑 | Card Name | B | 50% | 9.65 |
    const rowRegex = /\|\s*(👑|\d+)?\s*\|\s*([^|]+)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|/g;
    let match;
    while ((match = rowRegex.exec(tableText)) !== null) {
      const qty = match[1]?.trim();
      const name = match[2]?.trim();
      const color = match[3]?.trim();
      const playabilityStr = match[4]?.trim();
      const impactStr = match[5]?.trim();
      
      // Skip header row
      if (name === 'Name' || name?.includes('↓')) continue;
      
      if (name) {
        const playability = playabilityStr?.includes('NaN') ? null : parseFloat(playabilityStr) || null;
        const impact = parseFloat(impactStr) || 0;
        
        cardAnalysis.push({
          name,
          isCommander: qty === '👑',
          color: color || '',
          playability,
          impact,
          isGameChanger: name.includes('🏆'),
        });
      }
    }
    console.log('Parsed', cardAnalysis.length, 'cards');
  }

  return { metrics, bracket, cardAnalysis, landAnalysis };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log('EDH Power Check - Request body keys:', Object.keys(body));
    
    let url = body.url || null;
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

      if (cards.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'No cards provided',
            metrics: null,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Build URL
      const cleanName = (name: string) => name.replace(/\s*\(commander\)\s*$/i, '').trim();
      const encodeName = (name: string) => encodeURIComponent(cleanName(name)).replace(/%20/g, '+');

      let decklistParam = '';
      if (commanderName) {
        decklistParam += `1x+${encodeName(commanderName)}~~`;
      }

      const cardCounts = new Map<string, number>();
      for (const card of cards) {
        const cleaned = cleanName(card);
        if (commanderName && cleaned.toLowerCase() === cleanName(commanderName).toLowerCase()) continue;
        const key = cleaned.toLowerCase();
        cardCounts.set(key, (cardCounts.get(key) || 0) + 1);
      }

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

      url = `https://edhpowerlevel.com/?d=${combined}`;
    }
    
    console.log('EDH Power Level URL length:', url.length);

    let result = {
      metrics: {
        powerLevel: null as number | null,
        tippingPoint: null as number | null,
        efficiency: null as number | null,
        impact: null as number | null,
        score: null as number | null,
        playability: null as number | null,
      },
      bracket: null as BracketData | null,
      cardAnalysis: [] as CardAnalysis[],
      landAnalysis: null as LandAnalysis | null,
    };

    // Try r.jina.ai for JS-rendered content
    try {
      console.log('Fetching via r.jina.ai...');
      const jinaUrl = `https://r.jina.ai/${url}`;
      const jinaRes = await fetchWithTimeout(jinaUrl, {
        headers: {
          'Accept': 'text/plain',
          'X-Return-Format': 'text',
        }
      }, 18000);
      
      if (jinaRes.ok) {
        const text = await jinaRes.text();
        console.log('Jina response length:', text.length);
        
        // Log snippet for debugging
        const powerIdx = text.indexOf('Power Level');
        if (powerIdx !== -1) {
          console.log('Power Level context:', text.substring(powerIdx, powerIdx + 60));
        }
        
        result = parseAllData(text);
        console.log('Parsed metrics:', result.metrics);
      } else {
        console.log('Jina response not ok:', jinaRes.status);
      }
    } catch (e) {
      console.error('Jina error:', e);
    }

    // Fallback: direct fetch (won't have JS-rendered content but try anyway)
    if (result.metrics.powerLevel === null) {
      try {
        console.log('Trying direct fetch as fallback...');
        const response = await fetchWithTimeout(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          }
        }, 10000);

        if (response.ok) {
          const html = await response.text();
          console.log('Direct fetch HTML length:', html.length);
          const directResult = parseAllData(html);
          if (directResult.metrics.powerLevel !== null) {
            result = directResult;
          }
        }
      } catch (e) {
        console.error('Direct fetch error:', e);
      }
    }

    console.log('Final result - power level:', result.metrics.powerLevel);

    return new Response(
      JSON.stringify({
        success: result.metrics.powerLevel !== null,
        ...result.metrics,
        bracket: result.bracket,
        cardAnalysis: result.cardAnalysis,
        landAnalysis: result.landAnalysis,
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
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
