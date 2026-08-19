import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CardSearchState,
  buildScryfallURL,
  hasSearchCriteria,
} from '@/lib/scryfall/query-builder';
import { pageCountFor } from '@/lib/pagination';
import { usePageParam, usePageSize } from './usePagination';
import { useScryfallPage } from './useScryfallPage';

/**
 * Scryfall card search, paged by page number.
 *
 * ## Why this is not "load more" any more
 *
 * It used to append: every extra batch was concatenated onto the last, so a
 * reader four batches into Commander staples had 700 card tiles in the
 * document, no way to say where they were, nothing to link, and lost the lot on
 * a reload. Now one page is on screen at a time and the page number is in the
 * address bar, so back, forward, refresh and paste all work.
 *
 * The block fetching, the cache and the count live in `useScryfallPage`, which
 * every other card surface reads through too. What this hook adds is what a
 * search page needs on top: the query built from filter state, the page in the
 * URL, and the remembered rows-per-page.
 */

export interface UseAdvancedCardSearchOptions {
  /** Put `?page=` in the address bar. Off inside panels and embedded pickers. */
  urlSync?: boolean;
  /** localStorage bucket for the rows-per-page preference. */
  sizeKey?: string;
}

export interface UseAdvancedCardSearchResult {
  /** The rows for the current page. Never more than `pageSize` of them. */
  results: any[];
  loading: boolean;
  error: string | null;
  /** Scryfall's own count for this query, or null before one has arrived. */
  totalResults: number | null;
  /** Null whenever the total is null. Never estimated. */
  pageCount: number | null;
  hasNext: boolean;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  searchWithState: (state: CardSearchState) => void;
  clearResults: () => void;
  currentState: CardSearchState | null;
}

export function useAdvancedCardSearch(
  options: UseAdvancedCardSearchOptions = {}
): UseAdvancedCardSearchResult {
  const { urlSync = false, sizeKey = 'search' } = options;

  const [pageSize, setStoredPageSize] = usePageSize(sizeKey);
  const [url, setUrl] = useState<string | null>(null);
  const [currentState, setCurrentState] = useState<CardSearchState | null>(null);

  /**
   * The page count trails the fetch by one render, and has to.
   *
   * Clamping the page needs the count, the count comes from the response, and
   * the response needs the page. Holding the last known count in state breaks
   * that circle: the first render of a new query pages unclamped, the count
   * arrives, and a page past the end snaps back on the render after. A page
   * past the end in the meantime is a 404 from Scryfall, which reads as an
   * empty page rather than an error.
   */
  const [pageCount, setPageCount] = useState<number | null>(null);

  /* The query is what makes a page number meaningless, so the request URL is
     the reset key. A page held while the URL is still null survives, which is
     what lets `/cards?page=7&fq=…` open on page 7 rather than page 1. */
  const { page, setPage } = usePageParam({
    urlSync,
    resetKey: url ?? '',
    pageCount,
  });

  const { rows, total, loading, error } = useScryfallPage(url, page, pageSize);

  useEffect(() => {
    setPageCount(pageCountFor(total, pageSize));
  }, [total, pageSize]);

  const searchWithState = useCallback((state: CardSearchState) => {
    if (!state || !hasSearchCriteria(state)) {
      setUrl(null);
      setCurrentState(null);
      return;
    }
    setCurrentState(state);
    setUrl(buildScryfallURL(state));
  }, []);

  const clearResults = useCallback(() => {
    setUrl(null);
    setCurrentState(null);
  }, []);

  /**
   * Keep the reader in the same part of the results when the page size changes.
   *
   * Going from 24 a page to 96 while on page 5 should not land on the 385th
   * card; it should still show the row being read. The first row on screen is
   * what is preserved.
   */
  const setPageSize = useCallback(
    (next: number) => {
      const firstRow = (page - 1) * pageSize;
      setStoredPageSize(next);
      setPage(Math.floor(firstRow / next) + 1);
    },
    [page, pageSize, setPage, setStoredPageSize]
  );

  const hasNext = useMemo(() => {
    if (pageCount != null) return page < pageCount;
    // With no count from the source, a full page is the only evidence another
    // one exists.
    return rows.length === pageSize;
  }, [pageCount, page, rows.length, pageSize]);

  return {
    results: rows,
    loading,
    error,
    totalResults: total,
    pageCount,
    hasNext,
    page,
    setPage,
    pageSize,
    setPageSize,
    searchWithState,
    clearResults,
    currentState,
  };
}
