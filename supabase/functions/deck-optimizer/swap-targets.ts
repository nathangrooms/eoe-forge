/**
 * Which cards are worth cutting — without lying about the ones we cannot measure.
 *
 * THE BUG THIS REPLACES
 * ---------------------
 * Swap targets used to come from one expression:
 *
 *     .filter(c => c.playability !== null && c.playability < 40 && !c.isCommander)
 *     .sort((a, b) => (a.playability || 0) - (b.playability || 0))
 *
 * The figure it reads is scraped from edhpowerlevel.com by `edh-power-check`,
 * which parses it out of a markdown table and writes `null` whenever the source
 * says `NaN` or the column is blank. Two things follow.
 *
 * First, the guard is thinner than it looks. `null !== null` is false so nulls
 * are excluded, and `undefined < 40` is false so undefined is excluded too —
 * but only by accident of how `<` treats non-numbers, not by intent. Change the
 * comparison to `<=`, or let a numeric `NaN` through a different parser, or
 * coerce with `Number(x) || 0` anywhere upstream, and every unmeasured card
 * instantly becomes a 0%-playability card at the very top of the cut list. The
 * `|| 0` on the very next line does exactly that to the sort order already.
 *
 * Second, and worse in practice: when the scrape yields nothing usable the list
 * is simply empty, and the optimiser asks a language model to pick cut targets
 * with no evidence at all — silently, with no indication that the "lowest
 * playability cards first" instruction in the prompt is referring to an empty
 * list.
 *
 * WHAT THIS DOES INSTEAD
 * ----------------------
 * A castability figure is used only when it is a real number in range. Anything
 * else — null, undefined, NaN, Infinity, "NaN", 105, -3 — is *unknown*, and
 * unknown never means low. When too few cards have a known figure, the shortfall
 * is filled from a measurement this function can make itself, and every target
 * carries the `source` it came from so nothing pretends to be a castability
 * reading it never had.
 *
 * Preference order, highest first:
 *   'castability'  a real engine figure supplied by the caller
 *   'playability'  the scraped edhpowerlevel figure, when finite
 *   'engine'       this deck's own cards ranked by the same signals used to
 *                  rank additions: no role the deck needs, no shared tags
 *
 * Pure. No network.
 */

import { normalizeName } from './catalog.ts';
import {
  scoreCandidate,
  type CandidateCard,
  type DeckProfile,
} from './_engine/deck/recommend/index.ts';

/** Inherited policy: below this a castability figure counts as a problem. */
export const LOW_CASTABILITY_PCT = 40;

export type CastabilitySource = 'castability' | 'playability' | 'engine';

export interface SwapTarget {
  name: string;
  /** The real figure, or null when nothing measured it. Never invented. */
  castability: number | null;
  source: CastabilitySource;
  /** Why this card is on the list, built from numbers. */
  reason: string;
}

/**
 * A percentage, or null.
 *
 * This is the whole safeguard, in one place, so it cannot be half-applied.
 * `null`, `undefined`, `NaN`, `Infinity`, `''`, `'NaN'` and out-of-range
 * numbers all return null — the caller then has to decide what to do about
 * "unknown", and cannot accidentally read it as zero.
 */
export function finitePct(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return n;
}

interface CastabilityEntry {
  pct: number;
  source: Exclude<CastabilitySource, 'engine'>;
}

/**
 * Gather whatever real castability figures the caller supplied.
 *
 * Reads, in decreasing order of trust: an explicit `castability` array, a
 * per-card `castability` field, then the scraped `edhAnalysis.cardAnalysis`
 * playability. A card already carrying a better-sourced figure is never
 * overwritten by a worse-sourced one.
 */
