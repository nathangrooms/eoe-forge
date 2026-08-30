import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { deckListHash, deckPowerFromStored, type DeckPower } from '@/lib/deck/power';
import { useDeckPowerBackfill } from '@/hooks/useDeckPowerBackfill';
import { canPriceOwnedCopies, ownedValueUSD } from '@/features/collection/value';
import { pickPrintingsByName, wishlistUnitPrice } from '@/lib/wishlist/printing';
import { deckWork, type DeckWork } from './deckWork';

// The dashboard is the first screen a signed-in player sees, so everything it
// renders has to come from a real row. There is deliberately no seeded/demo
// data in this module: if a query returns nothing, the widget renders an empty
// state rather than inventing numbers.

export { logActivity } from '@/lib/activityLogger';

/**
 * One printing the user owns, with what their copies of it are worth.
 *
 * Carried out of the summary rather than re-queried, because the dashboard now
 * shows the cards themselves and the rows that answer "what are your best
 * cards" were already fetched to compute the total. Asking twice is how this
 * product ended up with two screens disagreeing about the wishlist by $2,335.
 */
export interface OwnedHolding {
  cardId: string;
  name: string | null;
  /** Non-foil copies. */
  quantity: number;
  /** Foil copies. */
  foil: number;
  /** What all copies of this printing are worth, or null when we hold no price. */
  valueUSD: number | null;
}

/** One wishlist row, resolved to a printing and a price where one exists. */
export interface WantedCard {
  id: string;
  cardId: string | null;
  name: string | null;
  quantity: number;
  priority: string | null;
  /** Cost of one copy, or null when the catalogue holds no price for it. */
  unitUSD: number | null;
}

export interface DashboardSummary {
  displayName: string;
  collection: {
    totalValueUSD: number;
    totalCards: number;
    uniqueCards: number;
    /**
     * Owned stacks we could not price, so the total above is lower than the
     * collection is really worth. Counted with `canPriceOwnedCopies`, which is
     * the same rule `/collection` uses, so the two screens report the same
     * number. Re-measured 2026-08-19 against the owner's 52 rows: four, being
     * three Arena rebalanced printings that have never been sold on paper, plus
     * Kraum, Ludevic's Opus, which carries a foil price and no non-foil one
     * against a non-foil copy. A total that hides them is an under-count
     * presented as a fact.
     */
    unpricedCards: number;
    /** Every owned printing, most valuable first. */
    holdings: OwnedHolding[];
  };
  wishlist: {
    totalItems: number;
    totalDesired: number;
    valueUSD: number;
    /** Wanted cards with no price recorded, for the same reason. */
    unpricedCards: number;
    /** Every wanted card, cheapest priced first, unpriced ones last. */
    wanted: WantedCard[];
  };
  decks: {
    count: number;
    favoritesCount: number;
  };
}

const EMPTY_SUMMARY: DashboardSummary = {
  displayName: '',
  collection: { totalValueUSD: 0, totalCards: 0, uniqueCards: 0, unpricedCards: 0, holdings: [] },
  wishlist: { totalItems: 0, totalDesired: 0, valueUSD: 0, unpricedCards: 0, wanted: [] },
  decks: { count: 0, favoritesCount: 0 },
};

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && isFinite(value) ? value : fallback;
}

/**
 * Supabase types the embedded `cards(prices)` relation loosely, so the shape the
 * valuation actually needs is stated here rather than cast at every use.
 */
interface CollectionValueRow {
  card_id: string | null;
  card_name: string | null;
  quantity: number | null;
  foil: number | null;
  cards: { prices: unknown; name: string | null } | null;
}

function parseUsdPrice(prices: unknown): number {
  try {
    const parsed = typeof prices === 'string' ? JSON.parse(prices) : prices;
    const usd = parseFloat((parsed as { usd?: string } | null)?.usd ?? '');
    return isFinite(usd) ? usd : 0;
  } catch {
    return 0;
  }
}

