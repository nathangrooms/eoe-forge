/* Relative imports carry their `.ts` extension so this module runs unchanged
   under `node --test --experimental-strip-types`. Same convention, same reason,
   as `deckCardFilters.ts` and `deckLegality.ts`: money arithmetic is exactly
   the part worth testing without a browser. */
import type { DeckCardRow } from './deckCards.ts';

/**
 * What a deck costs, broken into the four questions a player is actually asking.
 *
 * ## Why this is a module
 *
 * The Value tab printed one figure: the market value of the whole list. The
 * census called it *"the tab with the biggest gap between what is on screen and
 * what is in the database"*, and the gap is not that the figure is wrong. It is
 * that the figure answers a question nobody has. Standing on that tab, a player
 * is deciding one of these:
 *
 * 1. **What is this deck worth?** The market total. The one thing it did print.
 * 2. **What do I still have to buy?** Copies you do not own, priced. The
 *    ownership data was already loading on the page — `useCollectionOwnership`
 *    runs on every deck load — and this tab went back to the database for its
 *    own copy of it and then never crossed the two.
 * 3. **Could it be cheaper?** Every card exists in several printings and they
 *    differ enormously. `oracle_id` came down with the deck and
 *    `card_printing_spread` holds the range. "$888, or $611 at the cheapest
 *    printing of everything" is a headline neither Moxfield nor Archidekt
 *    gives away.
 * 4. **What if I proxy the expensive half?** The actual decision on this
 *    screen. The proxy pipeline was already here, per card, and there was no
 *    figure for what proxying everything over $20 would save.
 *
 * Plus one fact the catalogue holds and nobody surfaced: a reserved-list card
 * will not be reprinted, so it is the part of the bill that is not going to
 * come down.
 *
 * ## Copies count, and unpriced is not zero
 *
 * Both rules are paid for. `DeckBudgetTracker` summed `prices.usd` once per
 * distinct card with no `quantity` anywhere in the file, which was almost right
 * for singleton Commander and badly wrong for anything with four-ofs. And a
 * missing price added as zero told a player the deck was cheaper to finish than
 * it is, which is the one direction a shopping total must never be wrong in.
 * Every figure here counts copies, and every figure carries the count of what
 * it could not price.
 */

/** What every printing of one card costs. Matches `PrintingSpread`'s shape. */
export interface SpreadLike {
  usdMin: number | null;
  usdMax: number | null;
  printings: number;
}

export interface DeckValueLine {
  row: DeckCardRow;
  name: string;
  copies: number;
  /** USD for the printing this row points at, or null when we hold no price. */
  unit: number | null;
  /** `unit * copies`. */
  total: number | null;
  /** Copies of this card in your collection, capped at what the deck needs. */
  owned: number;
  /** Copies still to buy. */
  needed: number;
  /** What those copies cost at this printing's price. */
  neededCost: number | null;
  /** The cheapest printing of this card, when the spread is known. */
  cheapestUnit: number | null;
  /** How many printings the catalogue holds. */
  printings: number;
  reserved: boolean;
  rarity: string;
}

export interface DeckValueSummary {
  /** Market value of every copy in the deck. The headline. */
  total: number;
  /** Rows we hold no price for, so every figure here is a floor. */
  unpricedRows: number;
  unpricedCopies: number;

  /** Value of the copies you already own. */
  ownedValue: number;
  ownedCopies: number;
  /** Value of the copies you still need. */
  toFinish: number;
  neededCopies: number;
  /** Rows you still need and cannot price. */
  toFinishUnpricedRows: number;

  /** The deck at the cheapest printing of every card, where the spread is known. */
  cheapestTotal: number | null;
  /** `total - cheapestTotal`, when both are known. */
  savingAtCheapest: number | null;
  /** Rows whose printing spread we could not read. */
  spreadUnknownRows: number;

  reservedRows: number;
  reservedValue: number;

  /** Copies you still need that cost more than the threshold, each. */
  proxyCards: number;
  proxySaving: number;

  /** The five stacks that cost the most to assemble. */
  topLines: DeckValueLine[];
  byRarity: Record<string, number>;
}

/** Above this, per copy, a card is worth proxying rather than buying. */
export const DEFAULT_PROXY_THRESHOLD = 20;

function priceOf(row: DeckCardRow): number | null {
  const raw = row.card?.prices?.usd;
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
}

export interface DeckValueInput {
  /** Every non-sideboard row, the commander included. */
  rows: readonly DeckCardRow[];
  /**
   * Copies owned, keyed by lower-cased card name.
   *
   * By name rather than by id, which is the same rule `useCollectionOwnership`
   * applies and for the same reason: "do I own this card in any printing" is
   * the question a deck builder is asking, and a Sol Ring is a Sol Ring.
   */
  ownedByName?: ReadonlyMap<string, number>;
  /** Printing spreads by oracle id, from `fetchPrintingSpreads`. */
  spreads?: ReadonlyMap<string, SpreadLike>;
}

