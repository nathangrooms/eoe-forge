/**
 * DeckMatrix — shared game-state core: card effects, honestly scoped.
 *
 * The complaint this module answers, in the owner's words: *"why do card
 * effects not do anything or work… Had a card that is +1 life when it gets
 * played, but nothing happened."*
 *
 * ## What this is not
 *
 * It is not a rules engine. Magic's rules are Turing-complete and every card is
 * allowed to rewrite them, which is why Forge and XMage represent many years of
 * work and thousands of individually-scripted cards. We are not building that,
 * and pretending to would produce something that looks like it works and
 * quietly does not — which is precisely the bug being reported.
 *
 * ## What this is
 *
 * A detector for the small set of triggers that are **mechanically unambiguous
 * in oracle text**: enters-the-battlefield life gain, card draw and token
 * creation, attack triggers, upkeep triggers, death triggers. Those fire by
 * themselves. Everything else is detected too — and reported as
 * `manualNotes`, so the card carries a visible marker and the player knows the
 * app did not resolve it.
 *
 * **The rule that matters more than the automation: never silently do nothing.**
 * A card that looks like it resolved but did not is worse than a card that says
 * "manual". `automationFor` exists so the UI can always say which one this is,
 * and `triggeredActionsFor` emits a `NOTE` action for anything it declines, so
 * the game feed says it out loud as well.
 *
 * ## Measured, so the UI can weight the marker properly
 *
 * Run over 12,000 real rows from our own `cards` table, `automationFor` returns:
 * `manual` 11,205, `vanilla` 367, `partial` 196, `keywords` 148, `automated` 84.
 * 2,094 triggers detected, 297 of them automated.
 *
 * That distribution is the point, not a disappointment: most Magic cards do have
 * an ability this engine will not resolve. It does mean a UI must NOT paint all
 * of them the same. `level` is there to be weighted — **`partial` is the loud
 * one**, because a card that half-resolved is the one a player will assume was
 * handled; `manual` should be a quiet dot; `vanilla` and `keywords` get nothing
 * at all.
 *
 * ## Reuse, not a second parser
 *
 * Classification comes from `@/lib/cards/tagger` — the same rules that produce
 * `cards.tags` and the Postgres `derive_card_tags`, already tuned for precision
 * over recall against the real 34,000-row catalogue. This module adds only the
 * one thing the tagger deliberately does not do: pull **quantities and targets**
 * out of a clause the tagger has already classified ("you gain 3 life" -> 3).
 * There is no second classifier here, and there must never be one.
 *
 * Unlike `tagger.ts`, nothing in this file is compiled to SQL, so the patterns
 * here are free to use ordinary JavaScript regex features.
 *
 * Pure: no clock, no randomness, no I/O. Same card in, same triggers out.
 */

import { deriveCardTags, normalizeOracleText } from '../cards/tagger.ts';
import type {
  CardInstance,
  DetectedEffect,
  DetectedTrigger,
  GameAction,
  GameState,
  InstanceId,
  InterveningCondition,
  ManaColor,
  PlayerId,
  TokenSpec,
  TriggerTiming,
} from './types.ts';
import {
  ENGINE_KEYWORDS,
  FLAGGABLE_KEYWORDS,
  effectiveKeywords,
  keywordSupport,
  normalizeKeyword,
} from './keywords.ts';

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `TriggerTiming`, `DetectedTrigger` and `DetectedEffect` live in `types.ts`,
 * not here, because a trigger waiting to resolve is part of a serialised game
 * state (`GameState.pendingTriggers`) and every state shape belongs in one
 * file. This module owns the *reading* of them out of oracle text.
 */
export const TRIGGER_LABELS: Record<TriggerTiming, string> = {
  etb: 'Enters the battlefield',
  attack: 'Attacks',
  blocks: 'Blocks',
  'deals-damage': 'Deals damage',
  upkeep: 'Your upkeep',
  death: 'Dies',
  'end-step': 'Your end step',
  cast: 'On cast',
  draw: 'You draw a card',
};

export type AutomationLevel =
  /** No rules text at all. Basics, vanilla creatures. Nothing to miss. */
  | 'vanilla'
  /** Only keyword abilities, all of which combat enforces. */
  | 'keywords'
  /** Every ability on the card is applied by the engine. */
  | 'automated'
  /** Some abilities fire, some need the player. */
  | 'partial'
  /** The card has abilities and the engine resolves none of them. */
  | 'manual'
  /** Oracle text was never loaded, so we cannot even say. */
  | 'unknown';

export interface CardAutomation {
  level: AutomationLevel;
  triggers: DetectedTrigger[];
  /** Keywords on this card whose rules the engine actually applies. */
  engineKeywords: string[];
  /** Keywords present that are a badge and a reminder only. */
  advisoryKeywords: string[];
  /** One entry per ability the player has to resolve themselves. */
  manualNotes: string[];
  /** True when the card should carry a visible "manual" marker right now. */
  needsManual: boolean;
  /** One line for a badge or tooltip. Never empty. */
  summary: string;
}