export function collectCastability(
  deckContext: Record<string, unknown> | null | undefined,
  edhAnalysis: Record<string, unknown> | null | undefined
): Map<string, CastabilityEntry> {
  const out = new Map<string, CastabilityEntry>();

  const offer = (name: unknown, raw: unknown, source: CastabilityEntry['source']) => {
    const key = normalizeName(String(name ?? ''));
    if (!key) return;
    const pct = finitePct(raw);
    if (pct === null) return;
    const prev = out.get(key);
    if (prev && prev.source === 'castability' && source !== 'castability') return;
    out.set(key, { pct, source });
  };

  // A real castability engine, supplied whole.
  const explicit = (deckContext as { castability?: unknown })?.castability;
  if (Array.isArray(explicit)) {
    for (const row of explicit) {
      const r = row as Record<string, unknown>;
      offer(r?.name, r?.pct ?? r?.castability ?? r?.playability, 'castability');
    }
  }

  // Or attached to the deck cards themselves.
  const cards = (deckContext as { cards?: unknown })?.cards;
  if (Array.isArray(cards)) {
    for (const row of cards) {
      const r = row as Record<string, unknown>;
      if (r && 'castability' in r) offer(r.name, r.castability, 'castability');
    }
  }

  // Failing both, the scrape.
  const analysis = (edhAnalysis as { cardAnalysis?: unknown })?.cardAnalysis;
  if (Array.isArray(analysis)) {
    for (const row of analysis) {
      const r = row as Record<string, unknown>;
      if (r?.isCommander) continue;
      offer(r?.name, r?.playability, 'playability');
    }
  }

  return out;
}

export interface DeckEntry {
  name: string;
  card: CandidateCard | null;
  quantity: number;
  isCommander: boolean;
}

/**
 * Choose cut candidates.
 *
 * Cards with a known-low figure come first, worst first. If that does not fill
 * `limit`, the rest come from this deck's own cards scored by the same signals
 * that rank additions — lowest first — and are labelled `engine` so nobody
 * mistakes them for a castability reading.
 *
 * Lands are never offered as swap targets: the land count is its own section,
 * with its own arithmetic, and cutting a land to add a spell is a different
 * decision from cutting a weak spell.
 */
export function chooseSwapTargets(
  deck: readonly DeckEntry[],
  castability: ReadonlyMap<string, CastabilityEntry>,
  profile: DeckProfile,
  limit: number
): SwapTarget[] {
  const eligible = deck.filter(
    e => !e.isCommander && e.card !== null && !/\bland\b/i.test(e.card!.typeLine)
  );

  const measured: SwapTarget[] = [];
  const unmeasured: DeckEntry[] = [];

  for (const entry of eligible) {
    const hit = castability.get(normalizeName(entry.name));
    if (hit && hit.pct < LOW_CASTABILITY_PCT) {
      measured.push({
        name: entry.name,
        castability: hit.pct,
        source: hit.source,
        reason: `${hit.pct}% castable (${hit.source === 'castability' ? 'measured' : 'scraped'})`,
      });
    } else if (!hit) {
      // No figure at all. NOT a low figure — it goes to the engine pass, where
      // it is judged on evidence this function actually holds.
      unmeasured.push(entry);
    }
    // A card with a known figure at or above the threshold is simply fine.
  }

  measured.sort((a, b) => (a.castability ?? 0) - (b.castability ?? 0) || a.name.localeCompare(b.name));

  if (measured.length >= limit) return measured.slice(0, limit);

  const scored = unmeasured
    .map(entry => {
      const { score, fillsRoles, shared } = scoreCandidate(entry.card!, profile);
      return { entry, score, fillsRoles, shared };
    })
    .sort((a, b) => a.score - b.score || a.entry.name.localeCompare(b.entry.name));

  const filler: SwapTarget[] = scored.slice(0, limit - measured.length).map(s => ({
    name: s.entry.name,
    castability: null,
    source: 'engine' as const,
    reason:
      s.shared.length === 0 && s.fillsRoles.length === 0
        ? `shares no tag with the deck and fills no role it is short of`
        : `weakest fit of the measured deck (${s.shared.length} shared ` +
          `${s.shared.length === 1 ? 'tag' : 'tags'}, fills ${s.fillsRoles.length} needed ` +
          `${s.fillsRoles.length === 1 ? 'role' : 'roles'})`,
  }));

  return [...measured, ...filler];
}