export function deckValueLines(input: DeckValueInput): DeckValueLine[] {
  const owned = input.ownedByName;
  const spreads = input.spreads;

  /* Ownership is spent as the rows are walked, so two rows pointing at two
     printings of one card cannot both claim the same copy out of the box. A
     naive per-row lookup would say you own two Sol Rings when you own one. */
  const remaining = new Map<string, number>();
  if (owned) for (const [key, n] of owned) remaining.set(key, n);

  return input.rows
    .filter(row => !row.is_sideboard)
    .map(row => {
      const name = row.card?.name || row.card_name;
      const key = name.trim().toLowerCase();
      const copies = Math.max(1, row.quantity);
      const unit = priceOf(row);

      const have = remaining.get(key) ?? 0;
      const ownedHere = Math.min(have, copies);
      if (owned) remaining.set(key, have - ownedHere);
      const needed = copies - ownedHere;

      const spread = row.card?.oracle_id ? spreads?.get(row.card.oracle_id) : undefined;

      return {
        row,
        name,
        copies,
        unit,
        total: unit === null ? null : unit * copies,
        owned: ownedHere,
        needed,
        neededCost: unit === null ? null : unit * needed,
        /* `usdMin` can be above the printing in the deck when the deck holds a
           printing we hold no price for, and it can be null when no printing of
           the card is priced. Neither is an error and neither is zero. */
        cheapestUnit: spread?.usdMin ?? null,
        printings: spread?.printings ?? 1,
        reserved: row.card?.is_reserved ?? false,
        rarity: row.card?.rarity ?? 'unknown',
      };
    });
}

export function summariseDeckValue(
  lines: readonly DeckValueLine[],
  options: { proxyThreshold?: number } = {}
): DeckValueSummary {
  const threshold = options.proxyThreshold ?? DEFAULT_PROXY_THRESHOLD;

  let total = 0;
  let unpricedRows = 0;
  let unpricedCopies = 0;
  let ownedValue = 0;
  let ownedCopies = 0;
  let toFinish = 0;
  let neededCopies = 0;
  let toFinishUnpricedRows = 0;
  let cheapestTotal = 0;
  let spreadUnknownRows = 0;
  let reservedRows = 0;
  let reservedValue = 0;
  let proxyCards = 0;
  let proxySaving = 0;
  const byRarity: Record<string, number> = {};

  for (const line of lines) {
    if (line.unit === null) {
      unpricedRows += 1;
      unpricedCopies += line.copies;
      if (line.needed > 0) toFinishUnpricedRows += 1;
    } else {
      total += line.total ?? 0;
      ownedValue += line.unit * line.owned;
      toFinish += line.unit * line.needed;
      byRarity[line.rarity] = (byRarity[line.rarity] ?? 0) + (line.total ?? 0);
      if (line.reserved) {
        reservedRows += 1;
        reservedValue += line.total ?? 0;
      }
      /* Only copies you still have to buy can be proxied INSTEAD of bought.
         Counting a card you already own as a saving would be telling a player
         they can save money by not buying something they have. */
      if (line.needed > 0 && line.unit > threshold) {
        proxyCards += line.needed;
        proxySaving += line.unit * line.needed;
      }
    }

    ownedCopies += line.owned;
    neededCopies += line.needed;

    /* The cheapest-printing total falls back to the price in the deck when the
       spread is unknown, and the row is counted so the figure can say how much
       of it is a fallback. Dropping those rows would make the cheapest total
       look like a bigger saving than it is, which is the wrong direction. */
    if (line.cheapestUnit !== null) {
      cheapestTotal += line.cheapestUnit * line.copies;
    } else {
      spreadUnknownRows += 1;
      cheapestTotal += line.total ?? 0;
    }
  }

  const topLines = [...lines]
    .filter(line => (line.total ?? 0) > 0)
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
    .slice(0, 5);

  const known = lines.some(line => line.cheapestUnit !== null);

  return {
    total,
    unpricedRows,
    unpricedCopies,
    ownedValue,
    ownedCopies,
    toFinish,
    neededCopies,
    toFinishUnpricedRows,
    cheapestTotal: known ? cheapestTotal : null,
    /* Never negative. A deck already holding the cheapest printing of
       everything saves nothing, and a rounding artefact reading "-$0.02 saved"
       would be worse than a zero. */
    savingAtCheapest: known ? Math.max(0, total - cheapestTotal) : null,
    spreadUnknownRows,
    reservedRows,
    reservedValue,
    proxyCards,
    proxySaving,
    topLines,
    byRarity,
  };
}
