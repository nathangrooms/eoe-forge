// Fast card recognition using Scryfall's fuzzy search API
// This bypasses slow/inaccurate OCR and leverages Scryfall's excellent search

import { supabase } from '@/integrations/supabase/client';

export interface CardCandidate {
  score: number;
  oracleId: string;
  name: string;
  setCode: string;
  cardId: string;
  imageUrl: string;
  priceUsd?: number;
}

export interface MatchResult {
  candidates: CardCandidate[];
  best?: CardCandidate;
}

// Direct Scryfall fuzzy search - much more accurate than OCR
export async function scryfallFuzzySearch(query: string): Promise<MatchResult> {
  if (!query || query.length < 2) {
    return { candidates: [] };
  }

  const cleanQuery = query.trim().toLowerCase();

  try {
    // First try fuzzy named search (best for partial/misspelled names)
    const fuzzyResponse = await fetch(
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cleanQuery)}`
    );

    if (fuzzyResponse.ok) {
      const card = await fuzzyResponse.json();
      const candidate = formatScryfallCard(card, 0.95);
      return { candidates: [candidate], best: candidate };
    }

    // If fuzzy fails, try autocomplete for partial matches
    const autocompleteResponse = await fetch(
      `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(cleanQuery)}`
    );

    if (autocompleteResponse.ok) {
      const { data: names } = await autocompleteResponse.json();
      
      if (names && names.length > 0) {
        // Get full card data for top matches
        const candidates = await Promise.all(
          names.slice(0, 5).map(async (name: string, index: number) => {
            try {
              const cardResponse = await fetch(
                `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`
              );
              if (cardResponse.ok) {
                const card = await cardResponse.json();
                return formatScryfallCard(card, 0.9 - index * 0.05);
              }
            } catch {
              return null;
            }
            return null;
          })
        );

        const validCandidates = candidates.filter((c): c is CardCandidate => c !== null);
        return { 
          candidates: validCandidates, 
          best: validCandidates[0] 
        };
      }
    }

    // Last resort: full text search
    const searchResponse = await fetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(cleanQuery)}&unique=cards&order=released&dir=desc`
    );

    if (searchResponse.ok) {
      const { data: cards } = await searchResponse.json();
      const candidates = (cards || [])
        .slice(0, 6)
        .map((card: any, index: number) => formatScryfallCard(card, 0.8 - index * 0.05));
      
      return { candidates, best: candidates[0] };
    }

    return { candidates: [] };

  } catch (error) {
    console.error('Scryfall search error:', error);
    return { candidates: [] };
  }
}

// Local database search for offline/faster matching
export async function localCardSearch(query: string): Promise<MatchResult> {
  if (!query || query.length < 2) {
    return { candidates: [] };
  }

  const cleanQuery = query.trim().toLowerCase();

  try {
    // Search local cards table with pattern matching
    const { data: cards, error } = await supabase
      .from('cards')
      .select('id, oracle_id, name, set_code, image_uris, prices')
      .or(`name.ilike.%${cleanQuery}%,name.ilike.${cleanQuery}%`)
      .order('name')
      .limit(10);

    if (error) throw error;

    if (!cards || cards.length === 0) {
      return { candidates: [] };
    }

    // Score and sort by relevance
    const candidates: CardCandidate[] = cards
      .map(card => {
        const nameLower = card.name.toLowerCase();
        let score = 0.5;
        
        // Exact match
        if (nameLower === cleanQuery) score = 1.0;
        // Starts with query
        else if (nameLower.startsWith(cleanQuery)) score = 0.9;
        // Contains query
        else if (nameLower.includes(cleanQuery)) score = 0.7;
        
        const imageUris = card.image_uris as any;
        const prices = card.prices as any;

        return {
          score,
          oracleId: card.oracle_id,
          name: card.name,
          setCode: card.set_code,
          cardId: card.id,
          imageUrl: imageUris?.small || imageUris?.normal || '',
          priceUsd: prices?.usd ? parseFloat(prices.usd) : undefined
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    return { candidates, best: candidates[0] };

  } catch (error) {
    console.error('Local search error:', error);
    return { candidates: [] };
  }
}

// Combined search: try local first, fallback to Scryfall
export async function smartCardSearch(
  query: string, 
  prefer: 'newest' | 'cheapest' = 'newest'
): Promise<MatchResult> {
  // Try local database first (faster)
  const localResult = await localCardSearch(query);
  
  if (localResult.best && localResult.best.score >= 0.9) {
    return sortByPreference(localResult, prefer);
  }

  // Fallback to Scryfall for better fuzzy matching
  const scryfallResult = await scryfallFuzzySearch(query);
  
  // Merge results, preferring higher scores
  const allCandidates = [...localResult.candidates, ...scryfallResult.candidates];
  const uniqueCandidates = deduplicateCandidates(allCandidates);
  const sorted = uniqueCandidates.sort((a, b) => b.score - a.score).slice(0, 6);

  return sortByPreference({ candidates: sorted, best: sorted[0] }, prefer);
}

function formatScryfallCard(card: any, score: number): CardCandidate {
  return {
    score,
    oracleId: card.oracle_id || '',
    name: card.name,
    setCode: card.set,
    cardId: card.id,
    imageUrl: card.image_uris?.small || card.image_uris?.normal || 
              (card.card_faces?.[0]?.image_uris?.small) || '',
    priceUsd: card.prices?.usd ? parseFloat(card.prices.usd) : undefined
  };
}

function deduplicateCandidates(candidates: CardCandidate[]): CardCandidate[] {
  const seen = new Map<string, CardCandidate>();
  
  for (const candidate of candidates) {
    const key = candidate.name.toLowerCase();
    if (!seen.has(key) || seen.get(key)!.score < candidate.score) {
      seen.set(key, candidate);
    }
  }
  
  return Array.from(seen.values());
}

function sortByPreference(result: MatchResult, prefer: 'newest' | 'cheapest'): MatchResult {
  if (prefer === 'cheapest' && result.candidates.length > 0) {
    const withPrices = result.candidates.filter(c => c.priceUsd !== undefined);
    if (withPrices.length > 0) {
      const cheapest = withPrices.sort((a, b) => (a.priceUsd || 0) - (b.priceUsd || 0))[0];
      return { candidates: result.candidates, best: cheapest };
    }
  }
  return result;
}
