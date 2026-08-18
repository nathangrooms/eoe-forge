/**
 * One mana-curve maths module.
 *
 * The deck tile and the analysis modal each reimplemented the bucket-midpoint
 * average with different denominators, so the same deck reported two different
 * numbers in two places — 3.21 on the tile and 2.14 in the modal opened from
 * that tile. Both now call this.
 */

export const CURVE_BINS = ['0-1', '2', '3', '4', '5', '6-7', '8-9', '10+'] as const;
export type CurveBin = (typeof CURVE_BINS)[number];

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
