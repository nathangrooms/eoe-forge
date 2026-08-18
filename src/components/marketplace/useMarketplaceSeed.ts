import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * What the price search shows before anyone types.
 *
 * The marketplace used to open on four zeroes and an empty text box — a card
 * trading page with not one card on it. Everything below is read live: the
 * user's own wishlist and collection rows come from Postgres, and the printings
 * they resolve to come from Scryfall's `/cards/collection` endpoint, which
 * returns the same object shape the search endpoint does. Nothing is
 * synthesised, and a card the user does not own or want will never appear in
 * the "yours" views.
 */

export interface MarketplaceSeed {
  id: string;
  label: string;
  /** One line naming where the list came from. Rendered above the grid. */
  caption: string;
  /** Raw Scryfall card objects, ready for `toCardPriceData`. */
  cards: any[];
}

/** Scryfall accepts at most 75 identifiers per `/cards/collection` request. */
const SCRYFALL_COLLECTION_MAX = 75;
/** One screenful and a bit — enough to fill the page without a 75-card wall. */
const SEED_SIZE = 42;

const usdOf = (prices: unknown): number => {
  const raw = (prices as Record<string, string | null> | null)?.usd;
  const n = Number(raw ?? '');
  return Number.isFinite(n) ? n : 0;
};

/** Resolve card ids to full Scryfall printings, preserving the order given. */
async function fetchScryfallCards(ids: string[]): Promise<any[]> {
  if (ids.length === 0) return [];
  const slice = ids.slice(0, SCRYFALL_COLLECTION_MAX);

  const res = await fetch('https://api.scryfall.com/cards/collection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiers: slice.map(id => ({ id })) }),
  });
  if (!res.ok) return [];

  const payload = await res.json();
  const byId = new Map<string, any>((payload?.data ?? []).map((c: any) => [c.id, c]));
  return slice.map(id => byId.get(id)).filter(Boolean);
}

/** Scryfall search, used only for the signed-out / empty-shelf fallback view. */
async function fetchScryfallSearch(q: string, order: string, dir: string): Promise<any[]> {
  const url = new URL('https://api.scryfall.com/cards/search');
  url.searchParams.set('q', q);
  url.searchParams.set('order', order);
  url.searchParams.set('dir', dir);
  url.searchParams.set('unique', 'cards');
  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const payload = await res.json();
  return (payload?.data ?? []).slice(0, SEED_SIZE);
}

/**
 * Rank a set of card ids by the USD price we already hold locally.
 *
 * The ranking deliberately uses `cards.prices->>'usd'` — the same field the
 * collection page displays — rather than the denormalised `price_usd` column,
 * which is stale. Ids with no row in `cards` (an import that never resolved)
 * drop out here, which is also what keeps junk rows off the page.
 */
async function rankByValue(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from('cards')
    .select('id, prices')
    .in('id', ids.slice(0, 400));

  return (data ?? [])
    .map(row => ({ id: row.id, usd: usdOf(row.prices) }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, SEED_SIZE)
    .map(r => r.id);
}

export function useMarketplaceSeed() {
  const [seeds, setSeeds] = useState<MarketplaceSeed[]>([]);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const next: MarketplaceSeed[] = [];

      if (session) {
        const [{ data: wishRows }, { data: ownedRows }] = await Promise.all([
          supabase.from('wishlist').select('card_id').eq('user_id', session.user.id),
          supabase.from('user_collections').select('card_id').eq('user_id', session.user.id),
        ]);

        const wishIds = [...new Set((wishRows ?? []).map(r => r.card_id))];
        const ownedIds = [...new Set((ownedRows ?? []).map(r => r.card_id))];

        const [wishRanked, ownedRanked] = await Promise.all([
          rankByValue(wishIds),
          rankByValue(ownedIds),
        ]);

        const [wishCards, ownedCards] = await Promise.all([
          fetchScryfallCards(wishRanked),
          fetchScryfallCards(ownedRanked),
        ]);

        /* The captions describe the SELECTION, not the display order — the grid
           has its own sort control and defaults to name. Saying "dearest first"
           here while the grid is alphabetical would be a lie about the data. */
        if (wishCards.length > 0) {
          next.push({
            id: 'wishlist',
            label: `Your wishlist (${wishIds.length})`,
            caption:
              wishIds.length > wishCards.length
                ? `The ${wishCards.length} dearest of the ${wishIds.length} cards on your wishlist, priced by Scryfall`
                : `All ${wishCards.length} cards on your wishlist, priced by Scryfall`,
            cards: wishCards,
          });
        }

        if (ownedCards.length > 0) {
          next.push({
            id: 'collection',
            label: `Your collection (${ownedIds.length})`,
            caption:
              ownedIds.length > ownedCards.length
                ? `The ${ownedCards.length} most valuable of the ${ownedIds.length} cards you own, priced by Scryfall`
                : `All ${ownedCards.length} cards you own, priced by Scryfall`,
            cards: ownedCards,
          });
        }
      }

      // Nothing wished for and nothing owned yet — still show real cards.
      if (next.length === 0) {
        const cards = await fetchScryfallSearch('game:paper -t:basic usd>=1', 'usd', 'desc');
        if (cards.length > 0) {
          next.push({
            id: 'market',
            label: 'Highest priced',
            caption: `The ${cards.length} highest-priced paper cards Scryfall lists`,
            cards,
          });
        }
      }

      if (alive.current) setSeeds(next);
    } catch (error) {
      console.error('Error seeding marketplace:', error);
      if (alive.current) setSeeds([]);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { seeds, loading, reload: load };
}
