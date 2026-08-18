import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CardSearchState,
  buildScryfallURL,
  hasSearchCriteria,
} from '@/lib/scryfall/query-builder';

interface UseAdvancedCardSearchResult {
  results: any[];
  loading: boolean;
  /** Set only while a "load more" page is in flight, so the grid doesn't flash. */
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  totalResults: number;
  searchWithState: (state: CardSearchState) => void;
  loadMore: () => void;
  clearResults: () => void;
  currentState: CardSearchState | null;
}

/**
 * Scryfall card search.
 *
 * The cache key is the FULL request URL, not just the `q` token — `order`,
 * `dir` and `unique` travel as query params, so keying on `q` alone was what
 * made the sort dropdown and direction toggle inert.
 */
export function useAdvancedCardSearch(): UseAdvancedCardSearchResult {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [currentState, setCurrentState] = useState<CardSearchState | null>(null);

  // Refs keep `run` stable: depending on `results` would rebuild the callback
  // on every fetch and retrigger the caller's debounce effect.
  const resultsRef = useRef<any[]>([]);
  const nextPageRef = useRef<string | null>(null);
  const lastUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async (url: string, append: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await fetch(url, { signal: controller.signal });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        // Scryfall returns 404 with an explanatory `details` field for a query
        // that parsed fine but matched nothing, and 400 for a syntax error.
        if (response.status === 404) {
          if (!append) {
            resultsRef.current = [];
            setResults([]);
            setTotalResults(0);
          }
          setHasMore(false);
          nextPageRef.current = null;
          return;
        }
        throw new Error(payload?.details || `Search failed (${response.status})`);
      }

      const data = payload?.data ?? [];
      const next = append ? [...resultsRef.current, ...data] : data;
      resultsRef.current = next;
      setResults(next);
      setHasMore(Boolean(payload?.has_more));
      nextPageRef.current = payload?.next_page ?? null;
      setTotalResults(payload?.total_cards ?? data.length);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to search cards');
      if (!append) {
        resultsRef.current = [];
        setResults([]);
        setHasMore(false);
        setTotalResults(0);
      }
    } finally {
      if (controller === abortRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  const clearResults = useCallback(() => {
    abortRef.current?.abort();
    resultsRef.current = [];
    nextPageRef.current = null;
    lastUrlRef.current = null;
    setResults([]);
    setHasMore(false);
    setTotalResults(0);
    setCurrentState(null);
    setError(null);
    setLoading(false);
    setLoadingMore(false);
  }, []);

  const searchWithState = useCallback(
    (state: CardSearchState) => {
      if (!state || !hasSearchCriteria(state)) {
        clearResults();
        return;
      }

      const url = buildScryfallURL(state);
      if (url === lastUrlRef.current) return;

      lastUrlRef.current = url;
      setCurrentState(state);
      void run(url, false);
    },
    [run, clearResults]
  );

  const loadMore = useCallback(() => {
    const next = nextPageRef.current;
    if (!next || loading || loadingMore) return;
    void run(next, true);
  }, [run, loading, loadingMore]);

  return {
    results,
    loading,
    loadingMore,
    error,
    hasMore,
    totalResults,
    searchWithState,
    loadMore,
    clearResults,
    currentState,
  };
}
