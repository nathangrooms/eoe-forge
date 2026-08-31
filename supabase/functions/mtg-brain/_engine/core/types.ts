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
// Type-only, and the cycle it closes is type-only too: `behaviour.ts` reads
// `Role` and the card shapes from here. Both sides are erased at compile time,
// so no module actually depends on the other at run time.
import type { ArchetypeInfluence, CommanderPlan } from '../knowledge/behaviour.ts';

/** The five colour-identity letters actually stored in `cards.color_identity`. */
export type Color = 'W' | 'U' | 'B' | 'R' | 'G';

export const COLORS: readonly Color[] = ['W', 'U', 'B', 'R', 'G'];

/**
 * The roles a deck is measured against.
 *
 * Five of the seven are decided by a card's BEHAVIOUR where an ability record
 * exists and by its tags where one does not — see `knowledge/behaviour.ts` for
 * the facet table and `roles.ts` for the tag fallback. Two are decided by the
 * type line and never by either: `creature` and `land`.
 *
 * `creature` was added on 2026-08-23 because the owner asked why creature mode
 * produced no creatures, and the answer, read out of this line, was that there
 * was nowhere for it to. Measured on the four test decks before it existed:
 * Atraxa 7 creatures, Krenko 3, Talrand 4, Muldrotha 7, against 49, 55, 54 and
 * 43 artifacts each. A quota the generator does not hold is a quota it cannot
 * fill.
 *
 * ORDER MATTERS. `neediestRole` and `scoreCandidate` both break ties by walking
 * this list, so `creature` sits LAST: a mana dork is credited as ramp, which is
 * the scarcer job, and still counts toward the creature floor, because that
 * floor is taken over the whole deck rather than over one bucket.
 */
export type Role =
  | 'ramp'
  | 'draw'
  | 'removal'
  | 'interaction'
  /*
   * FINDING A CARD IS NOT DRAWING ONE, AND THE DECK HAD NO WORD FOR IT.
   *
   * Every tutor in the format answered `cardRole` with NOTHING, so the
   * generator's first pass — which places a card into its neediest role and
   * skips it outright when it serves none — could never take one. Measured:
   *
   *   Demonic Tutor      rank  62   role NONE
   *   Vampiric Tutor     rank 112   role NONE
   *   Enlightened Tutor  rank 123   role NONE
   *   Worldly Tutor      rank 166   role NONE
   *
   * and eight of ten generated decks scored 0 on the product's own `tutors`
   * subscore as a result. The tagger has always said `tutor`; the ROLE
   * vocabulary is what had no slot for it.
   *
   * It is its own role rather than folded into `draw`, because they answer
   * different questions. Draw is how many cards you see; a tutor is which one.
   * A deck with ten draw spells and no tutor still cannot find its engine.
   */
  | 'tutor'
  | 'wincon'
  | 'land'
  | 'creature';

export const ROLES: readonly Role[] = [
  'ramp',
  'draw',
  'removal',
  'interaction',
  'tutor',
  'wincon',
  'land',
  'creature',
];

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
  /**
   * What this card's ability record says it DOES. See `knowledge/behaviour.ts`.
   *
   * Optional, and the difference between absent and empty is the whole point.
   * Absent means no record was produced for this card and the engine falls back
   * to `tags`, which is the old word matching and is counted as such. Present
   * means the record spoke, and where it spoke it OVERRULES the tags: a record
   * that contains no `add-mana` is evidence a card does not ramp, and letting a
   * `ramp` tag win over it would put the text matcher back in charge of exactly
   * the cards the record covers.
   *
   * Produced outside the engine, by `src/lib/deck/recommend/behaviour.ts`,
   * because `engine-parity.test.ts` forbids this tree from importing the
   * ability compiler. The engine owns the vocabulary and reads the values.
   */
  facets?: readonly string[] | null;
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
  /** Behaviour facets, when the caller has them. See `CandidateCard.facets`. */
  facets?: readonly string[] | null;
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
  /**
   * What THIS commander is for, read from its own ability record.
   *
   * The answer to "every commander has unique style, so it needs to use the
   * brain to pick cards". A plan is a list of wants — facets a card can carry
   * that would make it do the commander's job — derived in
   * `knowledge/behaviour.ts` from the commander's record and from nothing else.
   * Absent means no commander was supplied or its record was empty, and then
   * the `commander-fit` signal simply does not fire, which is the honest
   * default: unknown is not "fits nothing".
   */
  commanderPlan?: CommanderPlan | null;
  /**
   * What the ARCHETYPE the player asked for is for, on its own axis.
   *
   * Separate from `commanderPlan` and deliberately so: the archetype modifies
   * the commander rather than competing with it, so it scores as a second,
   * smaller signal that is added to the first. Folding it into the commander's
   * want list was measured and did not work, and `withArchetype` in
   * `knowledge/behaviour.ts` records why. Absent means the player asked for no
   * archetype, or asked for one this catalogue holds no shell for, and then the
   * `archetype-fit` signal does not fire at all.
   */
  archetype?: ArchetypeInfluence | null;
  /**
   * How many of the cards this profile was built from carried a record.
   *
   * Carried on the profile so a caller can report the fallback rate without
   * recomputing it. `{ withRecord: 0, total: 0 }` when nothing was measured.
   */
  facetCoverage?: { withRecord: number; total: number };
}

/**
 * A signal that fired for one candidate.
 *
 * `detail` is assembled from measured numbers by the signal that produced it.
 * It is never free text and never model output, so every clause in a reason is
 * attributable to a column in `cards` or a count taken from the deck.
 */
export interface Signal {
  kind:
    | 'role-gap'
    | 'commander-fit'
    | 'archetype-fit'
    | 'tag-synergy'
    | 'curve-fit'
    | 'budget-fit'
    | 'castability'
    | 'popularity';
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
  /**
   * How hard to lean on EDHREC popularity, when the default is not right.
   *
   * Defaults to `WEIGHTS.popularity` and is clamped to `WEIGHTS.playability`,
   * so no caller can put popularity above castability. Raised only by a caller
   * ranking against an empty deck, where the signals that normally do the work
   * have nothing to measure yet. See `popularityWeight` in `rank.ts`.
   */
  popularityWeight?: number;
  /**
   * How hard to lean on the commander plan. Raised by a caller building from
   * an empty deck, where fitting the commander is the only real question.
   * Clamped in `rank.ts`; see `commanderFitWeight` there.
   */
  commanderFitWeight?: number;
}
