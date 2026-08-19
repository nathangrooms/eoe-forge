/**
 * DeckMatrix playtest harness — the harness's own deterministic RNG.
 *
 * Separate from `src/lib/game/rules.ts`'s RNG on purpose. The engine's RNG
 * belongs to the game and advances every time a library is shuffled; the
 * harness needs its own stream for choosing commanders and filling decklists,
 * and the two must not share a counter or a deck build would change because a
 * game shuffled one more time.
 *
 * Same algorithm (mulberry32) because it is small, fast and reproducible, and
 * because matching the engine means one less thing to explain.
 *
 * Nothing here reads a clock or `Math.random`. A seed in is a run out, every
 * time, on any machine.
 */

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [0, max). */
  int(max: number): number;
  /** Uniform pick. Throws on an empty list, because a silent undefined is worse. */
  pick<T>(items: readonly T[]): T;
  /** A shuffled copy. Fisher-Yates, seeded. */
  shuffle<T>(items: readonly T[]): T[];
  /** N distinct items, in shuffled order. Fewer than N if the list is short. */
  sample<T>(items: readonly T[], count: number): T[];
}

/**
 * Fold a string into a 32-bit seed, so a run can be named as well as numbered.
 * FNV-1a: no dependencies, stable across Node versions and platforms.
 */
export function seedFrom(value: string | number): number {
  if (typeof value === 'number') return value | 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

/**
 * Derive a child seed from a parent seed and a label.
 *
 * Every part of the harness that needs randomness takes a derived stream rather
 * than sharing one: `makeRng(seed, 'deck:p1')` and `makeRng(seed, 'deck:p2')`
 * are independent, so adding a third seat cannot change the first two decks.
 * That property is what makes a reported finding still reproduce a week later.
 */
export function deriveSeed(seed: number, label: string): number {
  let hash = seed | 0;
  hash ^= 0x9e3779b9;
  for (let i = 0; i < label.length; i++) {
    hash ^= label.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

export function makeRng(seed: number, label?: string): Rng {
  let state = (label === undefined ? seed : deriveSeed(seed, label)) | 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let r = state;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };

  const int = (max: number): number => {
    if (max <= 0) return 0;
    return Math.floor(next() * max);
  };

  const shuffle = <T,>(items: readonly T[]): T[] => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1);
      const swap = out[i];
      out[i] = out[j];
      out[j] = swap;
    }
    return out;
  };

  return {
    next,
    int,
    shuffle,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('makeRng.pick: empty list');
      return items[int(items.length)];
    },
    sample<T>(items: readonly T[], count: number): T[] {
      if (count >= items.length) return shuffle(items);
      return shuffle(items).slice(0, count);
    },
  };
}
