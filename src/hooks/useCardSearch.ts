import { useState, useEffect } from 'react';

interface Card {
  id: string;
  name: string;
  type_line: string;
  cmc: number;
  colors: string[];
  color_identity: string[];
  oracle_text?: string;
  power?: string;
  toughness?: string;
  set: string;
  image_uris?: {
    small: string;
    normal: string;
    large: string;
  };
  prices?: {
    usd?: string;
  };
  mechanics?: string[];
}

interface SearchFilters {
  sets: string[];
  types: string[];
  colors: string[];
  mechanics: string[];
}

export const useCardSearch = (query: string, filters: SearchFilters) => {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const searchCards = async () => {
      if (!query.trim() && filters.sets.length === 0) {
        setCards([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Build Scryfall query
        const queryParts: string[] = [];

        if (query.trim()) {
          queryParts.push(`(${query.trim()})`);
        }

        if (filters.sets.length > 0) {
          const setQuery = filters.sets.map(set => `e:${set.toLowerCase()}`).join(' OR ');
          queryParts.push(`(${setQuery})`);
        }

        if (filters.types.length > 0) {
          const typeQuery = filters.types.map(type => `t:${type.toLowerCase()}`).join(' OR ');
          queryParts.push(`(${typeQuery})`);
        }

        if (filters.colors.length > 0) {
          const colorQuery = filters.colors.map(color => `c:${color}`).join('');
          queryParts.push(`c=${colorQuery}`);
        }

        if (filters.mechanics.length > 0) {
          const mechanicQueries = filters.mechanics.map(mechanic => {
            switch (mechanic.toLowerCase()) {
              case 'spacecraft':
                return 't:spacecraft';
              case 'station':
                return 'o:station';
              case 'warp':
                return 'o:warp';
              case 'void':
                return 'o:void';
              case 'planet':
                return 't:planet';
              default:
                return `o:${mechanic}`;
            }
          });
          queryParts.push(`(${mechanicQueries.join(' OR ')})`);
        }

        const finalQuery = queryParts.join(' ');
        
        if (!finalQuery) {
          setCards([]);
          setLoading(false);
          return;
        }

        const response = await fetch(
          `https://api.scryfall.com/cards/search?q=${encodeURIComponent(finalQuery)}&order=name`,
          {
            headers: {
              'User-Agent': 'EOE-DeckBuilder/1.0'
            }
          }
        );

        if (!response.ok) {
          if (response.status === 404) {
            setCards([]);
          } else {
            throw new Error(`Search failed: ${response.status}`);
          }
        } else {
          const data = await response.json();
          
          // Process cards and add mechanic tags
          const processedCards = data.data?.map((card: any) => ({
            ...card,
            mechanics: extractMechanics(card)
          })) || [];

          setCards(processedCards);
        }
      } catch (err) {
        console.error('Card search error:', err);
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(searchCards, 300); // Debounce

    return () => clearTimeout(timeoutId);
  }, [query, filters]);

  return { cards, loading, error };
};

const extractMechanics = (card: any): string[] => {
  const mechanics: string[] = [];
  const text = (card.oracle_text || '').toLowerCase();
  const typeLine = (card.type_line || '').toLowerCase();

  // Check for EOE mechanics
  if (typeLine.includes('spacecraft')) mechanics.push('Spacecraft');
  if (typeLine.includes('planet')) mechanics.push('Planet');
  if (text.includes('station')) mechanics.push('Station');
  if (text.includes('warp')) mechanics.push('Warp');
  if (text.includes('void')) mechanics.push('Void');
  if (text.includes('crew')) mechanics.push('Crew');
  if (typeLine.includes('vehicle')) mechanics.push('Vehicle');

  // Check for common MTG mechanics
  if (text.includes('flying')) mechanics.push('Flying');
  if (text.includes('haste')) mechanics.push('Haste');
  if (text.includes('vigilance')) mechanics.push('Vigilance');
  if (text.includes('trample')) mechanics.push('Trample');
  if (text.includes('lifelink')) mechanics.push('Lifelink');

  return mechanics;
};