/**
 * THE deck power score, as the app sees it. The pure half.
 *
 * Split from `power.ts` for one reason and it is not tidiness: `power.ts`
 * imports the Supabase client to read and write `user_decks`, and a module that
 * opens a socket cannot be imported by `node --test`. The equality this whole
 * refactor exists to create — the deck page's score IS the optimiser's score —
 * is worth nothing if no test can reach the code that computes it. So
 * everything deterministic lives here, `src/engine/one-brain.test.ts` imports
 * it directly, and `power.ts` re-exports all of it so no consumer changed.
 *
 * DeckMatrix used to carry five different "power" numbers — `powerLevel`,
 * `powerScore`, `edhPower`, `user_decks.power_level` and `power.score` — each
 * produced by a different model on a different scale, so one deck could read
 * 5 on the dashboard, 6.28 in the builder banner and 6.6 in the analysis modal
 * at the same moment.
 *
 * This module is the only producer *in the browser*, and it is now a thin
 * adapter rather than a model. The model lives in `src/engine/power/`, where an
 * edge function can carry a byte-identical copy of it. That is the difference
 * between this version and the last one: the optimiser used to reason about a
 * castability figure the client had scraped off edhpowerlevel.com and posted to
 * it, while the deck page showed a number computed here. Now both call the same
 * `evaluateDeck`, and `src/engine/one-brain.test.ts` fails if they diverge.
 *
 * What this file still owns, because none of it is engine work:
 *
 *   - the adapters that turn each of the app's four card shapes into engine
 *     entries;
 *   - the decklist hash and everything staleness depends on;
 *   - reading and writing `user_decks.edh_analysis.deckmatrix`.
 *
 * ## Staleness
 *
 * A score is only meaningful for the decklist it was computed from, so every
 * result carries the {@link deckListHash} of that list. A stored score whose
 * hash no longer matches the deck is returned with `stale: true`, and
 * `PowerScore` refuses to render a stale number as if it were current. A wrong
 * number shown confidently is worse than no number.
 */

import type { Card as BuilderCard } from '../deckbuilder/types';
import type { Card as StoreCard } from '../../stores/deckStore';
import type { DeckCardRow } from './deckCards.ts';
import { evaluateDeck } from '../../engine/evaluate.ts';
import type { EngineCard, EngineDeckEntry } from '../../engine/core/card.ts';
import type { CutTarget } from '../../engine/advise/cuts.ts';
import {
  LOGISTIC,
  POWER_BANDS,
  SUBSCORE_ORDER,
  SUBSCORE_LABELS,
  SUBSCORE_DESCRIPTIONS,
  SUBSCORE_WEIGHTS,
  bandForScore,
  bracketIdForScore,
  type BracketId,
  type CastabilityReadout,
  type PowerBand,
  type Subscore,
  type SubscoreKey,
} from '../../engine/power/score.ts';
import { DeckCoach, type CoachingOperation } from '../deckbuilder/score/coach.ts';

/* ------------------------------------------------------------------ *
 * Bands, brackets and colour
 * ------------------------------------------------------------------ */

/**
 * The thresholds, the subscore vocabulary and the weights all come from the
 * engine. Before unification four different sets of cuts were live at once, so
 * a deck at 6.5 was "high" on the tile and "mid" in the analysis panel. There
 * is one table now and this re-exports it rather than restating it.
 */
export {
  /* The curve between the weighted mean and the 1 to 10 score. Exported so the
     screen can show that step instead of leaving a reader unable to make the
     arithmetic come out. */
  LOGISTIC,
  POWER_BANDS,
  SUBSCORE_ORDER,
  SUBSCORE_LABELS,
  SUBSCORE_DESCRIPTIONS,
  SUBSCORE_WEIGHTS,
  bandForScore,
  bracketIdForScore,
};
export type { PowerBand, BracketId, SubscoreKey, Subscore, CastabilityReadout, CutTarget };

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
  4: { id: 4, name: 'Optimized', blurb: 'No restrictions, built to win' },
  5: { id: 5, name: 'cEDH', blurb: 'Competitive, tuned against the strongest decks' },
};

export function bracketForScore(score: number): DeckBracket {
  return DECK_BRACKETS[bracketIdForScore(score)];
}

/* ------------------------------------------------------------------ *
 * The result shape
 * ------------------------------------------------------------------ */

/** Every subscore is 0–100, or null where it does not apply. One scale. */
export type DeckPowerSubscores = Record<SubscoreKey, number>;

/**
 * One card the engine named, and why.
 *
 * The three lists below were counts here and lists in the engine. `PowerResult`
 * has carried `gameChangers.list`, `combos` and `tutors.list` — every one of
 * them a card name out of `src/engine/power/catalogs.ts` — since the engine was
 * written, and this adapter reduced all three to integers. So the EDH tab could
 * print "3 game changers" and had no way to say which three, on a page whose
 * whole argument is that a measurement you cannot see the working of is a
 * black box.
 */
export interface NamedCard {
  name: string;
  /** The words a player would use. `with Demonic Consultation`, `fast`. */
  why: string;
}

