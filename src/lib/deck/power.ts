/**
 * THE deck power score. The accessor every surface uses.
 *
 * The model is in `src/engine/power/`, so an edge function can carry a
 * byte-identical copy of it and reach the same number. The deterministic half
 * of the adapter is in `./powerAdapter.ts`, so `node --test` can reach it
 * without a Supabase client. This file is what is left: reading and writing
 * `user_decks.edh_analysis`, plus a re-export of everything else so that the
 * twenty-six modules importing `@/lib/deck/power` did not have to change.
 *
 * The one rule that matters: there is no second model, no second scale and no
 * second set of band thresholds anywhere in this repository, and
 * `src/engine/one-brain.test.ts` fails if that stops being true.
 */

import { supabase } from '@/integrations/supabase/client';
import { fetchDeckCards } from '@/lib/deck/deckCards';
import {
  POWER_ENGINE_VERSION,
  computeDeckPower,
  deckListHash,
  entriesFromDeckRows,
  bandForScore,
  bracketIdForScore,
  bandLabel,
  DECK_BRACKETS,
  type DeckPower,
  type DeckPowerDiagnostics,
  type DeckPowerSubscores,
  type PowerBand,
  type BracketId,
  type Subscore,
  type CastabilityReadout,
} from './powerAdapter.ts';

export * from './powerAdapter.ts';

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

/**
 * Stored form. Lives at `user_decks.edh_analysis.deckmatrix`, next to — and
 * deliberately separate from — the `metrics` block the edhpowerlevel.com
 * scraper writes. Two different opinions, two different keys, never merged
 * into one field.
 *
 * The evidence is stored too. It is a few kilobytes and it is the difference
 * between a stored score you can still explain and a stored number.
 */
export interface StoredDeckPower {
  version: number;
  score: number;
  /** The weighted mean before the curve and the adjustments. See DeckPower.raw.
      Optional: scores stored before it existed do not carry it, and the panel
      that shows the working hides itself rather than inventing a figure. */
  raw?: number;
  band: PowerBand;
  bracket: BracketId;
  subscores: DeckPowerSubscores;
  evidence: Subscore[];
  castability: CastabilityReadout;
  diagnostics: DeckPowerDiagnostics;
  drivers: string[];
  drags: string[];
  legality: { ok: boolean; issues: string[] };
  unreliable: boolean;
  hash: string;
  scoredAt: string;
}

function toStored(power: DeckPower): StoredDeckPower {
  return {
    version: POWER_ENGINE_VERSION,
    score: power.score,
    raw: power.raw,
    band: power.band,
    bracket: power.bracket,
    subscores: power.subscores,
    evidence: power.evidence,
    castability: power.castability,
    diagnostics: power.diagnostics,
    drivers: power.drivers,
    drags: power.drags,
    legality: power.legality,
    unreliable: power.unreliable,
    hash: power.hash,
    scoredAt: power.scoredAt,
  };
}

/**
 * The two columns a cached score writes, without the read that precedes them in
 * `persistDeckPower`.
 *
 * That function reads `edh_analysis` first so the scraper's own keys survive
 * the merge, which costs a request every time the score moves. A page that
 * already holds the column — the deck page loads it with the deck — can merge
 * locally and write once. Same two columns, same shape, one request.
 */
export function deckPowerRecord(power: DeckPower): {
  power_level: number;
  deckmatrix: StoredDeckPower;
} {
  return {
    power_level: Math.max(1, Math.min(10, Math.round(power.score))),
    deckmatrix: toStored(power),
  };
}

/** What a stored score has instead of a computed cut list: nothing. */
const EMPTY_READOUT: CastabilityReadout = {
  averagePct: null,
  medianPct: null,
  hardToCastCount: 0,
  threshold: 50,
  scoredCount: 0,
  avgManaValue: 0,
  landCount: 0,
  manaRocksAndDorks: 0,
  untappedLandPct: 0,
  keepable7Pct: null,
  turnOneColourPct: null,
  sourcesByColour: { W: 0, U: 0, B: 0, R: 0, G: 0 },
  hardest: [],
  approximate: false,
};

/**
 * Rehydrate a stored score.
 *
 * `currentHash` is the hash of the decklist as it stands *now*. When it does
 * not match what the score was computed from, the result comes back with
 * `stale: true` and every renderer treats it as "needs rescoring" rather than
 * as the deck's power.
 *
 * `cuts` comes back empty. A cut list is only meaningful against a live
 * decklist, and returning a stored one would let a page suggest cutting a card
 * that is no longer in the deck.
 */