/* -------------------------------------------------------------------------- */
/* Reading numbers out of oracle text                                         */
/* -------------------------------------------------------------------------- */

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  twenty: 20,
};

const QUANTITY = 'a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|twenty|\\d+';

/** A written or digit quantity. Returns null for anything variable. */
function readQuantity(raw: string | undefined): number | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (/^\d+$/.test(key)) return Number(key);
  const word = NUMBER_WORDS[key];
  return word === undefined ? null : word;
}

/* -------------------------------------------------------------------------- */
/* The honesty gate                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Text that means a human has to make a decision, pick a target, or read a
 * board state this engine cannot evaluate. A trigger containing any of it is
 * never automated, whatever else it also says.
 *
 * This list is deliberately over-eager. Refusing to auto-resolve a trigger
 * costs the player two taps; auto-resolving one wrongly corrupts the game and
 * — worse — teaches them not to trust the ones that are right.
 */
const NEEDS_A_HUMAN: readonly string[] = [
  'target',
  'choose',
  'chooses',
  'may',
  'search',
  'up to',
  'sacrifice',
  'exile',
  'discard',
  'destroy',
  'each player',
  'unless',
  'instead',
  'fight',
  'for each',
  'equal to',
  'that many',
  'that much',
  'divided',
  // Bare "if" catches every conditional templating at once — "if you control",
  // "if it had a counter on it", "if that creature died this turn". Measured
  // against the catalogue, an earlier list of specific "if you"/"if that"
  // prefixes let Promising Duskmage's "if it had a +1/+1 counter on it, draw a
  // card" fire on every death.
  'if',
  'becomes',
  'transform',
  'shuffle',
  'copy',
  'reveal',
  'scry',
  'surveil',
  'mill',
  'return',
  'untap',
  'tap',
  'where x',
  'the top card',
  'put that card',
];

/**
 * One compiled regex with real word boundaries.
 *
 * Substring matching was wrong and quietly so: `'if '` is inside `'cliff '`,
 * `'tap '` is inside nothing useful but `'mill '` sits inside `'windmill '`.
 * A false positive here only costs the player two taps, but it costs them on
 * cards that should have worked, which erodes trust in the ones that do.
 */
const NEEDS_A_HUMAN_RE = new RegExp(
  `\\b(?:${NEEDS_A_HUMAN.join('|')})\\b|gets? \\+`,
  'i'
);

function needsAHuman(clause: string): boolean {
  return NEEDS_A_HUMAN_RE.test(clause);
}

/* -------------------------------------------------------------------------- */
/* Effect fragments                                                           */
/* -------------------------------------------------------------------------- */

interface FragmentMatch {
  effect: DetectedEffect;
  /** Byte range consumed in the clause, so residual text can be worked out. */
  start: number;
  end: number;
}

function matchAll(clause: string, source: string): RegExpExecArray[] {
  const re = new RegExp(source, 'g');
  const out: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(clause)) !== null) {
    out.push(match);
    if (match.index === re.lastIndex) re.lastIndex += 1;
  }
  return out;
}

const COLOR_WORDS: Record<string, ManaColor> = {
  white: 'W',
  blue: 'U',
  black: 'B',
  red: 'R',
  green: 'G',
};

/**
 * Every keyword a token clause may name, longest first so "first strike" is
 * never truncated to "first".
 *
 * Built on first use rather than at module scope. Reading another module's
 * export while this one is still evaluating is an initialisation-order
 * dependency, and Vite's dev graph resolved it as a temporal dead zone —
 * `FLAGGABLE_KEYWORDS is not defined`, thrown at import time, taking every page
 * that touches the game core down with it. Neither `tsc` nor the node test
 * runner reproduced it; the browser did. Laziness removes the ordering question
 * rather than relying on it.
 */
let keywordAlternation: string | null = null;
function keywordAlternationPattern(): string {
  if (keywordAlternation === null) {
    keywordAlternation = [...FLAGGABLE_KEYWORDS].sort((a, b) => b.length - a.length).join('|');
  }
  return keywordAlternation;
}

const TOKEN_NOISE = new Set([
  'creature',
  'artifact',
  'enchantment',
  'legendary',
  'token',
  'tokens',
  'colorless',
  'colourless',
  'tapped',
  'attacking',
  'and',
  'named',
  'white',
  'blue',
  'black',
  'red',
  'green',
]);

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Turn "1/1 white soldier creature" into a `TokenSpec`.
 *
 * Deliberately forgiving: an unparsed descriptor still produces a real token
 * with the descriptor kept as its type line, because a token on the board that
 * is named wrong is fixable in two taps, and a token that never appeared is
 * the silent no-op we are trying to eliminate.
 */
