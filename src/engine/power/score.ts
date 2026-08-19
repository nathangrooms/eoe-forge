/**
 * The deck power score. One model, one scale, one set of band cuts.
 *
 * Nine subscores used to be produced here as bare numbers and mapped through a
 * logistic to 1 to 10. Two things are different now.
 *
 * **It is computed from castability rather than beside it.** The old model fed
 * on `deckbuilder/score/simulation.ts`, a Monte Carlo whose generator
 * (`state * 1103515245 + 12345 & 0x7fffffff`) loses low bits to double
 * precision and cycles after 15,824 states. A 99-card shuffle draws 98 of them,
 * so a run advertised as 10,000 seeded draws was about 161 distinct shuffles
 * repeated. The exact hypergeometric engine, with Hall's condition for colour
 * requirements, was sitting in the same repository being used only to draw a
 * bar on the deck page. It is now the heaviest input to the score.
 *
 * **It carries its evidence.** Every subscore names what it counted and which
 * cards it counted, and the contributions are scaled to sum to the subscore.
 * That is what stops this becoming the score DeckMatrix has already shipped
 * once, the one that read 35 to 39 out of 100 for every deck because it was
 * reading an array that did not exist. A number nobody can check does not get
 * checked.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * Nothing measures popularity, inclusion rate or real-world win rate, because
 * we hold no such data. edhpowerlevel has inclusion counts over millions of
 * decklists; our `cards` table has 26 columns and not one of them is a play
 * count. That is a data gap, not a formula gap. Weights tuned until our number
 * matched theirs would be fitted to a scrape of a site we cannot see inside.
 *
 * Pure. No network, no AI, no database.
 */

import { deckCoverage, isLandCard, type DeckCoverage, type EngineCard, type EngineDeckEntry } from '../core/card.ts';
import {
  createPlayabilityEngine,
  type DeckPlayability,
  type ManaColour,
  type ManaProfile,
  type PlayabilityCardInput,
} from '../playability/castability.ts';
import { keepableSevenPct, turnOneColourPct } from '../playability/opening.ts';
import { buildSubscore, type Subscore, type SubscoreKey } from './evidence.ts';
import {
  LOGISTIC,
  SUBSCORE_ORDER,
  bandForScore,
  bracketIdForScore,
  type BracketId,
  type PowerBand,
} from './weights.ts';
import {
  castabilitySubscore,
  speedSubscore,
  interactionSubscore,
  tutorSubscore,
  resilienceSubscore,
  cardAdvantageSubscore,
  manaSubscore,
  consistencySubscore,
  staxSubscore,
  synergySubscore,
  gameChangers,
  comboPairs,
  type GameChangerReport,
  type SubscoreInput,
} from './subscores.ts';

export { LOW_CASTABILITY_PCT } from './subscores.ts';
export {
  SUBSCORE_WEIGHTS,
  SUBSCORE_ORDER,
  SUBSCORE_LABELS,
  SUBSCORE_DESCRIPTIONS,
  POWER_BANDS,
  LOGISTIC,
  bandForScore,
  bracketIdForScore,
  type PowerBand,
  type BracketId,
} from './weights.ts';
export type { Subscore, Contribution, SubscoreKey } from './evidence.ts';
export { SUBSCORE_KEYS } from './evidence.ts';

/* ------------------------------------------------------------------ *
 * Result
 * ------------------------------------------------------------------ */

/**
 * The figures a deck page shows beside the score.
 *
 * Every one of these is exact. The block they replace was headed "Opening-hand
 * simulation, 10,000 seeded draws" and was neither ten thousand draws nor, in
 * one case, a measurement at all: `expectedWinTurn` was the constant 10 minus
 * four arbitrary coefficients times four other subscores, and it was presented
 * to players as the turn they should expect to win on. It is gone and nothing
 * replaces it, because nothing in our data supports it.
 */
export interface CastabilityReadout {
  /** Copy-weighted mean castability across cards with a cost. */
  averagePct: number | null;
  medianPct: number | null;
  /** Copy-weighted count of cards under the threshold. */
  hardToCastCount: number;
  threshold: number;
  scoredCount: number;
  /** Mean mana value of the non-land cards. */
  avgManaValue: number;
  landCount: number;
  manaRocksAndDorks: number;
  /** Lands that come into play tapped, as a share of all lands. */
  untappedLandPct: number;
  /** Exact: two to five lands in the opening seven. */
  keepable7Pct: number | null;
  /** Exact: at least one land making a colour in the opening seven. */
  turnOneColourPct: number | null;
  sourcesByColour: Record<ManaColour, number>;
  /** The cards you will struggle to pay for, worst first. */
  hardest: Array<{ name: string; pct: number; turn: number | null }>;
  /**
   * True when the exact solver hit its state budget on some card and fell back.
   * Callers must not present the figure as exact when this is set.
   */
  approximate: boolean;
}

