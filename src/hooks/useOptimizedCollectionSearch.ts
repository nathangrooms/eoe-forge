import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface CollectionCard {
  id: string;
  card_id: string;
  card_name: string;
  quantity: number;
  foil: number;
  condition: string;
  set_code: string;
  price_usd: number | null;
  cards?: any;
}

interface SearchFilters {
  colors?: string[];
  rarity?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'name' | 'price' | 'quantity' | 'set' | 'rarity' | 'cmc';
  sortOrder?: 'asc' | 'desc';
}

interface SearchResult {
  cards: CollectionCard[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
}

const ITEMS_PER_PAGE = 50;

/**
 * Optimized collection search hook with:
 * - Debounced search (300ms)
 * - Indexed database queries
 * - Pagination support
 * - Request cancellation
 * - Memoization
 */
export function useOptimizedCollectionSearch(
  query: string,
  filters: SearchFilters = {},
  page: number = 0
): SearchResult & { loadMore: () => void; reset: () => void } {
  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cacheRef = useRef<Map<string, { cards: CollectionCard[]; total: number }>>(new Map());

  // Generate cache key from search params
  const getCacheKey = useCallback((q: string, f: SearchFilters, p: number) => {
    return JSON.stringify({ q, f, p });
  }, []);

  const searchCollection = useCallback(async (
    searchQuery: string,
    searchFilters: SearchFilters,
    currentPage: number,
    append: boolean = false
  ) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Check cache first
    const cacheKey = getCacheKey(searchQuery, searchFilters, currentPage);
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setCards(append ? [...cards, ...cached.cards] : cached.cards);
      setTotal(cached.total);
      setHasMore(cached.cards.length >= ITEMS_PER_PAGE);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      // Build query with optimizations
      let dbQuery = supabase
        .from('user_collections')
        .select(`
          *,
          cards!user_collections_card_id_fkey (
            id,
            name,
            image_uris,
            prices,
            set_code,
            rarity,
            cmc,
            type_line,
            colors,
            color_identity
          )
        `, { count: 'exact' })
        .eq('user_id', user.id);

      // Text search with indexed query
      if (searchQuery && searchQuery.trim()) {
        dbQuery = dbQuery.ilike('card_name', `%${searchQuery.trim()}%`);
      }

      // Apply filters
      if (searchFilters.condition) {
        dbQuery = dbQuery.eq('condition', searchFilters.condition);
      }

      if (searchFilters.minPrice !== undefined) {
        dbQuery = dbQuery.gte('price_usd', searchFilters.minPrice);
      }

      if (searchFilters.maxPrice !== undefined) {
        dbQuery = dbQuery.lte('price_usd', searchFilters.maxPrice);
      }

      // Sorting
      const sortBy = searchFilters.sortBy || 'name';
      const sortOrder = searchFilters.sortOrder || 'asc';
      
      switch (sortBy) {
        case 'name':
          dbQuery = dbQuery.order('card_name', { ascending: sortOrder === 'asc' });
          break;
        case 'price':
          dbQuery = dbQuery.order('price_usd', { ascending: sortOrder === 'asc', nullsFirst: false });
          break;
        case 'quantity':
          dbQuery = dbQuery.order('quantity', { ascending: sortOrder === 'asc' });
          break;
        case 'set':
          dbQuery = dbQuery.order('set_code', { ascending: sortOrder === 'asc' });
          break;
        default:
          dbQuery = dbQuery.order('card_name', { ascending: true });
      }

      // Pagination
      const from = currentPage * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      dbQuery = dbQuery.range(from, to);

      const { data, error: queryError, count } = await dbQuery;

      if (queryError) throw queryError;

      // Filter by rarity and colors on client side (after fetch)
      let filteredData = (data || []) as CollectionCard[];

      if (searchFilters.rarity && filteredData.length > 0) {
        filteredData = filteredData.filter(item => 
          item.cards?.rarity?.toLowerCase() === searchFilters.rarity?.toLowerCase()
        );
      }

      if (searchFilters.colors && searchFilters.colors.length > 0 && filteredData.length > 0) {
        filteredData = filteredData.filter(item => {
          const cardColors = item.cards?.colors || [];
          return searchFilters.colors!.some(color => cardColors.includes(color));
        });
      }

      // Cache results
      cacheRef.current.set(cacheKey, { cards: filteredData, total: count || 0 });

      // Keep cache size reasonable (max 20 entries)
      if (cacheRef.current.size > 20) {
        const firstKey = cacheRef.current.keys().next().value;
        cacheRef.current.delete(firstKey);
      }

      setCards(append ? [...cards, ...filteredData] : filteredData);
      setTotal(count || 0);
      setHasMore(filteredData.length >= ITEMS_PER_PAGE);
      
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Search cancelled');
        return;
      }
      console.error('Collection search error:', err);
      setError(err.message || 'Failed to search collection');
      setCards([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [cards, getCacheKey]);

  // Debounced search effect
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce by 300ms
    searchTimeoutRef.current = setTimeout(() => {
      searchCollection(query, filters, page, false);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [query, JSON.stringify(filters), page]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      searchCollection(query, filters, page + 1, true);
    }
  }, [loading, hasMore, query, filters, page, searchCollection]);

  const reset = useCallback(() => {
    setCards([]);
    setTotal(0);
    setHasMore(false);
    setError(null);
    cacheRef.current.clear();
  }, []);

  return {
    cards,
    total,
    hasMore,
    loading,
    error,
    loadMore,
    reset
  };
}
