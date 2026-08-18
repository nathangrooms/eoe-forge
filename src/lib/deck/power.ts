/**
 * THE deck power score.
 *
 * DeckMatrix used to carry five different "power" numbers — `powerLevel`,
 * `powerScore`, `edhPower`, `user_decks.power_level` and `power.score` — each
 * produced by a different model on a different scale, so one deck could read
 * 5 on the dashboard, 6.28 in the builder banner and 6.6 in the analysis modal
 * at the same moment.
 *
 * This module is the only producer. Every surface calls {@link computeDeckPower}
 * (or reads a stored result through {@link deckPowerFromSummary}) and renders
 * the result through `@/components/deck/PowerScore`. There is no second model,
 * no second scale and no second set of band thresholds.
 *
 * The engine underneath is `EDHPowerCalculator` — nine weighted subscores over
 * four curated catalogues, mapped through a logistic to 1–10, plus a seeded
 * 10,000-iteration Monte Carlo for the playability figures. That engine is
 * deliberately *not* re-exported: callers get {@link DeckPower}, a flat shape
 * with one scale per field, so nothing downstream can invent its own rescaling.
 *
 * ## Staleness
 *
 * A score is only meaningful for the decklist it was computed from, so every
 * result carries the {@link deckListHash} of that list. A stored score whose
 * hash no longer matches the deck is returned with `stale: true`, and
 * `PowerScore` refuses to render a stale number as if it were current. A wrong
 * number shown confidently is worse than no number.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Card as EngineCard } from '@/lib/deckbuilder/types';
import type { Card as StoreCard } from '@/stores/deckStore';
import {
  EDHPowerCalculator,
  type EDHPowerScore,
} from '@/lib/deckbuilder/score/edh-power-calculator';
import { DeckCoach, type CoachingOperation } from '@/lib/deckbuilder/score/coach';
import { fetchDeckCards, type DeckCardRow } from '@/lib/deck/deckCards';

/* ------------------------------------------------------------------ *
 * Bands, brackets and colour
 * ------------------------------------------------------------------ */

export type PowerBand = 'casual' | 'mid' | 'high' | 'cedh';

/**
 * The one threshold table.
 *
 * These are `EDHPowerCalculator.defaultConfig.thresholds`. Before unification
 * four different sets of cuts were live at once (the SQL summary used 3/6/8,
 * the tile bracket helper used 2/4/6/8, the meter's text colour used 3/6/8 and
 * the engine used 3.4/6.6/8.5), so a deck at 6.5 was "high" on the tile and
 * "mid" in the analysis panel. Anything that needs a cut imports these.
 */
export const POWER_BANDS = {
  casualMax: 3.4,
  midMax: 6.6,
  highMax: 8.5,
} as const;

export function bandForScore(score: number): PowerBand {
  if (score <= POWER_BANDS.casualMax) return 'casual';
  if (score <= POWER_BANDS.midMax) return 'mid';
  if (score <= POWER_BANDS.highMax) return 'high';
  return 'cedh';
}

const BAND_LABEL: Record<PowerBand, string> = {
  casual: 'Casual',
  mid: 'Mid power',
  high: 'High power',
  cedh: 'cEDH',
};

export function bandLabel(band: PowerBand): string {
  return BAND_LABEL[band];
}

/** Short form for tiles, where the band sits next to the number. */
const BAND_SHORT: Record<PowerBand, string> = {
  casual: 'Casual',
  mid: 'Mid',
  high: 'High',
  cedh: 'cEDH',
};

export function bandShortLabel(band: PowerBand): string {
  return BAND_SHORT[band];
}

/**
 * `text-power-1|4|7|10` are the registered power tokens — the only colour the
 * monochrome palette allows for this readout. Keyed off the band so the colour
 * and the word can never disagree.
 */
export function powerTextClass(band: PowerBand): string {
  switch (band) {
    case 'casual':
      return 'text-power-1';
    case 'mid':
      return 'text-power-4';
    case 'high':
      return 'text-power-7';
    case 'cedh':
      return 'text-power-10';
  }
}

export function powerFillClass(band: PowerBand): string {
  switch (band) {
    case 'casual':
      return 'bg-power-1';
    case 'mid':
      return 'bg-power-4';
    case 'high':
      return 'bg-power-7';
    case 'cedh':
      return 'bg-power-10';
  }
}

export type BracketId = 1 | 2 | 3 | 4 | 5;

export interface DeckBracket {
  id: BracketId;
  name: string;
  blurb: string;
}

