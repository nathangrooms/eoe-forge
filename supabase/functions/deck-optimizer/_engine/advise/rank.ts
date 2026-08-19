/**
 * Ranking: score the whole legal pool, then truncate.
 *
 * The order of operations is the entire point of this file.
 *
 *   eligible → score every survivor → sort → *then* take N
 *
 * An earlier bug in this repo did the opposite for card recommendations: it
 * matched tags loosely, took `.limit(40)`, and ranked those forty. That ranks
 * an arbitrary slice of the table very carefully. Nothing here may take a
 * limit before `rankCandidates` has scored the full pool, and
 * `recommend.test.ts` asserts it.
 *
 * The hard filters are applied twice — once in SQL (`query.ts`, the fast path)
 * and again here (the guarantee). That is not redundancy by accident. SQL is
 * how the pool gets small enough to move; this pass is why an illegal or
 * off-colour card cannot reach a user even if the query is later edited, the
 * adapter is swapped, or a cached row is stale. An illegal suggestion is worse
 * than no suggestion, so it is checked where it cannot be optimised away.
 *
 * Pure. No network, no AI.
 */

import { sharedTagScore, sharedTags as sharedSignalTags } from '../knowledge/tag-signal.ts';
import { cardPlayability, type ManaProfile } from '../playability/castability.ts';
import type {
  CandidateCard,
  DeckProfile,
  Recommendation,
  RecommendOptions,
  Role,
  Signal,
} from '../core/types.ts';
import { ROLES } from '../core/types.ts';
import { isLegalIn, withinIdentity } from './query.ts';
import { roleShortfall } from './profile.ts';
import { servesRole } from './roles.ts';

/* ------------------------------------------------------------------ *
 * Weights
 * ------------------------------------------------------------------ *
 *
 * Chosen so the signals rank in the order a deckbuilder would rank them, and
 * written down as named constants so the ordering can be argued with.
 *
 *   role gap   3.0  The actionable one. "You have 4 ramp and want 10" is a
 *                   concrete deficiency; a card that fixes it beats a card
 *                   that is merely thematically pleasant.
 *   synergy    2.0  Does it belong here at all. IDF-weighted via tag-signal,
 *                   so a shared `storm` (worth 9.7) counts for far more than a
 *                   shared `ramp` (4.0), and platitudes are already stripped.
 *   curve      1.0  A tilt, not a verdict. Measured against the deck's own
 *                   mean mana value, so it invents no ideal curve.
 *   budget     1.0  Only consulted when the user asks about budget.
 *
 *   castable   2.5  Added when the mana base is known. Placed ABOVE synergy and
 *                   below role gap on a product decision, not a measurement: a
 *                   card you cannot reliably cast is worth nothing however well
 *                   it fits the theme, but a card that fixes a concrete
 *                   deficiency is still the more useful suggestion. It is also
 *                   a GATE — see `cannot-cast` in `ineligibility` — because
 *                   ranking an uncastable card lower still leaves it on the
 *                   list, and a suggestion the deck cannot support is not a
 *                   weak suggestion, it is a wrong one.
 *
 *                   2.5 is a starting position with no empirical basis, and it
 *                   must not be presented as one. There is no labelled data in
 *                   this product to fit it to.
 */
export const WEIGHTS = {
  roleGap: 3.0,
  playability: 2.5,
  tagSynergy: 2.0,
  curveFit: 1.0,
  budgetFit: 1.0,
  popularity: 0.8,
} as const;

/**
 * The rank at which the popularity prior has decayed to nothing.
 *
 * `edhrec_rank` is a popularity ordering over the whole catalogue, so its
 * useful signal is concentrated at the top: the gap between rank 5 and rank 50
 * says something, the gap between 12,000 and 12,500 says nothing. A logarithmic
 * decay to zero at this rank is the shape that matches, and it puts the weight
 * BELOW curve fit, which is the point. It is a tilt among equals, not a reason.
 */
const POPULARITY_HORIZON = 25000;