function parseTokenDescriptor(descriptor: string, keywordTail?: string): TokenSpec {
  const raw = descriptor.trim().replace(/\s+/g, ' ');

  const pt = /(\d+)\/(\d+)/.exec(raw);
  const keywords = (keywordTail ?? '')
    .split(/,| and /)
    .map(keyword => normalizeKeyword(keyword))
    .filter(Boolean);

  const colors: ManaColor[] = [];
  for (const [word, color] of Object.entries(COLOR_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(raw) && !colors.includes(color)) colors.push(color);
  }

  // `x/x` is stripped alongside a numeric printing, but leaves no power or
  // toughness behind: a variable body is exactly what the hand-set stat
  // controls are for, and guessing a number here would be a fabrication.
  const stripped = raw
    .replace(/[\dx]+\/[\dx]+/g, ' ')
    .split(/\s+/)
    .filter(word => word && !TOKEN_NOISE.has(word));

  const name = stripped.length > 0 ? titleCase(stripped.join(' ')) : 'Token';
  const isCreatureToken = !!pt || /\bcreature\b/.test(raw);
  const isArtifactToken = /\bartifact\b/.test(raw);
  const isLandToken = /\bland\b/.test(raw);

  const typeParts = ['Token'];
  if (isArtifactToken) typeParts.push('Artifact');
  if (isLandToken) typeParts.push('Land');
  if (isCreatureToken) typeParts.push('Creature');
  // Treasure, Clue, Food and friends print no type word in the clause; every
  // one of them is an artifact, so that is the safe default.
  if (!isArtifactToken && !isLandToken && !isCreatureToken) typeParts.push('Artifact');

  return {
    name,
    typeLine: `${typeParts.join(' ')} — ${name}`,
    power: pt ? pt[1] : undefined,
    toughness: pt ? pt[2] : undefined,
    colorIdentity: colors,
    keywords,
    oracleText: '',
  };
}

/**
 * Pull every effect this engine can apply out of one trigger clause.
 *
 * The clause has already passed `needsAHuman`, so anything matched here is
 * unconditional and needs no decision from anybody.
 */
function readFragments(clause: string): FragmentMatch[] {
  const found: FragmentMatch[] = [];

  const push = (match: RegExpExecArray, effect: DetectedEffect | null) => {
    if (!effect) return;
    found.push({ effect, start: match.index, end: match.index + match[0].length });
  };

  // "you gain 3 life"
  for (const match of matchAll(clause, `you gain (${QUANTITY}) life`)) {
    const amount = readQuantity(match[1]);
    push(match, amount === null ? null : { kind: 'gain-life', amount, text: match[0] });
  }

  // "you lose 2 life"
  for (const match of matchAll(clause, `you lose (${QUANTITY}) life`)) {
    const amount = readQuantity(match[1]);
    push(match, amount === null ? null : { kind: 'lose-life', amount, text: match[0] });
  }

  // "each opponent loses 2 life"
  for (const match of matchAll(clause, `each opponent loses (${QUANTITY}) life`)) {
    const amount = readQuantity(match[1]);
    push(
      match,
      amount === null ? null : { kind: 'each-opponent-loses-life', amount, text: match[0] }
    );
  }

  // "~ deals 2 damage to each opponent"
  for (const match of matchAll(clause, `deals (${QUANTITY}) damage to each opponent`)) {
    const amount = readQuantity(match[1]);
    push(match, amount === null ? null : { kind: 'damage-each-opponent', amount, text: match[0] });
  }

  // "draw a card" / "draw two cards". Bare "draw" is not enough — the tagger's
  // own note explains why: "draws" is somebody else drawing.
  for (const match of matchAll(clause, `draw (${QUANTITY}) cards?`)) {
    const amount = readQuantity(match[1]);
    push(match, amount === null ? null : { kind: 'draw', amount, text: match[0] });
  }

  // "create a 1/1 white Soldier creature token with flying"
  //
  // The trailing keyword list is captured with a strict alternation of real
  // keywords rather than a loose `[a-z ,]+`, so "token with menace, then attach
  // this Equipment to it" takes only "menace" and leaves the rest as residual —
  // where a loose match would have swallowed an instruction the engine cannot
  // carry out and reported the trigger as fully handled.
  const keywordAlt = keywordAlternationPattern();
  for (const match of matchAll(
    clause,
    `create (${QUANTITY}) ([^.;,]*?) tokens?(?: with (${keywordAlt}(?:(?:, | and )${keywordAlt})*))?`
  )) {
    const amount = readQuantity(match[1]);
    if (amount === null) continue;
    push(match, {
      kind: 'create-token',
      amount,
      text: match[0],
      token: parseTokenDescriptor(match[2], match[3]),
      tapped: /\btapped\b/.test(match[2]),
    });
  }

  // "put a +1/+1 counter on ~" — only on itself. On anything else it is a target.
  for (const match of matchAll(
    clause,
    `put (${QUANTITY}) \\+1/\\+1 counters? on (~|this creature|it)`
  )) {
    const amount = readQuantity(match[1]);
    push(match, amount === null ? null : { kind: 'counter-on-self', amount, text: match[0] });
  }

  return found.sort((a, b) => a.start - b.start);
}

