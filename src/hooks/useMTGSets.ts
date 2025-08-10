import { useState, useEffect } from 'react';

interface MTGSet {
  id: string;
  code: string;
  name: string;
  type: string;
  released_at: string;
  card_count: number;
  icon_svg_uri?: string;
}

export function useMTGSets() {
  const [sets, setSets] = useState<MTGSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSets = async () => {
      setLoading(true);
      setError(null);
      
      try {
        console.log('Fetching MTG sets from Scryfall...');
        const response = await fetch('https://api.scryfall.com/sets', {
          headers: {
            'User-Agent': 'MTG-Deck-Builder/1.0'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch sets: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.data) {
          // Sort sets by release date (newest first) and filter out digital-only sets for main list
          const sortedSets = data.data
            .filter((set: MTGSet) => set.card_count > 0) // Only sets with cards
            .sort((a: MTGSet, b: MTGSet) => 
              new Date(b.released_at).getTime() - new Date(a.released_at).getTime()
            );
          
          console.log('Loaded', sortedSets.length, 'MTG sets');
          setSets(sortedSets);
        } else {
          setSets([]);
        }
        
      } catch (err) {
        console.error('Error fetching MTG sets:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch sets');
        setSets([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchSets();
  }, []);

  // Group sets by type for easier navigation
  const groupedSets = sets.reduce((groups, set) => {
    const type = set.type || 'other';
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(set);
    return groups;
  }, {} as Record<string, MTGSet[]>);

  // Get popular/recent sets for quick access
  const popularSets = sets.slice(0, 20); // Most recent 20 sets

  return { 
    sets, 
    groupedSets, 
    popularSets, 
    loading, 
    error 
  };
}