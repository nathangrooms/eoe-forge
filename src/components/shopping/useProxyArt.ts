/**
 * Which printing of each card on a proxy list actually gets printed, and
 * keeping that choice.
 *
 * WHY THIS EXISTS
 * ---------------
 * The owner: *"proxies need a button click that allows you to change to
 * alternative art work"* and *"if alternative art work changed, it should auto
 * save"*. A pasted list lands every card on whatever printing the catalogue
 * picked, which is the cheapest one we hold a price for. On a proxy sheet the
 * art IS the product, so that default is a decision made for the player about
 * the only thing they came here to decide.
 *
 * WHAT GETS SAVED, AND WHY IT IS THE PRINTING ID
 * ----------------------------------------------
 * `card_list_items.card_id` is already a printing id, not an oracle id, so a
 * chosen printing is stored by changing that one column. Nothing new is added
 * to the table. It also means the row's joined `cards` record comes back as the
 * chosen printing on the next read, carrying its own `image_uris` and `faces`,
 * so the sheet prints the picked art without anything else being told.
 *
 * Storing an oracle id instead would lose the choice the moment the page
 * reloaded, because an oracle id names the card and not the picture.
 *
 * AUTOSAVE THAT SAYS SO
 * ---------------------
 * Commit 43afae4 fixed this exact mistake on the deck optimiser: it wrote the
 * deck on a silent 500 ms timer, so the only safe conclusion a reader could
 * draw was that nothing had been saved, and the owner asked for a save button.
 * So the write is debounced, the timer lives in a ref so a second pick
 * reschedules rather than races the first, and every piece of state it moves
 * through is readable on screen: per card, and once for the page. `saveNow`
 * exists for anyone who would rather press something than trust a timer.
 *
 * ONE QUERY, NOT NINETY NINE
 * --------------------------
 * How many printings each card has comes from `fetchPrintingSpreads`, which
 * chunks 150 oracle ids into a single `in (…)`. A 99 card list is one request.
 * Two outages on this project came from per-row lookups; this is not one.
 *
 * The writes are one request per card the player actually changed, which is a
 * number they typed with their own hands, and repeated picks on the same card
 * inside the debounce window collapse into one.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchPrintingSpreads } from '@/lib/cards/printings';
import { useCardLists, type CardListItem } from '@/lib/shopping';

/** The whole page's saving state, in the optimiser's own vocabulary. */
export type ArtSaveState = 'idle' | 'saving' | 'saved' | 'error';

/** One card's saving state. `waiting` is picked but not yet written. */
export type RowArtState = 'waiting' | 'saving' | 'saved' | 'error';

/**
 * Long enough that clicking through four printings writes once, short enough
 * that nobody navigates away inside it. The optimiser uses 400 ms for a much
 * bigger write; this one is a single column.
 */
const SAVE_AFTER_MS = 600;

export interface ProxyArt {
  /** Printing picked this session, by list row id. Empty until somebody picks. */
  chosen: Record<string, any>;
  /** Printings the catalogue holds, by oracle id. Missing means we do not know. */
  counts: Map<string, number>;
  /** What is happening to each row, so a card can say it for itself. */
  rowState: Record<string, RowArtState>;
  state: ArtSaveState;
  /** Rows picked and not yet written. */
  waiting: number;
  /** What went wrong, in a player's words. Null when nothing did. */
  problem: string | null;
  /** Print this printing for this row from now on. Saves itself. */
  choose: (item: CardListItem, printing: any) => void;
  /** Write anything still waiting, right now. */
  saveNow: () => void;
}

/**
 * A failed write says what a player can do about it, and the database's own
 * words go to the console instead of onto the page.
 *
 * 23505 is the one failure that is not bad luck: `card_list_items` carries a
 * unique index on (list_id, card_id, finish) while a row is still wanted, so
 * picking the printing that another row on the same list already holds would
 * make two identical rows. That is a real thing a player can hit, on a list
 * that took the same card in from two places, and it deserves a real sentence.
 */
function explain(result: { error?: any; missed?: boolean }): string {
  if (result.error?.code === '23505') {
    return 'You already have that art on this list for this card. Change the other one instead.';
  }
  if (result.missed) {
    return 'That did not save. You may have been signed out. Sign in and pick the art again.';
  }
  return 'That did not save. Check your connection and try again.';
}