/** Connective words left over once the recognised fragments are cut out. */
const RESIDUAL_NOISE =
  /\b(and|then|also|until end of turn|this turn|at the beginning of the next|you|~)\b|[.,;:]/g;

function residualOf(clause: string, fragments: FragmentMatch[]): string | undefined {
  if (fragments.length === 0) return clause.trim() || undefined;
  let remaining = '';
  let cursor = 0;
  for (const fragment of fragments) {
    remaining += clause.slice(cursor, fragment.start);
    cursor = fragment.end;
  }
  remaining += clause.slice(cursor);
  const cleaned = remaining.replace(RESIDUAL_NOISE, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > 2 ? cleaned : undefined;
}

/* -------------------------------------------------------------------------- */
/* Trigger detection                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The normalised oracle text a card would produce for the tagger.
 *
 * `normalizeOracleText` lowercases, strips reminder text and apostrophes, and
 * — the part that matters here — replaces the card's own name with `~`, so a
 * single pattern matches both "When Ajani's Pridemate enters" and the modern
 * "When this creature enters".
 */
function taggerShapeOf(card: CardInstance): Parameters<typeof deriveCardTags>[0] {
  return {
    name: card.name,
    type_line: card.typeLine ?? null,
    oracle_text: card.oracleText ?? null,
    keywords: card.keywords ?? null,
    mana_cost: card.manaCost ?? null,
    cmc: card.cmc ?? 0,
  };
}

/**
 * Self-reference as the normaliser leaves it, plus every modern templating.
 *
 * Exported because `triggers.ts` builds patterns of its own against the same
 * normalised shape, and two copies of this string would drift.
 */
export const SELF_PATTERN =
  '(?:~|this (?:creature|permanent|artifact|enchantment|land|vehicle|token|planeswalker))';

const SELF = SELF_PATTERN;

interface TriggerPattern {
  timing: TriggerTiming;
  re: RegExp;
  /** Group index holding the effect clause. */
  clauseGroup: number;
  /**
   * Group holding an "or attacks" / "or dies" tail, which registers the same
   * clause under a second timing.
   */
  alsoGroup?: number;
}

/**
 * The trigger openers, deliberately allowing NO free text between the event and
 * the comma.
 *
 * Measured against the real catalogue, an earlier `[^,\n]*` wildcard there made
 * Eternal of Harsh Truths ("Whenever this creature attacks **and isn't
 * blocked**, draw a card") fire on every attack, and Noggle Robber's "enters or
 * dies" fire only on entry. A condition the engine cannot evaluate must stop
 * the trigger being automated at all, so the opener is exact and anything with
 * an extra clause simply is not recognised — which lands it in `manualNotes`,
 * which is the right answer.
 */
const TRIGGER_PATTERNS: TriggerPattern[] = [
  // "When ~ enters, …" / "When this creature enters the battlefield, …"
  // "Whenever ~ enters or attacks, …" registers under both timings.
  {
    timing: 'etb',
    re: new RegExp(
      `(?:^|\\n)\\s*(?:when|whenever) ${SELF} enters(?: the battlefield)?(?: (or attacks|or dies))?,\\s*([^\\n]+)`,
      'g'
    ),
    clauseGroup: 2,
    alsoGroup: 1,
  },
  {
    timing: 'attack',
    re: new RegExp(`(?:^|\\n)\\s*whenever ${SELF} attacks,\\s*([^\\n]+)`, 'g'),
    clauseGroup: 1,
  },
  {
    timing: 'upkeep',
    re: /(?:^|\n)\s*at the beginning of your upkeep,\s*([^\n]+)/g,
    clauseGroup: 1,
  },
  {
    timing: 'end-step',
    re: /(?:^|\n)\s*at the beginning of your end step,\s*([^\n]+)/g,
    clauseGroup: 1,
  },
  {
    timing: 'death',
    re: new RegExp(`(?:^|\\n)\\s*when ${SELF} dies,\\s*([^\\n]+)`, 'g'),
    clauseGroup: 1,
  },
  // The four timings `triggers.ts` added to the event model. Same discipline as
  // above: the opener is exact, so "whenever this creature deals combat damage
  // to a player **and isn't blocked**" is not recognised and stays manual.
  {
    timing: 'blocks',
    re: new RegExp(`(?:^|\\n)\\s*whenever ${SELF} blocks,\\s*([^\\n]+)`, 'g'),
    clauseGroup: 1,
  },
  {
    timing: 'deals-damage',
    re: new RegExp(
      `(?:^|\\n)\\s*whenever ${SELF} deals (?:combat )?damage to a player,\\s*([^\\n]+)`,
      'g'
    ),
    clauseGroup: 1,
  },
  {
    timing: 'cast',
    re: new RegExp(`(?:^|\\n)\\s*when you cast (?:${SELF}|this spell),\\s*([^\\n]+)`, 'g'),
    clauseGroup: 1,
  },
  {
    timing: 'draw',
    re: /(?:^|\n)\s*whenever you draw a card,\s*([^\n]+)/g,
    clauseGroup: 1,
  },
];

/**
 * Read one trigger clause into a `DetectedTrigger`.
 *
 * Exported so `triggers.ts` can rebuild a trigger from the remainder of a
 * clause once it has lifted a CR 603.4 intervening "if" off the front — without
 * that, the bare `if` in `NEEDS_A_HUMAN` would keep every such trigger manual
 * even when both halves are things this engine understands perfectly well.
 */
export function buildDetectedTrigger(timing: TriggerTiming, clause: string): DetectedTrigger {
  return buildTrigger(timing, clause);
}

/* -------------------------------------------------------------------------- */
/* CR 603.4 — intervening "if" clauses                                        */
/* -------------------------------------------------------------------------- */

/**
 * Read the condition out of an intervening "if" clause.
 *
 * The set is deliberately tiny and each pattern must match the *whole*
 * condition. "If you control a creature" is read; "if you control a creature
 * with flying" is not, and comes back `unknown` — which keeps the whole trigger
 * manual. That asymmetry is the design: a condition evaluated wrongly silently
 * fires or silently suppresses an ability, and both are worse than asking.
 *
 * Input is the normalised oracle shape: lower-cased, apostrophes stripped.
 */
export function parseIntervening(text: string): InterveningCondition {
  const condition = text.trim().replace(/\s+/g, ' ');

  // "you control a creature" / "you control three or more artifacts"
  const controls = /^you control (a|an|another|one|two|three|four|five|six|seven|eight|nine|ten|\d+)(?: or more)? ([a-z]+)$/.exec(
    condition
  );
  if (controls) {
    const atLeast = readQuantity(controls[1]);
    if (atLeast !== null) {
      const word = controls[2];
      const typeWord = word.endsWith('s') ? word.slice(0, -1) : word;
      return { kind: 'controls', typeWord, atLeast: Math.max(1, atLeast) };
    }
  }

  // "you have 25 or more life" / "your life total is 5 or less"
  const life = /^(?:you have|your life total is) (\d+) or (more|less|greater|fewer)(?: life)?$/.exec(
    condition
  );
  if (life) {
    const amount = parseInt(life[1], 10);
    const upward = life[2] === 'more' || life[2] === 'greater';
    return upward ? { kind: 'life-at-least', amount } : { kind: 'life-at-most', amount };
  }

  if (/^its your turn$/.test(condition)) return { kind: 'your-turn' };

  return { kind: 'unknown', text: condition };
}

/**
 * Split a clause into its CR 603.4 condition and the effect it guards.
 *
 * A condition the engine cannot classify leaves the clause whole, so the bare
 * `if` in `NEEDS_A_HUMAN` still catches it and the trigger stays manual —
 * exactly the behaviour that existed before intervening "if" was understood.
 */
function liftIntervening(clause: string): {
  body: string;
  condition: InterveningCondition | undefined;
} {
  const match = /^if ([^,]+),\s*(.+)$/.exec(clause);
  if (!match) return { body: clause, condition: undefined };
  const condition = parseIntervening(match[1]);
  if (condition.kind === 'unknown') return { body: clause, condition };
  return { body: match[2].trim(), condition };
}

function buildTrigger(timing: TriggerTiming, clause: string): DetectedTrigger {
  const trimmed = clause.trim();
  const { body, condition } = liftIntervening(trimmed);

  if (needsAHuman(body)) {
    return {
      timing,
      clause: trimmed,
      effects: [],
      automated: false,
      residual: trimmed,
      intervening: condition,
    };
  }

  const fragments = readFragments(body);
  const effects = fragments.map(f => f.effect);
  return {
    timing,
    clause: trimmed,
    effects,
    automated: effects.length > 0,
    residual: residualOf(body, fragments),
    intervening: condition,
  };
}

/**
 * Every trigger this module can see on a card, automated or not.
 *
 * Cards with no `oracleText` return an empty list — which is why `automationFor`
 * reports `unknown` rather than `vanilla` in that case. "We did not load the
 * text" and "this card has no abilities" must never look the same.
 */
export function detectTriggers(card: CardInstance | null | undefined): DetectedTrigger[] {
  if (!card || !card.oracleText) return [];
  const text = normalizeOracleText(taggerShapeOf(card));
  const out: DetectedTrigger[] = [];

  for (const pattern of TRIGGER_PATTERNS) {
    pattern.re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.re.exec(text)) !== null) {
      const clause = match[pattern.clauseGroup];
      if (!clause) continue;
      out.push(buildTrigger(pattern.timing, clause));
      const tail = pattern.alsoGroup ? match[pattern.alsoGroup] : undefined;
      if (tail === 'or attacks') out.push(buildTrigger('attack', clause));
      if (tail === 'or dies') out.push(buildTrigger('death', clause));
      if (match.index === pattern.re.lastIndex) pattern.re.lastIndex += 1;
    }
  }

  return out;
}

