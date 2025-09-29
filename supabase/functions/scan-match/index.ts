import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { text, prefer = 'newest' } = await req.json();
    
    if (!text || typeof text !== 'string') {
      return new Response('Invalid text parameter', { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    // Normalize the input text
    const normalizedText = text
      .trim()
      .replace(/[^\w\s'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    console.log('Searching for card:', normalizedText);

    // Search cards using escaped ILIKE for pattern matching
    const escapedText = normalizedText.replace(/[%_\\]/g, '\\$&');
    const originalEscaped = text.trim().replace(/[%_\\]/g, '\\$&');
    
    const { data: cards, error } = await supabase
      .from('cards')
      .select('id, oracle_id, name, set_code, image_uris, prices, rarity')
      .or(`name.ilike.%${escapedText}%,name.ilike.%${originalEscaped}%`)
      .limit(20);

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    console.log(`Found ${cards?.length || 0} potential matches`);

    if (!cards || cards.length === 0) {
      // Fallback to Scryfall search
      return await searchScryfall(text, prefer, corsHeaders);
    }

    // Calculate similarity scores and format candidates
    const candidates = cards
      .map(card => {
        const similarity = calculateSimilarity(normalizedText, card.name.toLowerCase());
        const exactMatch = card.name.toLowerCase() === normalizedText;
        const startsWithMatch = card.name.toLowerCase().startsWith(normalizedText);
        
        // Boost score for exact or prefix matches
        let score = similarity;
        if (exactMatch) score = 1.0;
        else if (startsWithMatch) score = Math.max(score, 0.9);
        
        return {
          score,
          oracleId: card.oracle_id,
          name: card.name,
          setCode: card.set_code,
          cardId: card.id,
          imageUrl: card.image_uris?.small || '',
          priceUsd: card.prices?.usd ? parseFloat(card.prices.usd) : undefined,
          rarity: card.rarity
        };
      })
      .filter(candidate => candidate.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    // Determine best match based on preference
    let best = candidates[0];
    if (candidates.length > 1 && prefer === 'cheapest') {
      const withPrices = candidates.filter(c => c.priceUsd !== undefined);
      if (withPrices.length > 0) {
        best = withPrices.sort((a, b) => (a.priceUsd || 0) - (b.priceUsd || 0))[0];
      }
    }

    console.log(`Returning ${candidates.length} candidates, best match: ${best?.name} (${best?.score})`);

    return new Response(JSON.stringify({ 
      candidates, 
      best: best?.score > 0.7 ? best : undefined 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Card match error:', error);
    return new Response(JSON.stringify({ 
      error: (error as any).message,
      candidates: [] 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function searchScryfall(text: string, prefer: string, corsHeaders: Record<string, string>) {
  try {
    console.log('Falling back to Scryfall search:', text);
    
    let response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(text)}`);
    
    if (!response.ok) {
      response = await fetch(`https://api.scryfall.com/cards/search?q=name:"${encodeURIComponent(text)}"&unique=cards&order=released`);
    }

    if (!response.ok) {
      return new Response(JSON.stringify({ candidates: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const scryfallCards = data.data || [data];

    const candidates = scryfallCards
      .slice(0, 6)
      .map((card: any) => ({
        score: 0.8,
        oracleId: card.oracle_id,
        name: card.name,
        setCode: card.set,
        cardId: card.id,
        imageUrl: card.image_uris?.small || '',
        priceUsd: card.prices?.usd ? parseFloat(card.prices.usd) : undefined
      }));

    const best = candidates[0];
    
    console.log(`Scryfall returned ${candidates.length} candidates`);

    return new Response(JSON.stringify({ candidates, best }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Scryfall search error:', error);
    return new Response(JSON.stringify({ candidates: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  
  return matrix[str2.length][str1.length];
}