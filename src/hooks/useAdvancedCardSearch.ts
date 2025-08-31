import { useState, useCallback } from 'react';
import { CardSearchState, buildScryfallURL } from '@/lib/scryfall/query-builder';

interface UseAdvancedCardSearchResult {
  results: any[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  totalResults: number;
  searchWithState: (state: CardSearchState, page?: number) => Promise<void>;
  loadMore: () => void;
  clearResults: () => void;
  currentState: CardSearchState | null;
}

export function useAdvancedCardSearch(): UseAdvancedCardSearchResult {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentState, setCurrentState] = useState<CardSearchState | null>(null);

  const searchWithState = useCallback(async (state: CardSearchState, page = 1) => {
    // Don't search if no meaningful search criteria
    if (!state || (!state.text?.trim() && Object.keys(state).filter(key => 
      key !== 'unique' && key !== 'order' && key !== 'dir' && state[key as keyof CardSearchState]
    ).length === 0)) {
      setResults([]);
      setHasMore(false);
      setTotalResults(0);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = buildScryfallURL(state);
      const searchURL = new URL(url);
      searchURL.searchParams.set('page', page.toString());
      
      const response = await fetch(searchURL.toString(), {
        headers: {
          'User-Agent': 'MTG-Deck-Builder/1.0'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          setResults(page === 1 ? [] : results);
          setHasMore(false);
          setTotalResults(0);
          return;
        }
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.data) {
        const newResults = page === 1 ? data.data : [...results, ...data.data];
        setResults(newResults);
        setHasMore(data.has_more || false);
        setTotalResults(data.total_cards || data.data.length);
        setCurrentPage(page);
        setCurrentState(state);
      } else {
        setResults(page === 1 ? [] : results);
        setHasMore(false);
        setTotalResults(0);
      }

    } catch (err) {
      console.error('Advanced card search error:', err);
      setError(err instanceof Error ? err.message : 'Failed to search cards');
      if (page === 1) {
        setResults([]);
        setHasMore(false);
        setTotalResults(0);
      }
    } finally {
      setLoading(false);
    }
  }, [results]);

  const loadMore = useCallback(() => {
    if (hasMore && !loading && currentState) {
      searchWithState(currentState, currentPage + 1);
    }
  }, [hasMore, loading, currentState, currentPage, searchWithState]);

  const clearResults = useCallback(() => {
    setResults([]);
    setHasMore(false);
    setTotalResults(0);
    setCurrentPage(1);
    setCurrentState(null);
    setError(null);
  }, []);

  return {
    results,
    loading,
    error,
    hasMore,
    totalResults,
    searchWithState,
    loadMore,
    clearResults,
    currentState
  };
}