/**
 * How much a shared role tag actually tells you.
 *
 * `cards.tags` carries 76 names but only 66 distinct ideas, and those ideas are
 * wildly unequal in size: `etb` is on 4,622 cards and `storm` is on 40. A
 * consumer that ranks by the *count* of shared tags therefore ranks by the
 * count of shared platitudes — two cards both "enter the battlefield" is not a
 * synergy, two cards both counting Storm is.
 *
 * This module turns a raw tag array into a scoring signal, in three steps.
 *
 * 1. **Drop the aliases.** `TAG_RULES` emits legacy names beside the canonical
 *    one so existing readers keep working: a sacrifice outlet carries
 *    `sacrifice-outlet`, `sac-outlet` AND `sacrifice`, and carried a fourth
 *    spelling, `sac_outlet`, until the readers converged. Counting raw overlap
 *    therefore scored one idea three or four times, and made "both of these can
 *    sacrifice something" worth more than "both of these are Storm payoffs".
 *    The alias set is derived from `TAG_RULES` at module load, never
 *    hand-listed, so a new alias cannot reintroduce the double count.
 * 2. **Drop the tags that say nothing.** Card types restate the type line, and
 *    `etb` / `evasion` are true of roughly one card in eight — see the measured
 *    table below. They are kept in the database (the deck builder's blink and
 *    flier quotas need them) and excluded only from *ranking*.
 * 3. **Weight what is left by rarity.** `log2(total / cards carrying the tag)`,
 *    the standard inverse-document-frequency measure. A shared `storm` is worth
 *    9.7; a shared `ramp` is worth 4.0.
 *
 * Pure and dependency-free apart from `TAG_RULES`. No network, no database.
 */

import { TAG_RULES } from './tagger.ts';

/* ------------------------------------------------------------------ *
 * Measured corpus statistics
 * ------------------------------------------------------------------ */

/**
 * Rows in `cards` when the table below was measured.
 *
 * Measured 2026-08-18 against the live catalogue, after the role re-tag and
 * after `sacrifice-outlet` was narrowed to exclude self-sacrifice, with:
 *
 *   select t.tag, count(*) from cards c, unnest(c.tags) t(tag) group by t.tag;
 *   select count(*) from cards;
 *
 * These are counts, not estimates. Re-run both queries after a bulk re-tag or a
 * set import and paste the results back; `tag-signal.test.ts` fails if any rule
 * or alias has no measurement here.
 */
export const TAGGED_CARD_TOTAL = 34088;

/**
 * Cards carrying each alias, measured the same way.
 *
 * An alias is a second name for a canonical tag, so its count is its
 * canonical's — except `removal`, which two rules emit and which is genuinely
 * their union (3,416 spot removal plus 638 sweepers, less the overlap).
 *
 * These belong here because callers legitimately use the legacy names:
 * `ArchetypeDetection` counts `tokens` and `removal-spot`, the deck builder's
 * templates quota on `sac-outlet` and `wincon`. With no measurement those
 * lookups return a baseline of zero, and a threshold divided by zero never
 * fires — which is exactly how the two detectors keyed to `tokens` and
 * `removal-spot` would have been switched off silently.
 *
 * `signalTags` still strips aliases before *ranking*, which is the only place
 * counting one idea twice does damage.
 */
const ALIAS_CARD_COUNT: Readonly<Record<string, number>> = {
  removal: 4010,
  tokens: 3594,
  draw: 3422,
  'removal-spot': 3416,
  recursion: 1574,
  auras: 1304,
  wincon: 750,
  'sac-outlet': 724,
  sacrifice: 724,
  'removal-sweeper': 638,
};

