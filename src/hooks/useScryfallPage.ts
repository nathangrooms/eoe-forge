import { useEffect, useRef, useState } from 'react';
import { blocksFor } from '@/lib/pagination';

/**
 * One page of a Scryfall search, by page number.
 *
 * Every card-browsing surface in this product reads Scryfall through here:
 * the card search page, the deck-builder and wishlist pickers, and both
 * commander walls. One fetcher means one caching rule, one abort rule and one
 * answer to "how many are there".
 *
 * ## Scryfall's page is 175 and ours is not
 *
 * Scryfall serves a fixed 175 rows per request and offers no way to ask for
 * fewer. 175 cards is not a page a person reads, especially with the art drawn
 * as large as it should be, so a page here is whatever the surface asks for and
 * this hook maps it onto Scryfall's:
 *
 *   page 3, 24 a page  ->  rows 48-71    ->  Scryfall page 1, sliced
 *   page 9, 24 a page  ->  rows 192-215  ->  Scryfall page 2, sliced
 *   page 2, 96 a page  ->  rows 96-191   ->  Scryfall pages 1 and 2, joined
 *
 * A page never needs more than two requests, and fetched blocks are kept until
 * the query changes, so at 24 a page six of every seven page turns are instant
 * and cost no network at all. This is not "fetch it all and slice": the request
 * is one page of an upstream API with no smaller unit, not the 30,000 rows
 * behind it.
 *
 * ## The total is real
 *
 * `total_cards` arrives with every response and is Scryfall's own count for the
 * query, so a page count derived from it is not a guess. Where a surface has no
 * total it must show a next arrow and no page count; see `@/lib/pagination`.
 *
 * ## Ordering
 *
 * Measured against the live API on 2026-08-19 for `f:commander -t:land` ordered
 * by EDHREC rank: page 2 fetched three times returned the identical order, page
 * 100 fetched twice returned the identical order, and pages 99 and 100 shared
 * no rows. Scryfall's ordering is stable, so a card cannot appear on two pages.
 */

/** Scryfall's own page size. Fixed by them, which is why the arithmetic exists. */
export const SCRYFALL_PAGE_SIZE = 175;

interface Block {
  rows: any[];
  /** `total_cards` as reported with this block. */
  total: number | null;
}

export interface ScryfallPageResult {
  /** The rows for the requested page. Never more than `pageSize` of them. */
  rows: any[];
  /** Scryfall's count for the whole query, or null until one has arrived. */
  total: number | null;
  loading: boolean;
  error: string | null;
}

/**
 * @param url    A full Scryfall search URL without a `page` parameter, or null
 *               to show nothing.
 * @param page   1-based page number.
 * @param size   Rows per page.
 */
export function useScryfallPage(
  url: string | null,
  page: number,
  size: number
): ScryfallPageResult {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Fetched blocks for the current query, keyed by Scryfall page number. */
  const cache = useRef(new Map<number, Block>());
  const cachedUrl = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runId = useRef(0);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    // A different query: nothing already fetched is about it.
    if (cachedUrl.current !== url) {
      cachedUrl.current = url;
      cache.current.clear();
      setTotal(null);
    }

    if (!url) {
      runId.current++;
      abortRef.current?.abort();
      setRows([]);
      setError(null);
      setLoading(false);
      return;
    }

    const id = ++runId.current;
    const offset = (Math.max(1, page) - 1) * size;

    /** Scryfall's count for this query, from whichever block already carried it. */
    const reportedTotal = (): number | null => {
      for (const block of cache.current.values()) {
        if (block.total != null) return block.total;
      }
      return null;
    };

    /**
     * Which blocks this page needs, re-decided every time a total arrives.
     *
     * The count is what stops the list at the last block that exists. Before it
     * has arrived the plan is arithmetic and may reach one block too far; the
     * moment block one answers, the plan shortens and the block that was never
     * there is never asked for.
     */
    const plan = () => blocksFor(offset, size, reportedTotal(), SCRYFALL_PAGE_SIZE);

    /** The requested window, or null while a block it needs is still missing. */
    const assemble = (): any[] | null => {
      const wanted = plan();
      if (wanted.length === 0) return [];
      const joined: any[] = [];
      for (const b of wanted) {
        const block = cache.current.get(b);
        if (!block) return null;
        joined.push(...block.rows);
      }
      const start = offset - (wanted[0] - 1) * SCRYFALL_PAGE_SIZE;
      return joined.slice(start, start + size);
    };

    const ready = assemble();
    if (ready) {
      setRows(ready);
      setError(null);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        // Re-planned after every block, because the first answer carries the
        // count and the count can shorten the list.
        for (let guard = 0; guard < 8; guard++) {
          const b = plan().find(n => !cache.current.has(n));
          if (b === undefined) break;

          const request = new URL(url);
          request.searchParams.set('page', String(b));
          const response = await fetch(request.toString(), { signal: controller.signal });
          const payload = await response.json().catch(() => null);

          if (!response.ok) {
            /*
             * Two statuses mean "there is nothing here", and neither is an error.
             *
             *   404  the query parsed and matched no cards.
             *   422  "You have paginated beyond the end of these results."
             *
             * The second one is the reason this branch had to change. Measured
             * against the live API on 2026-08-19: past the end is 422, never
             * 404. A malformed query is 400 ("Your search contains unclosed
             * parentheses"), so reading 422 as an empty block cannot hide a
             * syntax error from the reader.
             *
             * Only block one can report a total of zero. A 404 or 422 on a later
             * block says nothing about how many rows the query has, and writing
             * a zero there would be inventing a count.
             */
            if (response.status === 404 || (response.status === 422 && b > 1)) {
              cache.current.set(b, { rows: [], total: b === 1 ? 0 : null });
              if (b === 1) setTotal(0);
              continue;
            }
            throw new Error(payload?.details || `Search failed (${response.status})`);
          }

          const reported =
            typeof payload?.total_cards === 'number' ? payload.total_cards : null;
          cache.current.set(b, { rows: payload?.data ?? [], total: reported });
          if (reported !== null) setTotal(reported);
        }

        if (id !== runId.current) return;
        setRows(assemble() ?? []);
      } catch (err: any) {
        if (err?.name === 'AbortError' || id !== runId.current) return;
        setError(err instanceof Error ? err.message : 'Failed to search cards');
        setRows([]);
        setTotal(null);
      } finally {
        if (controller === abortRef.current && id === runId.current) setLoading(false);
      }
    })();
  }, [url, page, size]);

  return { rows, total, loading, error };
}