/**
 * The tagger's own view of a card, for UI that wants to say *why* something was
 * detected. Exposed so nothing else re-derives tags from oracle text.
 */
export function cardTags(card: CardInstance | null | undefined): string[] {
  if (!card || !card.oracleText) return [];
  return deriveCardTags(taggerShapeOf(card));
}

/* -------------------------------------------------------------------------- */
/* What the engine will and will not do with this card                        */
/* -------------------------------------------------------------------------- */

/** A line that is nothing but keyword abilities we enforce, e.g. "Flying, vigilance". */
function isPureEngineKeywordLine(line: string): boolean {
  const parts = line
    .split(',')
    .map(part => normalizeKeyword(part))
    .filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every(part => (ENGINE_KEYWORDS as readonly string[]).includes(part));
}

/**
 * A mana ability. `mana.ts` already approximates these — it counts every
 * untapped land and every artifact/creature with a colour identity as one
 * source — so listing them as unresolved would badge every land on the table.
 * The approximation is documented at the top of `mana.ts`; this is where it is
 * deliberately not double-reported.
 */
function isManaAbilityLine(line: string): boolean {
  return /:\s*add\b/i.test(line);
}

/**
 * One answer per card object, kept for as long as that object lives.
 *
 * `automationFor` runs a dozen regexes over every line of oracle text, and the
 * marker it feeds is now drawn on every permanent on the table — a board can
 * hold 120 of them and re-renders on every action. A `WeakMap` keyed on the
 * instance is exactly the right cache here because game state is immutable: any
 * change to a card produces a NEW `CardInstance`, which misses the cache and is
 * recomputed, while the old entry is collected. There is no invalidation to get
 * wrong and no key to keep in step.
 */
