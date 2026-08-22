/**
 * One mana-curve maths module.
 *
 * The deck tile and the analysis modal each reimplemented the bucket-midpoint
 * average with different denominators, so the same deck reported two different
 * numbers in two places — 3.21 on the tile and 2.14 in the modal opened from
 * that tile. Both now call this.
 *
 * There are two averages in here and they are not interchangeable:
 *
 *   `averageManaValue`      approximate, from the stored eight-bucket curve
 *   `deckAverageManaValue`  exact, from a decklist that has its cards in hand
 *
 * Reach for the exact one whenever you hold the rows. The approximation exists
 * for the surfaces that only ever receive `compute_deck_summary`'s buckets.
 */
import { categorizeCard } from './cardCategories.ts';

export const CURVE_BINS = ['0-1', '2', '3', '4', '5', '6-7', '8-9', '10+'] as const;
export type CurveBin = (typeof CURVE_BINS)[number];

/**
 * The least a row has to carry for the exact average to be computable.
 *
 * Structural rather than `DeckCardRow` so that a caller holding something
 * close-but-not-identical does not have to fabricate a row to ask the
 * question. `DeckCardRow` satisfies it as it stands.
 */
export interface ManaValueRow {
  quantity?: number | null;
  is_commander?: boolean | null;
  is_sideboard?: boolean | null;
  card?: { type_line?: string | null; cmc?: number | null } | null;
}

/**
 * Average mana value, exactly, over the cards a deck actually holds.
 *
 * The rule, and it is the same rule `ManaCurve` plots to, which is the whole
 * point of it living in one place:
 *
 *   the sideboard is not the deck
 *   the commander is not in the average — it is always available, so counting
 *     it says nothing about what the deck draws
 *   lands have no mana value to average
 *   a card counts once per copy
 *
 * The deck page and the public deck page both print this figure beside the
 * curve, and before this they printed two different numbers for one deck: the
 * public page averaged bucket midpoints, which reads a deck of nothing but
 * two-drops as 2.00 and a deck of nothing but ones as 0.50.
 */
export function deckAverageManaValue(rows: readonly ManaValueRow[]): number {
  let copies = 0;
  let weighted = 0;

  for (const row of rows) {
    if (row.is_sideboard) continue;
    const category = categorizeCard(row.card?.type_line, {
      isCommander: Boolean(row.is_commander),
    });
    if (category === 'commanders' || category === 'lands') continue;

    const quantity = Number(row.quantity ?? 1);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const cmc = Number(row.card?.cmc ?? 0);
    copies += quantity;
    weighted += (Number.isFinite(cmc) ? cmc : 0) * quantity;
  }

  return copies > 0 ? weighted / copies : 0;
}

/** Representative mana value for a bucket. */
const BIN_MIDPOINT: Record<string, number> = {
  '0-1': 0.5,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6-7': 6.5,
  '8-9': 8.5,
  '10+': 10,
};

export function normalizeCurve(
  bins: Record<string, number> | null | undefined
): Array<{ bin: CurveBin; count: number }> {
  return CURVE_BINS.map(bin => ({ bin, count: Number(bins?.[bin] ?? 0) }));
}

/**
 * Average mana value excluding lands — the convention every MTG site uses.
 *
 * The stored curve counts lands in the `0-1` bucket, so they are removed from
 * that bucket before averaging. This is an approximation off bucketed data,
 * which is why it is labelled "Avg MV" with a tooltip rather than presented as
 * an exact figure.
 */
export function averageManaValue(
  bins: Record<string, number> | null | undefined,
  landCount = 0
): number {
  const entries = normalizeCurve(bins);
  const nonLandLow = Math.max(entries[0].count - landCount, 0);

  let weighted = nonLandLow * BIN_MIDPOINT['0-1'];
  let cards = nonLandLow;

  for (const { bin, count } of entries.slice(1)) {
    weighted += BIN_MIDPOINT[bin] * count;
    cards += count;
  }

  return cards > 0 ? weighted / cards : 0;
}