export interface DeckPowerDiagnostics {
  tutorCount: number;
  gameChangerCount: number;
  noTutors: boolean;
  noGameChangers: boolean;
  /**
   * The cards behind the two counts above, and the two-card combos the deck
   * holds both halves of.
   *
   * Optional because a score read back out of `user_decks.edh_analysis` that
   * was written before these existed has no such key, and an absent list must
   * read as "not recorded" rather than as "none". `deckPowerFromStored` fills
   * them with empty arrays; a freshly computed score always carries them.
   */
  gameChangerList?: NamedCard[];
  tutorList?: NamedCard[];
  /** Named two-card combos, with the total mana value of the pair. */
  comboList?: Array<{ name: string; totalMv: number }>;
}

/** The single typed result. Nothing else in the app describes a power score. */
export interface DeckPower {
  /** 1–10, one decimal. The number. */
  score: number;
  /**
   * The weighted mean of the ten subscores, 0 to 100, BEFORE the curve and the
   * two structural adjustments.
   *
   * Carried so the screen can show its own working. Without it the panel headed
   * "Why this score / Ten parts" listed ten subscores whose weights sum to 1.00
   * and whose weighted mean came to 56.97, and then printed 5.3, with two
   * unshown steps in between: the logistic curve onto 1 to 10, and a flat
   * deduction for having no tutors and nothing that ends a game. A reader
   * checking the arithmetic could not make it come out, which on the product's
   * single most important number is worse than not showing the working at all.
   *
   * Optional because a score read back out of `user_decks.edh_analysis` that
   * was written before this existed has no such key.
   */
  raw?: number;
  band: PowerBand;
  bracket: BracketId;
  /**
   * The flat 0–100 record, for the tiles and radar charts that want a number
   * per axis. Derived from {@link evidence} and never computed separately.
   */
  subscores: DeckPowerSubscores;
  /**
   * The same ten subscores with their working shown: what each one counted, and
   * which cards it counted. This is the field that stops the score being a
   * black box, and it is why `simulation` is gone.
   */
  evidence: Subscore[];
  /** Exact castability figures. Replaces the old Monte Carlo `simulation`. */
  castability: CastabilityReadout;
  /**
   * This deck's own cards ranked worst first, from the same evaluation that
   * produced the score. The optimiser reasons about this exact list.
   */
  cuts: CutTarget[];
  diagnostics: DeckPowerDiagnostics;
  /** Plain sentences naming what carried the deck and what held it back. */
  drivers: string[];
  drags: string[];
  legality: { ok: boolean; issues: string[] };
  /**
   * True when too few cards carried rules text for the number to mean much.
   * A list imported as bare names lands here. Renderers must say so.
   */
  unreliable: boolean;
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
 *
 * **2** — castability became the heaviest input to the score instead of a
 * decoration beside it, the Monte Carlo was deleted, and every subscore gained
 * its evidence. Every stored v1 score is a different model's answer and is
 * discarded rather than mixed in.
 */
export const POWER_ENGINE_VERSION = 2;

/* ------------------------------------------------------------------ *
 * Deck list input
 * ------------------------------------------------------------------ */

/**
 * One decklist row. Quantity matters: a list stored as "Forest ×10" has to
 * become ten cards or castability is computed against a library that does not
 * exist.
 */
export interface PowerDeckEntry {
  card: BuilderCard;
  quantity: number;
  isCommander?: boolean;
  /**
   * The name to hash on, when it differs from the card's own name.
   *
   * The stored hash has to be reproducible from `deck_cards.card_name` alone,
   * because that is all the deck summary and the dashboard queries carry. A
   * joined `cards.name` can differ from it — a double-faced card is stored as
   * "Front" in one place and "Front // Back" in the other — and a hash computed
   * from the wrong one would mark every deck permanently stale.
   */
  hashName?: string;
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
  return deckListHash(
    entries.map(e => ({ name: e.hashName ?? e.card.name, quantity: e.quantity }))
  );
}

/* ------------------------------------------------------------------ *
 * Adapters — every card shape in the app funnels through one of these
 * ------------------------------------------------------------------ */

function blankEngineCard(name: string): BuilderCard {
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
      const card: BuilderCard = {
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
        legalities: (row.card?.legalities ?? {}) as BuilderCard['legalities'],
        prices: { usd: row.card?.prices?.usd ?? '0' },
        set: row.card?.set_code || '',
        set_name: row.card?.set_code || '',
        rarity: (row.card?.rarity as BuilderCard['rarity']) || 'common',
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
      return {
        card,
        quantity: Math.max(1, row.quantity || 1),
        isCommander: row.is_commander,
        // Hash on the stored name so this matches what `compute_deck_summary`
        // and the dashboard queries can reproduce.
        hashName: row.card_name,
      };
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
        legalities: (card.legalities ?? {}) as BuilderCard['legalities'],
        prices: { usd: card.prices?.usd ?? '0' },
        set: card.set || '',
        set_name: card.set_name || '',
        collector_number: card.collector_number || '',
        rarity: (card.rarity as BuilderCard['rarity']) || 'common',
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

/**
 * App card shape to engine card shape.
 *
 * The engine deliberately does not know about `Set<string>` tags, prices as
 * JSON strings, or any of the other shapes the app carries. One conversion,
 * here, so no engine module has to.
 */
function toEngineCard(card: BuilderCard): EngineCard {
  return {
    name: card.name,
    type_line: card.type_line ?? '',
    mana_cost: card.mana_cost ?? null,
    cmc: card.cmc ?? 0,
    oracle_text: card.oracle_text ?? null,
    colors: card.colors ?? [],
    color_identity: card.color_identity ?? [],
    power: card.power ?? null,
    toughness: card.toughness ?? null,
    keywords: card.keywords ?? [],
    legalities: (card.legalities ?? {}) as Record<string, string>,
    oracle_id: card.oracle_id || card.id || card.name,
    usd: card.prices?.usd ? Number(card.prices.usd) || null : null,
    tags: card.tags instanceof Set ? [...card.tags] : null,
  };
}

function toEngineEntries(entries: PowerDeckEntry[]): EngineDeckEntry[] {
  return entries.map(e => ({
    card: toEngineCard(e.card),
    quantity: Math.max(1, e.quantity || 1),
    isCommander: e.isCommander,
  }));
}

/* ------------------------------------------------------------------ *
 * The one accessor
 * ------------------------------------------------------------------ */

export interface ComputeDeckPowerOptions {
  format?: string;
  /** Overrides the commander found via `isCommander` on the entries. */
  commander?: BuilderCard;
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

/**
 * Legality, which is a property of the list rather than of the engine's model.
 *
 * Kept here rather than in the engine because the engine is scoring a deck, not
 * validating one, and mixing the two produced a "power" that silently dropped
 * when a deck was one card short of legal.
 */
function checkLegality(
  entries: PowerDeckEntry[],
  format: string,
  commander?: BuilderCard
): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (format !== 'commander') return { ok: true, issues };

  if (!commander) issues.push('Commander decks need a commander.');

  const total = entries
    .filter(e => !e.isCommander)
    .reduce((n, e) => n + Math.max(1, e.quantity), 0);
  if (total !== 99 && total > 0) {
    issues.push(`This deck has ${total} cards beside the commander, and it needs 99.`);
  }

  const BASICS = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes']);
  for (const entry of entries) {
    const name = entry.card.name;
    if (BASICS.has(name.toLowerCase())) continue;
    if (entry.quantity > 1) {
      issues.push(`${name} appears ${entry.quantity} times, and you may only run one.`);
    }
  }

  if (commander) {
    const allowed = new Set(commander.color_identity ?? []);
    for (const entry of entries) {
      if (entry.isCommander) continue;
      const outside = (entry.card.color_identity ?? []).filter(c => !allowed.has(c));
      if (outside.length > 0) {
        issues.push(`${entry.card.name} uses ${outside.join('')}, which your commander does not.`);
      }
    }
  }

  return { ok: issues.length === 0, issues };
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

  const format = (options.format || 'commander').toLowerCase();
  const hash = entryHash(usable);
  const cacheKey = `${format}:${hash}`;
  const cached = scoreCache.get(cacheKey);
  if (cached) return cached;

  const commander =
    options.commander ?? usable.find(e => e.isCommander)?.card ?? undefined;

  let evaluation: ReturnType<typeof evaluateDeck>;
  try {
    evaluation = evaluateDeck(toEngineEntries(usable), {
      format,
      commander: commander ? toEngineCard(commander) : null,
    });
  } catch (error) {
    console.error('Deck power calculation failed:', error);
    return null;
  }

  const { power } = evaluation;

  const flat = {} as DeckPowerSubscores;
  for (const subscore of power.subscores) flat[subscore.key] = subscore.value ?? 0;

  const result: DeckPower = {
    score: power.score,
    raw: power.raw,
    band: power.band,
    bracket: power.bracket,
    subscores: flat,
    evidence: power.subscores,
    castability: power.readout,
    cuts: evaluation.cuts,
    diagnostics: {
      tutorCount: power.tutors.count,
      gameChangerCount: power.gameChangers.count,
      noTutors: power.flags.noTutors,
      noGameChangers: power.flags.noGameChangers,
      /* The names, not just the counts. See `NamedCard`. The engine's own
         `reason` and `quality` strings are carried through rather than
         reworded, so what the EDH tab prints is the measurement. */
      gameChangerList: power.gameChangers.list.map(entry => ({
        name: entry.name,
        why: entry.reason,
      })),
      tutorList: power.tutors.list.map(entry => ({
        name: entry.name,
        why: `${entry.quality} · ${entry.mv} mana`,
      })),
      comboList: power.combos,
    },
    // The drivers and drags ARE the subscores' own sentences, so what a player
    // reads as a summary is literally the measurement, not a phrasing of it.
    drivers: power.drivers.map(s => `${SUBSCORE_LABELS[s.key]}: ${s.measured}`),
    drags: power.drags.map(s => `${SUBSCORE_LABELS[s.key]}: ${s.measured}`),
    legality: checkLegality(usable, format, commander),
    unreliable: power.unreliable,
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
  const expanded: BuilderCard[] = [];
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