/** Wizards' Commander Brackets, worded to match the EDH analysis panel. */
export const DECK_BRACKETS: Record<BracketId, DeckBracket> = {
  1: {
    id: 1,
    name: 'Exhibition',
    blurb: 'No extra turns, no mass land denial, no two-card combos, no game changers',
  },
  2: {
    id: 2,
    name: 'Core',
    blurb: 'No chained extra turns, no mass land denial, no two-card combos',
  },
  3: {
    id: 3,
    name: 'Upgraded',
    blurb: 'Late-game combos only, at most three game changers',
  },
  4: { id: 4, name: 'Optimized', blurb: 'No restrictions — built to win' },
  5: { id: 5, name: 'cEDH', blurb: 'Competitive, tuned against the strongest decks' },
};

/**
 * Score → bracket, straddling the same cuts as {@link bandForScore} so a
 * "Casual" deck can only ever land in bracket 1 or 2. Bracket 1 splits the
 * casual band; every other boundary *is* a band boundary.
 */
export function bracketIdForScore(score: number): BracketId {
  if (score <= 2) return 1;
  if (score <= POWER_BANDS.casualMax) return 2;
  if (score <= POWER_BANDS.midMax) return 3;
  if (score <= POWER_BANDS.highMax) return 4;
  return 5;
}

export function bracketForScore(score: number): DeckBracket {
  return DECK_BRACKETS[bracketIdForScore(score)];
}

/* ------------------------------------------------------------------ *
 * The result shape
 * ------------------------------------------------------------------ */

export type SubscoreKey =
  | 'speed'
  | 'interaction'
  | 'tutors'
  | 'resilience'
  | 'card_advantage'
  | 'mana'
  | 'consistency'
  | 'stax_pressure'
  | 'synergy';

/** Weights the engine applies. Surfaced so the breakdown can explain itself. */
export const SUBSCORE_WEIGHTS: Record<SubscoreKey, number> = {
  speed: 0.2,
  interaction: 0.15,
  tutors: 0.12,
  resilience: 0.12,
  mana: 0.12,
  consistency: 0.12,
  card_advantage: 0.1,
  stax_pressure: 0.04,
  synergy: 0.03,
};

/** Display order: heaviest contribution first, so the breakdown reads as a cause. */
export const SUBSCORE_ORDER: SubscoreKey[] = [
  'speed',
  'interaction',
  'tutors',
  'resilience',
  'mana',
  'consistency',
  'card_advantage',
  'stax_pressure',
  'synergy',
];

export const SUBSCORE_LABELS: Record<SubscoreKey, string> = {
  speed: 'Speed',
  interaction: 'Interaction',
  tutors: 'Tutors',
  resilience: 'Resilience',
  card_advantage: 'Card advantage',
  mana: 'Mana base',
  consistency: 'Consistency',
  stax_pressure: 'Stax pressure',
  synergy: 'Synergy',
};

export const SUBSCORE_DESCRIPTIONS: Record<SubscoreKey, string> = {
  speed: 'Fast mana and a low curve — how early the deck can act',
  interaction: 'Removal, counterspells and other answers',
  tutors: 'Search effects that make the game plan repeatable',
  resilience: 'Protection, recursion and recovery after a wipe',
  card_advantage: 'Draw engines that stop the deck running out of gas',
  mana: 'Fixing, untapped sources and land count',
  consistency: 'Curve, redundancy and how often the deck does its thing',
  stax_pressure: 'Resource denial applied to the rest of the table',
  synergy: 'How well the list works with its commander and itself',
};

/** Every subscore is 0–100. One scale, everywhere. */
export type DeckPowerSubscores = Record<SubscoreKey, number>;

/**
 * The seeded simulation figures. Percentages are 0–100; `avgManaValue` and
 * `expectedWinTurn` are plain floats. Seed is fixed at {@link POWER_SEED} so
 * two surfaces scoring the same list get byte-identical numbers.
 */
export interface DeckPowerSimulation {
  keepable7Pct: number;
  t1ColorPct: number;
  t2TwoColorsPct: number;
  untappedLandPct: number;
  avgManaValue: number;
  manaRocksAndDorks: number;
  expectedWinTurn: number;
  comboPresent: boolean;
}

export interface DeckPowerDiagnostics {
  tutorCount: number;
  gameChangerCount: number;
  noTutors: boolean;
  noGameChangers: boolean;
}

