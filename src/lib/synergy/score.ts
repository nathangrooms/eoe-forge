/**
 * The scorer — where co-occurrence, oracle text and tribal signals combine.
 *
 * Every function here is pure and synchronous. The corpus index is passed in,
 * never fetched, so a caller can score a 100-card deck inside a render without
 * awaiting anything (see `loadPreconIndex` for the one-time async hop).
 *
 * READ THIS BEFORE TRUSTING A SCORE
 * ---------------------------------
 * The two halves of this engine have very different epistemic standing:
 *
 *   • Co-occurrence is *observed*. 184 professional decks either did or did not
 *     play two cards together. When support clears `MIN_SUPPORT` this is real
 *     evidence.
 *   • Mechanic and tribal overlap are *inferred* from regexes over card text.
 *     They generalise to the whole 34,088-card pool, which co-occurrence cannot,
 *     but they are guesses.
 *
 * `SynergyResult.confidence` reports the mix. A score of 0.8 at confidence 0.1
 * means "these two cards' text rhymes and we have never seen them played
 * together" — which is a suggestion, not a finding. Any UI that renders the
 * score must render the confidence too.
 */

import type { PreconCorpusDeck } from '@/data/precon-corpus';
import {
  associate,
  associationConfidence,
  associationScore,
  clamp01,
  type Association,
} from './association';
import {
  cardId,
  cooccurrence,
  eligibleForBoth,
  eligibleDecks,
  frequencyOf,
  inferIdentity,
  neighboursOf,
  type CorpusIndex,
} from './corpus';
import {
  canonicalIdentityKey,
  colorIdentityKey,
  detectMechanics,
  fitsIdentity,
  isType,
  mechanicOverlap,
  sharedCreatureTypes,
  textualReferences,
} from './mechanics';
import {
  DEFAULT_WEIGHTS,
  type CooccurrenceEvidence,
  type Mechanic,
  type SynergyCard,
  type SynergyReason,
  type SynergyRecommendation,
  type SynergyResult,
  type SynergyWeights,
} from './types';

/** Everything the scorer needs, built once by `loadPreconIndex`. */
export interface SynergyEngine {
  index: CorpusIndex;
  decks: readonly PreconCorpusDeck[];
}

/**
 * Cards whose co-occurrence says nothing about synergy.
 *
 * Two duals in the same colour pair, or a signet and a triome, appear together
 * because the deck's colours demanded both — not because they interact. Even
 * after colour-conditioning, mana-base pairs were the loudest false positives
 * in the measured output, so their co-occurrence component is suppressed
 * outright and only their text signals remain.
 */
export function isManaBase(card: SynergyCard): boolean {
  if (isType(card.type_line, 'Land')) return true;
  if (!isType(card.type_line, 'Artifact')) return false;
  if (isType(card.type_line, 'Creature')) return false;
  if ((card.cmc ?? 0) > 3) return false;
  const mechanics = detectMechanics(card);
  // A ramp artifact that does nothing else is a mana rock.
  return mechanics.has('ramp') && mechanics.size <= 2;
}

/** Cached per-card derivations, so a deck-wide pass does not re-regex. */
export interface CardProfile {
  card: SynergyCard;
  name: string;
  identity: string;
  mechanics: Set<Mechanic>;
  manaBase: boolean;
  corpusId: number | null;
}

export function profile(index: CorpusIndex, card: SynergyCard): CardProfile {
  return {
    card,
    name: card.name,
    identity: colorIdentityKey(card.color_identity),
    mechanics: detectMechanics(card),
    manaBase: isManaBase(card),
    corpusId: cardId(index, card.name),
  };
}

/* ------------------------------------------------------------------ *
 * Pair scoring
 * ------------------------------------------------------------------ */

/** Co-occurrence evidence for two profiled cards, or `null` when unmeasurable. */
export function evidenceFor(
  engine: SynergyEngine,
  a: CardProfile,
  b: CardProfile
): { evidence: CooccurrenceEvidence; association: Association } | null {
  if (a.corpusId === null || b.corpusId === null) return null;
  if (a.corpusId === b.corpusId) return null;
  if (a.manaBase && b.manaBase) return null;

  const { index } = engine;
  const together = cooccurrence(index, a.corpusId, b.corpusId);
  const freqA = frequencyOf(index, a.corpusId);
  const freqB = frequencyOf(index, b.corpusId);
  const eligA = eligibleDecks(index, a.identity);
  const eligB = eligibleDecks(index, b.identity);
  const eligBoth = eligibleForBoth(index, a.identity, b.identity);

  const association = associate(together, freqA, freqB, eligA, eligB, eligBoth);

  return {
    association,
    evidence: {
      together,
      a: freqA,
      b: freqB,
      eligible: eligBoth,
      lift: association.lift,
      npmi: association.npmi,
      significant: association.significant,
    },
  };
}

/** Score a single pair. */
export function scorePair(
  engine: SynergyEngine,
  cardA: SynergyCard,
  cardB: SynergyCard,
  weights: SynergyWeights = DEFAULT_WEIGHTS
): SynergyResult {
  return scoreProfiles(engine, profile(engine.index, cardA), profile(engine.index, cardB), weights);
}