export interface PowerFlags {
  /** Almost nothing searches the library, for a deck at this power level. */
  noTutors: boolean;
  /** Nothing on the curated game-changer list, for a deck at this level. */
  noGameChangers: boolean;
}

export interface PowerResult {
  /** 1 to 10, one decimal. */
  score: number;
  band: PowerBand;
  bracket: BracketId;
  /** The weighted mean of the applicable subscores, 0 to 100. */
  raw: number;
  /** Every subscore, in display order, each carrying its own evidence. */
  subscores: Subscore[];
  flags: PowerFlags;
  /** The exact castability roll-up the score was built on. */
  playability: DeckPlayability;
  /** The same numbers, shaped for a deck page. */
  readout: CastabilityReadout;
  gameChangers: GameChangerReport;
  combos: Array<{ name: string; totalMv: number }>;
  tutors: { count: number; quality: number; list: Array<{ name: string; quality: string; mv: number }> };
  /** How much of the deck the engine could actually see. */
  coverage: DeckCoverage;
  /**
   * True when too little of the deck carried rules text for the number to mean
   * anything. Callers must say so rather than showing the decimal on its own.
   */
  unreliable: boolean;
  drivers: Subscore[];
  drags: Subscore[];
}

/* ------------------------------------------------------------------ *
 * The calculation
 * ------------------------------------------------------------------ */

/** Maps the weighted 0 to 100 mean onto 1 to 10. See LOGISTIC in weights.ts. */
function toTenPointScale(raw: number): number {
  const normalized = (raw - LOGISTIC.mu) / LOGISTIC.sigma;
  return 1 + (1 / (1 + Math.exp(-normalized))) * 9;
}

export interface ComputePowerOptions {
  format?: string;
  /** Overrides the commander found via `isCommander` on the entries. */
  commander?: EngineCard | null;
  /** Percentage under which a card counts as hard to cast. */
  castabilityThreshold?: number;
}

/** Cards a commander deck at this band is expected to be able to search with. */
function tutorFloor(band: PowerBand): number {
  return band === 'cedh' ? 6 : band === 'high' ? 3 : 1.5;
}

function gameChangerFloor(band: PowerBand): number {
  return band === 'cedh' || band === 'high' ? 2 : 1;
}

/**
 * Score a decklist.
 *
 * The commander is passed to the subscores but is not part of the library, so
 * castability is computed over the 99 you actually draw. `isCommander` on an
 * entry is what removes it, which is the same flag `buildManaProfile` reads.
 */
export function computePower(
  entries: readonly EngineDeckEntry[],
  options: ComputePowerOptions = {}
): PowerResult {
  const format = (options.format || 'commander').toLowerCase();
  const commander =
    options.commander ?? entries.find(e => e.isCommander)?.card ?? null;

  const playabilityInput: PlayabilityCardInput[] = entries.map(e => ({
    name: e.card.name,
    type_line: e.card.type_line ?? '',
    mana_cost: e.card.mana_cost ?? null,
    cmc: e.card.cmc ?? null,
    oracle_text: e.card.oracle_text ?? null,
    color_identity: (e.card.color_identity ?? null) as string[] | null,
    quantity: Math.max(1, Math.trunc(e.quantity ?? 1)),
    isCommander: !!e.isCommander,
  }));

  const engine = createPlayabilityEngine(playabilityInput, {
    threshold: options.castabilityThreshold,
  });
  const playability = engine.deck();

  const input: SubscoreInput = { entries, commander, format, playability };

  const tutors = tutorSubscore(input);
  const parts: Subscore[] = [
    castabilitySubscore(input),
    speedSubscore(input),
    interactionSubscore(input),
    tutors.subscore,
    manaSubscore(input, engine.profile),
    resilienceSubscore(input),
    cardAdvantageSubscore(input),
    consistencySubscore(input),
    synergySubscore(input),
    staxSubscore(input),
  ];

  const byKey = new Map(parts.map(p => [p.key, p]));
  const ordered = SUBSCORE_ORDER.map(k => byKey.get(k)!).filter(Boolean);

  const changers = gameChangers(input);

  // First pass: the weighted mean over the subscores that apply.
  let subscores = ordered;
  let raw = weightedMean(subscores);
  let score = toTenPointScale(raw);
  let band = bandForScore(score);

  // Two structural facts about a deck that the continuous subscores understate:
  // a deck with no way to find a card plays out differently every game, and a
  // deck with nothing that ends a game does not end games. Both are checked
  // against what a deck at this band would be expected to carry.
  const noTutors = tutors.quality < tutorFloor(band);
  const noGameChangers = changers.count < gameChangerFloor(band);

  let adjustment = 0;
  if (noTutors) adjustment -= band === 'cedh' ? 1.0 : 0.6;
  if (noGameChangers) adjustment -= band === 'cedh' ? 1.4 : 0.8;

  if (adjustment !== 0) {
    score = Math.max(1, Math.min(10, score + adjustment));
    band = bandForScore(score);
  }

  score = Math.round(score * 10) / 10;
  raw = Math.round(raw * 10) / 10;

  const coverage = deckCoverage(entries);
  const applicable = subscores.filter(s => s.applicable && s.value !== null);
  const drivers = [...applicable].sort((a, b) => (b.value! - a.value!)).slice(0, 3);
  const drags = [...applicable].sort((a, b) => a.value! - b.value!).slice(0, 3);

  return {
    score,
    band: bandForScore(score),
    bracket: bracketIdForScore(score),
    raw,
    subscores,
    flags: { noTutors, noGameChangers },
    playability,
    readout: buildReadout(entries, playability, engine.profile),
    gameChangers: changers,
    combos: comboPairs(input),
    tutors: { count: tutors.list.length, quality: tutors.quality, list: tutors.list },
    coverage,
    unreliable: coverage.total > 0 && coverage.ratio < 0.6,
    drivers,
    drags,
  };
}