/** The single typed result. Nothing else in the app describes a power score. */
export interface DeckPower {
  /** 1–10, one decimal. The number. */
  score: number;
  band: PowerBand;
  bracket: BracketId;
  subscores: DeckPowerSubscores;
  simulation: DeckPowerSimulation;
  diagnostics: DeckPowerDiagnostics;
  /** Human-readable strengths and weaknesses straight from the engine. */
  drivers: string[];
  drags: string[];
  legality: { ok: boolean; issues: string[] };
  /** Hash of the decklist this score was computed from. */
  hash: string;
  /** ISO timestamp of the computation. */
  scoredAt: string;
  /**
   * True when this is a stored score whose decklist has since changed. A stale
   * score must never be rendered as the deck's current power.
   */
  stale: boolean;
  /** `engine` = computed here and now; `stored` = read back from the database. */
  source: 'engine' | 'stored';
  engineVersion: number;
}

/**
 * Bumped whenever the engine, its catalogues or this adapter change in a way
 * that would move scores. Stored results from an older version are treated as
 * absent rather than shown alongside fresh ones.
 */
export const POWER_ENGINE_VERSION = 1;

/** Fixed simulation seed. Determinism is the whole point. */
export const POWER_SEED = 42;

/* ------------------------------------------------------------------ *
 * Deck list input
 * ------------------------------------------------------------------ */

/**
 * One decklist row. Quantity matters: the engine's simulation shuffles the
 * real deck, so a list stored as "Forest ×10" has to become ten cards or the
 * keepable-seven figure is computed against a 60-card deck that does not exist.
 */
export interface PowerDeckEntry {
  card: EngineCard;
  quantity: number;
  isCommander?: boolean;
}

/**
 * Quantity-aware, order-independent decklist hash (FNV-1a, hex).
 *
 * The builder's old `generateCardsHash` sorted names and ignored quantity, so
 * swapping three Islands for three Mountains of the same count left the hash
 * unchanged and the cached score looked current. This one folds quantity in.
 */