const automationCache = new WeakMap<CardInstance, CardAutomation>();

/**
 * Everything the UI needs to tell the truth about one card: what fires by
 * itself, what the player has to do, and whether to show the manual marker.
 */
export function automationFor(card: CardInstance | null | undefined): CardAutomation {
  if (!card) return computeAutomation(card);
  const cached = automationCache.get(card);
  if (cached) return cached;
  const computed = computeAutomation(card);
  automationCache.set(card, computed);
  return computed;
}

function computeAutomation(card: CardInstance | null | undefined): CardAutomation {
  const empty: CardAutomation = {
    level: 'vanilla',
    triggers: [],
    engineKeywords: [],
    advisoryKeywords: [],
    manualNotes: [],
    needsManual: false,
    summary: 'No rules text.',
  };
  if (!card) return empty;

  const keywords = effectiveKeywords(card);
  const engineKeywords = keywords.filter(k => keywordSupport(k) === 'engine');
  const advisoryKeywords = keywords.filter(k => keywordSupport(k) !== 'engine');

  if (card.oracleText === undefined || card.oracleText === null) {
    return {
      level: 'unknown',
      triggers: [],
      engineKeywords,
      advisoryKeywords,
      manualNotes: ['Rules text was not loaded for this card. Resolve it by hand.'],
      needsManual: !card.manualResolved,
      summary: 'Rules text not loaded. Resolve by hand.',
    };
  }

  const triggers = detectTriggers(card);
  const automatedClauses = new Set(
    triggers.filter(t => t.automated).map(t => t.clause.slice(0, 40))
  );

  const manualNotes: string[] = [];
  const seenNotes = new Set<string>();
  const addNote = (note: string) => {
    const trimmed = note.trim();
    if (!trimmed || seenNotes.has(trimmed)) return;
    seenNotes.add(trimmed);
    manualNotes.push(trimmed);
  };

  for (const line of card.oracleText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isPureEngineKeywordLine(trimmed)) continue;
    if (isManaAbilityLine(trimmed)) continue;

    // A line the engine fully resolved needs no note; one it half-resolved
    // reports only the half it left behind.
    const lower = trimmed.toLowerCase();
    const owning = triggers.find(t => lower.includes(t.clause.slice(0, 24).replace(/~/g, '')));
    if (owning && owning.automated) {
      if (owning.residual) addNote(`${owning.residual} (part of "${trimmed}")`);
      continue;
    }
    addNote(trimmed);
  }

  // Advisory keywords are abilities too. A "Ward {2}" creature must not read as
  // fully automated just because its only other text is flying.
  for (const keyword of advisoryKeywords) {
    addNote(`${keyword}. This keyword is not applied for you.`);
  }

  const automatedCount = triggers.filter(t => t.automated).length;
  const hasText = card.oracleText.trim().length > 0;

  let level: AutomationLevel;
  if (!hasText && advisoryKeywords.length === 0) {
    level = engineKeywords.length > 0 ? 'keywords' : 'vanilla';
  } else if (manualNotes.length === 0) {
    level = automatedCount > 0 ? 'automated' : engineKeywords.length > 0 ? 'keywords' : 'vanilla';
  } else if (automatedCount > 0 || automatedClauses.size > 0) {
    level = 'partial';
  } else {
    level = 'manual';
  }

  const needsManual = manualNotes.length > 0 && !card.manualResolved;

  const summary = summaryFor(level, automatedCount, manualNotes.length, engineKeywords);

  return { level, triggers, engineKeywords, advisoryKeywords, manualNotes, needsManual, summary };
}

