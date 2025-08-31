import { useState, useEffect, useCallback } from 'react';

interface CatalogData {
  object: string;
  total_values: number;
  data: string[];
}

interface ScryfallCatalogs {
  cardTypes: string[];
  supertypes: string[];
  subtypes: string[];
  keywords: string[];
  abilityWords: string[];
  creatureTypes: string[];
  artifactTypes: string[];
  enchantmentTypes: string[];
  spellTypes: string[];
  planeswalkerTypes: string[];
  landTypes: string[];
  watermarks: string[];
  loading: boolean;
  error: string | null;
}

const CATALOG_ENDPOINTS = {
  cardTypes: '/catalog/card-names',
  supertypes: '/catalog/supertypes', 
  subtypes: '/catalog/subtypes',
  keywords: '/catalog/keyword-abilities',
  abilityWords: '/catalog/ability-words',
  creatureTypes: '/catalog/creature-types',
  artifactTypes: '/catalog/artifact-types',
  enchantmentTypes: '/catalog/enchantment-types',
  spellTypes: '/catalog/spell-types',
  planeswalkerTypes: '/catalog/planeswalker-types',
  landTypes: '/catalog/land-types',
  watermarks: '/catalog/watermarks'
};

const CACHE_KEY = 'scryfall_catalogs';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export function useScryfallCatalogs(): ScryfallCatalogs {
  const [catalogs, setCatalogs] = useState<Partial<ScryfallCatalogs>>({
    cardTypes: [],
    supertypes: [],
    subtypes: [],
    keywords: [],
    abilityWords: [],
    creatureTypes: [],
    artifactTypes: [],
    enchantmentTypes: [],
    spellTypes: [],
    planeswalkerTypes: [],
    landTypes: [],
    watermarks: [],
    loading: true,
    error: null
  });

  const loadFromCache = useCallback((): Partial<ScryfallCatalogs> | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      const isExpired = Date.now() - timestamp > CACHE_DURATION;
      
      if (isExpired) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error loading catalogs from cache:', error);
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
  }, []);

  const saveToCache = useCallback((data: Partial<ScryfallCatalogs>) => {
    try {
      const cacheData = {
        data,
        timestamp: Date.now()
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Error saving catalogs to cache:', error);
    }
  }, []);

  const fetchCatalog = useCallback(async (endpoint: string): Promise<string[]> => {
    try {
      const response = await fetch(`https://api.scryfall.com${endpoint}`, {
        headers: {
          'User-Agent': 'MTG-Deck-Builder/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch ${endpoint}: ${response.statusText}`);
      }

      const data: CatalogData = await response.json();
      return data.data || [];
    } catch (error) {
      console.error(`Error fetching catalog ${endpoint}:`, error);
      return [];
    }
  }, []);

  const loadCatalogs = useCallback(async () => {
    // Try to load from cache first
    const cached = loadFromCache();
    if (cached) {
      setCatalogs({ ...cached, loading: false, error: null });
      return;
    }

    setCatalogs(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Fetch all catalogs in parallel with delay to respect rate limits
      const catalogPromises = Object.entries(CATALOG_ENDPOINTS).map(
        ([key, endpoint], index) => 
          new Promise<[string, string[]]>(resolve => {
            setTimeout(async () => {
              const data = await fetchCatalog(endpoint);
              resolve([key, data]);
            }, index * 100); // 100ms delay between requests
          })
      );

      const results = await Promise.all(catalogPromises);
      
      const newCatalogs = results.reduce((acc, [key, data]) => {
        (acc as any)[key] = data;
        return acc;
      }, {} as Partial<ScryfallCatalogs>);

      const finalCatalogs = {
        ...newCatalogs,
        loading: false,
        error: null
      };

      setCatalogs(finalCatalogs);
      saveToCache(finalCatalogs);
    } catch (error) {
      console.error('Error loading catalogs:', error);
      setCatalogs(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load catalogs'
      }));
    }
  }, [loadFromCache, saveToCache, fetchCatalog]);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  return catalogs as ScryfallCatalogs;
}