/** Cards carrying each canonical tag. */
const CANONICAL_CARD_COUNT: Readonly<Record<string, number>> = {
  creature: 18827,
  etb: 4622,
  evasion: 4412,
  instant: 3953,
  artifact: 3922,
  enchantment: 3838,
  sorcery: 3764,
  'token-maker': 3594,
  'card-draw': 3422,
  'targeted-removal': 3416,
  counters: 2881,
  ramp: 2140,
  lifegain: 2063,
  'graveyard-recursion': 1574,
  land: 1410,
  aura: 1304,
  voltron: 1243,
  protection: 806,
  finisher: 750,
  'sacrifice-outlet': 724,
  'mass-pump': 702,
  flash: 674,
  'discard-outlet': 663,
  equipment: 647,
  'board-wipe': 638,
  'x-spell': 572,
  mill: 557,
  'tribal-payoff': 504,
  stax: 501,
  aristocrats: 476,
  'lands-matter': 470,
  discard: 469,
  'mana-dork': 465,
  'haste-enabler': 450,
  bounce: 429,
  counterspell: 428,
  tutor: 409,
  treasure: 383,
  reanimator: 371,
  untapper: 342,
  spellslinger: 341,
  'mana-rock': 340,
  planeswalker: 333,
  'tutor-narrow': 309,
  'artifacts-matter': 252,
  landfall: 219,
  'graveyard-hate': 207,
  vehicle: 204,
  blink: 198,
  'cost-reduction': 170,
  'land-destruction': 144,
  clone: 141,
  infect: 136,
  prowess: 115,
  proliferate: 101,
  'tutor-broad': 101,
  'enchantments-matter': 69,
  'self-mill': 66,
  'group-hug': 60,
  'extra-turn': 56,
  'extra-combat': 47,
  cascade: 42,
  storm: 40,
  'fast-mana': 38,
  battle: 36,
  'basic-land': 22,
};

/** Every measured tag name, canonical and legacy alike. */
export const TAG_CARD_COUNT: Readonly<Record<string, number>> = {
  ...CANONICAL_CARD_COUNT,
  ...ALIAS_CARD_COUNT,
};

/* ------------------------------------------------------------------ *
 * Which tags carry a signal
 * ------------------------------------------------------------------ */

/** Tags that only restate the card's type — useless as a synergy signal. */
export const TYPE_TAGS: ReadonlySet<string> = new Set([
  'creature',
  'instant',
  'sorcery',
  'artifact',
  'enchantment',
  'land',
  'basic-land',
  'planeswalker',
  'battle',
]);

/**
 * True of so many cards that a match means nothing.
 *
 * `etb` covers 13.6% of the catalogue and `evasion` 12.9% (every flier, every
 * menace creature). Ranking by shared-tag count put Elvish Harbinger, Timeless
 * Witness and Hunted Troll in Craterhoof Behemoth's list purely because all of
 * them have an enters-the-battlefield trigger, while Pathbreaker Ibex and
 * Beastmaster Ascension — the cards that do what Craterhoof does — were
 * nowhere in it.
 *
 * The rarity weighting alone would already push these down — but they are also
 * used to *choose* which tags to query on, and a query for `etb` returns an
 * arbitrary 60 of 4,622 rows. Excluding them outright is both cheaper and
 * clearer to explain in the UI.
 */
export const LOW_INFORMATION_TAGS: ReadonlySet<string> = new Set(['etb', 'evasion']);

/**
 * Every tag that exists only as a legacy alias of another rule's tag.
 *
 * Derived, not written down: the union of every rule's `also` list minus the
 * set of canonical tags. `lands-matter` appears in `landfall`'s `also` and is
 * also a rule in its own right, so it correctly survives as canonical.
 */
export const ALIAS_TAGS: ReadonlySet<string> = (() => {
  const canonical = new Set(TAG_RULES.map((r) => r.tag));
  const aliases = new Set<string>();
  for (const rule of TAG_RULES) {
    for (const alias of rule.also ?? []) {
      if (!canonical.has(alias)) aliases.add(alias);
    }
  }
  return aliases;
})();

/* ------------------------------------------------------------------ *
 * Weighting
 * ------------------------------------------------------------------ */

/**
 * Weight for a tag we have never measured.
 *
 * A new rule ships before the next corpus measurement, and neither extreme is
 * acceptable: treating it as unique would let it dominate every list, treating
 * it as universal would silence it. The median measured weight is the honest
 * "we do not know yet" answer.
 */