const ENTERS_TAPPED = /enters(?: the battlefield)? tapped/i;

/** How many hard-to-cast cards a deck page names. The rest are a count. */
const HARDEST_SHOWN = 6;

function buildReadout(
  entries: readonly EngineDeckEntry[],
  playability: DeckPlayability,
  profile: ManaProfile
): CastabilityReadout {
  let landCopies = 0;
  let tappedCopies = 0;
  let spellCopies = 0;
  let mvTotal = 0;

  for (const entry of entries) {
    if (entry.isCommander) continue;
    const qty = Math.max(1, Math.trunc(entry.quantity ?? 1));
    if (isLandCard(entry.card)) {
      landCopies += qty;
      if (ENTERS_TAPPED.test(entry.card.oracle_text ?? '')) tappedCopies += qty;
    } else {
      spellCopies += qty;
      mvTotal += (entry.card.cmc ?? 0) * qty;
    }
  }

  const hardest = playability.cards
    .filter(c => c.pct !== null && !c.isCommander && c.skipped === null)
    .sort((a, b) => (a.pct as number) - (b.pct as number) || a.name.localeCompare(b.name))
    .slice(0, HARDEST_SHOWN)
    .map(c => ({ name: c.name, pct: c.pct as number, turn: c.turn }));

  return {
    averagePct: playability.averagePct,
    medianPct: playability.medianPct,
    hardToCastCount: playability.belowThresholdCount,
    threshold: playability.threshold,
    scoredCount: playability.scoredCount,
    avgManaValue: spellCopies > 0 ? mvTotal / spellCopies : 0,
    landCount: landCopies,
    manaRocksAndDorks: profile.rockCount + profile.dorkCount,
    untappedLandPct: landCopies > 0 ? ((landCopies - tappedCopies) / landCopies) * 100 : 0,
    keepable7Pct: keepableSevenPct(profile.librarySize, landCopies),
    turnOneColourPct: turnOneColourPct(profile),
    sourcesByColour: profile.sourcesByColour,
    hardest,
    approximate: playability.anyApproximate,
  };
}

/**
 * The weighted mean, over applicable subscores only.
 *
 * Renormalising over what applied is the whole reason `applicable` exists. A
 * deck with no commander has no commander synergy; folding a zero in for it
 * would invent a failing grade for a question that was never asked.
 */
export function weightedMean(subscores: readonly Subscore[]): number {
  let sum = 0;
  let weight = 0;
  for (const s of subscores) {
    if (!s.applicable || s.value === null) continue;
    sum += s.value * s.weight;
    weight += s.weight;
  }
  return weight > 0 ? sum / weight : 0;
}

/** Convenience for callers that want the flat record the old shape used. */
export function subscoreValues(result: PowerResult): Record<SubscoreKey, number | null> {
  const out = {} as Record<SubscoreKey, number | null>;
  for (const s of result.subscores) out[s.key] = s.value;
  return out;
}