/**
 * Below this a card is not offered at all.
 *
 * Deliberately well under the 40% at which a card in the deck already counts as
 * a problem. Refusing to SUGGEST is a stronger action than flagging something
 * already present, so the bar for it is set lower, and a card that merely looks
 * awkward is ranked down rather than hidden.
 */
export const UNCASTABLE_GATE_PCT = 25;

/**
 * Saturation constant for tag synergy.
 *
 * `sharedTagScore` is an unbounded sum of IDF weights. Passing it through
 * `s / (s + K)` bounds it in [0, 1) smoothly, with no cliff: at K the signal is
 * at half strength. K = 6 puts "one rare shared tag" and "two ordinary shared
 * tags" at roughly the same place, which is the intended trade.
 */
const SYNERGY_SATURATION = 6;

/** Mana values away from the deck's mean at which curve fit saturates. */
const CURVE_SPAN = 3;

/** Below this, a curve difference is noise and no clause is emitted. */
const CURVE_MIN_REPORTABLE = 0.5;

/** Default ceiling used to scale the budget signal when none is given. */
const DEFAULT_BUDGET_CEILING_USD = 20;

/** Tags that disqualify a card as a suggestion outright. */
const NEVER_SUGGEST_TAGS: ReadonlySet<string> = new Set(['basic-land']);

/* ------------------------------------------------------------------ *
 * Eligibility — the hard filters, restated
 * ------------------------------------------------------------------ */

export type Ineligibility =
  | 'illegal-in-format'
  | 'outside-color-identity'
  | 'already-in-deck'
  | 'never-suggest'
  | 'over-budget'
  | 'unpriced-under-budget-cap'
  | 'cannot-cast';

/**
 * Why this card may not be suggested, or null if it may.
 *
 * Returning the reason rather than a boolean makes the filter testable and
 * makes "why did my card vanish" answerable.
 */
export function ineligibility(
  card: CandidateCard,
  profile: DeckProfile,
  options: RecommendOptions = {}
): Ineligibility | null {
  if (!isLegalIn(card.legalities, profile.format)) return 'illegal-in-format';
  if (!withinIdentity(card.colorIdentity, profile.colorIdentity)) return 'outside-color-identity';
  if (profile.ownedOracleIds.has(card.oracleId)) return 'already-in-deck';
  if (card.tags.some(t => NEVER_SUGGEST_TAGS.has(t))) return 'never-suggest';

  if (typeof options.maxUsd === 'number') {
    // "Unknown price" is not "cheap". A budget list that quietly includes
    // unpriced cards is not a budget list.
    if (card.usd === null) return 'unpriced-under-budget-cap';
    if (card.usd > options.maxUsd) return 'over-budget';
  }

  // The same rule as prices, applied to castability: unknown is not zero. A
  // profile with no mana base, or a card with no cost, is simply not checked.
  const pct = castabilityPct(card, profile);
  if (pct !== null && pct < UNCASTABLE_GATE_PCT) return 'cannot-cast';

  return null;
}

/* ------------------------------------------------------------------ *
 * Castability
 * ------------------------------------------------------------------ */

/**
 * How often this deck could pay for this card, or null if we cannot say.
 *
 * Memoised per profile on the mana cost alone, because that is genuinely all
 * castability depends on: two cards costing `{1}{U}` have the same answer by
 * definition. Without this a 30,000-row pool would solve the same hypergeometric
 * thousands of times. The memo hangs off the profile object rather than off the
 * module, so it cannot leak between decks and cannot survive the profile.
 */
const castabilityMemo = new WeakMap<DeckProfile, Map<string, number | null>>();

