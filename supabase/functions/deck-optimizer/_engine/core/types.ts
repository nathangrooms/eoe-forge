/**
 * Shared shapes for the in-house recommendation engine.
 *
 * Every field here corresponds to a column that was confirmed to exist on
 * `public.cards` (checked against the live catalogue on 2026-08-18), because a
 * recommender that invents a column is the same class of bug as one that
 * invents a card.
 *
 * Two facts about the table drive most of these shapes:
 *
 * 1. `cards` stores **printings**, not cards. 32,881 commander-legal rows
 *    collapse to 31,833 distinct `oracle_id`s; Sol Ring alone has three rows
 *    and one card has four. Anything user-facing must key on `oracleId`, or a
 *    suggestion list happily recommends the same card three times.
 * 2. `cmc` is `numeric` and `prices->>'usd'` is a JSON string, so both arrive
 *    over the wire as *strings*. They are coerced once, at the boundary, in
 *    `normalizeRow`.
 *
 * Pure data. No network, no AI.
 */

import type { ManaProfile } from '../playability/castability.ts';

/** The five colour-identity letters actually stored in `cards.color_identity`. */
export type Color = 'W' | 'U' | 'B' | 'R' | 'G';

export const COLORS: readonly Color[] = ['W', 'U', 'B', 'R', 'G'];

/**
 * The roles a deck is measured against.
 *
 * These are derived from tags that genuinely exist in `TAG_RULES` — see
 * `roles.ts`, where each role lists the tags that map to it.
 */
export type Role = 'ramp' | 'draw' | 'removal' | 'interaction' | 'wincon' | 'land';

export const ROLES: readonly Role[] = ['ramp', 'draw', 'removal', 'interaction', 'wincon', 'land'];

/**
 * One printing, normalised.
 *
 * `id` is the printing (primary key); `oracleId` is the card. Ranking dedupes
 * on `oracleId` and keeps the cheapest printing, because "what does it cost to
 * add this card" is answered by the cheapest legal printing, not by whichever
 * row the database happened to return first.
 */
export interface CandidateCard {
  id: string;
  oracleId: string;
  name: string;
  typeLine: string;
  cmc: number;
  colorIdentity: Color[];
  tags: string[];
  manaCost: string | null;
  /** Cheapest USD price seen for this card, or null when unpriced. */
  usd: number | null;
  /** Raw legalities map, e.g. `{ commander: 'legal', modern: 'not_legal' }`. */
  legalities: Record<string, string>;
  /**
   * Scryfall's EDHREC popularity rank. 1 is the most-played card in Commander.
   *
   * Be careful about what this IS. It is a popularity ORDERING across all
   * cards, not a quality score and not deck-specific synergy. Scryfall ships it
   * on every card object and our nightly sync stores it, which makes it the
   * only "what do people actually play" signal in the schema; we hold no
   * inclusion counts, no win rates and no per-commander data of our own.
   *
   * So it is used as a weak PRIOR and never as a verdict. A rank-1 card the
   * deck cannot cast is still a bad card for that deck, which is exactly why
   * castability gates and this only tilts.
   *
   * Null when the sync has not reached that printing yet, and null means
   * unknown rather than unpopular.
   */
  edhrecRank: number | null;
}

/** A card already in the deck. Only the fields ranking actually reads. */
export interface DeckCard {
  oracleId: string;
  name: string;
  typeLine: string;
  cmc: number;
  tags: string[];
  /** Copies in the deck. Commander is singleton, but limited/60-card is not. */
  quantity?: number;
}

/**
 * What the deck currently looks like, measured from its own cards.
 *
 * Nothing in here is guessed: counts and curve come from `cards`, the colour
 * identity comes from the commander, and the only declared policy is
 * `roleTargets` (see `roles.ts`).
 */
export interface DeckProfile {
  format: string;
  /** The commander's colour identity. Candidates must be a subset of this. */
  colorIdentity: Color[];
  /** Total cards counted, including lands. */
  deckSize: number;
  /** Non-land cards counted — the denominator for the curve. */
  spellCount: number;
  /** Mean mana value of non-land cards. 0 when there are none. */
  meanCmc: number;
  /** Signal tags carried by the deck, strongest first (aliases stripped). */
  signalTags: string[];
  /** How many deck cards carry each tag. */
  tagCounts: Record<string, number>;
  /** How many deck cards serve each role. */
  roleCounts: Record<Role, number>;
  /** How many the deck is aiming for. Declared policy, overridable. */
  roleTargets: Record<Role, number>;
  /** Oracle ids already in the deck — never recommended back to the user. */
  ownedOracleIds: ReadonlySet<string>;
  /**
   * This deck's mana base, when the caller has it.
   *
   * Optional because a caller with only `{name, tags}` rows genuinely cannot
   * supply it, and a missing mana base must mean "castability was not checked"
   * rather than "nothing is castable". When it IS present, `rank.ts` both
   * scores castability and refuses to suggest a card the base cannot support.
   * That is the product decision that a card you cannot cast is worth nothing
   * no matter how well it fits, applied to additions as well as to cuts.
   */
  manaProfile?: ManaProfile | null;
}

/**
 * A signal that fired for one candidate.
 *
 * `detail` is assembled from measured numbers by the signal that produced it.
 * It is never free text and never model output, so every clause in a reason is
 * attributable to a column in `cards` or a count taken from the deck.
 */
export interface Signal {
  kind: 'role-gap' | 'tag-synergy' | 'curve-fit' | 'budget-fit' | 'castability' | 'popularity';
  /** Contribution to the total score. May be negative (curve fit only). */
  score: number;
  /** Human-readable clause, built from numbers. */
  detail: string;
}

/** A ranked suggestion. */
export interface Recommendation {
  card: CandidateCard;
  score: number;
  signals: Signal[];
  /** The signals' details joined into one sentence. */
  reason: string;
  /** Roles this card would fill, of the ones the deck is short of. */
  fillsRoles: Role[];
  /** Deck tags this card shares (signal tags only, aliases stripped). */
  sharedTags: string[];
}

export interface RecommendOptions {
  /** How many suggestions to return. Applied strictly after ranking. */
  limit?: number;
  /**
   * Hard USD ceiling per card. Cards above it are excluded, not merely
   * penalised — a budget deck cannot use a card it cannot buy. Cards with no
   * known price are excluded when a ceiling is set, because "unknown" is not
   * "cheap".
   */
  maxUsd?: number;
  /** Reward cheaper cards even without a hard ceiling. */
  preferBudget?: boolean;
  /** Override the declared role targets. */
  roleTargets?: Partial<Record<Role, number>>;
}
