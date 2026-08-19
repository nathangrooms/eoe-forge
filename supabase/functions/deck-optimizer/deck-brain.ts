/**
 * The optimiser's half of the shared brain.
 *
 * WHAT THIS REPLACES, AND WHY IT MATTERED
 * ---------------------------------------
 * `swap-targets.ts` used to choose cuts from a castability figure the **client**
 * had put in the request body, which the client in turn had scraped off
 * edhpowerlevel.com. Its own header documented the trap that arrangement left
 * behind:
 *
 *   > Change the comparison to `<=`, or let a numeric `NaN` through a different
 *   > parser, or coerce with `Number(x) || 0` anywhere upstream, and every
 *   > unmeasured card instantly becomes a 0%-playability card at the very top
 *   > of the cut list.
 *
 * It guarded that carefully and correctly. What it could not do was measure
 * anything: when the scrape returned nothing, the cut list was empty and the
 * model was asked to choose cuts from no evidence at all, with the prompt still
 * telling it to prefer "lowest playability cards first".
 *
 * The engine now travels with this function, byte for byte, so castability is
 * computed here from the decklist in front of it. Two consequences:
 *
 *   1. The optimiser produces the **same power score** the deck page shows,
 *     from the same code, so "your score is 5.2" and "cut this card" are two
 *     views of one evaluation rather than two systems guessing separately.
 *   2. "Unmeasured" has stopped being the common case. The rule that unmeasured
 *     never means low is kept anyway, because a card with no mana cost still has
 *     no castability figure.
 *
 * WHAT THE FUNCTION STILL HAS TO DO ITSELF
 * ----------------------------------------
 * Turn PostgREST rows into engine cards. That conversion is here rather than in
 * the engine because the engine must not know what our table looks like; it is
 * the same reason `src/lib/deck/power.ts` carries its own adapters.
 */

import { normalizeName, type CatalogRow } from './catalog.ts';
import { evaluateDeck } from './_engine/evaluate.ts';
import type { EngineCard, EngineDeckEntry } from './_engine/core/card.ts';
import type { CutTarget } from './_engine/advise/cuts.ts';
import type { DeckEvaluation } from './_engine/evaluate.ts';

export type { CutTarget, DeckEvaluation };

/** Inherited policy: below this a castability figure counts as a problem. */
export const LOW_CASTABILITY_PCT = 40;

/**
 * A percentage, or null.
 *
 * Kept from `swap-targets.ts` because it is still the right shape for reading
 * anything a client sent. `null`, `undefined`, `NaN`, `Infinity`, `''`, `'NaN'`
 * and out-of-range numbers all return null, so the caller has to decide what to
 * do about "unknown" and cannot accidentally read it as zero.
 */
export function finitePct(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return n;
}

/** One line of the user's deck, resolved against the catalogue. */
export interface ResolvedDeckLine {
  name: string;
  row: CatalogRow | null;
  quantity: number;
  isCommander: boolean;
}

/**
 * A PostgREST row to an engine card.
 *
 * `oracle_text` matters more than it looks: without it the castability engine
 * cannot see that a Command Tower makes five colours or that a Signet makes
 * mana at all, so every non-basic source would vanish and the whole deck would
 * read as uncastable. `catalog.cardsByName` selects it for exactly this reason,
 * and `poolFor` deliberately does not, because that query returns thirty
 * thousand rows and the ranker never reads the text.
 */
export function toEngineCard(row: CatalogRow): EngineCard {
  return {
    name: row.name,
    type_line: row.type_line ?? '',
    mana_cost: row.mana_cost ?? null,
    cmc: typeof row.cmc === 'string' ? Number(row.cmc) : (row.cmc ?? 0),
    oracle_text: row.oracle_text ?? null,
    color_identity: row.color_identity ?? [],
    keywords: row.keywords ?? [],
    legalities: row.legalities ?? {},
    oracle_id: row.oracle_id ?? row.id,
    usd: row.usd === null || row.usd === undefined ? null : Number(row.usd) || null,
    // The column is already populated by `scryfall-sync` from the same rules the
    // engine would use, so reading it is both free and identical.
    tags: row.tags ?? null,
  };
}

/**
 * Evaluate the user's deck exactly as the deck page does.
 *
 * Lines that did not resolve against the catalogue are dropped rather than
 * guessed at. A card we cannot look up has no cost, no type and no tags, and
 * feeding a blank into the engine would drag every subscore down for a card the
 * user does have. The caller already reports unresolved names separately.
 */
export function evaluateUserDeck(
  lines: readonly ResolvedDeckLine[],
  format: string
): DeckEvaluation {
  const entries: EngineDeckEntry[] = [];
  for (const line of lines) {
    if (!line.row) continue;
    entries.push({
      card: toEngineCard(line.row),
      quantity: line.quantity,
      isCommander: line.isCommander,
    });
  }
  return evaluateDeck(entries, { format, threshold: LOW_CASTABILITY_PCT });
}

/* ------------------------------------------------------------------ *
 * The response shape, unchanged
 * ------------------------------------------------------------------ */

export type CastabilitySource = 'engine-castability' | 'engine-fit';

/**
 * The shape this function has always returned for a cut candidate.
 *
 * `castability` is still `number | null` and `null` still means "no figure
 * exists", never "0%". What has changed is that `source` can no longer be
 * `'playability'`: nothing here reads a scraped number any more.
 */
export interface SwapTarget {
  name: string;
  castability: number | null;
  source: CastabilitySource;
  reason: string;
}

export function toSwapTargets(cuts: readonly CutTarget[], limit: number): SwapTarget[] {
  return cuts.slice(0, limit).map(cut => ({
    name: cut.name,
    castability: cut.castabilityPct,
    source: cut.grounds === 'uncastable' ? 'engine-castability' : 'engine-fit',
    reason: cut.reason,
  }));
}
