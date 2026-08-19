/**
 * One copy of the lists, shared by everything that draws them.
 *
 * The cart badge in the header, the shopping page, the arriving strip on the
 * collection page and the add button on a card page are all looking at the same
 * list, and if each fetched its own copy the badge would say 4 while the page
 * showed 5. So there is one store, every mutation refreshes it, and every
 * surface reads from it.
 */

import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import {
  addManyToList,
  addToList,
  clearList,
  fileArrival,
  loadDeckShortfalls,
  loadListItems,
  loadWishlistSource,
  markArrived,
  markBought,
  removeItem,
  resetItem,
  setQuantity,
  type AddToListInput,
  type BulkListItem,
  type FileInput,
  type MarkBoughtInput,
} from './api.ts';
import { assembleShoppingList, type AssembledList, type DeckShortfallRow, type WishlistSourceRow } from './assemble.ts';
import type { CardListItem, Finish, ItemSource, ListKind } from './list.ts';

interface CardListState {
  shopping: CardListItem[];
  proxies: CardListItem[];
  wishlist: WishlistSourceRow[];
  shortfalls: DeckShortfallRow[];
  loading: boolean;
  /** Never been loaded in this session. Distinct from "loaded and empty". */
  loaded: boolean;
  error: string | null;

  load: (options?: { force?: boolean }) => Promise<void>;

  add: (input: AddToListInput) => Promise<void>;
  /** A whole list at once. One request however many cards. Returns rows written. */
  addMany: (input: {
    kind: ListKind;
    items: BulkListItem[];
    source?: ItemSource;
    sourceDeckId?: string | null;
  }) => Promise<number>;
  setQuantity: (itemId: string, quantity: number) => Promise<void>;
  remove: (itemId: string) => Promise<void>;
  /** Empty a list of everything still wanted. Returns how many rows went. */
  clear: (kind: ListKind) => Promise<number>;
  markBought: (input: MarkBoughtInput) => Promise<void>;
  markArrived: (itemId: string, arrived?: { cardId?: string | null; finish?: Finish | null }) => Promise<void>;
  file: (input: FileInput) => Promise<void>;
  reset: (itemId: string) => Promise<void>;

  /** The merged shopping list: what to buy, what is on the way, what landed. */
  assembled: () => AssembledList;
  /** Copies still to buy. This is the number on the cart. */
  toBuyCount: () => number;
  /** Copies bought and not yet put away. */
  inTransitCount: () => number;
  /** Copies on the proxy list. */
  proxyCount: () => number;
  /** Whether a card is already on a given list, for the add button. */
  copiesOn: (kind: ListKind, card: { id?: string; oracle_id?: string | null; name?: string }) => number;
}

/** Guards against two surfaces mounting at once and both fetching. */
let inFlight: Promise<void> | null = null;

export const useCardLists = create<CardListState>((set, get) => ({
  shopping: [],
  proxies: [],
  wishlist: [],
  shortfalls: [],
  loading: false,
  loaded: false,
  error: null,

  load: async (options = {}) => {
    if (!options.force && inFlight) return inFlight;
    if (!options.force && get().loaded && !get().loading) return;

    const run = (async () => {
      set({ loading: true, error: null });
      try {
        const { data } = await supabase.auth.getUser();
        const userId = data.user?.id;
        if (!userId) {
          set({ shopping: [], proxies: [], wishlist: [], shortfalls: [], loaded: true });
          return;
        }
        /*
         * Settled, not all-or-nothing.
         *
         * Four independent reads feed this list, and one of them failing used
         * to blank all four: a single timeout left the cart empty and the page
         * saying nothing at all. Now whatever came back is shown, and the
         * failure is named rather than silently swallowed, so a player can see
         * that the deck part of their list is missing instead of concluding
         * they have nothing to buy.
         */
        const [shopping, proxies, wishlist, shortfalls] = await Promise.allSettled([
          loadListItems('shopping'),
          loadListItems('proxy'),
          loadWishlistSource(userId),
          loadDeckShortfalls(userId),
        ]);

        const missing: string[] = [];
        if (shopping.status === 'rejected') missing.push('your shopping list');
        if (proxies.status === 'rejected') missing.push('your proxy list');
        if (wishlist.status === 'rejected') missing.push('your wishlist');
        if (shortfalls.status === 'rejected') missing.push('what your decks are missing');

        set({
          shopping: shopping.status === 'fulfilled' ? shopping.value : get().shopping,
          proxies: proxies.status === 'fulfilled' ? proxies.value : get().proxies,
          wishlist: wishlist.status === 'fulfilled' ? wishlist.value : get().wishlist,
          shortfalls: shortfalls.status === 'fulfilled' ? shortfalls.value : get().shortfalls,
          loaded: true,
          error:
            missing.length === 0
              ? null
              : `We could not load ${missing.join(' or ')} just now. Try again in a moment.`,
        });
        if (missing.length > 0) {
          console.error('Some list sources did not load:', {
            shopping: shopping.status,
            proxies: proxies.status,
            wishlist: wishlist.status,
            shortfalls: shortfalls.status,
          });
        }
      } catch (error: any) {
        console.error('Could not load your lists:', error);
        set({ error: error?.message ?? 'Could not load your lists.' });
      } finally {
        set({ loading: false });
        inFlight = null;
      }
    })();

    inFlight = run;
    return run;
  },

  add: async input => {
    await addToList(input);
    await get().load({ force: true });
  },

  addMany: async input => {
    const written = await addManyToList(input);
    await get().load({ force: true });
    return written;
  },

  setQuantity: async (itemId, quantity) => {
    await setQuantity(itemId, quantity);
    await get().load({ force: true });
  },

  remove: async itemId => {
    await removeItem(itemId);
    await get().load({ force: true });
  },

  clear: async kind => {
    const gone = await clearList(kind);
    await get().load({ force: true });
    return gone;
  },

  markBought: async input => {
    await markBought(input);
    await get().load({ force: true });
  },

  markArrived: async (itemId, arrived) => {
    await markArrived(itemId, arrived);
    await get().load({ force: true });
  },

  file: async input => {
    await fileArrival(input);
    await get().load({ force: true });
  },

  reset: async itemId => {
    await resetItem(itemId);
    await get().load({ force: true });
  },

  assembled: () => {
    const { shopping, wishlist, shortfalls } = get();
    return assembleShoppingList({ items: shopping, wishlist, shortfalls });
  },

  toBuyCount: () => get().assembled().toBuy.reduce((sum, entry) => sum + entry.quantity, 0),

  inTransitCount: () => {
    const list = get().assembled();
    return [...list.arriving, ...list.arrived].reduce((sum, item) => sum + item.quantity, 0);
  },

  proxyCount: () => get().proxies.reduce((sum, item) => sum + item.quantity, 0),

  copiesOn: (kind, card) => {
    const rows = kind === 'shopping' ? get().shopping : get().proxies;
    const oracle = card.oracle_id ?? null;
    const name = (card.name ?? '').trim().toLowerCase();
    return rows
      .filter(row => {
        if (row.status !== 'want') return false;
        if (oracle && row.oracle_id) return row.oracle_id === oracle;
        if (card.id && row.card_id === card.id) return true;
        return row.card_name.trim().toLowerCase() === name;
      })
      .reduce((sum, row) => sum + row.quantity, 0);
  },
}));
