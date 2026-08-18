import { useCallback, useRef, useState } from 'react';

/**
 * One paged Scryfall commander search.
 *
 * The page runs three of these at once — the EDHREC-ordered default wall, the
 * name search, and whatever the finder panel asked for — and swaps which one
 * the grid is showing. Keeping them separate means switching back to the
 * default grid does not re-fetch it, and a slow finder response cannot land on
 * top of a name search the player has since typed (the run counter drops any
 * response that is no longer the current one).
 *
 * Scryfall answers a valid query with zero matches as a 404, so that is an
 * empty result, not an error.
 */

export interface CommanderBrowseState {
  cards: any[];
  total: number | null;
  nextPage: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

const EMPTY: CommanderBrowseState = {
  cards: [],
  total: null,
  nextPage: null,
  loading: false,
  loadingMore: false,
  error: null,
};

export function useCommanderBrowse() {
  const [state, setState] = useState<CommanderBrowseState>(EMPTY);
  const runId = useRef(0);

  const fetchPage = useCallback(async (url: string, append: boolean) => {
    const id = ++runId.current;
    setState(prev => ({
      ...prev,
      error: null,
      loading: !append,
      loadingMore: append,
      ...(append ? {} : { cards: [], total: null, nextPage: null }),
    }));

    try {
      const response = await fetch(url);

      if (response.status === 404) {
        if (id !== runId.current) return;
        setState({ ...EMPTY, total: 0 });
        return;
      }
      if (!response.ok) throw new Error(`Scryfall returned ${response.status}`);

      const data = await response.json();
      if (id !== runId.current) return;

      const cards = data.data || [];
      setState(prev => ({
        cards: append ? [...prev.cards, ...cards] : cards,
        total: data.total_cards ?? cards.length,
        nextPage: data.has_more ? data.next_page : null,
        loading: false,
        loadingMore: false,
        error: null,
      }));
    } catch (error: any) {
      if (id !== runId.current) return;
      setState(prev => ({
        ...prev,
        loading: false,
        loadingMore: false,
        error: error?.message || 'Could not reach Scryfall. Try again.',
      }));
    }
  }, []);

  const run = useCallback((url: string) => fetchPage(url, false), [fetchPage]);

  const loadMore = useCallback(() => {
    if (!state.nextPage || state.loadingMore) return;
    return fetchPage(state.nextPage, true);
  }, [fetchPage, state.nextPage, state.loadingMore]);

  const reset = useCallback(() => {
    runId.current++;
    setState(EMPTY);
  }, []);

  return { ...state, run, loadMore, reset };
}

export default useCommanderBrowse;
