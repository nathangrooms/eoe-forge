/**
 * The opening hand, computed exactly.
 *
 * WHAT THIS REPLACES
 * ------------------
 * The deck page showed three figures under the heading "Opening-hand
 * simulation, 10,000 seeded draws". They came from
 * `deckbuilder/score/simulation.ts`, which shuffled with
 *
 *     state = (state * 1103515245 + 12345) & 0x7fffffff
 *
 * In JavaScript that product reaches 2^61 for a 31-bit state, well past the 53
 * bits a double carries exactly, so the low bits are gone before the mask sees
 * them. The generator cycles after 15,824 distinct states. A Fisher-Yates pass
 * over a 99-card deck consumes 98 of them, so the advertised ten thousand draws
 * were about 161 distinct opening hands, each counted roughly sixty times. The
 * figures were not merely approximate; the sample size on the label was wrong
 * by a factor of sixty.
 *
 * None of these quantities needed sampling in the first place. Drawing seven
 * cards from a known library is a hypergeometric, and this file computes it
 * with the exact BigInt path already sitting in `castability.ts`.
 *
 * WHAT IS AND IS NOT MODELLED
 * ---------------------------
 * Stated plainly, because a confident wrong number is worse than a missing one:
 *
 *   - "Keepable" here means two to five lands in the seven. That is the
 *     standard rule of thumb and nothing more. It does not know whether the
 *     spells in the hand are castable, whether the lands make the right
 *     colours, or whether you are on the play. Anything cleverer would be a
 *     judgement dressed as a measurement.
 *   - Mulligans are not modelled. This is the first seven.
 *   - A mana rock in the opener is not counted as a land, because you cannot
 *     play it on turn one for free.
 */

import { hypergeometricAtLeast, type ManaProfile } from './castability.ts';

/** Cards in an opening hand. */
export const OPENING_HAND = 7;

/** Lands below which a hand is a mulligan, and above which it is flooded. */
export const KEEPABLE_LAND_RANGE = { min: 2, max: 5 } as const;

/**
 * P(the opening seven holds between two and five lands), as a percentage.
 *
 * Computed as the difference of two upper tails, which keeps it inside the
 * exact BigInt path rather than summing floating-point terms.
 */
export function keepableSevenPct(librarySize: number, landCount: number): number | null {
  if (librarySize < OPENING_HAND || landCount < 0 || landCount > librarySize) return null;
  const atLeastMin = hypergeometricAtLeast(
    librarySize,
    landCount,
    OPENING_HAND,
    KEEPABLE_LAND_RANGE.min
  );
  const tooMany = hypergeometricAtLeast(
    librarySize,
    landCount,
    OPENING_HAND,
    KEEPABLE_LAND_RANGE.max + 1
  );
  return Math.max(0, Math.min(1, atLeastMin - tooMany)) * 100;
}

/**
 * P(the opening seven holds exactly `k` lands), for every k from 0 to 7.
 *
 * Shares of one, summing to one. Same difference-of-tails trick as
 * {@link keepableSevenPct}, so every bar is the exact BigInt figure and the
 * bars and the roll-up above them cannot disagree.
 *
 * This exists because the playtest tab was sampling it. `/simulate` ran 4,000
 * Fisher-Yates draws to draw the same histogram and to report the same "two to
 * five lands" percentage the deck page computes exactly here, so one deck had
 * two answers to one question and the sampled one moved every time it was
 * opened. Sampling a hypergeometric is the exact thing this module was written
 * to stop.
 */
export function openingLandDistribution(
  librarySize: number,
  landCount: number
): number[] | null {
  if (librarySize < OPENING_HAND || landCount < 0 || landCount > librarySize) return null;

  // `hypergeometricAtLeast` returns 1 for k <= 0, so tail[0] is P(at least 0).
  const tail: number[] = [];
  for (let k = 0; k <= OPENING_HAND + 1; k++) {
    tail.push(hypergeometricAtLeast(librarySize, landCount, OPENING_HAND, k));
  }

  const pmf: number[] = [];
  for (let k = 0; k <= OPENING_HAND; k++) pmf.push(Math.max(0, tail[k] - tail[k + 1]));
  return pmf;
}

/**
 * P(the opening seven holds at least one land that makes a colour), as a
 * percentage.
 *
 * "Makes a colour" means a source whose colour mask is not empty and which is
 * available on turn one, so a Wastes and a Signet are both excluded: one makes
 * no colour, the other is not a land.
 */
export function turnOneColourPct(profile: ManaProfile): number | null {
  if (profile.librarySize < OPENING_HAND) return null;
  const colouredLands = profile.sources.filter(
    s => s.kind === 'land' && s.colourMask !== 0 && s.onlineTurn <= 1
  ).length;
  return hypergeometricAtLeast(profile.librarySize, colouredLands, OPENING_HAND, 1) * 100;
}

/**
 * P(at least one source of a given colour has been seen by the end of turn
 * `turn`), as a percentage.
 *
 * On the play you have seen `7 + (turn - 1)` cards. That is the same convention
 * `castability` uses, so the two figures are quoted against the same draw.
 */
export function colourByTurnPct(
  profile: ManaProfile,
  colourSourceCount: number,
  turn: number
): number | null {
  if (profile.librarySize < OPENING_HAND) return null;
  const seen = Math.min(profile.librarySize, OPENING_HAND + Math.max(0, turn - 1));
  return hypergeometricAtLeast(profile.librarySize, colourSourceCount, seen, 1) * 100;
}