export function deckPowerFromStored(
  stored: unknown,
  currentHash: string | null
): DeckPower | null {
  const raw = stored as Partial<StoredDeckPower> | null | undefined;
  if (!raw || typeof raw !== 'object') return null;
  if (raw.version !== POWER_ENGINE_VERSION) return null;
  if (typeof raw.score !== 'number' || Number.isNaN(raw.score)) return null;

  const score = Math.round(raw.score * 10) / 10;
  const band = raw.band ?? bandForScore(score);

  return {
    score,
    raw: typeof raw.raw === 'number' ? raw.raw : undefined,
    band,
    bracket: raw.bracket ?? bracketIdForScore(score),
    subscores: (raw.subscores ?? {}) as DeckPowerSubscores,
    evidence: raw.evidence ?? [],
    castability: raw.castability ?? EMPTY_READOUT,
    cuts: [],
    /* The three named lists in `DeckPowerDiagnostics` were added after v2
       shipped, so a stored score written before them carries the counts and not
       the names. Empty arrays rather than absent keys, so a renderer can test
       `.length` without first asking whether the field exists — and an empty
       list beside a count of three reads as "not recorded", which is exactly
       what it is. */
    diagnostics: {
      tutorCount: 0,
      gameChangerCount: 0,
      noTutors: false,
      noGameChangers: false,
      gameChangerList: [],
      tutorList: [],
      comboList: [],
      ...(raw.diagnostics ?? {}),
    },
    drivers: raw.drivers ?? [],
    drags: raw.drags ?? [],
    legality: raw.legality ?? { ok: true, issues: [] },
    unreliable: raw.unreliable ?? false,
    hash: raw.hash ?? '',
    scoredAt: raw.scoredAt ?? '',
    stale: currentHash !== null && raw.hash !== currentHash,
    source: 'stored',
    engineVersion: POWER_ENGINE_VERSION,
  };
}

/** Shape `compute_deck_summary` returns for a deck's cards. */
interface SummaryCardRow {
  card_name?: string;
  quantity?: number;
  is_sideboard?: boolean;
}

/**
 * Read the canonical score out of a `compute_deck_summary` payload.
 *
 * The RPC's own `power.score` is the legacy field — the edhpowerlevel.com
 * scrape falling back to the integer column — so it is ignored entirely. The
 * score comes from `edhAnalysis.deckmatrix`, and staleness is decided here by
 * re-hashing the card list the same payload already carries. That keeps this
 * correct whether or not the accompanying SQL migration has been applied.
 */
export function deckPowerFromSummary(summary: unknown): DeckPower | null {
  const raw = summary as
    | { edhAnalysis?: { deckmatrix?: unknown } | null; cards?: SummaryCardRow[] | null }
    | null
    | undefined;
  if (!raw) return null;

  const stored = raw.edhAnalysis?.deckmatrix;
  if (!stored) return null;

  const cards = Array.isArray(raw.cards) ? raw.cards : null;
  const currentHash = cards
    ? deckListHash(
        cards
          .filter(c => !c.is_sideboard)
          .map(c => ({ name: c.card_name ?? '', quantity: Number(c.quantity ?? 1) }))
      )
    : null;

  return deckPowerFromStored(stored, currentHash);
}

/**
 * Persist a freshly computed score.
 *
 * Merges into `edh_analysis` so the scraper's own keys survive, and mirrors the
 * rounded score into the legacy `power_level` integer column so anything still
 * reading it gets a number that at least came from this engine. This is the
 * **only** place either is written from the client.
 */
export async function persistDeckPower(deckId: string, power: DeckPower): Promise<void> {
  if (!deckId || power.stale) return;

  try {
    const { data, error: readError } = await supabase
      .from('user_decks')
      .select('edh_analysis')
      .eq('id', deckId)
      .maybeSingle();

    if (readError) throw readError;

    const existing =
      data?.edh_analysis && typeof data.edh_analysis === 'object' && !Array.isArray(data.edh_analysis)
        ? (data.edh_analysis as Record<string, unknown>)
        : {};

    const { error } = await supabase
      .from('user_decks')
      .update({
        edh_analysis: { ...existing, deckmatrix: toStored(power) } as never,
        power_level: Math.max(1, Math.min(10, Math.round(power.score))),
      })
      .eq('id', deckId);

    if (error) throw error;
  } catch (error) {
    // A failed cache write must never break the surface that computed the
    // score — the number on screen is already correct.
    console.warn('Could not persist deck power:', error);
  }
}

/**
 * Score a deck by id: load its list, compute, persist, return.
 *
 * Used by the surfaces that only hold a summary (the deck list backfill) and
 * by anything that wants a guaranteed-fresh number without holding the cards.
 */
export async function scoreDeckById(
  deckId: string,
  format: string,
  options: { persist?: boolean } = {}
): Promise<DeckPower | null> {
  try {
    const rows = await fetchDeckCards(deckId);
    const power = computeDeckPower(entriesFromDeckRows(rows), { format });
    if (power && options.persist !== false) await persistDeckPower(deckId, power);
    return power;
  } catch (error) {
    console.error(`Could not score deck ${deckId}:`, error);
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

/** One decimal, always. The 2dp scrape readout was the giveaway that a second
 *  number was on screen; there is only one format now. */
export function formatPowerScore(score: number): string {
  return score.toFixed(1);
}

/** `6.6 · High power · Bracket 4` — for titles and aria labels. */
export function describeDeckPower(power: DeckPower): string {
  return `${formatPowerScore(power.score)}/10 · ${bandLabel(power.band)} · Bracket ${power.bracket} ${
    DECK_BRACKETS[power.bracket].name
  }`;
}
