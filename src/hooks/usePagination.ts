import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DEFAULT_PAGE_SIZE,
  FIRST_PAGE,
  PAGE_SIZE_OPTIONS,
  clampPage,
  pageCountFor,
  parsePageParam,
} from '@/lib/pagination';

/**
 * Page state, and where it lives.
 *
 * The page number belongs in the URL. `?page=3` is what makes the browser's
 * back button walk back through the pages you looked at, makes a page of
 * results something you can send to somebody, and puts you back where you were
 * after a reload. Back and forward working everywhere is a standing rule in
 * this project, and a pager that kept its page in component state would quietly
 * break it.
 *
 * Two escapes from that, both deliberate:
 *
 * - `urlSync: false` for a pager inside a right-hand panel or an embedded
 *   picker, where the page URL belongs to the host screen and writing to it
 *   would fight whatever else owns it.
 * - `key`, when one screen has two independent pagers.
 *
 * Page size is a preference, not a place, so it lives in `localStorage` rather
 * than the URL. Somebody who likes big cards should not have to say so again on
 * every screen, and it should not ride along in a link they share.
 */

export interface UsePageParamOptions {
  /** Query-string key. Change it only when a screen has two pagers. */
  key?: string;
  /**
   * Anything whose change makes the current page meaningless: the filter, the
   * sort, the tab. When this string changes the page returns to 1.
   *
   * Without it, a filter that narrows 30,000 cards to 12 leaves the reader on
   * page 9 looking at an empty grid and no obvious way out.
   */
  resetKey?: string;
  /** Highest page that exists, when it is known. Nulls are respected, not guessed. */
  pageCount?: number | null;
  /** Off for pagers inside panels and pickers. See above. */
  urlSync?: boolean;
}

export interface PageParam {
  page: number;
  setPage: (page: number) => void;
}

export function usePageParam(options: UsePageParamOptions = {}): PageParam {
  const { key = 'page', resetKey, pageCount = null, urlSync = true } = options;

  const [searchParams, setSearchParams] = useSearchParams();
  const [localPage, setLocalPage] = useState(FIRST_PAGE);

  const raw = urlSync ? searchParams.get(key) : null;
  const page = clampPage(urlSync ? parsePageParam(raw) : localPage, pageCount);

  // Refs keep `setPage` stable. It is passed to `Pager` and into effects, and a
  // callback that changed on every render would restart debounces that key on it.
  const latest = useRef({ key, urlSync, setSearchParams, page });
  latest.current = { key, urlSync, setSearchParams, page };

  const setPage = useCallback((next: number) => {
    const target = Math.max(FIRST_PAGE, Math.floor(next) || FIRST_PAGE);
    const { key: k, urlSync: sync, setSearchParams: write } = latest.current;
    if (!sync) {
      setLocalPage(target);
      return;
    }
    // A push, not a replace: turning the page is a move, and the back button
    // should undo it.
    write(
      prev => {
        const params = new URLSearchParams(prev);
        if (target === FIRST_PAGE) params.delete(k);
        else params.set(k, String(target));
        return params;
      },
      { replace: false }
    );
  }, []);

  /**
   * Send the reader back to page 1 when the result set changes underneath them.
   *
   * This one replaces rather than pushes. Typing into a filter should not
   * deposit a history entry per keystroke; the back button belongs to the pages
   * the reader chose to visit.
   *
   * An empty previous key is the surface saying "I have not decided what I am
   * showing yet" — a search that has not built its request URL, a list still
   * loading. Adopting the first real key is not a change of result set, and
   * treating it as one would throw away the page number in a link somebody was
   * sent.
   */
  const seenReset = useRef(resetKey);
  useEffect(() => {
    const previous = seenReset.current;
    seenReset.current = resetKey;
    if (resetKey === previous) return;
    if (previous === undefined || previous === '') return;
    const { key: k, urlSync: sync, setSearchParams: write, page: p } = latest.current;
    if (p === FIRST_PAGE) return;
    if (!sync) {
      setLocalPage(FIRST_PAGE);
      return;
    }
    write(
      prev => {
        const params = new URLSearchParams(prev);
        params.delete(k);
        return params;
      },
      { replace: true }
    );
  }, [resetKey]);

  return { page, setPage };
}

/**
 * Rows per page, remembered per surface.
 *
 * Mirrors `useCardSize`: same storage-key convention, same "a preference is not
 * a place" reasoning. An unrecognised stored value falls back rather than
 * throwing, because a value written by an older build should not break the page.
 */
export function usePageSize(
  storageKey: string,
  fallback: number = DEFAULT_PAGE_SIZE
): [number, (size: number) => void] {
  const key = `dm.pageSize.${storageKey}`;

  const [size, setSize] = useState<number>(() => {
    if (typeof window === 'undefined') return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      const n = raw ? Number.parseInt(raw, 10) : NaN;
      return PAGE_SIZE_OPTIONS.includes(n as (typeof PAGE_SIZE_OPTIONS)[number])
        ? n
        : fallback;
    } catch {
      return fallback;
    }
  });

  const set = useCallback(
    (next: number) => {
      setSize(next);
      try {
        window.localStorage.setItem(key, String(next));
      } catch {
        /* private mode: the choice just does not persist */
      }
    },
    [key]
  );

  return [size, set];
}

export interface UsePagedItemsOptions {
  pageSize?: number;
  /** See `UsePageParamOptions.resetKey`. */
  resetKey?: string;
  key?: string;
  urlSync?: boolean;
}

export interface PagedItems<T> {
  /** The rows for the current page, in the order they were given. */
  pageItems: T[];
  page: number;
  setPage: (page: number) => void;
  pageCount: number;
  /** Total rows across every page. Real, because they are all in hand. */
  total: number;
  pageSize: number;
}

/**
 * Page a list that is already in memory.
 *
 * **Read this before reaching for it.** Slicing in the browser is the wrong
 * answer for a catalogue: 96,000 rows must be paged by the database, and
 * `rangeFor` exists for that. This is for the case where the whole set was
 * going to be fetched anyway because the screen computes something over all of
 * it — the collection's own copy count and value, the wishlist's total. There,
 * one indexed read of the user's own rows is the cheap part and drawing several
 * thousand card tiles is the expensive part, and this cuts the expensive part.
 *
 * If the screen does not need a figure computed over every row, page it at the
 * database instead.
 *
 * `items` must already be sorted. Sort first, then page: paging a list and
 * sorting the page is the bug that puts the same card on two pages.
 */
export function usePagedItems<T>(
  items: T[],
  options: UsePagedItemsOptions = {}
): PagedItems<T> {
  const { pageSize = DEFAULT_PAGE_SIZE, resetKey, key, urlSync } = options;

  const total = items.length;
  const pageCount = pageCountFor(total, pageSize) ?? 1;
  const { page, setPage } = usePageParam({ key, urlSync, resetKey, pageCount });

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return { pageItems, page, setPage, pageCount, total, pageSize };
}