const DEFAULT_WEIGHT = (() => {
  // Canonical counts only: an alias is the same idea measured twice and would
  // drag the median toward whichever ideas happen to have legacy names.
  const weights = Object.values(CANONICAL_CARD_COUNT)
    .map((n) => Math.log2(TAGGED_CARD_TOTAL / n))
    .sort((a, b) => a - b);
  return weights[Math.floor(weights.length / 2)];
})();

/**
 * Inverse document frequency: how surprising it is that two cards share this.
 *
 * `storm` (40 cards) scores 9.73, `ramp` (2,140) scores 3.99, `creature`
 * (18,827) scores 0.86.
 */
export function tagWeight(tag: string): number {
  const n = TAG_CARD_COUNT[tag];
  if (!n || n <= 0) return DEFAULT_WEIGHT;
  return Math.log2(TAGGED_CARD_TOTAL / n);
}

/* ------------------------------------------------------------------ *
 * Public helpers
 * ------------------------------------------------------------------ */

/** True when a tag is worth ranking on at all. */
export function isSignalTag(tag: string): boolean {
  return !TYPE_TAGS.has(tag) && !LOW_INFORMATION_TAGS.has(tag) && !ALIAS_TAGS.has(tag);
}

/**
 * A card's tags reduced to what actually distinguishes it, rarest first.
 *
 * Rarest first matters: callers query the database on the first few, and the
 * first few are the ones that pick out a genuinely related card rather than a
 * tenth of the catalogue.
 */
export function signalTags(tags: readonly string[] | null | undefined): string[] {
  const out = Array.from(new Set((tags ?? []).filter(Boolean))).filter(isSignalTag);
  return out.sort((a, b) => tagWeight(b) - tagWeight(a) || a.localeCompare(b));
}

/**
 * How strongly a candidate answers the signal tags of the card being viewed.
 *
 * The sum of the weights of the tags they share, so one rare match beats
 * several common ones. Returns 0 when nothing is shared.
 */
export function sharedTagScore(
  signal: readonly string[],
  candidateTags: readonly string[] | null | undefined
): number {
  if (!candidateTags?.length || !signal.length) return 0;
  const theirs = new Set(candidateTags);
  let score = 0;
  for (const tag of signal) if (theirs.has(tag)) score += tagWeight(tag);
  return score;
}

/* ------------------------------------------------------------------ *
 * Deck-level density
 * ------------------------------------------------------------------ */

/** Share of the catalogue carrying this tag, 0–1. Unmeasured tags return 0. */
export function tagBaseline(tag: string): number {
  const n = TAG_CARD_COUNT[tag];
  return n && n > 0 ? n / TAGGED_CARD_TOTAL : 0;
}

/**
 * How much denser a theme is in a deck than in the catalogue at large.
 *
 * 1.0 means "no denser than the same number of cards drawn at random", 3.0
 * means three times as dense. This is the number that makes a deck-level
 * threshold mean something: eight cards tagged `counters` in a 100-card deck is
 * what you get by accident — `counters` is on 8.45% of all cards — whereas
 * eight tagged `storm` is 200 times the baseline.
 *
 * Several tags sum their baselines. That slightly overstates the baseline when
 * a card carries two of them (a card can be both `counterspell` and
 * `removal-spot`), which makes the measure conservative, never generous.
 */
export function tagEnrichment(
  count: number,
  deckSize: number,
  tags: readonly string[]
): number {
  if (deckSize <= 0 || count <= 0) return 0;
  let baseline = 0;
  for (const tag of tags) baseline += tagBaseline(tag);
  if (baseline <= 0) return 0;
  return count / deckSize / baseline;
}

/** The signal tags a candidate shares, rarest first — for "why is this here". */
export function sharedTags(
  signal: readonly string[],
  candidateTags: readonly string[] | null | undefined
): string[] {
  if (!candidateTags?.length) return [];
  const theirs = new Set(candidateTags);
  return signal.filter((tag) => theirs.has(tag));
}
