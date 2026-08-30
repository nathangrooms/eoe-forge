/**
 * The score's vocabulary and its weights, in a module with no dependencies.
 *
 * These live apart from `subscores.ts` for one practical reason: things outside
 * the engine want to *name* the model without *running* it. The homepage prints
 * the weights, and importing them from the scorer would drag the card
 * catalogues and the 815-line tagger into the marketing bundle to read ten
 * numbers.
 *
 * It used to solve that by transcribing them:
 *
 *     // `EDHPowerCalculator.defaultConfig.weights`, as percentages.
 *     // Deliberately not imported: pulling the calculator in would drag the
 *     // feature extractor … They are checked against the source above.
 *
 * A hand-checked copy is a copy, and it goes stale the first time the model
 * changes. This file is the fix: import it and there is nothing to check.
 *
 * Nothing here is measured. The weights are a written-down judgement about what
 * matters in a Commander deck, kept in one place so the judgement can be argued
 * with rather than discovered in three places at once.
 */

import type { SubscoreKey } from './evidence.ts';

/**
 * How much each subscore is worth. Sums to 1.
 *
 * NOT fitted to anything. We hold no inclusion data, no win rates and no
 * labelled decks, so there is nothing to fit them to. Tuning them until our
 * number matches edhpowerlevel's would fit them to a scrape of a site we cannot
 * see inside, and would make this the tenth power model rather than the first
 * honest one.
 *
 * The one ordering that is a product decision rather than a guess is
 * castability at the top. A card you cannot reliably cast is worth nothing no
 * matter how strong it reads, so what decides whether the deck functions
 * outranks what decides how hard it hits.
 */
export const SUBSCORE_WEIGHTS: Record<SubscoreKey, number> = {
  castability: 0.22,
  speed: 0.13,
  interaction: 0.13,
  tutors: 0.1,
  mana: 0.1,
  resilience: 0.1,
  card_advantage: 0.09,
  consistency: 0.08,
  synergy: 0.04,
  stax_pressure: 0.01,
};

/** Display order. Heaviest first, so the breakdown reads as a cause. */
export const SUBSCORE_ORDER: readonly SubscoreKey[] = [
  'castability',
  'speed',
  'interaction',
  'tutors',
  'mana',
  'resilience',
  'card_advantage',
  'consistency',
  'synergy',
  'stax_pressure',
];

export const SUBSCORE_LABELS: Record<SubscoreKey, string> = {
  castability: 'Castability',
  speed: 'Speed',
  interaction: 'Interaction',
  tutors: 'Tutors',
  resilience: 'Resilience',
  card_advantage: 'Card advantage',
  mana: 'Mana base',
  consistency: 'Consistency',
  stax_pressure: 'Slowing the table',
  synergy: 'Synergy',
};

export const SUBSCORE_DESCRIPTIONS: Record<SubscoreKey, string> = {
  castability: 'How often you can actually pay for your own cards',
  speed: 'Fast mana and a low curve, so how early the deck can act',
  interaction: 'Removal, counterspells and other answers',
  tutors: 'Cards that go and find the card you need',
  resilience: 'Protection and recovery after a board wipe',
  card_advantage: 'Draw that stops the deck running out of cards',
  mana: 'Land count, fixing, and how many come in tapped',
  consistency: 'Whether the deck covers all the jobs it needs covered',
  stax_pressure: 'How much this deck slows everyone else down',
  synergy: 'How much the deck is built around its commander',
};

/**
 * The one threshold table.
 *
 * Before unification four different sets of cuts were live at once: the SQL
 * summary used 3/6/8, the tile helper 2/4/6/8, the meter's colour 3/6/8 and the
 * engine 3.4/6.6/8.5, so one deck was "high" on the tile and "mid" in the
 * analysis panel at the same moment. Anything that needs a cut imports these.
 */
export const POWER_BANDS = {
  casualMax: 3.4,
  midMax: 6.6,
  highMax: 8.5,
} as const;

export type PowerBand = 'casual' | 'mid' | 'high' | 'cedh';

export function bandForScore(score: number): PowerBand {
  if (score <= POWER_BANDS.casualMax) return 'casual';
  if (score <= POWER_BANDS.midMax) return 'mid';
  if (score <= POWER_BANDS.highMax) return 'high';
  return 'cedh';
}

export type BracketId = 1 | 2 | 3 | 4 | 5;

/**
 * Score to bracket, straddling the same cuts as {@link bandForScore} so a
 * "Casual" deck can only ever land in bracket 1 or 2. Bracket 1 splits the
 * casual band; every other boundary IS a band boundary.
 */
export function bracketIdForScore(score: number): BracketId {
  if (score <= 2) return 1;
  if (score <= POWER_BANDS.casualMax) return 2;
  if (score <= POWER_BANDS.midMax) return 3;
  if (score <= POWER_BANDS.highMax) return 4;
  return 5;
}

/**
 * Maps the weighted 0 to 100 mean onto 1 to 10.
 *
 * `mu` is the raw score that lands mid-scale and `sigma` how quickly it moves.
 * These are the values the previous engine used, kept so the shape of the curve
 * is unchanged while its inputs are corrected. Changing the curve and the
 * subscores at once would make the movement in scores unattributable.
 */
export const LOGISTIC = { mu: 55, sigma: 12 } as const;
