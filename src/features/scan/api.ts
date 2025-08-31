import { supabase } from '@/integrations/supabase/client';

interface MatchRequest {
  text: string;
  prefer?: 'newest' | 'cheapest';
}

interface CardCandidate {
  score: number;
  oracleId: string;
  name: string;
  setCode: string;
  cardId: string;
  imageUrl: string;
  priceUsd?: number;
}

interface MatchResponse {
  candidates: CardCandidate[];
  best?: CardCandidate;
}

export async function matchCardName(request: MatchRequest): Promise<MatchResponse> {
  const { text, prefer = 'newest' } = request;
  
  // Normalize the input text
  const normalizedText = text
    .trim()
    .replace(/[^\w\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  try {
    // Use Supabase to search for cards with similarity matching
    // This simulates trigram similarity - in a real implementation you'd use pg_trgm
    const { data: cards, error } = await supabase
      .from('cards')
      .select('id, oracle_id, name, set_code, image_uris, prices')
      .ilike('name', `%${normalizedText}%`)
      .limit(10);

    if (error) throw error;

    if (!cards || cards.length === 0) {
      // Fallback to Scryfall search
      return await searchScryfall(text, prefer);
    }

    // Calculate similarity scores and format candidates
    const candidates: CardCandidate[] = cards
      .map(card => {
        const similarity = calculateSimilarity(normalizedText, card.name.toLowerCase());
        return {
          score: similarity,
          oracleId: card.oracle_id,
          name: card.name,
          setCode: card.set_code,
          cardId: card.id,
          imageUrl: (card.image_uris as any)?.small || '',
          priceUsd: (card.prices as any)?.usd ? parseFloat((card.prices as any).usd) : undefined
        };
      })
      .filter(candidate => candidate.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    // Sort by preference for best match
    let best: CardCandidate | undefined;
    if (candidates.length > 0) {
      if (prefer === 'cheapest') {
        best = candidates
          .filter(c => c.priceUsd !== undefined)
          .sort((a, b) => (a.priceUsd || 0) - (b.priceUsd || 0))[0] || candidates[0];
      } else {
        best = candidates[0]; // Highest similarity score
      }
    }

    return { candidates, best };

  } catch (error) {
    console.error('Card matching error:', error);
    return { candidates: [] };
  }
}

async function searchScryfall(text: string, prefer: string): Promise<MatchResponse> {
  try {
    // Try exact name search first
    let response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(text)}`);
    
    if (!response.ok) {
      // Fallback to general search
      response = await fetch(`https://api.scryfall.com/cards/search?q=name:"${encodeURIComponent(text)}"&unique=cards&order=released`);
    }

    if (!response.ok) {
      return { candidates: [] };
    }

    const data = await response.json();
    const scryfallCards = data.data || [data];

    const candidates: CardCandidate[] = scryfallCards
      .slice(0, 6)
      .map((card: any) => ({
        score: 0.8, // Default score for Scryfall matches
        oracleId: card.oracle_id,
        name: card.name,
        setCode: card.set,
        cardId: card.id,
        imageUrl: card.image_uris?.small || '',
        priceUsd: card.prices?.usd ? parseFloat(card.prices.usd) : undefined
      }));

    const best = candidates[0];
    
    return { candidates, best };

  } catch (error) {
    console.error('Scryfall search error:', error);
    return { candidates: [] };
  }
}

function calculateSimilarity(str1: string, str2: string): number {
  // Simple Levenshtein distance-based similarity
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