/** One line for a badge or tooltip. Never empty, never vague. */
function summaryFor(
  level: AutomationLevel,
  automatedCount: number,
  manualCount: number,
  engineKeywords: readonly string[]
): string {
  switch (level) {
    case 'vanilla':
      return 'No rules text.';
    case 'keywords':
      return `Keywords only. ${engineKeywords.join(', ')} enforced.`;
    case 'automated':
      return `${automatedCount} trigger${automatedCount === 1 ? '' : 's'} resolved automatically.`;
    case 'partial':
      return `${automatedCount} trigger${automatedCount === 1 ? '' : 's'} automatic, ${manualCount} to resolve by hand.`;
    case 'manual':
      return `${manualCount} abilit${manualCount === 1 ? 'y' : 'ies'} to resolve by hand.`;
    case 'unknown':
      return 'Rules text not loaded. Resolve by hand.';
    default:
      return 'Resolve by hand.';
  }
}

/* -------------------------------------------------------------------------- */
/* Turning a trigger into actions                                             */
/* -------------------------------------------------------------------------- */

function livingOpponents(state: GameState, playerId: PlayerId): PlayerId[] {
  return state.players
    .filter(p => p.id !== playerId && !p.hasLost && !p.conceded)
    .map(p => p.id);
}

/**
 * Actions for one detected trigger on one permanent.
 *
 * Every action carries `cause`, so the log reads "Ajani's Pridemate enters:
 * Nathan gains 3 life" rather than an unexplained life change.
 */
export function actionsForTrigger(
  state: GameState,
  card: CardInstance,
  trigger: DetectedTrigger,
  at = 0
): GameAction[] {
  if (!trigger.automated) return [];
  const controller = card.controllerId;
  const cause = `${card.name} (${TRIGGER_LABELS[trigger.timing].toLowerCase()})`;
  const actions: GameAction[] = [];

  for (const effect of trigger.effects) {
    switch (effect.kind) {
      case 'gain-life':
        actions.push({ type: 'LIFE_CHANGE', playerId: controller, delta: effect.amount, at, cause });
        break;
      case 'lose-life':
        actions.push({ type: 'LIFE_CHANGE', playerId: controller, delta: -effect.amount, at, cause });
        break;
      case 'each-opponent-loses-life':
        for (const opponent of livingOpponents(state, controller)) {
          actions.push({ type: 'LIFE_CHANGE', playerId: opponent, delta: -effect.amount, at, cause });
        }
        break;
      case 'damage-each-opponent':
        for (const opponent of livingOpponents(state, controller)) {
          actions.push({
            type: 'DAMAGE',
            targetPlayerId: opponent,
            amount: effect.amount,
            sourcePlayerId: controller,
            sourceInstanceId: card.instanceId,
            at,
            cause,
          });
        }
        break;
      case 'draw':
        actions.push({ type: 'DRAW', playerId: controller, count: effect.amount, at, cause });
        break;
      case 'counter-on-self':
        actions.push({
          type: 'CARD_COUNTER',
          instanceId: card.instanceId,
          counter: '+1/+1',
          delta: effect.amount,
          at,
          cause,
        });
        break;
      case 'create-token':
        if (effect.token) {
          actions.push({
            type: 'CREATE_TOKEN',
            playerId: controller,
            token: effect.token,
            count: effect.amount,
            tapped: effect.tapped,
            at,
            cause,
          });
        }
        break;
    }
  }

  return actions;
}

/**
 * The note the engine owes the player when it declines to resolve something.
 * Returns null when there is nothing to admit.
 */
export function manualNoteAction(
  card: CardInstance,
  at = 0,
  context = 'resolves'
): GameAction | null {
  const automation = automationFor(card);
  if (!automation.needsManual) return null;
  const first = automation.manualNotes[0] ?? 'This card has text the engine does not resolve.';
  const extra =
    automation.manualNotes.length > 1 ? ` (+${automation.manualNotes.length - 1} more)` : '';
  return {
    type: 'NOTE',
    instanceId: card.instanceId,
    message: `${card.name} ${context}. Resolve by hand: ${first}${extra}`,
    at,
  };
}

/**
 * The note for one trigger that fired in the game but not in the engine.
 *
 * Measured over the catalogue, 93% of cards carry *some* text this engine does
 * not implement, so a log line for every permanent that arrives would bury the
 * feed and train the player to ignore it. The line is therefore spent only
 * where it buys something: a trigger that genuinely went off at this moment and
 * that the engine declined, or half-resolved. The broader "this card has text
 * we do not run" case is carried by the card's own marker
 * (`automationFor().needsManual`), where it costs nothing to look at and
 * nothing to ignore.
 */
