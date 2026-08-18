/* Relative imports carry their `.ts` extension so this module runs unchanged
   under `node --test --experimental-strip-types`, the runner the repo already
   uses. Vite and `tsconfig.app.json` (`allowImportingTsExtensions`) both accept
   the explicit form; Node's ESM resolver does not accept the implicit one. */
import type { DeckCardRow } from './deckCards.ts';
import {
  COLOUR_BIT,
  MANA_COLOURS,
  type CardPlayability,
  type DeckPlayability,
  type ManaColour,
  type ManaProfile,
  type PlayabilityCardInput,
} from './playability.ts';

/**
 * The view layer for `playability.ts`.
 *
 * The engine answers "what is the probability" exactly. It deliberately says
 * nothing about how to *present* that answer, so this module owns the three
 * presentation decisions the deck page needs and nothing else:
 *
 *  1. how a `DeckCardRow` becomes engine input,
 *  2. which band a percentage falls in, and what that band looks like,
 *  3. how to say, in English, *why* a number is low.
 *
 * (3) is the point. The previous per-card figure came off the
 * edhpowerlevel.com scrape as a bare percentage with no derivation, for at
 * most the hundred cards the scrape managed. A percentage a player cannot act
 * on is close to useless — "58%" tells you nothing, "only 6 blue sources are
 * online by turn 2 and this wants two of them" tells you to add duals.
 */

/* ------------------------------------------------------------------ *
 * Deck rows -> engine input
 * ------------------------------------------------------------------ */

/**
 * Shape saved deck rows for the engine.
 *
 * Sideboard rows are dropped: they are not in the library you draw from, so
 * counting them would dilute every source density on the page. Rows whose
 * printing is missing from the local `cards` table arrive with no type line
 * and no mana cost; the engine reports those as skipped rather than guessing,
 * which is the honest answer and matches the "card data not synced" note the
 * table already prints.
 */
export function rowsToPlayabilityInputs(
  rows: readonly DeckCardRow[]
): PlayabilityCardInput[] {
  return rows
    .filter(row => !row.is_sideboard)
    .map(row => ({
      name: row.card?.name || row.card_name,
      type_line: row.card?.type_line ?? '',
      mana_cost: row.card?.mana_cost ?? null,
      cmc: row.card?.cmc ?? null,
      oracle_text: row.card?.oracle_text ?? null,
      color_identity: row.card?.color_identity ?? null,
      quantity: row.quantity,
      isCommander: row.is_commander,
    }));
}

/** One row's engine input, for a per-card lookup against a built engine. */
export function rowToPlayabilityInput(row: DeckCardRow): PlayabilityCardInput {
  return {
    name: row.card?.name || row.card_name,
    type_line: row.card?.type_line ?? '',
    mana_cost: row.card?.mana_cost ?? null,
    cmc: row.card?.cmc ?? null,
    oracle_text: row.card?.oracle_text ?? null,
    color_identity: row.card?.color_identity ?? null,
    quantity: row.quantity,
    isCommander: row.is_commander,
  };
}

/* ------------------------------------------------------------------ *
 * Bands
 * ------------------------------------------------------------------ */

export type PlayabilityBandId = 'reliable' | 'fine' | 'awkward' | 'hard' | 'unlikely';

export interface PlayabilityBand {
  id: PlayabilityBandId;
  label: string;
  /** Lowest percentage in the band. */
  min: number;
  /** Meter fill. Monochrome until the number is a real problem. */
  fillClass: string;
  /** The percentage itself. */
  textClass: string;
  /** Filter-chip tint. */
  chipClass: string;
  /** What the band means, in one clause. */
  blurb: string;
}

/**
 * Five bands, and only the bottom two carry a hue.
 *
 * Design law reserves colour for MTG semantics, so the ramp is built out of
 * `foreground` at four weights. `destructive` is the one exception and it is
 * earned: below the engine's own `DEFAULT_THRESHOLD` of 50 the card is more
 * likely stuck in hand than cast on curve, which is a fault, and `destructive`
 * is the registered token every other deck panel already uses to say so. A
 * grey bar at 12% and a grey bar at 96% would be distinguishable but not
 * *obvious*, and the brief is that an uncastable card must be obvious without
 * reading the number.
 */
const BANDS: PlayabilityBand[] = [
  {
    id: 'reliable',
    label: 'Reliable',
    min: 85,
    fillClass: 'bg-foreground',
    textClass: 'text-foreground',
    chipClass: 'bg-foreground/15',
    blurb: 'on curve almost every game',
  },
  {
    id: 'fine',
    label: 'Fine',
    min: 70,
    fillClass: 'bg-foreground/65',
    textClass: 'text-foreground',
    chipClass: 'bg-foreground/10',
    blurb: 'usually on curve',
  },
  {
    id: 'awkward',
    label: 'Awkward',
    min: 50,
    fillClass: 'bg-foreground/35',
    textClass: 'text-muted-foreground',
    chipClass: 'bg-muted',
    blurb: 'a coin flip on curve',
  },
  {
    id: 'hard',
    label: 'Hard',
    min: 25,
    fillClass: 'bg-destructive/60',
    textClass: 'text-destructive',
    chipClass: 'bg-destructive/15',
    blurb: 'usually stuck in hand on curve',
  },
  {
    id: 'unlikely',
    label: 'Unlikely',
    min: 0,
    fillClass: 'bg-destructive',
    textClass: 'text-destructive',
    chipClass: 'bg-destructive/25',
    blurb: 'rarely castable on curve',
  },
];