export function castabilityPct(card: CandidateCard, profile: DeckProfile): number | null {
  const mana: ManaProfile | null | undefined = profile.manaProfile;
  if (!mana) return null;
  if (!card.manaCost) return null;

  let memo = castabilityMemo.get(profile);
  if (!memo) {
    memo = new Map();
    castabilityMemo.set(profile, memo);
  }
  const hit = memo.get(card.manaCost);
  if (hit !== undefined) return hit;

  let value: number | null = null;
  try {
    value = cardPlayability(
      { name: card.name, type_line: card.typeLine, mana_cost: card.manaCost, cmc: card.cmc },
      mana
    ).pct;
  } catch {
    // An unparseable cost is unknown, not unsupported.
    value = null;
  }
  memo.set(card.manaCost, value);
  return value;
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

/**
 * Score one card, and record which signals fired.
 *
 * Depends only on the card and the profile — never on the other candidates, and
 * never on position in the input array. That independence is what makes the
 * ranking insensitive to the order the database returns rows in.
 */
export function scoreCandidate(
  card: CandidateCard,
  profile: DeckProfile,
  options: RecommendOptions = {}
): { score: number; signals: Signal[]; fillsRoles: Role[]; shared: string[] } {
  const signals: Signal[] = [];

  /* --- Role gap ---------------------------------------------------- */
  // A card serving several short roles is credited for the worst one, not the
  // sum: a card is one card, and adding it closes one slot.
  const fillsRoles = ROLES.filter(
    role => servesRole(card.tags, role) && roleShortfall(profile, role) > 0
  );
  let bestRole: Role | null = null;
  let bestShortfall = 0;
  for (const role of fillsRoles) {
    const s = roleShortfall(profile, role);
    // Strict `>`, over a list already in fixed `ROLES` order, so ties resolve
    // to the same role every time regardless of anything else.
    if (s > bestShortfall) {
      bestShortfall = s;
      bestRole = role;
    }
  }
  if (bestRole) {
    const have = profile.roleCounts[bestRole] ?? 0;
    const target = profile.roleTargets[bestRole] ?? 0;
    signals.push({
      kind: 'role-gap',
      score: WEIGHTS.roleGap * bestShortfall,
      detail: `fills a ${bestRole} gap (${have} of ${target})`,
    });
  }

  /* --- Tag synergy -------------------------------------------------- */
  const shared = sharedSignalTags(profile.signalTags, card.tags);
  const raw = sharedTagScore(profile.signalTags, card.tags);
  if (raw > 0 && shared.length > 0) {
    signals.push({
      kind: 'tag-synergy',
      score: WEIGHTS.tagSynergy * (raw / (raw + SYNERGY_SATURATION)),
      detail:
        `shares ${shared.length} ${shared.length === 1 ? 'tag' : 'tags'} with your deck ` +
        `(${shared.slice(0, 3).join(', ')})`,
    });
  }

  /* --- Curve fit ---------------------------------------------------- */
  // Positive delta = cheaper than the deck's own average.
  const delta = profile.meanCmc - card.cmc;
  if (profile.spellCount > 0 && Math.abs(delta) >= CURVE_MIN_REPORTABLE) {
    const clamped = Math.max(-1, Math.min(1, delta / CURVE_SPAN));
    signals.push({
      kind: 'curve-fit',
      score: WEIGHTS.curveFit * clamped,
      detail: `${Math.abs(delta).toFixed(1)} mana value ${delta > 0 ? 'below' : 'above'} your curve`,
    });
  }

  /* --- Castability --------------------------------------------------- */
  // Only ever reported when the deck's mana base is known. A card the engine
  // could not measure produces no signal at all, rather than a zero that would
  // read as "you definitely cannot cast this".
  const castable = castabilityPct(card, profile);
  if (castable !== null) {
    signals.push({
      kind: 'castability',
      score: WEIGHTS.playability * (castable / 100),
      detail: `you could pay for this ${Math.round(castable)}% of the time on turn ${Math.max(1, Math.round(card.cmc))}`,
    });
  }

  /* --- Popularity ---------------------------------------------------- */
  // The weakest signal in the model, and deliberately so. It says "other people
  // play this", which is worth something when two cards are otherwise level and
  // worth nothing against a card that fixes a real deficiency. Absent for a
  // card the sync has not reached, because unknown is not unpopular.
  if (card.edhrecRank !== null && card.edhrecRank > 0) {
    const decay = Math.max(
      0,
      1 - Math.log(card.edhrecRank) / Math.log(POPULARITY_HORIZON)
    );
    if (decay > 0) {
      signals.push({
        kind: 'popularity',
        score: WEIGHTS.popularity * decay,
        detail: `played in a lot of decks (EDHREC rank ${card.edhrecRank.toLocaleString('en')})`,
      });
    }
  }

  /* --- Budget ------------------------------------------------------- */
  const wantsBudget = options.preferBudget === true || typeof options.maxUsd === 'number';
  if (wantsBudget && card.usd !== null) {
    const ceiling = options.maxUsd ?? DEFAULT_BUDGET_CEILING_USD;
    if (ceiling > 0) {
      const cheapness = Math.max(0, 1 - Math.min(1, card.usd / ceiling));
      signals.push({
        kind: 'budget-fit',
        score: WEIGHTS.budgetFit * cheapness,
        detail: `$${card.usd.toFixed(2)}`,
      });
    }
  }

  const score = signals.reduce((sum, s) => sum + s.score, 0);
  return { score, signals, fillsRoles, shared };
}

/** Assemble the reason from the signals that actually fired. */
export function buildReason(signals: readonly Signal[]): string {
  if (!signals.length) return 'No distinguishing signal.';
  const parts = signals.map(s => s.detail);
  return parts.join('; ').replace(/^./, c => c.toUpperCase()) + '.';
}

/* ------------------------------------------------------------------ *
 * Dedupe
 * ------------------------------------------------------------------ */

/**
 * Collapse printings to cards, keeping the cheapest.
 *
 * `cards` stores printings: 32,881 commander-legal rows are 31,833 distinct
 * cards, and one card has four rows. Without this, a suggestion list can offer
 * Sol Ring three times. The cheapest printing is kept because the question a
 * budget answer needs is "what does it cost to add this card", and ties are
 * broken by `id` so the choice does not depend on row order.
 */
export function dedupeByOracle(cards: readonly CandidateCard[]): CandidateCard[] {
  const best = new Map<string, CandidateCard>();
  for (const card of cards) {
    const prev = best.get(card.oracleId);
    if (!prev || cheaper(card, prev)) best.set(card.oracleId, card);
  }
  return [...best.values()].sort((a, b) => a.oracleId.localeCompare(b.oracleId));
}

function cheaper(a: CandidateCard, b: CandidateCard): boolean {
  // Unpriced sorts last, so a priced printing always wins over an unpriced one.
  if (a.usd === null && b.usd === null) return a.id < b.id;
  if (a.usd === null) return false;
  if (b.usd === null) return true;
  if (a.usd !== b.usd) return a.usd < b.usd;
  return a.id < b.id;
}

/* ------------------------------------------------------------------ *
 * The ranker
 * ------------------------------------------------------------------ */

/**
 * Rank the full pool, then truncate.
 *
 * `options.limit` is applied on the last line and nowhere else.
 */
export function rankCandidates(
  pool: readonly CandidateCard[],
  profile: DeckProfile,
  options: RecommendOptions = {}
): Recommendation[] {
  // 1. Collapse printings to cards.
  const cards = dedupeByOracle(pool);

  // 2. Hard filters, restated in TypeScript.
  const eligible = cards.filter(c => ineligibility(c, profile, options) === null);

  // 3. Score every survivor. No truncation yet.
  const scored: Recommendation[] = eligible.map(card => {
    const { score, signals, fillsRoles, shared } = scoreCandidate(card, profile, options);
    return {
      card,
      score,
      signals,
      reason: buildReason(signals),
      fillsRoles,
      sharedTags: shared,
    };
  });

  // 4. Total order. Score first; then name and oracle id, which are the
  //    tie-breakers that make the result independent of input order. `oracleId`
  //    is unique after dedupe, so no two entries can compare equal.
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.card.name.localeCompare(b.card.name) ||
      a.card.oracleId.localeCompare(b.card.oracleId)
  );

  // 5. Only now.
  const limit = options.limit;
  return typeof limit === 'number' && limit >= 0 ? scored.slice(0, limit) : scored;
}