/** Score two already-profiled cards — the hot path for deck-wide work. */
export function scoreProfiles(
  engine: SynergyEngine,
  a: CardProfile,
  b: CardProfile,
  weights: SynergyWeights = DEFAULT_WEIGHTS
): SynergyResult {
  const reasons: SynergyReason[] = [];

  const found = evidenceFor(engine, a, b);
  const association = found?.association ?? null;
  const cooccurrenceScore = association ? associationScore(association) : 0;
  const measured = Boolean(association?.significant);

  if (measured && cooccurrenceScore > 0 && association) {
    reasons.push({
      kind: 'cooccurrence',
      label:
        `played together in ${association.together} of ${association.eligible} ` +
        `colour-compatible precons (${association.lift.toFixed(1)}× expected)`,
      weight: cooccurrenceScore,
    });
  }

  const mechanics = mechanicOverlap(a.mechanics, b.mechanics);
  if (mechanics.shared.length > 0) {
    reasons.push({
      kind: 'mechanic',
      label: `both use ${mechanics.shared.slice(0, 3).join(', ')}`,
      weight: mechanics.score,
    });
  }

  const tribes = sharedCreatureTypes(a.card, b.card);
  const tribal = tribes.length > 0 ? Math.min(0.5 + tribes.length * 0.25, 1) : 0;
  if (tribes.length > 0) {
    reasons.push({
      kind: 'tribal',
      label: `both are ${tribes.join(' ')}`,
      weight: tribal,
    });
  }

  const refsAB = textualReferences(a.card, b.card);
  const refsBA = textualReferences(b.card, a.card);
  const textual = refsAB.length > 0 || refsBA.length > 0 ? 1 : 0;
  if (textual > 0) {
    const naming = refsAB.length > 0 ? a.name : b.name;
    const named = refsAB.length > 0 ? refsAB : refsBA;
    reasons.push({
      kind: 'textual',
      label: `${naming} references ${named.join(', ')}`,
      weight: textual,
    });
  }

  // Colour identity gates how easily two cards can share a deck at all.
  const compatibility = identityCompatibility(engine.index, a.identity, b.identity);
  if (compatibility <= 0) {
    return {
      a: a.name,
      b: b.name,
      score: 0,
      breakdown: { cooccurrence: null, mechanics: 0, tribal: 0, textual: 0 },
      reasons: [],
      evidence: found?.evidence ?? null,
      confidence: 1, // Certainly zero — this one we know.
    };
  }

  // When co-occurrence is unmeasurable the pair should not be penalised for it;
  // its weight is redistributed across the components that do have data.
  const active: Array<[number, number]> = [
    [measured ? cooccurrenceScore : Number.NaN, weights.cooccurrence],
    [mechanics.score, weights.mechanics],
    [tribal, weights.tribal],
    [textual, weights.textual],
  ];

  let total = 0;
  let divisor = 0;
  for (const [value, weight] of active) {
    if (Number.isNaN(value)) continue;
    total += value * weight;
    divisor += weight;
  }
  const score = divisor > 0 ? clamp01((total / divisor) * compatibility) : 0;

  reasons.sort((x, y) => y.weight - x.weight);

  return {
    a: a.name,
    b: b.name,
    score,
    breakdown: {
      cooccurrence: measured ? cooccurrenceScore : null,
      mechanics: mechanics.score,
      tribal,
      textual,
    },
    reasons,
    evidence: found?.evidence ?? null,
    confidence: confidenceOf(association, measured, reasons.length),
  };
}

/**
 * How readily two colour identities can share a deck, 0–1.
 *
 * The obvious formulation — "is the union of the two identities five colours or
 * fewer?" — is vacuous. Five-colour commanders exist, so *every* pair of cards
 * in Magic passes it. The self-test caught exactly that: a WUB card and an RG
 * card were being treated as freely combinable.
 *
 * The useful question is how *constrained* a deck playing both would be, and
 * the corpus answers it directly: of the decks that could legally play the more
 * restrictive of the two cards, what share could also play the other? A
 * mono-green pair scores 1. WUB with RG needs a five-colour commander, of which
 * the corpus has 7 out of 184, so it is heavily discounted rather than banned —
 * such decks are legal, merely rare.
 *
 * Returns 0 only when no deck in the corpus could play both, which is the
 * closest thing to "impossible" that observed data can assert.
 */
export function identityCompatibility(
  index: CorpusIndex,
  a: string,
  b: string
): number {
  const eligA = eligibleDecks(index, a);
  const eligB = eligibleDecks(index, b);
  if (eligA === 0 || eligB === 0) return 0;

  const both = eligibleForBoth(index, a, b);
  if (both === 0) return 0;

  return clamp01(both / Math.min(eligA, eligB));
}

/**
 * Confidence blends "is this observed?" with "how much did we find at all?".
 *
 * A text-only match tops out at 0.35 by construction — it can never present
 * itself as strongly as a measured one.
 */