/** Bands high-to-low, for legends and filter chips. */
export const PLAYABILITY_BANDS: readonly PlayabilityBand[] = BANDS;

export function playabilityBand(pct: number): PlayabilityBand {
  // BANDS is ordered high-to-low, so the first match is the tightest one.
  return BANDS.find(b => pct >= b.min) ?? BANDS[BANDS.length - 1];
}

/**
 * The band as a closed range, e.g. "70–85%".
 *
 * The legend used to print `${band.min}%+` for every band, which is only true
 * of the top one: "Hard 25%+" claims Hard covers everything above 25%, when
 * Hard is 25–50 and a 90% card is Reliable. Derived from the neighbouring
 * band rather than typed out, so it cannot drift from `min`.
 */
export function bandRange(band: PlayabilityBand): string {
  const i = BANDS.findIndex(b => b.id === band.id);
  const upper = i > 0 ? BANDS[i - 1].min : 100;
  return `${band.min}–${upper}%`;
}

/* ------------------------------------------------------------------ *
 * Explanation
 * ------------------------------------------------------------------ */

const COLOUR_NAME: Record<ManaColour, string> = {
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green',
};

const COLOUR_SYMBOL: Record<ManaColour, string> = {
  W: '{W}',
  U: '{U}',
  B: '{B}',
  R: '{R}',
  G: '{G}',
};

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/**
 * How many drawable sources produce *any* of `colours* and are online by
 * `turn`.
 *
 * `ManaProfile.sourcesByColour` counts every source in the deck regardless of
 * when it comes online, which would over-state the picture for a turn-2 cost
 * in a deck leaning on three-mana rocks. Counting from `profile.sources` with
 * the same `onlineTurn <= turn` test the solver uses keeps the sentence and
 * the number in agreement.
 */
export function liveSourcesFor(
  profile: ManaProfile,
  colours: readonly ManaColour[],
  turn: number
): number {
  let mask = 0;
  for (const c of colours) mask |= COLOUR_BIT[c];
  return profile.sources.filter(s => s.onlineTurn <= turn && (s.colourMask & mask) !== 0).length;
}

/** Live sources of any kind by `turn`, colour irrelevant. */
export function liveSourceTotal(profile: ManaProfile, turn: number): number {
  return profile.sources.filter(s => s.onlineTurn <= turn).length;
}

export interface PlayabilityExplanation {
  /** e.g. "58% castable on turn 2" */
  headline: string;
  /** The cost, spelled out. e.g. "Costs 2 mana, including {U}{U}." */
  cost: string;
  /** One line per colour requirement, plus the overall source count. */
  reasons: string[];
  /** The single most useful sentence, for one-line contexts. */
  summary: string;
  /** Set when the solver fell back; never present the number as exact. */
  approximate: boolean;
}

/** The card's pips written back out as symbols, e.g. "{2}{U}{U}". */
function pipText(card: CardPlayability): string {
  const generic = (card.manaRequired ?? 0) - card.pips.reduce((n, p) => n + p.count, 0);
  const parts: string[] = [];
  if (generic > 0) parts.push(`{${generic}}`);
  for (const pip of card.pips) {
    const symbol =
      pip.colours.length === 1
        ? COLOUR_SYMBOL[pip.colours[0]]
        : `{${pip.colours.join('/')}}`;
    for (let i = 0; i < pip.count; i++) parts.push(symbol);
  }
  return parts.join('');
}

/**
 * Say why the number is what it is.
 *
 * Returns `null` for a land — there is no castability question to answer, and
 * inventing one is exactly the kind of fabricated figure design law rules out.
 */
