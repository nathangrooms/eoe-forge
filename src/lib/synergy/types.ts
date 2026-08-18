/**
 * Shared types for the deterministic synergy engine.
 *
 * Everything here is plain data. No React, no Supabase, no network — the whole
 * of `src/lib/synergy` must stay importable from a plain Node script so it can
 * be self-tested without a browser (see `selftest.ts`).
 */

/** A single WUBRG colour. Colourless is the absence of all five. */
export type Color = 'W' | 'U' | 'B' | 'R' | 'G';

/**
 * The card shape the scorer needs.
 *
 * Deliberately a structural subset of the `cards` table so a row selected by
 * `lib/deck/deckCards` or `lib/precons/precon-api` can be passed straight in
 * without mapping. Everything except `name` is optional because the table has
 * real gaps: 1,205 of 34,088 rows have no oracle text and 17,194 have no
 * keywords.
 */
export interface SynergyCard {
  name: string;
  oracle_text?: string | null;
  type_line?: string | null;
  keywords?: string[] | null;
  color_identity?: string[] | null;
  cmc?: number | null;
}

/**
 * A mechanical theme detected in oracle text.
 *
 * This is a curated, deliberately small vocabulary of Commander-relevant
 * archetypes — the axes along which cards actually combine. It is not an
 * attempt to model every rule in Magic.
 */
export type Mechanic =
  | 'counters'        // +1/+1 counters
  | 'landfall'
  | 'tokens'
  | 'sacrifice'
  | 'death-trigger'   // "whenever a creature dies"
  | 'graveyard'       // recursion / self-mill payoffs
  | 'mill'
  | 'artifacts'
  | 'enchantments'
  | 'equipment'
  | 'auras'
  | 'treasure'
  | 'lifegain'
  | 'card-draw'
  | 'discard'
  | 'ramp'
  | 'untap'
  | 'blink'           // exile and return
  | 'etb'
  | 'attack-trigger'
  | 'spellslinger'    // instant/sorcery payoffs
  | 'counterspell'
  | 'removal'
  | 'tutor'
  | 'proliferate'
  | 'energy'
  | 'stax'            // taxes / denial
  | 'combat-tricks'   // extra combat, double strike granting
  | 'reanimate'
  | 'clone'
  | 'goad'
  | 'monarch'
  | 'cost-reduction';

/** How two cards relate, broken out so the UI can explain a score. */
export interface SynergyBreakdown {
  /**
   * Co-occurrence signal from the precon corpus, 0–1.
   * `null` when neither card clears the support floor — absence of evidence,
   * which is NOT the same as evidence of no synergy.
   */
  cooccurrence: number | null;
  /** Shared mechanical themes, 0–1. */
  mechanics: number;
  /** Shared creature subtype (tribal), 0–1. */
  tribal: number;
  /** Explicit textual reference — card A names card B's type/subtype, 0–1. */
  textual: number;
}

/** Why a pair scored what it scored, in words a player would accept. */
export interface SynergyReason {
  kind: 'cooccurrence' | 'mechanic' | 'tribal' | 'textual';
  /** Short human-readable label, e.g. "both use +1/+1 counters". */
  label: string;
  /** Contribution to the final score, 0–1, before weighting. */
  weight: number;
}

/** Statistical backing for a co-occurrence claim — always surfaced, never hidden. */
export interface CooccurrenceEvidence {
  /** Decks containing both cards. */
  together: number;
  /** Decks containing A. */
  a: number;
  /** Decks containing B. */
  b: number;
  /**
   * Decks whose colour identity could legally play BOTH cards. This is the
   * denominator that matters — using the full 184 makes every pair of
   * two-colour cards look synergistic when they merely share a colour pair.
   */
  eligible: number;
  /** Observed rate over expected rate. 1.0 means "no association at all". */
  lift: number;
  /** Normalised pointwise mutual information, roughly −1…1. */
  npmi: number;
  /**
   * False when `together` is below the support floor. A `true` here is the
   * only case in which the co-occurrence number should be shown as a fact.
   */
  significant: boolean;
}

export interface SynergyResult {
  a: string;
  b: string;
  /** Final blended score, 0–1. */
  score: number;
  breakdown: SynergyBreakdown;
  reasons: SynergyReason[];
  /** `null` when neither card is in the corpus at all. */
  evidence: CooccurrenceEvidence | null;
  /**
   * How much of this score rests on real observed data rather than text
   * heuristics, 0–1. Low confidence means "this is a guess from card text".
   */
  confidence: number;
}

/** A recommendation for a deck, with the cards that justify it. */
export interface SynergyRecommendation {
  card: string;
  score: number;
  /** Cards already in the deck that drove the score, best first. */
  becauseOf: string[];
  /** Decks in the corpus supporting this, across all pairings. */
  support: number;
  confidence: number;
}

/** Tunable weights, exposed so the blend can be tested and argued with. */
export interface SynergyWeights {
  cooccurrence: number;
  mechanics: number;
  tribal: number;
  textual: number;
}

/**
 * Defaults.
 *
 * Co-occurrence is weighted highest *when present* because it is the only
 * component grounded in observed deck construction rather than in a regex over
 * card text. It is also the component most often absent — see
 * `PRECON_CORPUS_META.singletonCount`.
 */
export const DEFAULT_WEIGHTS: SynergyWeights = {
  cooccurrence: 0.45,
  mechanics: 0.3,
  tribal: 0.15,
  textual: 0.1,
};