function confidenceOf(
  association: Association | null,
  measured: boolean,
  signalCount: number
): number {
  const textual = Math.min(signalCount / 3, 1) * 0.35;
  if (!measured || !association) return clamp01(textual);
  return clamp01(0.4 + associationConfidence(association) * 0.6);
}

/* ------------------------------------------------------------------ *
 * Deck-wide work
 * ------------------------------------------------------------------ */

/**
 * Total synergy of a deck with itself — the sum of pair scores, normalised.
 *
 * O(n²) in deck size. At 100 cards that is 4,950 pairs of pure arithmetic over
 * pre-profiled cards, which measures in single-digit milliseconds.
 */
export function scoreDeck(
  engine: SynergyEngine,
  cards: readonly SynergyCard[],
  weights: SynergyWeights = DEFAULT_WEIGHTS
): { score: number; pairs: SynergyResult[] } {
  const profiles = cards.map(c => profile(engine.index, c));
  const pairs: SynergyResult[] = [];

  for (let i = 0; i < profiles.length; i += 1) {
    for (let j = i + 1; j < profiles.length; j += 1) {
      const result = scoreProfiles(engine, profiles[i], profiles[j], weights);
      if (result.score > 0) pairs.push(result);
    }
  }

  pairs.sort((a, b) => b.score - a.score);
  const denominator = (profiles.length * (profiles.length - 1)) / 2;
  const score = denominator > 0
    ? clamp01(pairs.reduce((sum, p) => sum + p.score, 0) / denominator)
    : 0;

  return { score, pairs };
}

/**
 * Cards the corpus suggests for a deck, ranked.
 *
 * Purely co-occurrence-driven: it walks the decks that actually contain the
 * deck's cards and counts what else those decks played. Candidates are returned
 * as *names* — hydrating them into card rows is the caller's job, because that
 * needs the `cards` table and this module does not do I/O.
 *
 * `deckIdentity` is the commander's colour identity; candidates outside it are
 * dropped, since they are not legal rather than merely unsuggested.
 */
export function recommendFromCorpus(
  engine: SynergyEngine,
  deck: readonly SynergyCard[],
  deckIdentity: string,
  options: { limit?: number; minSupport?: number } = {}
): SynergyRecommendation[] {
  const { limit = 30 } = options;
  const { index, decks } = engine;
  const deckKey = canonicalIdentityKey(deckIdentity);

  /** Inferred colour identity per candidate, memoised across the whole pass. */
  const identities = new Map<number, string>();
  const present = new Set<number>();
  const profiles: CardProfile[] = [];
  for (const card of deck) {
    const p = profile(index, card);
    profiles.push(p);
    if (p.corpusId !== null) present.add(p.corpusId);
  }

  // candidate id → contributions from each deck card
  const contributions = new Map<number, Array<{ from: CardProfile; score: number; support: number }>>();

  for (const source of profiles) {
    if (source.corpusId === null || source.manaBase) continue;
    const neighbours = neighboursOf(index, source.corpusId, decks);

    for (const [candidate, together] of neighbours) {
      if (present.has(candidate)) continue;

      // The candidate is a bare corpus name with no metadata, so its identity
      // is inferred from the decks that play it (see `inferIdentity`), and
      // memoised — this loop runs once per deck card per neighbour.
      let candidateIdentity = identities.get(candidate);
      if (candidateIdentity === undefined) {
        candidateIdentity = inferIdentity(index, candidate);
        identities.set(candidate, candidateIdentity);
      }

      // A candidate the deck cannot legally play is not a recommendation.
      if (!fitsIdentity(candidateIdentity, deckKey)) continue;

      const freqSource = frequencyOf(index, source.corpusId);
      const freqCandidate = frequencyOf(index, candidate);
      const eligSource = eligibleDecks(index, source.identity);
      const eligCandidate = eligibleDecks(index, candidateIdentity);
      const eligBoth = eligibleForBoth(index, source.identity, candidateIdentity);

      const association = associate(
        together, freqSource, freqCandidate, eligSource, eligCandidate, eligBoth
      );
      if (!association.significant) continue;

      const score = associationScore(association);
      if (score <= 0) continue;

      const list = contributions.get(candidate) ?? [];
      list.push({ from: source, score, support: together });
      contributions.set(candidate, list);
    }
  }

  const out: SynergyRecommendation[] = [];
  for (const [candidate, list] of contributions) {
    list.sort((a, b) => b.score - a.score);
    // Mean of the top three drivers rather than a sum: summing would rank a
    // card that weakly matches forty deck cards above one that strongly
    // matches three, which inverts what a player means by synergy.
    const top = list.slice(0, 3);
    const score = clamp01(top.reduce((s, c) => s + c.score, 0) / top.length);
    out.push({
      card: index.names[candidate],
      score,
      becauseOf: top.map(c => c.from.name),
      support: list.reduce((s, c) => s + c.support, 0),
      confidence: clamp01(Math.min(list.length / 3, 1) * 0.5 + score * 0.5),
    });
  }

  out.sort((a, b) => b.score - a.score || b.support - a.support);
  return out.slice(0, limit);
}

/** Legality helper re-exported so callers filter candidates the same way. */
export { fitsIdentity };
