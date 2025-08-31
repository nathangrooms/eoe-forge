import { useState, useCallback } from 'react';

// Enhanced card search hook with Scryfall integration
export function useEnhancedCardSearch() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentQuery, setCurrentQuery] = useState('');

  const searchCards = useCallback(async (query: string, page = 1) => {
    if (!query.trim()) {
      setResults([]);
      setHasMore(false);
      setTotalResults(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodedQuery}&page=${page}&order=name&unique=cards`,
        {
          headers: {
            'User-Agent': 'MTG-Deck-Builder/1.0'
          }
        }
      );

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
        setCurrentQuery(query);
      } else {
        setResults(page === 1 ? [] : results);
        setHasMore(false);
        setTotalResults(0);
      }

    } catch (err) {
      console.error('Card search error:', err);
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
    if (hasMore && !loading && currentQuery) {
      searchCards(currentQuery, currentPage + 1);
    }
  }, [hasMore, loading, currentQuery, currentPage, searchCards]);

  const clearResults = useCallback(() => {
    setResults([]);
    setHasMore(false);
    setTotalResults(0);
    setCurrentPage(1);
    setCurrentQuery('');
    setError(null);
  }, []);

  return {
    results,
    loading,
    error,
    hasMore,
    totalResults,
    searchCards,
    loadMore,
    clearResults
  };
}