export function useProxyArt(items: CardListItem[]): ProxyArt {
  const [chosen, setChosen] = useState<Record<string, any>>({});
  const [rowState, setRowState] = useState<Record<string, RowArtState>>({});
  const [counts, setCounts] = useState<Map<string, number>>(() => new Map());
  const [state, setState] = useState<ArtSaveState>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(0);

  /** Picked and not yet written, by row id. The timer drains this. */
  const pending = useRef(new Map<string, any>());
  /** Written and refused. `saveNow` puts these back. */
  const refused = useRef(new Map<string, any>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  /** Oracle ids already asked about, so a re-render does not ask again. */
  const asked = useRef(new Set<string>());

  const oracleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      const id = item.oracle_id ?? item.card?.oracle_id ?? null;
      if (typeof id === 'string' && id.length > 0) ids.add(id);
    }
    return [...ids];
  }, [items]);
  const oracleKey = oracleIds.join(',');

  useEffect(() => {
    const wanted = oracleIds.filter(id => !asked.current.has(id));
    if (wanted.length === 0) return;

    let cancelled = false;
    for (const id of wanted) asked.current.add(id);

    fetchPrintingSpreads(wanted)
      .then(spreads => {
        if (cancelled || !alive.current) return;
        setCounts(prev => {
          const next = new Map(prev);
          for (const [id, spread] of spreads) next.set(id, spread.printings);
          return next;
        });
      })
      .catch(error => {
        // Not knowing the number is survivable: the button still opens the
        // shelf. Forget we asked so a later render can try again.
        for (const id of wanted) asked.current.delete(id);
        console.error('Could not count printings for the proxy list:', error);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oracleKey]);

  /**
   * Write everything waiting.
   *
   * `quiet` is the unmount path: the requests still go, because a choice the
   * player watched land on screen must not evaporate, but nothing sets state on
   * a page that is gone.
   */
  const flush = useCallback(async (options?: { quiet?: boolean }) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const batch = [...pending.current.entries()];
    if (batch.length === 0) return;
    pending.current.clear();

    const quiet = options?.quiet === true;
    if (!quiet) {
      setWaiting(0);
      setState('saving');
      setRowState(prev => {
        const next = { ...prev };
        for (const [id] of batch) next[id] = 'saving';
        return next;
      });
    }

    const results = await Promise.all(
      batch.map(async ([itemId, printing]) => {
        const patch: { card_id: string; oracle_id?: string } = { card_id: String(printing.id) };
        // A row imported from text can carry no oracle id at all. The printing
        // knows one, so taking it fixes the row for everything that groups by
        // card rather than by picture.
        if (typeof printing.oracle_id === 'string' && printing.oracle_id) {
          patch.oracle_id = printing.oracle_id;
        }
        /*
         * `.select('id')` is not decoration, it is the difference between
         * saying "saved" and knowing it.
         *
         * An update that matches no row is a SUCCESS to PostgREST: no error,
         * nothing changed. Row level security on `card_list_items` is
         * `auth.uid() = user_id`, so a signed-out session, an expired token or
         * a row belonging to somebody else all take that path, and without a
         * returned row the interface would cheerfully report a write that
         * never happened. Asking for the id back costs nothing on the same
         * round trip and turns silence into a visible failure.
         */
        const { data, error } = await supabase
          .from('card_list_items')
          .update(patch)
          .eq('id', itemId)
          .select('id');
        if (error) console.error('Could not save the art choice:', error);
        const missed = !error && (data ?? []).length === 0;
        if (missed) console.error('The art choice changed no row:', itemId);
        return { itemId, printing, error, missed };
      })
    );

    if (quiet || !alive.current) return;

    const failed = results.filter(result => result.error || result.missed);
    setRowState(prev => {
      const next = { ...prev };
      for (const result of results) {
        next[result.itemId] = result.error || result.missed ? 'error' : 'saved';
      }
      return next;
    });

    if (failed.length > 0) {
      for (const result of failed) refused.current.set(result.itemId, result.printing);
      setState('error');
      setProblem(explain(failed[0]));
    } else if (pending.current.size === 0) {
      setState('saved');
      setProblem(null);
    }
    /*
     * Nothing is said when something is still queued. A pick made while this
     * batch was in flight has its own timer running, and announcing "saved"
     * over the top of it would be the page claiming a write it has not sent
     * yet. `choose` already set the state to saving; it stays there.
     */

    // The store is the single copy of the lists every surface reads, so it is
    // re-read once per burst rather than once per card.
    if (failed.length < results.length) {
      void useCardLists.getState().load({ force: true });
    }
  }, []);

  const choose = useCallback(
    (item: CardListItem, printing: any) => {
      if (!printing?.id) return;
      setChosen(prev => ({ ...prev, [item.id]: printing }));

      if (String(printing.id) === item.card_id) {
        // Already the printing the row holds. Saying "saved" here would be
        // claiming a write that never happened, so the card says nothing.
        pending.current.delete(item.id);
        refused.current.delete(item.id);
        setWaiting(pending.current.size);
        setRowState(prev => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        return;
      }

      pending.current.set(item.id, printing);
      refused.current.delete(item.id);
      setWaiting(pending.current.size);
      setRowState(prev => ({ ...prev, [item.id]: 'waiting' }));
      // The wait counts as saving. A reader cannot tell a debounce apart from a
      // slow request, and the honest thing to show them is that it is underway.
      setState('saving');
      setProblem(null);

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, SAVE_AFTER_MS);
    },
    [flush]
  );

  const saveNow = useCallback(() => {
    for (const [itemId, printing] of refused.current) pending.current.set(itemId, printing);
    refused.current.clear();
    if (pending.current.size === 0) return;
    setWaiting(pending.current.size);
    setState('saving');
    setProblem(null);
    void flush();
  }, [flush]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // The timer dies with the page, so nothing it was going to do can run
      // against a page that is gone. What it was holding is written here and
      // now instead, in the same tick, because dropping a choice the player
      // watched appear on screen is the one outcome worse than a late write.
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      void flush({ quiet: true });
    };
  }, [flush]);

  return useMemo(
    () => ({ chosen, counts, rowState, state, waiting, problem, choose, saveNow }),
    [chosen, counts, rowState, state, waiting, problem, choose, saveNow]
  );
}
