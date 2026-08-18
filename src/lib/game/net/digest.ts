/**
 * DeckMatrix — networked play: cheap convergence checking.
 *
 * The premise of this whole architecture is that N clients folding the same log
 * land on the same state. That premise is worth exactly as much as our ability
 * to *notice* when it fails, so every client periodically hashes its state and
 * broadcasts the hash. A mismatch is a fork, and a fork is always fixed the
 * same way: refetch the durable log and re-fold from an anchor.
 *
 * This is not a security primitive. FNV-1a is trivially forgeable by anyone who
 * wants to publish a hash matching a state they are not in — a cheating client
 * can lie about its digest as easily as it can lie about anything else. What it
 * catches is the honest majority of problems: a dropped message, a
 * non-deterministic reducer change, a client on a stale deploy. Cheating is
 * addressed by `authority.ts` re-validating every action and by the dealer in
 * `secrets.ts` withholding what a cheat would need; see the notes there for
 * what is and is not actually preventable.
 *
 * Why not `JSON.stringify(state)` directly: key order in a JSON object is
 * insertion order, and the reducer builds objects by spreading, so two states
 * that are `deepEqual` can serialise differently. `stableStringify` sorts keys,
 * which costs a little and removes a whole family of phantom forks.
 */

import type { GameState } from '../types.ts';

/**
 * JSON with object keys sorted at every level. Arrays keep their order, because
 * in this state shape array order *is* information — a library is an ordered
 * list and two orderings are two different games.
 *
 * `undefined` members are dropped, matching `JSON.stringify`, so a field that
 * is absent and a field that is explicitly undefined hash alike.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';

  if (Array.isArray(value)) {
    const parts = value.map(item => (item === undefined ? 'null' : stableStringify(item)));
    return `[${parts.join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const entry = record[key];
    if (entry === undefined) continue;
    parts.push(`${JSON.stringify(key)}:${stableStringify(entry)}`);
  }
  return `{${parts.join(',')}}`;
}

/**
 * FNV-1a, 32 bits at a time, run twice with different offsets and concatenated.
 * 64 bits of output is ample for spotting a fork between four clients, and this
 * is a dozen lines with no dependency and no async — which matters, because it
 * runs on every checkpoint on a phone.
 */
export function digestString(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + c) >>> 0;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    h2 ^= h2 >>> 13;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Hash a whole `GameState`.
 *
 * Whole, not projected: because card identity lives in the `Knowledge` overlay
 * rather than in the state, every client genuinely holds the same object and
 * there is nothing to redact before hashing. That is the single biggest payoff
 * of keeping secrets outside the reducer — the integrity check compares
 * everything instead of comparing the subset we remembered to make public.
 */
export function digestState(state: GameState): string {
  return digestString(stableStringify(state));
}

/**
 * Where two states first differ, as a dotted path. Diagnostics only — this runs
 * when a fork has already been detected, never on the hot path.
 */
export function firstDivergence(a: unknown, b: unknown, path = ''): string | null {
  if (a === b) return null;

  const aObj = a !== null && typeof a === 'object';
  const bObj = b !== null && typeof b === 'object';
  if (!aObj || !bObj) return stableStringify(a) === stableStringify(b) ? null : path || '(root)';

  if (Array.isArray(a) !== Array.isArray(b)) return path || '(root)';

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}.length`;
    for (let i = 0; i < a.length; i++) {
      const found = firstDivergence(a[i], b[i], `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }

  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(ra), ...Object.keys(rb)])).sort();
  for (const key of keys) {
    const found = firstDivergence(ra[key], rb[key], path ? `${path}.${key}` : key);
    if (found) return found;
  }
  return null;
}
