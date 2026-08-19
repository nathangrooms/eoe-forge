import { useCallback, useMemo, useRef } from 'react';
import { pageCountFor } from '@/lib/pagination';
import { usePageParam, usePageSize } from '@/hooks/usePagination';
import { useScryfallPage } from '@/hooks/useScryfallPage';

/**
 * A wall of commanders, one page at a time.
 *
 * It used to hold two independent searches that each appended forever: a
 * default EDHREC-ordered wall and a name search, swapped by whether the box had
 * anything in it, each growing by a window of 24 and then by a Scryfall page of
 * 175. Four presses of "load more" put 700 pieces of card art in the document
 * with nothing on screen to say where you were.
 *
 * It is controlled now. The caller says which query and which page, and gets
 * that page back. Switching between the wall and a name search is a change of
 * URL, so there is nothing to keep in step and nothing to re-fetch when the
 * box is cleared: `useScryfallPage` still holds the blocks it fetched for the
 * wall.
 *
 * The page lives in the address bar, so a commander picked from page 6 can be
 * got back to with the Back button.
 */

export interface CommanderBrowseOptions {
  /**
   * The Scryfall search URL to show, or null for nothing at all (the picker is
   * closed, or the format has no commanders).
   */
  url: string | null;
  /** localStorage bucket for the rows-per-page preference. */
  sizeKey: string;
  /** Put `?page=` in the address bar. */
  urlSync?: boolean;
  /** Query-string key, for a screen that carries another pager. */
  pageKey?: string;
}

export interface CommanderBrowseState {
  cards: any[];
  /** Scryfall's own count, or null before one has arrived. Never estimated. */
  total: number | null;
  /** Null whenever the total is null. */
  pageCount: number | null;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  loading: boolean;
  error: string | null;
}

export function useCommanderBrowse(options: CommanderBrowseOptions): CommanderBrowseState {
  const { url, sizeKey, urlSync = true, pageKey = 'page' } = options;

  const [pageSize, setStoredPageSize] = usePageSize(sizeKey);

  /* The page count trails the fetch by one render: clamping needs the count,
     the count comes from the response, and the response needs the page. The ref
     breaks that circle without a render-phase state write. A page past the end
     reads as an empty page until the count lands and snaps it back. */
  const knownPageCount = useRef<number | null>(null);

  const { page, setPage } = usePageParam({
    key: pageKey,
    urlSync,
    resetKey: url ?? '',
    pageCount: knownPageCount.current,
  });

  const { rows, total, loading, error } = useScryfallPage(url, page, pageSize);

  const pageCount = useMemo(() => pageCountFor(total, pageSize), [total, pageSize]);
  knownPageCount.current = pageCount;

  /** Changing the page size keeps the card you were looking at on screen. */
  const setPageSize = useCallback(
    (next: number) => {
      const firstRow = (page - 1) * pageSize;
      setStoredPageSize(next);
      setPage(Math.floor(firstRow / next) + 1);
    },
    [page, pageSize, setPage, setStoredPageSize]
  );

  return {
    cards: rows,
    total,
    pageCount,
    page,
    setPage,
    pageSize,
    setPageSize,
    loading,
    error,
  };
}

export default useCommanderBrowse;
