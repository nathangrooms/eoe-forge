/**
 * Statistical association between two cards.
 *
 * WHY NOT RAW CO-OCCURRENCE
 * -------------------------
 * Measured on the real 184-deck corpus, the top co-occurring pairs are:
 *
 *   170  Command Tower + Sol Ring
 *   131  Arcane Signet + Sol Ring
 *   129  Arcane Signet + Command Tower
 *
 * These are not synergies, they are staples. Sol Ring is in 181 of 184 decks,
 * so it co-occurs with everything. A raw count ranks ubiquity, not affinity.
 *
 * WHY THE DENOMINATOR MUST BE COLOUR-CONDITIONED
 * ----------------------------------------------
 * Normalising by overall frequency (plain lift/PMI) fixes the staple problem —
 * Command Tower + Sol Ring drops to lift 1.01, correctly meaning "no
 * association". But it introduces a second, subtler confound. Scored against
 * all 184 decks, the strongest pairs come out as:
 *
 *   Canopy Vista + Fortified Village
 *   Port Town + Prairie Stream
 *   Thriving Heath + Thriving Isle
 *
 * Dual lands from the same colour pair. They co-occur because a deck that can
 * play one can play the other — that is colour identity leaking through as if
 * it were synergy.
 *
 * Conditioning the denominator on the decks that could *legally* play both
 * cards removes it. The same corpus then yields, at the top:
 *
 *   Abzan Falconer + Inspiring Call      (+1/+1 counters)
 *   Bred for the Hunt + Hardened Scales  (+1/+1 counters)
 *   Grapple with the Past + Grisly Salvage (graveyard)
 *   Rampaging Baloths + Seer's Sundial   (landfall)
 *
 * Those are real. That is the whole justification for this module.
 *
 * Pure functions. All inputs are plain numbers.
 */

/**
 * Minimum decks-together before a co-occurrence figure is called significant.
 *
 * At 2, the corpus produces 91,242 qualifying pairs and most are noise — two
 * cards printed in the same precon and its one reprint. At 5 there are 4,702,
 * and only 1,040 of those have a non-land on both sides. This is the single
 * most consequential number in the engine, so it is named and exported rather
 * than buried.
 */
export const MIN_SUPPORT = 3;

/**
 * Minimum colour-eligible decks before a rate is trustworthy.
 *
 * A five-colour card is eligible in all 184 decks; a WUBRG-identity card is
 * eligible in very few. Below this floor the denominator is too small for the
 * ratio to mean anything.
 */
export const MIN_ELIGIBLE = 8;

export interface Association {
  /** Decks containing both. */
  together: number;
  /** Decks that could legally play both. */
  eligible: number;
  /** Observed joint rate over the product of marginal rates. 1 = independent. */
  lift: number;
  /** Normalised PMI, roughly −1…1. 0 = independent, 1 = always together. */
  npmi: number;
  /** Whether the counts clear both floors. */
  significant: boolean;
}

/**
 * Colour-identity-conditioned association.
 *
 * `eligibleA` / `eligibleB` are the decks that could play each card alone;
 * `eligibleBoth` the decks that could play both. Marginal rates are computed
 * against each card's own eligible set, which is what stops a mono-white card
 * from looking rare merely because most decks are not white.
 */
export function associate(
  together: number,
  freqA: number,
  freqB: number,
  eligibleA: number,
  eligibleB: number,
  eligibleBoth: number
): Association {
  const insufficient: Association = {
    together,
    eligible: eligibleBoth,
    lift: 1,
    npmi: 0,
    significant: false,
  };

  if (eligibleBoth <= 0 || eligibleA <= 0 || eligibleB <= 0) return insufficient;
  if (together <= 0) return { ...insufficient, lift: 0, npmi: -1 };

  const pA = Math.min(freqA / eligibleA, 1);
  const pB = Math.min(freqB / eligibleB, 1);
  const pJoint = Math.min(together / eligibleBoth, 1);

  if (pA <= 0 || pB <= 0) return insufficient;

  const lift = pJoint / (pA * pB);
  // NPMI: PMI divided by −log(joint), bounding it to roughly −1…1 so a pair
  // seen 5/5 times does not outrank a pair seen 40/50 by two orders of
  // magnitude the way raw lift does.
  const npmi = pJoint >= 1 ? 1 : Math.log(lift) / -Math.log(pJoint);

  return {
    together,
    eligible: eligibleBoth,
    lift,
    npmi,
    significant: together >= MIN_SUPPORT && eligibleBoth >= MIN_ELIGIBLE,
  };
}

/**
 * Turn an association into a 0–1 score.
 *
 * Two corrections are applied on top of NPMI:
 *
 * 1. **Shrinkage toward zero at low support.** A pair seen 3 times together out
 *    of 3 possible has NPMI 1.0, the same as a pair seen 40/40, but nothing
 *    like the same evidence. The multiplier `n / (n + k)` pulls small samples
 *    down. With k = 6, support 3 keeps a third of its score, support 20 keeps
 *    77%. This is why the top of the raw NPMI list — pairs of cards that appear
 *    in exactly the same four decks because they were printed in the same
 *    precon and its reprint — does not dominate the output.
 *
 * 2. **Negative associations floor at zero.** "These two are rarely played
 *    together" is a real signal but not one this engine claims to measure; the
 *    corpus is far too small to distinguish anti-synergy from absence.
 */
export function associationScore(association: Association, shrinkage = 6): number {
  if (!association.significant) return 0;
  if (association.npmi <= 0) return 0;
  const support = association.together;
  const damped = support / (support + shrinkage);
  return clamp01(association.npmi * damped);
}

/**
 * How much a co-occurrence figure should be believed, 0–1.
 *
 * Reported separately from the score so a caller can render "5 of 46 decks" and
 * a weak-evidence badge rather than a bare number that reads as authoritative.
 */
export function associationConfidence(association: Association): number {
  if (!association.significant) return 0;
  const bySupport = association.together / (association.together + 10);
  const byEligible = Math.min(association.eligible / 40, 1);
  return clamp01(bySupport * 0.7 + byEligible * 0.3);
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
