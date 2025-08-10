import { useState, useEffect } from 'react';

// Card interface matching Scryfall API response
interface Card {
  id: string;
  name: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  colors?: string[];
  color_identity?: string[];
  keywords?: string[];
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    art_crop?: string;
  };
  prices?: {
    usd?: string;
    usd_foil?: string;
  };
  legalities: Record<string, string>;
  layout: string;
  mechanics?: string[];
}

interface SearchFilters {
  sets?: string[];
  types?: string[];
  colors?: string[];
  mechanics?: string[];
  format?: string;
  rarity?: string;
  cmc?: string;
}

export function useCardSearch(query: string, filters: SearchFilters = {}) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query || query.length < 2) {
      setCards([]);
      return;
    }

    const searchCards = async () => {
      setLoading(true);
      setError(null);

      try {
        // Build Scryfall search query
        let searchQuery = query;
        
        // Add filters to the search query
        if (filters.sets && filters.sets.length > 0) {
          const setQuery = filters.sets.map(set => `set:${set}`).join(' OR ');
          searchQuery += ` (${setQuery})`;
        }
        
        if (filters.types && filters.types.length > 0) {
          const typeQuery = filters.types.map(type => `type:${type}`).join(' OR ');
          searchQuery += ` (${typeQuery})`;
        }
        
        if (filters.colors && filters.colors.length > 0) {
          const colorQuery = filters.colors.map(color => `color:${color}`).join(' OR ');
          searchQuery += ` (${colorQuery})`;
        }
        
        if (filters.mechanics && filters.mechanics.length > 0) {
          const mechanicQuery = filters.mechanics.map(mechanic => `oracle:${mechanic}`).join(' OR ');
          searchQuery += ` (${mechanicQuery})`;
        }
        
        if (filters.format) {
          searchQuery += ` legal:${filters.format}`;
        }
        
        if (filters.rarity) {
          searchQuery += ` rarity:${filters.rarity}`;
        }
        
        if (filters.cmc) {
          searchQuery += ` cmc:${filters.cmc}`;
        }

        // Encode the search query
        const encodedQuery = encodeURIComponent(searchQuery);
        
        // Make request to Scryfall API
        const response = await fetch(
          `https://api.scryfall.com/cards/search?q=${encodedQuery}&order=name&unique=cards`,
          {
            headers: {
              'User-Agent': 'MTG-Deck-Builder/1.0'
            }
          }
        );

        if (!response.ok) {
          if (response.status === 404) {
            setCards([]);
            return;
          }
          throw new Error(`Search failed: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.data) {
          // Process cards and extract mechanics
          const processedCards = data.data.map((card: any) => ({
            ...card,
            mechanics: extractMechanics(card)
          }));
          
          setCards(processedCards.slice(0, 100)); // Limit to 100 results for performance
        } else {
          setCards([]);
        }
        
      } catch (err) {
        console.error('Card search error:', err);
        setError(err instanceof Error ? err.message : 'Failed to search cards');
        setCards([]);
      } finally {
        setLoading(false);
      }
    };

    // Debounce the search
    const timeoutId = setTimeout(searchCards, 300);
    
    return () => clearTimeout(timeoutId);
  }, [query, filters]);

  return { cards, loading, error };
}

// Helper function to extract mechanics from card text
function extractMechanics(card: Card): string[] {
  const mechanics: string[] = [];
  const text = (card.oracle_text || '').toLowerCase();
  const typeLine = (card.type_line || '').toLowerCase();

  // Common MTG mechanics - comprehensive list
  const knownMechanics = [
    'flying', 'trample', 'vigilance', 'menace', 'lifelink', 'deathtouch', 'haste', 'reach', 'first strike', 'double strike',
    'hexproof', 'shroud', 'indestructible', 'flash', 'defender',
    'cascade', 'convoke', 'delve', 'exploit', 'flashback', 'madness', 'morph', 'cycling', 'echo', 'suspend',
    'storm', 'affinity', 'bloodthirst', 'champion', 'evoke', 'hideaway', 'prowess', 'landfall', 'rally',
    'annihilator', 'exalted', 'infect', 'metalcraft', 'battle cry', 'living weapon', 'undying', 'miracle',
    'overload', 'scavenge', 'unleash', 'cipher', 'evolve', 'extort', 'battalion', 'bloodrush', 'detain',
    'populate', 'tribute', 'inspired', 'heroic', 'bestow', 'monstrosity', 'devotion', 'constellation',
    'ferocious', 'outlast', 'raid', 'prowess', 'dash', 'exploit', 'megamorph', 'renown', 'awaken',
    'converge', 'devoid', 'ingest', 'surge', 'skulk', 'investigate', 'emerge', 'escalate', 'meld',
    'crew', 'fabricate', 'partner', 'improvise', 'revolt', 'expertise', 'afterlife', 'riot', 'spectacle',
    'escape', 'companion', 'mutate', 'cycling', 'kicker', 'multikicker', 'buyback', 'replicate',
    'splice', 'transmute', 'dredge', 'forecast', 'graft', 'recover', 'ripple', 'split second',
    'vanishing', 'absorb', 'aura swap', 'bushido', 'offering', 'ninjutsu', 'soulshift', 'sweep',
    'channel', 'flip', 'epic', 'sunburst', 'modular', 'entwine', 'imprint', 'equipment', 'reconfigure',
    // Newer mechanics
    'foretell', 'boast', 'changeling', 'daybound', 'nightbound', 'disturb', 'decayed', 'cleave',
    'training', 'compleated', 'reconfigure', 'blitz', 'casualty', 'shield', 'enlist', 'read ahead',
    'prototype', 'unearth', 'powerstone', 'backup', 'toxic', 'corrupted', 'for mirrodin', 'incubate',
    'transform', 'adventure', 'food', 'treasure', 'clue', 'blood', 'powerstone token',
    // Planeswalker abilities
    'loyalty', 'planeswalker', 'ultimate',
    // Vehicle/Artifact mechanics
    'vehicle', 'artifact', 'equipment', 'fortification',
    // Land mechanics
    'basic', 'fetch', 'shock', 'tap', 'enters tapped', 'sacrifice',
    // Mana abilities
    'add', 'mana', 'convoke', 'improvise', 'spectacle'
  ];

  // Check for known mechanics in oracle text and type line
  knownMechanics.forEach(mechanic => {
    if (text.includes(mechanic) || typeLine.includes(mechanic)) {
      mechanics.push(mechanic.charAt(0).toUpperCase() + mechanic.slice(1));
    }
  });

  // Add keywords if present
  if (card.keywords) {
    mechanics.push(...card.keywords);
  }

  // Remove duplicates and return
  return [...new Set(mechanics)];
}