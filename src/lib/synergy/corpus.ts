/**
 * Corpus indexing.
 *
 * Turns the generated `precon-corpus` arrays into a structure that can answer
 * "how many decks contain both of these cards?" in a handful of machine
 * instructions, so a 100-card deck can be scored against a 6,144-card
 * vocabulary without anything async happening.
 *
 * The representation is a bitset per card: bit *d* is set when deck *d* plays
 * that card. With 184 decks that is six 32-bit words per card — the whole
 * membership matrix is 6,144 × 6 words ≈ 147 kB of `Uint32Array`, and
 * co-occurrence is an AND plus a popcount.
 *
 * `buildCorpusIndex` is pure and takes its data as arguments, so tests can
 * build a five-deck toy corpus and assert exact counts. `loadPreconIndex` is
 * the only impure thing here, and all it does is a memoised dynamic import.
 */

import type { PreconCorpusDeck } from '@/data/precon-corpus';
import { canonicalIdentityKey, fitsIdentity } from './mechanics';

const WORD_BITS = 32;

export interface CorpusIndex {
  /** Card names by corpus id. */
  readonly names: readonly string[];
  /** Lowercased name → corpus id. Card names are matched case-insensitively. */
  readonly ids: ReadonlyMap<string, number>;
  readonly deckCount: number;
  /** Colour identity key per deck, WUBRG order. */
  readonly deckIdentities: readonly string[];
  /** Deck names, for citing evidence. */
  readonly deckNames: readonly string[];
  /** `words` 32-bit words per card, flattened. */
  readonly membership: Uint32Array;
  /** Words per bitset row. */
  readonly words: number;
  /** Decks containing each card. */
  readonly frequency: Uint16Array;
  /**
   * Deck bitset per colour-identity key — the decks that could legally play a
   * card of that identity. At most 32 keys exist, so this is precomputed.
   */
  readonly eligibility: ReadonlyMap<string, Uint32Array>;
}

/** Build the index. Pure: same inputs, same output, no I/O. */
export function buildCorpusIndex(
  names: readonly string[],
  decks: readonly PreconCorpusDeck[]
): CorpusIndex {
  const deckCount = decks.length;
  const words = Math.ceil(Math.max(deckCount, 1) / WORD_BITS);
  const membership = new Uint32Array(names.length * words);
  const frequency = new Uint16Array(names.length);

  const ids = new Map<string, number>();
  names.forEach((name, id) => ids.set(name.toLowerCase(), id));

  decks.forEach((deck, d) => {
    const word = d >>> 5;
    const bit = 1 << (d & 31);
    for (const cardId of deck.cards) {
      if (cardId < 0 || cardId >= names.length) continue;
      membership[cardId * words + word] |= bit;
      frequency[cardId] += 1;
    }
  });

  const deckIdentities = decks.map(d => d.ci);
  const deckNames = decks.map(d => d.name);

  // Every colour identity a card can have — 32 subsets of WUBRG. Precomputing
  // all of them costs 32 × 6 words and removes the loop from the hot path.
  const eligibility = new Map<string, Uint32Array>();
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  for (let mask = 0; mask < 32; mask += 1) {
    const key = COLORS.filter((_, i) => mask & (1 << i)).join('');
    const bits = new Uint32Array(words);
    deckIdentities.forEach((deckCi, d) => {
      if (fitsIdentity(key, deckCi)) bits[d >>> 5] |= 1 << (d & 31);
    });
    eligibility.set(key, bits);
  }

  return {
    names,
    ids,
    deckCount,
    deckIdentities,
    deckNames,
    membership,
    words,
    frequency,
    eligibility,
  };
}

/** Corpus id for a card name, or `null` when the corpus has never seen it. */
export function cardId(index: CorpusIndex, name: string): number | null {
  const id = index.ids.get(name.trim().toLowerCase());
  return id === undefined ? null : id;
}