export function deckListHash(entries: Array<{ name: string; quantity: number }>): string {
  const normalized = entries
    .filter(e => e?.name)
    .map(e => `${e.name.trim().toLowerCase()}:${Math.max(1, Math.round(e.quantity || 1))}`)
    .sort()
    .join('|');

  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16).padStart(8, '0')}-${normalized.length.toString(16)}`;
}

function entryHash(entries: PowerDeckEntry[]): string {
  return deckListHash(entries.map(e => ({ name: e.card.name, quantity: e.quantity })));
}

/* ------------------------------------------------------------------ *
 * Adapters — every card shape in the app funnels through one of these
 * ------------------------------------------------------------------ */

function blankEngineCard(name: string): EngineCard {
  return {
    id: '',
    oracle_id: '',
    name,
    mana_cost: '',
    cmc: 0,
    type_line: '',
    oracle_text: '',
    colors: [],
    color_identity: [],
    keywords: [],
    legalities: {},
    prices: { usd: '0' },
    set: '',
    set_name: '',
    collector_number: '',
    rarity: 'common',
    layout: 'normal',
    is_legendary: false,
    tags: new Set<string>(),
    derived: { mv: 0, colorPips: {}, producesMana: false, etbTapped: false },
  };
}

/** Deck rows loaded by `fetchDeckCards` (deck detail page, analysis modal). */
export function entriesFromDeckRows(rows: DeckCardRow[]): PowerDeckEntry[] {
  return rows
    .filter(row => !row.is_sideboard)
    .map(row => {
      const base = blankEngineCard(row.card?.name || row.card_name);
      const card: EngineCard = {
        ...base,
        id: row.card_id,
        oracle_id: row.card_id,
        mana_cost: row.card?.mana_cost || '',
        cmc: row.card?.cmc ?? 0,
        type_line: row.card?.type_line || '',
        oracle_text: row.card?.oracle_text || '',
        colors: row.card?.colors ?? [],
        color_identity: row.card?.color_identity ?? [],
        power: row.card?.power ?? undefined,
        toughness: row.card?.toughness ?? undefined,
        keywords: row.card?.keywords ?? [],
        legalities: (row.card?.legalities ?? {}) as EngineCard['legalities'],
        prices: { usd: row.card?.prices?.usd ?? '0' },
        set: row.card?.set_code || '',
        set_name: row.card?.set_code || '',
        rarity: (row.card?.rarity as EngineCard['rarity']) || 'common',
        is_legendary:
          row.card?.is_legendary ??
          (row.card?.type_line || '').toLowerCase().includes('legendary'),
        derived: {
          mv: row.card?.cmc ?? 0,
          colorPips: {},
          producesMana: false,
          etbTapped: false,
        },
      };
      return { card, quantity: Math.max(1, row.quantity || 1), isCommander: row.is_commander };
    });
}

/** Zustand store cards (builder, AI builder, public deck page). */
export function entriesFromStoreCards(
  cards: StoreCard[],
  commander?: StoreCard | null
): PowerDeckEntry[] {
  const convert = (card: StoreCard, isCommander: boolean): PowerDeckEntry => {
    const base = blankEngineCard(card.name);
    return {
      quantity: Math.max(1, card.quantity || 1),
      isCommander,
      card: {
        ...base,
        id: card.id || '',
        oracle_id: card.id || '',
        mana_cost: card.mana_cost || '',
        cmc: card.cmc ?? 0,
        type_line: card.type_line || '',
        oracle_text: card.oracle_text || '',
        colors: card.colors ?? [],
        // Colour identity is not the same thing as colour. Aliasing the two
        // scored every deck against the wrong commander baseline.
        color_identity: card.color_identity?.length ? card.color_identity : (card.colors ?? []),
        power: card.power,
        toughness: card.toughness,
        keywords: card.mechanics ?? card.keywords ?? [],
        legalities: (card.legalities ?? {}) as EngineCard['legalities'],
        prices: { usd: card.prices?.usd ?? '0' },
        set: card.set || '',
        set_name: card.set_name || '',
        collector_number: card.collector_number || '',
        rarity: (card.rarity as EngineCard['rarity']) || 'common',
        layout: card.layout || 'normal',
        is_legendary: (card.type_line || '').toLowerCase().includes('legendary'),
        derived: { mv: card.cmc ?? 0, colorPips: {}, producesMana: false, etbTapped: false },
      },
    };
  };

  const entries = cards.map(card => convert(card, card.category === 'commanders'));

  // A commander held outside the card list (the builder keeps it in its own
  // slot) still has to be scored, or colour identity and synergy evaluate
  // against no commander at all.
  if (commander && !entries.some(e => e.isCommander && e.card.name === commander.name)) {
    entries.unshift(convert(commander, true));
  }
  return entries;
}

/** Plain `{name, quantity}` lists — AI build results, imports. */
export function entriesFromNamedCards(
  cards: Array<{ name: string; quantity?: number; isCommander?: boolean }>
): PowerDeckEntry[] {
  return cards.map(c => ({
    card: blankEngineCard(c.name),
    quantity: Math.max(1, c.quantity || 1),
    isCommander: c.isCommander,
  }));
}

/* ------------------------------------------------------------------ *
 * The one accessor
 * ------------------------------------------------------------------ */

export interface ComputeDeckPowerOptions {
  format?: string;
  /** Overrides the commander found via `isCommander` on the entries. */
  commander?: EngineCard;
}

/** Small memo so a tile, a modal and a panel scoring the same list pay once. */
const scoreCache = new Map<string, DeckPower>();
const SCORE_CACHE_LIMIT = 64;

function cacheScore(key: string, value: DeckPower) {
  if (scoreCache.size >= SCORE_CACHE_LIMIT) {
    const oldest = scoreCache.keys().next().value;
    if (oldest !== undefined) scoreCache.delete(oldest);
  }
  scoreCache.set(key, value);
}

function toSimulation(engine: EDHPowerScore): DeckPowerSimulation {
  return {
    keepable7Pct: engine.playability.keepable7_pct,
    t1ColorPct: engine.playability.t1_color_hit_pct,
    t2TwoColorsPct: engine.playability.t2_two_colors_hit_pct,
    untappedLandPct: engine.playability.untapped_land_ratio,
    avgManaValue: engine.playability.avg_cmc,
    manaRocksAndDorks: engine.playability.rocks_dorks_count,
    expectedWinTurn: engine.goldfish.exp_win_turn,
    comboPresent: engine.goldfish.combo_presence,
  };
}

/**
 * Score a decklist. **This is the only way a power number is produced.**
 *
 * Returns `null` for an empty list rather than a zero — "no cards" is not a
 * power level, and rendering 0/10 for an empty deck is exactly the kind of
 * confident-but-wrong number this module exists to remove.
 */
export function computeDeckPower(
  entries: PowerDeckEntry[],
  options: ComputeDeckPowerOptions = {}
): DeckPower | null {
  const usable = entries.filter(e => e?.card?.name);
  if (usable.length === 0) return null;

  const format = options.format || 'commander';
  const hash = entryHash(usable);
  const cacheKey = `${format}:${hash}`;
  const cached = scoreCache.get(cacheKey);
  if (cached) return cached;

  const commander =
    options.commander ?? usable.find(e => e.isCommander)?.card ?? undefined;

  // Expand quantities. The simulation shuffles this array as the real deck.
  const expanded: EngineCard[] = [];
  for (const entry of usable) {
    if (entry.isCommander && entry.card.name === commander?.name) continue;
    for (let i = 0; i < entry.quantity; i++) expanded.push(entry.card);
  }
  if (expanded.length === 0) return null;

  let engine: EDHPowerScore;
  try {
    engine = EDHPowerCalculator.calculatePower(expanded, format, POWER_SEED, commander);
  } catch (error) {
    console.error('Deck power calculation failed:', error);
    return null;
  }

  const score = Math.round(engine.power * 10) / 10;
  const band = bandForScore(score);

  const result: DeckPower = {
    score,
    band,
    bracket: bracketIdForScore(score),
    subscores: engine.subscores,
    simulation: toSimulation(engine),
    diagnostics: {
      tutorCount: engine.diagnostics.tutors.count_raw,
      gameChangerCount: engine.diagnostics.game_changers.count,
      noTutors: engine.flags.no_tutors,
      noGameChangers: engine.flags.no_game_changers,
    },
    drivers: engine.drivers,
    drags: engine.drags,
    legality: engine.legality,
    hash,
    scoredAt: new Date().toISOString(),
    stale: false,
    source: 'engine',
    engineVersion: POWER_ENGINE_VERSION,
  };

  cacheScore(cacheKey, result);
  return result;
}

/**
 * Coaching towards a target power level.
 *
 * A *target* is not a score — it is where the player wants the deck to land.
 * Keeping the two apart in the type system is half the reason this module
 * exists, so coaching takes the canonical {@link DeckPower} plus a separate
 * target rather than overloading one number with both meanings.
 */
export function coachDeckPower(
  entries: PowerDeckEntry[],
  power: DeckPower,
  targetPower: number,
  format = 'commander'
): { recommendations: string[]; operations: CoachingOperation[] } {
  const expanded: EngineCard[] = [];
  for (const entry of entries) {
    for (let i = 0; i < Math.max(1, entry.quantity); i++) expanded.push(entry.card);
  }

  try {
    return DeckCoach.generateRecommendations(
      {
        subscores: power.subscores,
        targetPower,
        currentPower: power.score,
        format,
        commander: entries.find(e => e.isCommander)?.card,
      },
      expanded
    );
  } catch (error) {
    console.error('Deck coaching failed:', error);
    return { recommendations: [], operations: [] };
  }
}

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

/**
 * Stored form. Lives at `user_decks.edh_analysis.deckmatrix`, next to — and
 * deliberately separate from — the `metrics` block the edhpowerlevel.com
 * scraper writes. Two different opinions, two different keys, never merged
 * into one field.
 */
export interface StoredDeckPower {
  version: number;
  score: number;
  band: PowerBand;
  bracket: BracketId;
  subscores: DeckPowerSubscores;
  simulation: DeckPowerSimulation;
  diagnostics: DeckPowerDiagnostics;
  drivers: string[];
  drags: string[];
  legality: { ok: boolean; issues: string[] };
  hash: string;
  scoredAt: string;
}

function toStored(power: DeckPower): StoredDeckPower {
  return {
    version: POWER_ENGINE_VERSION,
    score: power.score,
    band: power.band,
    bracket: power.bracket,
    subscores: power.subscores,
    simulation: power.simulation,
    diagnostics: power.diagnostics,
    drivers: power.drivers,
    drags: power.drags,
    legality: power.legality,
    hash: power.hash,
    scoredAt: power.scoredAt,
  };
}

/**
 * Rehydrate a stored score.
 *
 * `currentHash` is the hash of the decklist as it stands *now*. When it does
 * not match what the score was computed from, the result comes back with
 * `stale: true` and every renderer treats it as "needs rescoring" rather than
 * as the deck's power.
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
    band,
    bracket: raw.bracket ?? bracketIdForScore(score),
    subscores: (raw.subscores ?? {}) as DeckPowerSubscores,
    simulation: (raw.simulation ?? {}) as DeckPowerSimulation,
    diagnostics:
      raw.diagnostics ??
      ({ tutorCount: 0, gameChangerCount: 0, noTutors: false, noGameChangers: false } as const),
    drivers: raw.drivers ?? [],
    drags: raw.drags ?? [],
    legality: raw.legality ?? { ok: true, issues: [] },
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