export function useDashboardSummary() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!user) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      setError(null);

      const [
        { data: profile },
        { data: collectionRows },
        { data: wishlistRows },
        { count: deckCount },
        { count: favoriteCount },
      ] = await Promise.all([
        supabase.from('profiles').select('username').eq('id', user.id).maybeSingle(),
        // The join to `cards` is the point. Valuation reads live Scryfall prices
        // off the card row, never the denormalised `user_collections.price_usd`
        // snapshot — see `ownedValueUSD` for why.
        supabase
          .from('user_collections')
          // `card_id` and the joined `name` are here so the same rows can also
          // answer "which of my cards are worth the most", with real artwork,
          // without a second pass over the collection.
          .select('card_id, card_name, quantity, foil, cards(prices, name)')
          .eq('user_id', user.id),
        supabase
          .from('wishlist')
          .select('id, quantity, card_id, card_name, priority')
          .eq('user_id', user.id),
        supabase.from('user_decks').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('favorite_decks').select('deck_id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);

      let collectionValue = 0;
      let totalCards = 0;
      let collectionUnpriced = 0;
      const holdings: OwnedHolding[] = [];
      for (const row of (collectionRows ?? []) as CollectionValueRow[]) {
        if (!row) continue;
        const quantity = num(row.quantity);
        const foil = num(row.foil);
        const rowValue = ownedValueUSD(row.cards?.prices, quantity, foil);
        collectionValue += rowValue;
        totalCards += quantity + foil;
        // `ownedValueUSD` returns 0 both for "worth nothing" and for "we have
        // no price", so the row is asked directly rather than inferred from the
        // sum. No card in `cards` is stored at $0.00, so an owned row that
        // values to nothing is always a row we cannot price.
        //
        // The question is about the copies held, not about the printing. Asking
        // the wider one counted a non-foil copy of a foil-only printing as
        // priced, contributed $0 for it, and kept it out of the "no price yet"
        // line. `canPriceOwnedCopies` is the rule `/collection` already used.
        const priced = canPriceOwnedCopies(row.cards?.prices, quantity, foil);
        if (quantity + foil > 0 && !priced) collectionUnpriced += 1;
        if (row.card_id) {
          holdings.push({
            cardId: row.card_id,
            name: row.cards?.name ?? row.card_name ?? null,
            quantity,
            foil,
            valueUSD: priced ? Math.round(rowValue * 100) / 100 : null,
          });
        }
      }
      collectionValue = Math.round(collectionValue * 100) / 100;
      // Unpriced last rather than treated as free: a card we cannot value is not
      // the least valuable card you own, it is one we do not know about.
      holdings.sort((a, b) => {
        if (a.valueUSD === null) return b.valueUSD === null ? 0 : 1;
        if (b.valueUSD === null) return -1;
        return b.valueUSD - a.valueUSD;
      });

      // Wishlist rows only store a card id, so prices come from the card table.
      const wishlistCardIds = Array.from(
        new Set((wishlistRows ?? []).map(row => row?.card_id).filter(Boolean) as string[])
      );

      // `null` here means "this printing is in our catalogue and has no USD
      // price", which is a different fact from "this printing is not in our
      // catalogue" — the second falls through to the name lookup below, the
      // first must not.
      const priceByCardId: Record<string, number | null> = {};
      if (wishlistCardIds.length > 0) {
        const { data: cardRows } = await supabase
          .from('cards')
          .select('id, prices')
          .in('id', wishlistCardIds);

        for (const card of cardRows ?? []) {
          priceByCardId[card.id] = wishlistUnitPrice(card);
        }
      }

      /*
       * A wishlist row stores the printing the user picked, and that exact
       * printing is not always in our table — 11 of 94 rows here. Pricing only
       * by id counts those as zero, which is why this tile read $2,318 while
       * /wishlist read $4,653 for the same cards. The wishlist page already
       * falls back to the name; this does the same so the two agree.
       */
      const unresolved = (wishlistRows ?? [])
        .filter(row => row?.card_name && !(row.card_id && row.card_id in priceByCardId))
        .map(row => row!.card_name as string);

      /*
       * Which printing to quote is `pickPrintingsByName`'s job, not this
       * hook's. This used to keep the DEAREST printing of each name while
       * /wishlist kept the CHEAPEST, so the two screens still disagreed after
       * the by-name fallback landed: $7,315.36 here against $7,314.94 there,
       * for the same rows, in the same session. Cheapest is the right answer
       * because a wishlist asks what buying the card would cost.
       */
      const priceByName: Record<string, number | null> = {};
      /* The id of that same chosen printing, so a row whose own printing we do
         not hold can still show the artwork of the one we quoted. Without it
         those rows are the only cards on the dashboard with no picture. */
      const idByName: Record<string, string> = {};
      if (unresolved.length > 0) {
        const { data: byName } = await supabase
          .from('cards')
          // `image_uris` is part of the choice: a printing with art beats one
          // without at the same price, and `pickPrintingsByName` cannot see
          // that if the column is not asked for.
          .select('id, name, prices, image_uris')
          .in('name', Array.from(new Set(unresolved)));

        for (const [key, card] of pickPrintingsByName(byName ?? [])) {
          priceByName[key] = wishlistUnitPrice(card);
          if (card.id) idByName[key] = card.id;
        }
      }

      let wishlistValue = 0;
      let wishlistDesired = 0;
      /* Rows the catalogue has no price for. The total is quietly lower than
         the truth without this number beside it, and a wishlist total that
         understates itself is the number people budget against. */
      let wishlistUnpriced = 0;
      const wanted: WantedCard[] = [];
      for (const row of wishlistRows ?? []) {
        if (!row) continue;
        const quantity = num(row.quantity, 1);
        // The name lookup is the fallback for a printing we do not hold, not a
        // second opinion on one we do. A row whose id resolved to a card with
        // no USD price stays unpriced, exactly as /wishlist shows it, rather
        // than quietly borrowing a different printing's price.
        const resolvedById = Boolean(row.card_id && row.card_id in priceByCardId);
        // Keyed lowercase, the same way `pickPrintingsByName` stores them.
        const key = row.card_name ? row.card_name.toLowerCase() : '';
        const unit = resolvedById
          ? priceByCardId[row.card_id!]
          : (key ? priceByName[key] : undefined) ?? null;
        if (unit === null || unit === undefined) wishlistUnpriced += 1;
        else wishlistValue += unit * quantity;
        wishlistDesired += quantity;
        wanted.push({
          id: row.id,
          cardId: resolvedById ? row.card_id! : (key ? idByName[key] : undefined) ?? null,
          name: row.card_name ?? null,
          quantity,
          priority: row.priority ?? null,
          unitUSD: unit ?? null,
        });
      }
      wishlistValue = Math.round(wishlistValue * 100) / 100;

      /* Cheapest first, because the question a wishlist answers on a dashboard
         is "what could I pick up next", and the cheapest wanted card is the
         easiest yes. Cards we hold no price for go last: an unknown price is
         not a low one. */
      wanted.sort((a, b) => {
        if (a.unitUSD === null) return b.unitUSD === null ? 0 : 1;
        if (b.unitUSD === null) return -1;
        return a.unitUSD - b.unitUSD;
      });

      setData({
        displayName: profile?.username?.trim() || user.email?.split('@')[0] || '',
        collection: {
          totalValueUSD: collectionValue,
          totalCards,
          unpricedCards: collectionUnpriced,
          uniqueCards: collectionRows?.length ?? 0,
          holdings,
        },
        wishlist: {
          totalItems: wishlistRows?.length ?? 0,
          totalDesired: wishlistDesired,
          valueUSD: wishlistValue,
          unpricedCards: wishlistUnpriced,
          wanted,
        },
        decks: {
          count: deckCount ?? 0,
          favoritesCount: favoriteCount ?? 0,
        },
      });
    } catch (err) {
      console.error('Error fetching dashboard summary:', err);
      setError('Could not load your dashboard data.');
      setData(prev => prev ?? EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    fetchSummary();
  }, [fetchSummary]);

  return { data, loading, error, refetch: fetchSummary };
}

/**
 * How well a card would stand in as a deck's face, for the decks that have no
 * commander to do it.
 *
 * The first version took whichever row `deck_cards` returned first, which gave
 * the "Lyra Dawnbringer angel-tribal" deck a banner of Phoenix Down. Price alone
 * is not much better: it made the same deck a Polluted Delta, because a fetch
 * land is the most expensive card in a budget angel list. What a player means by
 * "the card this deck is about" is almost always its best legendary creature —
 * the card it would run as a commander — so that ranks first, any creature
 * second, everything else last, and price breaks ties inside each band.
 */
function faceRank(typeLine: string | null, isLegendary: boolean | null): number {
  const line = (typeLine ?? '').toLowerCase();
  const creature = line.includes('creature');
  if (creature && isLegendary) return 3;
  if (creature) return 2;
  if (line.includes('planeswalker')) return 2;
  return 1;
}

export interface DeckSummary {
  id: string;
  name: string;
  format: string;
  colors: string[];
  /**
   * The canonical EDH power score, or `null` when this deck has not been scored
   * against its current list. Previously this was `num(row.power_level)` — the
   * legacy integer column — so the dashboard stamped "5.0" on the art of a deck
   * the /decks tile was showing as 6.3 in the same session.
   */
  power: DeckPower | null;
  updatedAt: string;
  cardCount: number;
  commanderName: string | null;
  /**
   * The exact printing chosen for the commander. Carried alongside the name so
   * the dashboard can show *that* printing's art rather than whichever reprint a
   * name lookup happens to land on.
   */
  commanderCardId: string | null;
  /**
   * The card whose art represents the deck: the commander, or failing that the
   * card `faceRank` picks out of the list. A deck without a commander (60-card
   * formats, or an EDH list still missing its helm) is still a pile of Magic
   * cards, and its centrepiece is a far better banner than an empty rectangle —
   * or than whichever row `deck_cards` happened to return first.
   */
  faceCardId: string | null;
  isFavorite: boolean;
  /**
   * Whether a current score exists for the list as it stands today. A stale
   * score counts as unscored, because the number it holds describes a deck that
   * no longer exists.
   */
  scored: boolean;
  /** What is unfinished about this deck, or nothing when it is ready to play. */
  work: DeckWork;
}

interface DeckRow {
  id: string;
  name: string;
  format: string;
  colors: string[] | null;
  edh_analysis: unknown;
  updated_at: string;
}

/**
 * Every deck the user has, newest first, enriched with the two facts a deck list
 * is useless without: how many cards are in it and (for Commander) who is at
 * the helm. Favourite state is folded in so the star toggle in the widget can
 * write straight back.
 *
 * The default limit went from 6 to 24 because the dashboard now asks this one
 * question twice: which decks did you touch last, and which of your decks are
 * unfinished. The second is nonsense over a window of six. The busiest real
 * account has fifteen decks, and the extra rows cost one `deck_cards` query that
 * was already being made.
 */
export function useRecentDecks(limit = 24) {
  const { user } = useAuth();
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDecks = useCallback(async () => {
    if (!user) {
      setDecks([]);
      setLoading(false);
      return;
    }

    try {
      setError(null);

      const [{ data: deckRows, error: deckError }, { data: favoriteRows }] = await Promise.all([
        supabase
          .from('user_decks')
          .select('id, name, format, colors, edh_analysis, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(limit),
        supabase.from('favorite_decks').select('deck_id').eq('user_id', user.id),
      ]);

      if (deckError) throw deckError;

      const rows = (deckRows ?? []) as DeckRow[];
      const favoriteIds = new Set((favoriteRows ?? []).map(row => row.deck_id));

      const cardCounts: Record<string, number> = {};
      const commanders: Record<string, { id: string | null; name: string }> = {};
      const faces: Record<string, string> = {};
      /** Per-deck lists, so the stored score can be checked against the real deck. */
      const lists: Record<string, Array<{ name: string; quantity: number }>> = {};
      /** Candidate face cards for decks with no commander, in list order. */
      const candidates: Record<string, string[]> = {};

      if (rows.length > 0) {
        const { data: cardRows } = await supabase
          .from('deck_cards')
          .select('deck_id, quantity, is_commander, is_sideboard, card_name, card_id')
          .in('deck_id', rows.map(row => row.id));

        for (const card of cardRows ?? []) {
          if (!card.is_sideboard) {
            cardCounts[card.deck_id] = (cardCounts[card.deck_id] ?? 0) + num(card.quantity, 1);
            (lists[card.deck_id] ??= []).push({
              name: card.card_name,
              quantity: num(card.quantity, 1),
            });
            if (card.card_id) (candidates[card.deck_id] ??= []).push(card.card_id);
          }
          if (card.is_commander && !commanders[card.deck_id]) {
            commanders[card.deck_id] = { id: card.card_id ?? null, name: card.card_name };
          }
        }

        const needFace = rows.filter(row => !commanders[row.id]).map(row => row.id);
        const faceIds = Array.from(
          new Set(needFace.flatMap(deckId => (candidates[deckId] ?? []).slice(0, 120)))
        );

        if (faceIds.length > 0) {
          const { data: faceRows } = await supabase
            .from('cards')
            .select('id, prices, type_line, is_legendary')
            .in('id', faceIds);

          const scoreById = new Map<string, { rank: number; price: number }>();
          for (const card of faceRows ?? []) {
            scoreById.set(card.id, {
              rank: faceRank(card.type_line, card.is_legendary),
              price: parseUsdPrice(card.prices),
            });
          }

          for (const deckId of needFace) {
            let best: string | null = null;
            let bestRank = -1;
            let bestPrice = -1;
            for (const cardId of candidates[deckId] ?? []) {
              const score = scoreById.get(cardId);
              if (!score) continue;
              if (score.rank > bestRank || (score.rank === bestRank && score.price > bestPrice)) {
                bestRank = score.rank;
                bestPrice = score.price;
                best = cardId;
              }
            }
            // Every candidate unknown (a deck of unsynced cards) still gets a face.
            if (!best) best = candidates[deckId]?.[0] ?? null;
            if (best) faces[deckId] = best;
          }
        }
      }

      setDecks(
        rows.map(row => {
          // Staleness is decided against the list we just loaded, so a deck
          // edited since it was scored is reported as outdated rather than
          // rendered as current.
          const power = deckPowerFromStored(
            (row.edh_analysis as { deckmatrix?: unknown } | null)?.deckmatrix,
            deckListHash(lists[row.id] ?? [])
          );
          const cardCount = cardCounts[row.id] ?? 0;
          const scored = Boolean(power && !power.stale);

          return {
            id: row.id,
            name: row.name,
            format: row.format,
            colors: Array.isArray(row.colors) ? row.colors : [],
            power,
            updatedAt: row.updated_at,
            cardCount,
            commanderName: commanders[row.id]?.name ?? null,
            commanderCardId: commanders[row.id]?.id ?? null,
            faceCardId: commanders[row.id]?.id ?? faces[row.id] ?? null,
            isFavorite: favoriteIds.has(row.id),
            scored,
            work: deckWork({
              format: row.format,
              cardCount,
              hasCommander: Boolean(commanders[row.id]),
              scored,
            }),
          };
        })
      );
    } catch (err) {
      console.error('Error fetching recent decks:', err);
      setError('Could not load your decks.');
    } finally {
      setLoading(false);
    }
  }, [user, limit]);

  const toggleFavorite = useCallback(
    async (deckId: string): Promise<boolean> => {
      if (!user) return false;

      const wasFavorite = decks.find(deck => deck.id === deckId)?.isFavorite ?? false;

      // Optimistic: the star is a direct-manipulation control, so it must not
      // wait on a round trip. Rolled back below if the write fails.
      setDecks(prev =>
        prev.map(deck => (deck.id === deckId ? { ...deck, isFavorite: !wasFavorite } : deck))
      );

      try {
        if (wasFavorite) {
          const { error: deleteError } = await supabase
            .from('favorite_decks')
            .delete()
            .eq('user_id', user.id)
            .eq('deck_id', deckId);
          if (deleteError) throw deleteError;
        } else {
          const { error: insertError } = await supabase
            .from('favorite_decks')
            .insert({ user_id: user.id, deck_id: deckId });
          if (insertError) throw insertError;
        }
        return !wasFavorite;
      } catch (err) {
        console.error('Error toggling favorite:', err);
        setDecks(prev =>
          prev.map(deck => (deck.id === deckId ? { ...deck, isFavorite: wasFavorite } : deck))
        );
        throw err;
      }
    },
    [user, decks]
  );

  useEffect(() => {
    setLoading(true);
    fetchDecks();
  }, [fetchDecks]);

  /*
   * THE SAME DECK SAID 5.3 ON /decks AND "Not scored yet" HERE.
   *
   * A summary carries whatever score was last persisted, and `/decks` runs
   * `useDeckPowerBackfill` to score the ones that have none. The dashboard read
   * the same stored field and did not, so a deck nobody had opened My Decks for
   * showed no score on the first screen a player sees and a real one on the
   * second. That is the split CLAUDE.md's design law calls out by name: one
   * canonical implementation, one accessor.
   *
   * It is the same hook, so it is the same number and the same write. The
   * dashboard asks for a handful of decks rather than the whole library, and
   * the hook caps a pass at twelve either way, so this is the cheapest place
   * in the product for that work to happen rather than the most expensive.
   */
  const applyScore = useCallback((deckId: string, power: DeckPower) => {
    setDecks(prev =>
      prev.map(deck =>
        deck.id === deckId
          ? {
              ...deck,
              power,
              /* `scored` and `work` are derived from the score, and both were
                 computed once when the row was fetched. Setting `power` alone
                 left the tile drawing the score AND the line "Not scored yet"
                 underneath it, which is worse than the bug it replaced: one
                 wrong figure became two figures contradicting each other on the
                 same tile. */
              scored: true,
              work: deckWork({
                format: deck.format,
                cardCount: deck.cardCount,
                hasCommander: Boolean(deck.commanderName),
                scored: true,
              }),
            }
          : deck
      )
    );
  }, []);

  useDeckPowerBackfill(decks, applyScore);

  return { decks, loading, error, toggleFavorite, refetch: fetchDecks };
}