function popcount(value: number): number {
  let v = value - ((value >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return (v * 0x01010101) >>> 24;
}

/** Decks containing both cards. */
export function cooccurrence(index: CorpusIndex, a: number, b: number): number {
  const { membership, words } = index;
  const offsetA = a * words;
  const offsetB = b * words;
  let total = 0;
  for (let w = 0; w < words; w += 1) {
    total += popcount(membership[offsetA + w] & membership[offsetB + w]);
  }
  return total;
}

/** Decks containing the card. */
export function frequencyOf(index: CorpusIndex, id: number): number {
  return index.frequency[id];
}

/**
 * Decks that could legally play a card of this colour identity.
 *
 * The key is normalised, so `'GU'`, `'UG'` and `'ug'` all resolve. Passing an
 * unnormalised key used to miss the map and return 0, which every caller then
 * read as "no colour-compatible decks" instead of as a typo.
 */
export function eligibleDecks(index: CorpusIndex, identityKey: string): number {
  const bits = index.eligibility.get(canonicalIdentityKey(identityKey));
  if (!bits) return 0;
  let total = 0;
  for (let w = 0; w < bits.length; w += 1) total += popcount(bits[w]);
  return total;
}

/** Decks that could legally play BOTH — the honest denominator for a pair. */
export function eligibleForBoth(
  index: CorpusIndex,
  identityA: string,
  identityB: string
): number {
  const a = index.eligibility.get(canonicalIdentityKey(identityA));
  const b = index.eligibility.get(canonicalIdentityKey(identityB));
  if (!a || !b) return 0;
  let total = 0;
  for (let w = 0; w < a.length; w += 1) total += popcount(a[w] & b[w]);
  return total;
}

/** Decks containing the card, by corpus deck index. */
export function decksContaining(index: CorpusIndex, id: number): number[] {
  const { membership, words, deckCount } = index;
  const offset = id * words;
  const out: number[] = [];
  for (let d = 0; d < deckCount; d += 1) {
    if (membership[offset + (d >>> 5)] & (1 << (d & 31))) out.push(d);
  }
  return out;
}

/**
 * Best available guess at a card's colour identity, from the corpus alone.
 *
 * The corpus deliberately stores no card metadata, so when a candidate surfaces
 * as a bare name there is nothing to read its identity from. But a deck can
 * only play a card whose identity fits its commander, so the card's identity
 * must be a subset of *every* containing deck's identity — the intersection is
 * therefore a sound upper bound, and an exact answer for anything that appears
 * in a reasonable spread of decks. Sol Ring, in 181 decks including mono-colour
 * ones, correctly infers as colourless.
 *
 * An upper bound over-states colour count, which under-states the eligible-deck
 * denominator, which makes scores conservative rather than inflated. That is
 * the right direction to err.
 */
export function inferIdentity(index: CorpusIndex, id: number): string {
  const decks = decksContaining(index, id);
  if (decks.length === 0) return '';
  let identity = index.deckIdentities[decks[0]];
  for (let i = 1; i < decks.length && identity !== ''; i += 1) {
    const other = index.deckIdentities[decks[i]];
    identity = [...identity].filter(c => other.includes(c)).join('');
  }
  return identity;
}

/**
 * Cards that appear alongside the given card, with their co-occurrence counts.
 *
 * Walks only the decks that actually contain the card, so cost is proportional
 * to that card's popularity rather than to the size of the vocabulary.
 */
export function neighboursOf(
  index: CorpusIndex,
  id: number,
  decks: readonly PreconCorpusDeck[]
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const d of decksContaining(index, id)) {
    for (const other of decks[d].cards) {
      if (other === id) continue;
      counts.set(other, (counts.get(other) ?? 0) + 1);
    }
  }
  return counts;
}

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

let cached: Promise<{ index: CorpusIndex; decks: readonly PreconCorpusDeck[] }> | null = null;

/**
 * The real precon corpus, indexed and memoised.
 *
 * Dynamically imported: `precon-corpus.ts` is ~218 kB and nothing on the
 * critical rendering path needs it, so it must not land in the main chunk —
 * which is already 2.7 MB and flagged in the build.
 */
export function loadPreconIndex(): Promise<{
  index: CorpusIndex;
  decks: readonly PreconCorpusDeck[];
}> {
  if (!cached) {
    cached = import('@/data/precon-corpus').then(module => ({
      index: buildCorpusIndex(module.PRECON_CORPUS_CARDS, module.PRECON_CORPUS_DECKS),
      decks: module.PRECON_CORPUS_DECKS,
    }));
  }
  return cached;
}

/** Drop the memoised index. Only useful in tests. */
export function resetPreconIndex(): void {
  cached = null;
}