export function noteForDeclinedTrigger(
  card: CardInstance,
  trigger: DetectedTrigger,
  at: number
): GameAction | null {
  if (card.manualResolved) return null;
  const label = TRIGGER_LABELS[trigger.timing].toLowerCase();
  if (!trigger.automated) {
    return {
      type: 'NOTE',
      instanceId: card.instanceId,
      message: `${card.name} triggered (${label}). "${trigger.clause}" is not resolved for you. Do it by hand.`,
      at,
    };
  }
  if (trigger.residual) {
    return {
      type: 'NOTE',
      instanceId: card.instanceId,
      message: `${card.name} (${label}) partly resolved. Still to do by hand: ${trigger.residual}.`,
      at,
    };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* The reducer hook                                                           */
/* -------------------------------------------------------------------------- */

function battlefieldIdsOf(state: GameState): Set<InstanceId> {
  const out = new Set<InstanceId>();
  for (const player of state.players) for (const id of player.zones.battlefield) out.add(id);
  return out;
}

/**
 * **Superseded by `triggers.ts`, and no longer wired into the reducer.**
 *
 * `applyAction` now routes triggers through `collectTriggers` →
 * `GameState.pendingTriggers` → `drainTriggers`, which adds the three things
 * this function never had: CR 603.3b ordering across players, a controller's
 * own choice of order within their batch, and CR 603.4 intervening "if". This
 * is kept only because it is a self-contained way to ask "what would this
 * action set off", and it is deliberately *not* called anywhere in the engine —
 * calling it alongside the real pipeline would resolve every trigger twice.
 *
 * Given an action that has already been applied, what else should happen?
 *
 * Called by `applyAction` with the before and after states. Everything it
 * returns is fed back through `applyAction`, so triggered effects are ordinary
 * logged actions — replayable, undoable, and identical on every client because
 * detection is pure.
 *
 * Deliberately narrow. It looks only at:
 *   - permanents that entered the battlefield (cast, reanimated, tokened)
 *   - permanents that died
 *   - attackers, as they are declared
 *   - the start of the active player's upkeep and end step
 *   - a spell that resolved straight to the graveyard, which is the loudest
 *     silent no-op of all: an instant that "resolved" and did nothing
 */
export function triggeredActionsFor(
  prev: GameState,
  action: GameAction,
  next: GameState,
  at = 0
): GameAction[] {
  if (next.mode !== 'full' || next.status !== 'playing') return [];
  const out: GameAction[] = [];

  const fire = (card: CardInstance | undefined, timings: TriggerTiming[]) => {
    if (!card) return;
    for (const trigger of automationFor(card).triggers) {
      if (!timings.includes(trigger.timing)) continue;
      out.push(...actionsForTrigger(next, card, trigger, at));
      const note = noteForDeclinedTrigger(card, trigger, at);
      if (note) out.push(note);
    }
  };

  switch (action.type) {
    case 'PLAY':
    case 'MOVE_ZONE':
    case 'CREATE_TOKEN': {
      const before = battlefieldIdsOf(prev);
      const after = battlefieldIdsOf(next);
      for (const id of after) {
        if (before.has(id)) continue;
        fire(next.cards[id], ['etb']);
      }
      for (const id of before) {
        if (after.has(id)) continue;
        const card = next.cards[id];
        if (card && card.zone === 'graveyard') fire(card, ['death']);
      }
      // A spell that resolved to the graveyard did nothing at all unless the
      // player does it. Say so rather than letting it look resolved.
      if (action.type === 'PLAY' && action.to === 'graveyard') {
        const card = next.cards[action.instanceId];
        if (card) {
          const note = manualNoteAction(card, at, 'resolves');
          if (note) out.push(note);
          else
            out.push({
              type: 'NOTE',
              instanceId: card.instanceId,
              message: `${card.name} resolves. No spell effects were applied. Resolve it by hand.`,
              at,
            });
        }
      }
      break;
    }

    case 'ATTACK': {
      for (const declaration of action.attackers) {
        fire(next.cards[declaration.attackerId], ['attack']);
      }
      break;
    }

    case 'ADVANCE_STEP':
    case 'PHASE_CHANGE':
    case 'PASS_TURN': {
      if (prev.step === next.step && prev.activePlayerId === next.activePlayerId) break;
      const timing: TriggerTiming | null =
        next.step === 'upkeep' ? 'upkeep' : next.step === 'end' ? 'end-step' : null;
      if (!timing) break;
      const active = next.players.find(p => p.id === next.activePlayerId);
      if (!active) break;
      for (const id of active.zones.battlefield) {
        const card = next.cards[id];
        if (!card || card.controllerId !== active.id) continue;
        fire(card, [timing]);
      }
      break;
    }

    default:
      break;
  }

  return out;
}