export function describePlayability(
  card: CardPlayability,
  profile: ManaProfile
): PlayabilityExplanation | null {
  if (card.skipped === 'land') return null;

  if (card.skipped === 'no-mana-cost') {
    return {
      headline: 'No castability figure',
      cost: 'This card has no mana cost on record.',
      reasons: [
        'Either the printing is not synced to the local card table yet, or the card genuinely has no mana cost.',
      ],
      summary: 'No mana cost on record.',
      approximate: false,
    };
  }

  if (card.pct === null || card.turn === null) {
    return null;
  }

  const turn = card.turn;
  const pct = card.pct;

  if (card.manaRequired === 0) {
    return {
      headline: 'Free to cast',
      cost: 'Costs no mana.',
      reasons: ['No mana source has to be drawn for this, so there is nothing to miss.'],
      summary: 'Costs no mana.',
      approximate: card.approximate,
    };
  }

  const reasons: string[] = [];
  /** The tightest requirement, tracked by sources-per-pip. */
  let worst: { text: string; pressure: number } | null = null;

  for (const pip of card.pips) {
    const live = liveSourcesFor(profile, pip.colours, turn);
    const names = pip.colours.map(c => COLOUR_NAME[c]).join(' or ');
    const symbols = pip.colours.map(c => COLOUR_SYMBOL[c]).join('/');
    const needs =
      pip.count === 1
        ? `needs one ${names} source`
        : `needs ${pip.count} different ${names} sources`;
    /* "8 sources online by turn 2" was read as a board state — as though eight
       lands were already in play. Every one of these counts is a property of
       the *library*: how many sources exist that would not still be sitting
       tapped or uncast on that turn. Say "the library holds" so the sentence
       cannot be mistaken for what is on the battlefield. */
    const text = `${symbols} × ${pip.count} — ${needs}. The library holds ${live} ${names} ${plural(live, 'source')} that can be online by turn ${turn}.`;
    reasons.push(text);

    // The tightest requirement is the one worth quoting in one line: fewest
    // sources per pip demanded.
    const pressure = live / Math.max(1, pip.count);
    if (!worst || pressure < worst.pressure) {
      worst = {
        pressure,
        text: `only ${live} ${names} ${plural(live, 'source')} for ${pipTextForPip(pip)} on turn ${turn}`,
      };
    }
  }

  const total = liveSourceTotal(profile, turn);
  reasons.push(
    `Across the whole ${profile.librarySize}-card library, ${total} of ${profile.sources.length} mana ${plural(profile.sources.length, 'source')} can be online by turn ${turn}.`
  );

  const summary = worst
    ? `${Math.round(pct)}% — ${worst.text}.`
    : `${Math.round(pct)}% — ${total} mana ${plural(total, 'source')} online by turn ${turn}, needing ${card.manaRequired}.`;

  return {
    headline: `${pct.toFixed(1)}% castable on turn ${turn}`,
    cost: `Costs ${pipText(card)} — ${card.manaRequired} mana by turn ${turn}.`,
    reasons,
    summary,
    approximate: card.approximate,
  };
}

function pipTextForPip(pip: { colours: ManaColour[]; count: number }): string {
  const symbol =
    pip.colours.length === 1 ? COLOUR_SYMBOL[pip.colours[0]] : `{${pip.colours.join('/')}}`;
  return symbol.repeat(pip.count);
}

/* ------------------------------------------------------------------ *
 * Deck-level readouts
 * ------------------------------------------------------------------ */

export interface ColourSourceReadout {
  colour: ManaColour;
  symbol: string;
  name: string;
  /** Copies in the library that can produce this colour. */
  sources: number;
  /** Share of the library, as a fraction. */
  share: number;
}

/**
 * Sources per colour, for the colours the deck actually plays.
 *
 * Colours the deck does not touch are omitted rather than printed as zero: a
 * mono-red deck showing "white: 0" is noise, not information.
 */
export function colourSourceReadout(profile: ManaProfile): ColourSourceReadout[] {
  return MANA_COLOURS.filter(c => (profile.deckColourMask & COLOUR_BIT[c]) !== 0).map(colour => ({
    colour,
    symbol: COLOUR_SYMBOL[colour],
    name: COLOUR_NAME[colour],
    sources: profile.sourcesByColour[colour],
    share: profile.librarySize > 0 ? profile.sourcesByColour[colour] / profile.librarySize : 0,
  }));
}

/**
 * The cards dragging the deck down, worst first.
 *
 * Lands and skipped rows are excluded — the roll-up excludes them too, so
 * including them here would contradict the average printed beside it.
 *
 * `ceiling` defaults to the floor of the `reliable` band. A section headed
 * "hardest to cast" that lists a card at 100% is telling the player something
 * false about their deck; if nothing is below the ceiling the list is empty and
 * the panel says so, which is the true answer.
 */
export const HARD_TO_CAST_CEILING = 85;

function isHardToCast(c: CardPlayability, ceiling: number): boolean {
  return c.pct !== null && c.skipped === null && c.pct < ceiling;
}

export function hardestToCast(
  result: DeckPlayability,
  limit = 8,
  ceiling = HARD_TO_CAST_CEILING
): CardPlayability[] {
  return result.cards
    .filter(c => isHardToCast(c, ceiling))
    .sort((a, b) => (a.pct as number) - (b.pct as number))
    .slice(0, limit);
}

/**
 * How many rows are under the ceiling in total, ignoring the display limit.
 *
 * The panel above `hardestToCast` used to promise "every spell that comes in
 * under 85%" while the function silently truncated at eight. A deck with
 * twenty problem cards was told it had eight. The panel now asks for this
 * count and says which it is showing.
 */
export function hardToCastCount(
  result: DeckPlayability,
  ceiling = HARD_TO_CAST_CEILING
): number {
  return result.cards.filter(c => isHardToCast(c, ceiling)).length;
}
