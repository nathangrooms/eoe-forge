import { categorizeCard } from '@/lib/deck/cardCategories';
import type { DeckCardRow } from '@/lib/deck/deckCards';
import type { Card as StoreCard } from '@/stores/deckStore';

/**
 * The deck, shaped for the panels that were written against the builder's store.
 *
 * ## Why this is a module and not a `useMemo` on one page
 *
 * It was a forty-line mapping inside `DeckInterface`, which was correct while
 * that page was the only thing mounting those panels. The optimiser is a route
 * of its own now, and it feeds the same panel the same deck, so the mapping had
 * to become one thing rather than two — a second copy starts identical and
 * drifts on the first field anybody adds, and this file has already been the
 * scene of exactly that.
 *
 * ## The one field that is a bug fix rather than a shape
 *
 * `legalities` is in here. `DeckLegalityChecker` reads `card.legalities` at six
 * places and the original mapping did not carry the field at all, so the
 * validation panel could never report a banned card while the builder's copy of
 * the same panel could. That was the one figure where the builder's input was
 * the better one, and it is why the merge read both files rather than assuming.
 */
export function toAnalyticsCards(rows: DeckCardRow[]): StoreCard[] {
  return rows
    .filter(row => !row.is_sideboard)
    .map(
      row =>
        ({
          id: row.card_id,
          name: row.card?.name || row.card_name,
          cmc: row.card?.cmc ?? 0,
          type_line: row.card?.type_line || '',
          colors: row.card?.colors ?? [],
          color_identity: row.card?.color_identity ?? [],
          oracle_text: row.card?.oracle_text ?? '',
          power: row.card?.power ?? undefined,
          toughness: row.card?.toughness ?? undefined,
          rarity: row.card?.rarity ?? undefined,
          mana_cost: row.card?.mana_cost ?? undefined,
          set: row.card?.set_code ?? undefined,
          set_name: row.card?.set_code ?? undefined,
          // The legality check reads this and nothing else. Without it the
          // panel reported no banned cards for every deck, including one
          // holding a banned card.
          legalities: row.card?.legalities ?? undefined,
          keywords: row.card?.keywords ?? [],
          // Budget and value panels read `prices.usd` off the card.
          prices: row.card?.prices ?? undefined,
          image_uris: row.card?.image_uris ?? undefined,
          quantity: row.quantity,
          category: categorizeCard(row.card?.type_line, {
            isCommander: row.is_commander,
          }) as StoreCard['category'],
          mechanics: row.card?.keywords ?? [],
          // Archetype detection counts role tags and nothing else.
          tags: row.card?.tags ?? [],
          /* Carried because the row already holds them. A panel that wants to
             say "reserved list", "the 200th most played card in Commander" or
             "this land makes blue" should not go back to the database for a
             column that came down with the deck. See `DeckCardDetail`. */
          oracle_id: row.card?.oracle_id ?? undefined,
          edhrec_rank: row.card?.edhrec_rank ?? undefined,
          is_reserved: row.card?.is_reserved ?? false,
          produced_mana: row.card?.produced_mana ?? [],
          /* The printing id, kept apart from `id` for the surfaces that draw
             the card: `CardImage` falls back to a Scryfall path built from it. */
          card_id: row.card_id,
        }) as unknown as StoreCard
    );
}

/** The commander, as the panels see it. */
export function analyticsCommanderOf(cards: StoreCard[]): StoreCard | undefined {
  return cards.find(card => card.category === 'commanders');
}

/** The ninety-nine — what every analysis panel treats as the deck proper. */
export function mainboardOf(cards: StoreCard[]): StoreCard[] {
  return cards.filter(card => card.category !== 'commanders');
}
