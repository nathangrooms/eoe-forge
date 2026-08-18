/**
 * DeckMatrix — the card-ability DSL: the oracle-text compiler.
 *
 * Normalised oracle text in, `CardAbilities` out. Written from scratch against
 * our own `cards` table; no card script, class or data file from any other
 * project was read into this repo, copied, ported or machine-converted.
 *
 * ## The one invariant: text is CONSUMED, never skipped
 *
 * `compile()` cuts the normalised text into segments that TILE it exactly —
 * every character of the input belongs to exactly one segment, gaps included.
 * Each segment then goes down one of two paths and there is no third:
 *
 *   - it becomes one or more `Ability`, and its span is recorded as consumed;
 *   - it becomes an `UnparsedClause` carrying a `GapReason` and its span.
 *
 * There is no branch in this file that discards a segment.
 * `assertClausesAccounted()` in `coverage.ts` proves it: consumed spans plus
 * unparsed spans must cover `[0, text.length)`. A dropped clause is therefore a
 * failing test, not a quiet regression that surfaces at a table as "that card
 * did nothing".
 *
 * A clause that is *recognised as an ability* but contains one sentence we have
 * no vocabulary for does NOT become unparsed — it becomes an ability whose
 * effect list contains `{ do: 'manual', text }`. The ability runs its automated
 * half and says the rest out loud. That is the difference between a card that
 * half-worked silently and a card that half-worked loudly.
 *
 * ## Why a rule table
 *
 * The same shape as `src/lib/cards/tagger.ts`, which already carries 77 role
 * tags across 34,088 rows with verified TypeScript/SQL parity. A declarative
 * table of (pattern, builder) pairs stays readable at a hundred entries, is
 * testable one row at a time, and does not sprawl into an imperative parser
 * that nobody dares change. Precision over recall throughout: a wrong ability
 * is far worse than a missing one, because a missing one is visible.
 */

import type { TokenSpec } from '../types.ts';
import type {
  Ability,
  CardAbilities,
  Cost,
  Duration,
  Effect,
  GapReason,
  PlayerSelector,
  Selector,
  TargetSpec,
  TriggerEvent,
  UnparsedClause,
  ValueExpr,
} from './dsl.ts';
import { FLAGGABLE_KEYWORDS, normalizeKeyword } from '../keywords.ts';

/* -------------------------------------------------------------------------- */
/* Input                                                                      */
/* -------------------------------------------------------------------------- */

export interface CompileInput {
  name: string;
  oracleText?: string;
  typeLine?: string;
  keywords?: string[];
  manaCost?: string;
  cmc?: number;
  /** Scryfall `oracle_id`. Falls back to the lower-cased name. */
  oracleId?: string;
}

/* -------------------------------------------------------------------------- */
/* Normalisation                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The span universe: every offset in an `UnparsedClause` is an index into the
 * string this returns.
 *
 * Unlike `tagger.ts`'s normaliser this keeps the original case, because the
 * result is shown to a player on a stack row and in a log line. A paraphrase in
 * the log is a small lie, and the whole point of this module is not telling
 * small lies about what the engine did.
 *
 * Three things it does, and each of them earns its place:
 *  1. reminder text in brackets is removed — it restates rules and would be
 *     compiled twice;
 *  2. the card's own name becomes `~`, because oracle text still says
 *     "Ajani's Pridemate gets +1/+1" and card names contain trigger words;
 *  3. curly apostrophes are flattened, so one pattern matches both
 *     "owner's" and "owner’s".
 */
export function normaliseOracle(input: CompileInput): string {
  let text = (input.oracleText ?? '').replace(/\r\n?/g, '\n');

  // Reminder text. Applied before the name swap so a name inside reminder text
  // never leaves a stray `~` behind.
  text = text.replace(/\([^)]*\)/g, '');

  const names = new Set<string>();
  const name = (input.name ?? '').trim();
  if (name) {
    names.add(name);
    for (const part of name.split('//')) names.add(part.trim());
    // "Ajani's Pridemate" is referred to as "Ajani's Pridemate", but the short
    // name before a comma is also used on legendary creatures.
    const short = name.split(',')[0].trim();
    if (short.length >= 3) names.add(short);
  }

  for (const candidate of Array.from(names).sort((a, b) => b.length - a.length)) {
    if (candidate.length < 3) continue;
    text = text.split(candidate).join('~');
  }

  text = text.replace(/[‘’ʼ`]/g, "'");
  text = text.replace(/[—–]/g, '—');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/ *\n */g, '\n');
  return text.trim();
}

/* -------------------------------------------------------------------------- */
/* Segmentation                                                               */
/* -------------------------------------------------------------------------- */

export interface Segment {
  /** The clause itself, trimmed. May be empty for a blank line. */
  text: string;
  /** Start offset of this segment's slice of the normalised text. */
  start: number;
  /** End offset, exclusive. Segments tile `[0, length)` with no gaps. */
  end: number;
}

/**
 * Cut the normalised text into one segment per line.
 *
 * Magic prints one ability per line, and that is the only division that is
 * reliably an ability boundary. Splitting on sentences would tear
 * "{T}: Draw a card. You lose 1 life." into two halves of one activated
 * ability, which is worse than not splitting at all.
 *
 * Separators are folded into the preceding segment's span, so the returned
 * spans tile the input exactly and clause accounting is arithmetic rather than
 * a judgement call.
 */
export function splitClauses(text: string): Segment[] {
  if (text.length === 0) return [];

  const segments: Segment[] = [];
  let start = 0;

  for (let i = 0; i <= text.length; i++) {
    const atEnd = i === text.length;
    if (!atEnd && text[i] !== '\n') continue;
    const end = atEnd ? text.length : i + 1;
    segments.push({ text: text.slice(start, atEnd ? i : i).trim(), start, end });
    start = end;
    if (atEnd) break;
  }

  return segments;
}

/* -------------------------------------------------------------------------- */
/* Numbers                                                                    */
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
  fifteen: 15,
  twenty: 20,
};

/** Alternation used inside patterns. Kept in one place so it cannot drift. */
const NUM =
  '(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fifteen|twenty|x|\\d+)';

function readNumber(raw: string | undefined): ValueExpr | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (key === 'x') return { v: 'x' };
  if (/^\d+$/.test(key)) return Number(key);
  const word = NUMBER_WORDS[key];
  return word === undefined ? null : word;
}

/** A number we could not read counts as 1 rather than 0 — never a silent no-op. */
function readNumberOr1(raw: string | undefined): ValueExpr {
  return readNumber(raw) ?? 1;
}

/* -------------------------------------------------------------------------- */
/* Target collection                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Targets are numbered in the order they appear in the text, and `{sel:'target',
 * ref}` points at that number. Collecting them as the effects are built keeps
 * "destroy target creature and target player draws a card" unambiguous without
 * a second pass.
 */
class TargetCollector {
  readonly specs: TargetSpec[] = [];

  card(prompt: string, filter?: TargetSpec['filter']): number {
    const ref = this.specs.length;
    this.specs.push({ ref, what: 'card', filter, min: 1, max: 1, prompt });
    return ref;
  }

  player(prompt: string): number {
    const ref = this.specs.length;
    this.specs.push({ ref, what: 'player', min: 1, max: 1, prompt });
    return ref;
  }

  any(prompt: string): number {
    const ref = this.specs.length;
    this.specs.push({ ref, what: 'any', min: 1, max: 1, prompt });
    return ref;
  }
}

/* -------------------------------------------------------------------------- */
/* Tokens                                                                     */
/* -------------------------------------------------------------------------- */

const COLOUR_WORDS: Record<string, string> = {
  white: 'W',
  blue: 'U',
  black: 'B',
  red: 'R',
  green: 'G',
  colorless: 'C',
  colourless: 'C',
};

const TOKEN_NOISE = new Set(['creature', 'artifact', 'enchantment', 'token', 'tokens', 'legendary', 'and', 'with']);

/**
 * "a 1/1 white Soldier creature token" → a `TokenSpec`.
 *
 * Deliberately conservative: anything it cannot classify keeps the descriptor
 * as the token's name rather than inventing a type line. A token with a wrong
 * type line is invisible to "Goblins you control" forever; a token with an
 * honest name is merely plain.
 */
export function parseToken(descriptor: string): TokenSpec {
  const text = descriptor.trim().replace(/^(?:a|an)\s+/i, '');
  const stats = text.match(/(\d+)\/(\d+)/);
  const colours: string[] = [];
  const subtypes: string[] = [];
  const keywords: string[] = [];

  const withMatch = text.match(/\bwith\s+(.+)$/i);
  if (withMatch) {
    for (const raw of withMatch[1].split(/,| and /i)) {
      const keyword = normalizeKeyword(raw);
      if (keyword && FLAGGABLE_KEYWORDS.includes(keyword)) keywords.push(keyword);
    }
  }

  const head = withMatch ? text.slice(0, withMatch.index) : text;
  for (const word of head.split(/[\s,]+/)) {
    const lower = word.toLowerCase().replace(/[^a-z']/g, '');
    if (!lower || TOKEN_NOISE.has(lower)) continue;
    if (COLOUR_WORDS[lower]) {
      colours.push(COLOUR_WORDS[lower]);
      continue;
    }
    if (/^\d+$/.test(lower) || /\d/.test(word)) continue;
    subtypes.push(word.replace(/[^A-Za-z'-]/g, ''));
  }

  const name = subtypes.length > 0 ? subtypes.join(' ') : text;
  const isCreature = /creature/i.test(text) || !!stats;

  return {
    name,
    typeLine: isCreature
      ? `Token Creature${subtypes.length > 0 ? ` — ${subtypes.join(' ')}` : ''}`
      : `Token${subtypes.length > 0 ? ` ${subtypes.join(' ')}` : ''}`,
    power: stats?.[1],
    toughness: stats?.[2],
    colorIdentity: colours.length > 0 ? (colours as TokenSpec['colorIdentity']) : undefined,
    keywords: keywords.length > 0 ? keywords : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Recipients                                                                 */
/* -------------------------------------------------------------------------- */

const CREATURE_FILTER: TargetSpec['filter'] = { is: 'type', value: 'creature' };

/**
 * "to any target", "to target creature", "to each opponent" → what the effect
 * points at. Returns `null` when the recipient is not one we model, so the
 * caller can emit a `{do:'manual'}` rather than guessing a victim.
 */
function parseRecipient(
  raw: string,
  targets: TargetCollector
): { kind: 'player'; who: PlayerSelector } | { kind: 'card'; what: Selector } | null {
  const text = raw.trim().toLowerCase().replace(/\.$/, '');

  if (text === 'you') return { kind: 'player', who: { who: 'you' } };
  if (text === 'each opponent' || text === 'each of your opponents') {
    return { kind: 'player', who: { who: 'each-opponent' } };
  }
  if (text === 'each player') return { kind: 'player', who: { who: 'each-player' } };
  if (text === 'target player' || text === 'target opponent') {
    return { kind: 'player', who: { who: 'target-player', ref: targets.player('Choose a player') } };
  }
  if (text === 'any target') {
    // "Any target" is a creature, planeswalker, battle or player. We offer the
    // whole list and let the announcement decide, rather than narrowing it.
    return { kind: 'player', who: { who: 'target-player', ref: targets.any('Choose any target') } };
  }
  if (text === 'target creature') {
    return { kind: 'card', what: { sel: 'target', ref: targets.card('Choose a creature', CREATURE_FILTER) } };
  }
  if (text === '~' || text === 'itself' || text === 'this creature' || text === 'this permanent') {
    return { kind: 'card', what: { sel: 'self' } };
  }
  if (text === 'each creature') {
    return { kind: 'card', what: { sel: 'all', where: { is: 'type', value: 'creature' } } };
  }
  if (text === 'each creature you control') {
    return {
      kind: 'card',
      what: { sel: 'all', where: { is: 'type', value: 'creature' }, controller: { who: 'you' } },
    };
  }
  if (text === 'each creature your opponents control') {
    return {
      kind: 'card',
      what: {
        sel: 'all',
        where: { is: 'type', value: 'creature' },
        controller: { who: 'each-opponent' },
      },
    };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Effect rules                                                               */
/* -------------------------------------------------------------------------- */

interface EffectRule {
  id: string;
  re: RegExp;
  build(match: RegExpMatchArray, targets: TargetCollector): Effect[] | null;
}

const YOU: PlayerSelector = { who: 'you' };

/**
 * The closed effect vocabulary, as an ordered table.
 *
 * Order matters exactly once: more specific patterns come before the general
 * ones they would otherwise be swallowed by ("each opponent loses N life"
 * before "you lose N life"). Everything else is independent.
 */
const EFFECT_RULES: EffectRule[] = [
  /* --- life --- */
  {
    id: 'gain-life',
    re: new RegExp(`^(?:you )?gains? (${NUM}) life$`, 'i'),
    build: m => [{ do: 'gain-life', who: YOU, amount: readNumberOr1(m[1]) }],
  },
  {
    id: 'each-opponent-loses-life',
    re: new RegExp(`^each opponent loses (${NUM}) life$`, 'i'),
    build: m => [{ do: 'lose-life', who: { who: 'each-opponent' }, amount: readNumberOr1(m[1]) }],
  },
  {
    id: 'each-player-loses-life',
    re: new RegExp(`^each player loses (${NUM}) life$`, 'i'),
    build: m => [{ do: 'lose-life', who: { who: 'each-player' }, amount: readNumberOr1(m[1]) }],
  },
  {
    id: 'lose-life',
    re: new RegExp(`^(?:you )?loses? (${NUM}) life$`, 'i'),
    build: m => [{ do: 'lose-life', who: YOU, amount: readNumberOr1(m[1]) }],
  },
  {
    id: 'target-player-gains-life',
    re: new RegExp(`^target player gains (${NUM}) life$`, 'i'),
    build: (m, t) => [
      { do: 'gain-life', who: { who: 'target-player', ref: t.player('Choose a player') }, amount: readNumberOr1(m[1]) },
    ],
  },
  {
    id: 'each-opponent-gains-life',
    re: new RegExp(`^each opponent gains (${NUM}) life$`, 'i'),
    build: m => [{ do: 'gain-life', who: { who: 'each-opponent' }, amount: readNumberOr1(m[1]) }],
  },

  /* --- cards --- */
  {
    id: 'draw',
    re: new RegExp(`^(?:you )?draws? (${NUM}) cards?$`, 'i'),
    build: m => [{ do: 'draw', who: YOU, count: readNumberOr1(m[1]) }],
  },
  {
    id: 'each-player-draws',
    re: new RegExp(`^each player draws (${NUM}) cards?$`, 'i'),
    build: m => [{ do: 'draw', who: { who: 'each-player' }, count: readNumberOr1(m[1]) }],
  },
  {
    id: 'target-player-draws',
    re: new RegExp(`^target player draws (${NUM}) cards?$`, 'i'),
    build: (m, t) => [
      { do: 'draw', who: { who: 'target-player', ref: t.player('Choose a player') }, count: readNumberOr1(m[1]) },
    ],
  },
  {
    id: 'discard',
    re: new RegExp(`^(?:you )?discards? (${NUM}) cards?( at random)?$`, 'i'),
    build: m => [
      { do: 'discard', who: YOU, count: readNumberOr1(m[1]), ...(m[2] ? { random: true } : {}) },
    ],
  },
  {
    id: 'each-opponent-discards',
    re: new RegExp(`^each opponent discards (${NUM}) cards?( at random)?$`, 'i'),
    build: m => [
      {
        do: 'discard',
        who: { who: 'each-opponent' },
        count: readNumberOr1(m[1]),
        ...(m[2] ? { random: true } : {}),
      },
    ],
  },
  {
    id: 'mill',
    re: new RegExp(`^(?:you )?mills? (${NUM}) cards?$`, 'i'),
    build: m => [{ do: 'mill', who: YOU, count: readNumberOr1(m[1]) }],
  },
  {
    id: 'each-opponent-mills',
    re: new RegExp(`^each opponent mills (${NUM}) cards?$`, 'i'),
    build: m => [{ do: 'mill', who: { who: 'each-opponent' }, count: readNumberOr1(m[1]) }],
  },

  /* --- damage --- */
  {
    id: 'damage',
    re: new RegExp(`^~ deals (${NUM}) damage to (.+)$`, 'i'),
    build: (m, t) => {
      const amount = readNumberOr1(m[1]);
      const recipient = parseRecipient(m[2], t);
      if (!recipient) return null;
      return recipient.kind === 'player'
        ? [{ do: 'damage-player', who: recipient.who, amount }]
        : [{ do: 'damage', to: recipient.what, amount }];
    },
  },
  {
    id: 'poison',
    re: new RegExp(`^(?:each opponent gets|target player gets) (${NUM}) poison counters?$`, 'i'),
    build: m => [{ do: 'poison', who: { who: 'each-opponent' }, amount: readNumberOr1(m[1]) }],
  },

  /* --- permanents --- */
  {
    id: 'create-token',
    re: new RegExp(`^creates? (${NUM}) (.+?) tokens?(?: that(?:'s| is) tapped| tapped)?$`, 'i'),
    build: m => [
      {
        do: 'create-token',
        who: YOU,
        token: parseToken(m[2]),
        count: readNumberOr1(m[1]),
        ...(/tapped/i.test(m[0]) ? { tapped: true } : {}),
      },
    ],
  },
  {
    id: 'counters-on-self',
    re: new RegExp(`^puts? (${NUM}) ([+\\-]1/[+\\-]1|[a-z ]+?) counters? on ~$`, 'i'),
    build: m => [
      { do: 'add-counters', what: { sel: 'self' }, counter: m[2].trim(), count: readNumberOr1(m[1]) },
    ],
  },
  {
    id: 'counters-on-target',
    re: new RegExp(`^puts? (${NUM}) ([+\\-]1/[+\\-]1|[a-z ]+?) counters? on target creature$`, 'i'),
    build: (m, t) => [
      {
        do: 'add-counters',
        what: { sel: 'target', ref: t.card('Choose a creature', CREATURE_FILTER) },
        counter: m[2].trim(),
        count: readNumberOr1(m[1]),
      },
    ],
  },
  {
    id: 'counters-each-creature-you-control',
    re: new RegExp(`^puts? (${NUM}) ([+\\-]1/[+\\-]1) counters? on each creature you control$`, 'i'),
    build: m => [
      {
        do: 'add-counters',
        what: { sel: 'all', where: { is: 'type', value: 'creature' }, controller: YOU },
        counter: m[2].trim(),
        count: readNumberOr1(m[1]),
      },
    ],
  },
  {
    id: 'destroy-target-creature',
    re: /^destroy target creature$/i,
    build: (_m, t) => [{ do: 'destroy', what: { sel: 'target', ref: t.card('Choose a creature', CREATURE_FILTER) } }],
  },
  {
    id: 'exile-target-creature',
    re: /^exile target creature$/i,
    build: (_m, t) => [{ do: 'exile', what: { sel: 'target', ref: t.card('Choose a creature', CREATURE_FILTER) } }],
  },
  {
    id: 'destroy-all-creatures',
    re: /^destroy all creatures$/i,
    build: () => [{ do: 'destroy', what: { sel: 'all', where: { is: 'type', value: 'creature' } } }],
  },
  {
    id: 'tap-target',
    re: /^tap target creature$/i,
    build: (_m, t) => [{ do: 'tap', what: { sel: 'target', ref: t.card('Choose a creature', CREATURE_FILTER) } }],
  },
  {
    id: 'untap-target',
    re: /^untap target creature$/i,
    build: (_m, t) => [{ do: 'untap', what: { sel: 'target', ref: t.card('Choose a creature', CREATURE_FILTER) } }],
  },
  {
    id: 'untap-self',
    re: /^untap ~$/i,
    build: () => [{ do: 'untap', what: { sel: 'self' } }],
  },
  {
    id: 'return-target-to-hand',
    re: /^returns? target creature to (?:its owner's|their owner's) hand$/i,
    build: (_m, t) => [
      {
        do: 'move-zone',
        what: { sel: 'target', ref: t.card('Choose a creature', CREATURE_FILTER) },
        to: 'hand',
      },
    ],
  },
  {
    id: 'pump-self',
    re: /^~ gets ([+\-]\d+)\/([+\-]\d+) until end of turn$/i,
    build: m => [
      {
        do: 'pump',
        what: { sel: 'self' },
        power: Number(m[1]),
        toughness: Number(m[2]),
        duration: 'end-of-turn' as Duration,
      },
    ],
  },
  {
    id: 'pump-target',
    re: /^target creature gets ([+\-]\d+)\/([+\-]\d+) until end of turn$/i,
    build: (m, t) => [
      {
        do: 'pump',
        what: { sel: 'target', ref: t.card('Choose a creature', CREATURE_FILTER) },
        power: Number(m[1]),
        toughness: Number(m[2]),
        duration: 'end-of-turn' as Duration,
      },
    ],
  },
  {
    id: 'pump-creatures-you-control',
    re: /^creatures you control get ([+\-]\d+)\/([+\-]\d+) until end of turn$/i,
    build: m => [
      {
        do: 'pump',
        what: { sel: 'all', where: { is: 'type', value: 'creature' }, controller: YOU },
        power: Number(m[1]),
        toughness: Number(m[2]),
        duration: 'end-of-turn' as Duration,
      },
    ],
  },

  /* --- mana --- */
  {
    id: 'add-mana',
    re: /^adds? ((?:\{[^}]+\})+)$/i,
    build: m => [{ do: 'add-mana', who: YOU, mana: m[1] }],
  },

  /* --- table --- */
  {
    id: 'you-become-monarch',
    re: /^you become the monarch$/i,
    build: () => [{ do: 'set-monarch', who: YOU }],
  },
  {
    id: 'you-win',
    re: /^you win the game$/i,
    build: () => [{ do: 'win-game', who: YOU }],
  },
  {
    id: 'you-lose',
    re: /^you lose the game$/i,
    build: () => [{ do: 'lose-game', who: YOU }],
  },
  {
    id: 'shuffle',
    re: /^shuffle(?: your library)?$/i,
    build: () => [{ do: 'shuffle', who: YOU }],
  },
];

/**
 * One sentence of effect text → effects, or `null` if we have no vocabulary
 * for it. `null` is not a failure to be swallowed: the caller turns it into a
 * `{do:'manual'}` so the sentence still reaches the player.
 */
export function parseEffectSentence(sentence: string, targets: TargetCollector): Effect[] | null {
  const text = sentence.trim().replace(/\.$/, '').trim();
  if (!text) return null;

  for (const rule of EFFECT_RULES) {
    const match = text.match(rule.re);
    if (!match) continue;
    const built = rule.build(match, targets);
    if (built) return built;
  }
  return null;
}

/**
 * The effect half of an ability. Every sentence lands somewhere: recognised
 * sentences become effects, unrecognised ones become `{do:'manual'}` carrying
 * their own verbatim text.
 */
function parseEffectList(text: string, targets: TargetCollector): Effect[] {
  const out: Effect[] = [];

  for (const sentence of splitSentences(text)) {
    const optional = /^you may /i.test(sentence);
    const body = optional ? sentence.replace(/^you may /i, '') : sentence;
    const effects = parseEffectSentence(body, targets);

    if (!effects) {
      out.push({ do: 'manual', text: sentence.trim() });
      continue;
    }

    if (optional) out.push({ do: 'may', who: YOU, text: sentence.trim(), effects });
    else out.push(...effects);
  }

  return out;
}

/**
 * Split an effect clause into sentences.
 *
 * ". " is the only reliable boundary — " and " joins halves of one sentence as
 * often as it joins two ("draw a card and you gain 1 life" is two, "target
 * creature gets +1/+1 and gains flying" is one), so it is left alone and the
 * whole thing goes to `{do:'manual'}` if it does not match a rule. Guessing
 * there would produce half-applied abilities, which is the failure mode this
 * project exists to remove.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=\.)\s+/)
    .map(part => part.trim())
    .filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* Trigger conditions                                                         */
/* -------------------------------------------------------------------------- */

interface TriggerRule {
  id: string;
  re: RegExp;
  build(match: RegExpMatchArray): TriggerEvent | null;
}

const SELF_WORDS = "(?:~|this creature|this permanent|this artifact|this enchantment|this land|this planeswalker|this token|this vehicle)";

const TRIGGER_RULES: TriggerRule[] = [
  {
    id: 'self-enters',
    re: new RegExp(`^${SELF_WORDS} enters(?: the battlefield)?$`, 'i'),
    build: () => ({ on: 'enters', who: { sel: 'self' } }),
  },
  {
    id: 'another-creature-enters-you',
    re: /^another creature enters under your control$/i,
    build: () => ({
      on: 'enters',
      who: {
        sel: 'all',
        where: { is: 'and', of: [{ is: 'type', value: 'creature' }, { is: 'other' }] },
        controller: { who: 'you' },
      },
    }),
  },
  {
    id: 'another-creature-enters',
    re: /^another creature enters(?: the battlefield)?$/i,
    build: () => ({
      on: 'enters',
      who: {
        sel: 'all',
        where: { is: 'and', of: [{ is: 'type', value: 'creature' }, { is: 'other' }] },
      },
    }),
  },
  {
    id: 'creature-you-control-enters',
    re: /^(?:a|another) creature you control enters(?: the battlefield)?$/i,
    build: () => ({
      on: 'enters',
      who: { sel: 'all', where: { is: 'type', value: 'creature' }, controller: { who: 'you' } },
    }),
  },
  {
    id: 'self-dies',
    re: new RegExp(`^${SELF_WORDS} dies$`, 'i'),
    build: () => ({ on: 'dies', who: { sel: 'self' } }),
  },
  {
    id: 'another-creature-dies',
    re: /^another creature (?:you control )?dies$/i,
    build: () => ({
      on: 'dies',
      who: {
        sel: 'all',
        where: { is: 'and', of: [{ is: 'type', value: 'creature' }, { is: 'other' }] },
      },
    }),
  },
  {
    id: 'self-leaves',
    re: new RegExp(`^${SELF_WORDS} leaves the battlefield$`, 'i'),
    build: () => ({ on: 'leaves', who: { sel: 'self' }, from: 'battlefield' }),
  },
  {
    id: 'self-attacks',
    re: new RegExp(`^${SELF_WORDS} attacks$`, 'i'),
    build: () => ({ on: 'attacks', who: { sel: 'self' } }),
  },
  {
    id: 'creature-you-control-attacks',
    re: /^a creature you control attacks$/i,
    build: () => ({
      on: 'attacks',
      who: { sel: 'all', where: { is: 'type', value: 'creature' }, controller: { who: 'you' } },
    }),
  },
  {
    id: 'self-blocks',
    re: new RegExp(`^${SELF_WORDS} blocks(?: a creature)?$`, 'i'),
    build: () => ({ on: 'blocks', who: { sel: 'self' } }),
  },
  {
    id: 'self-becomes-blocked',
    re: new RegExp(`^${SELF_WORDS} becomes blocked$`, 'i'),
    build: () => ({ on: 'becomes-blocked', who: { sel: 'self' } }),
  },
  {
    id: 'self-deals-combat-damage-to-player',
    re: new RegExp(`^${SELF_WORDS} deals combat damage to a player$`, 'i'),
    build: () => ({ on: 'deals-damage', source: { sel: 'self' }, to: 'player', combatOnly: true }),
  },
  {
    id: 'self-deals-damage',
    re: new RegExp(`^${SELF_WORDS} deals damage(?: to a player)?$`, 'i'),
    build: () => ({ on: 'deals-damage', source: { sel: 'self' }, to: 'any' }),
  },
  {
    id: 'self-tapped',
    re: new RegExp(`^${SELF_WORDS} becomes tapped$`, 'i'),
    build: () => ({ on: 'tapped', who: { sel: 'self' } }),
  },
  {
    id: 'self-untapped',
    re: new RegExp(`^${SELF_WORDS} becomes untapped$`, 'i'),
    build: () => ({ on: 'untapped', who: { sel: 'self' } }),
  },
  {
    id: 'you-cast',
    re: /^you cast (?:a|an) (creature|instant|sorcery|artifact|enchantment|planeswalker) spell$/i,
    build: m => ({ on: 'cast', what: { is: 'type', value: m[1].toLowerCase() }, by: { who: 'you' } }),
  },
  {
    id: 'you-gain-life',
    re: /^you gain life$/i,
    build: () => ({ on: 'gains-life', whose: { who: 'you' } }),
  },
  {
    id: 'you-lose-life',
    re: /^you lose life$/i,
    build: () => ({ on: 'loses-life', whose: { who: 'you' } }),
  },
  {
    id: 'you-draw',
    re: /^you draw a card$/i,
    build: () => ({ on: 'draws-card', whose: { who: 'you' } }),
  },
  {
    id: 'beginning-of-your-upkeep',
    re: /^the beginning of your upkeep$/i,
    build: () => ({ on: 'step', step: 'upkeep', whose: { who: 'you' } }),
  },
  {
    id: 'beginning-of-your-end-step',
    re: /^the beginning of your end step$/i,
    build: () => ({ on: 'step', step: 'end', whose: { who: 'you' } }),
  },
  {
    id: 'beginning-of-your-draw-step',
    re: /^the beginning of your draw step$/i,
    build: () => ({ on: 'step', step: 'draw', whose: { who: 'you' } }),
  },
  {
    id: 'beginning-of-each-upkeep',
    re: /^the beginning of each (?:player's )?upkeep$/i,
    build: () => ({ on: 'step', step: 'upkeep', whose: { who: 'each-player' } }),
  },
  {
    id: 'beginning-of-each-opponents-upkeep',
    re: /^the beginning of each opponent's upkeep$/i,
    build: () => ({ on: 'step', step: 'upkeep', whose: { who: 'each-opponent' } }),
  },
  {
    id: 'beginning-of-combat-on-your-turn',
    re: /^the beginning of combat on your turn$/i,
    build: () => ({ on: 'step', step: 'begin_combat', whose: { who: 'you' } }),
  },
];

function parseTriggerCondition(text: string): TriggerEvent | null {
  const cleaned = text.trim().replace(/\.$/, '');
  for (const rule of TRIGGER_RULES) {
    const match = cleaned.match(rule.re);
    if (!match) continue;
    const built = rule.build(match);
    if (built) return built;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Costs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * "{2}{W}, {T}, Sacrifice a creature" → a cost list.
 *
 * Returns `null` for any component we cannot price. A half-understood cost is
 * worse than none at all: it would let a player activate an ability for less
 * than the card charges, which is a rules break the log would not even show.
 */
export function parseCosts(text: string): Cost[] | null {
  const parts = text.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const costs: Cost[] = [];

  for (const part of parts) {
    const lower = part.toLowerCase();

    if (/^(?:\{[^}]+\})+$/.test(part)) {
      // {T} and {Q} are the tap and untap symbols, not mana.
      if (/^\{t\}$/i.test(part)) {
        costs.push({ pay: 'tap' });
        continue;
      }
      if (/^\{q\}$/i.test(part)) {
        costs.push({ pay: 'untap' });
        continue;
      }
      if (/\{t\}/i.test(part) || /\{q\}/i.test(part)) return null;
      costs.push({ pay: 'mana', cost: part });
      continue;
    }

    const loyalty = part.match(/^([+\-−]\s?\d+)$/);
    if (loyalty) {
      const value = Number(loyalty[1].replace(/[\s−]/g, m => (m === '−' ? '-' : '')));
      if (!Number.isFinite(value)) return null;
      costs.push(
        value >= 0
          ? { pay: 'add-counters', counter: 'loyalty', count: value, to: { sel: 'self' } }
          : { pay: 'remove-counters', counter: 'loyalty', count: -value, from: { sel: 'self' } }
      );
      continue;
    }
    if (/^0$/.test(part)) {
      costs.push({ pay: 'add-counters', counter: 'loyalty', count: 0, to: { sel: 'self' } });
      continue;
    }

    let match = lower.match(new RegExp(`^sacrifice (${NUM})? ?(.+)$`));
    if (match && /^sacrifice /.test(lower)) {
      const what = match[2].trim();
      if (what === '~' || what === 'this creature' || what === 'this permanent') {
        costs.push({ pay: 'sacrifice', what: { sel: 'self' }, count: 1 });
      } else if (/^(?:a |an )?creature$/.test(what) || what === 'creatures') {
        costs.push({
          pay: 'sacrifice',
          what: { sel: 'all', where: { is: 'type', value: 'creature' }, controller: { who: 'you' } },
          count: readNumberOr1(match[1]),
        });
      } else {
        return null;
      }
      continue;
    }

    match = lower.match(new RegExp(`^discard (${NUM}) cards?(?: at random)?$`));
    if (match) {
      costs.push({
        pay: 'discard',
        count: readNumberOr1(match[1]),
        ...(/at random/.test(lower) ? { random: true } : {}),
      });
      continue;
    }

    match = lower.match(new RegExp(`^pay (${NUM}) life$`));
    if (match) {
      costs.push({ pay: 'life', amount: readNumberOr1(match[1]) });
      continue;
    }

    match = lower.match(new RegExp(`^remove (${NUM}) ([+\\-]1/[+\\-]1|[a-z ]+?) counters? from ~$`));
    if (match) {
      costs.push({
        pay: 'remove-counters',
        counter: match[2].trim(),
        count: readNumberOr1(match[1]),
        from: { sel: 'self' },
      });
      continue;
    }

    if (/^tap (?:an )?untapped creatures? you control$/.test(lower)) {
      costs.push({
        pay: 'tap-others',
        what: { sel: 'all', where: { is: 'and', of: [{ is: 'type', value: 'creature' }, { is: 'untapped' }] }, controller: { who: 'you' } },
        count: 1,
      });
      continue;
    }

    return null;
  }

  return costs;
}

/* -------------------------------------------------------------------------- */
/* Clause compilers                                                           */
/* -------------------------------------------------------------------------- */

interface ClauseResult {
  abilities: Ability[];
  /** Set when the clause could not become an ability at all. */
  gap?: GapReason;
}

const KEYWORD_SET = new Set(FLAGGABLE_KEYWORDS.map(normalizeKeyword));

/** A line that is nothing but keywords: "Flying, vigilance". */
function compileKeywordLine(clause: string, nextId: () => string): ClauseResult | null {
  const parts = clause
    .split(',')
    .map(part => part.trim().replace(/\.$/, ''))
    .filter(Boolean);
  if (parts.length === 0) return null;

  const abilities: Ability[] = [];
  for (const part of parts) {
    const lower = normalizeKeyword(part);
    const protection = lower.match(/^protection from (.+)$/);
    if (protection) {
      abilities.push({
        kind: 'keyword',
        id: nextId(),
        text: part,
        confidence: 'exact',
        keyword: 'protection',
        quality: protection[1],
      });
      continue;
    }
    if (!KEYWORD_SET.has(lower)) return null;
    abilities.push({
      kind: 'keyword',
      id: nextId(),
      text: part,
      confidence: 'exact',
      keyword: lower,
    });
  }

  return { abilities };
}

/** "When ~ enters, you gain 3 life." */
function compileTriggered(clause: string, nextId: () => string): ClauseResult | null {
  const match = clause.match(/^(when|whenever|at)\s+(.+?),\s*(.+)$/is);
  if (!match) return null;

  const [, , conditionText, effectText] = match;
  const event = parseTriggerCondition(conditionText);
  if (!event) {
    // Recognisably a trigger, but not one we model. That is a gap with a name,
    // not an ability we pretend to have.
    return { abilities: [], gap: gapForTrigger(conditionText) };
  }

  const targets = new TargetCollector();
  let body = effectText.trim();
  let interveningIf = false;

  // CR 603.4 — "if you control a Goblin" between the event and the effect.
  const intervening = body.match(/^if ([^,]+),\s*(.+)$/i);
  if (intervening) {
    interveningIf = true;
    body = intervening[2];
  }

  const optional = /^you may /i.test(body);
  const effects = parseEffectList(body, targets);

  const ability: Ability = {
    kind: 'triggered',
    id: nextId(),
    text: clause,
    confidence: 'exact',
    event,
    effects,
    ...(targets.specs.length > 0 ? { targets: targets.specs } : {}),
    ...(optional ? { optional: true } : {}),
    ...(interveningIf
      ? // The condition itself is not modelled — only the fact that there is
        // one — so the ability carries a manual note rather than firing
        // unconditionally and pretending the check happened.
        { interveningIf: true }
      : {}),
  };

  if (interveningIf) {
    (ability as { effects: Effect[] }).effects = [
      { do: 'manual', text: intervening[1], hint: 'intervening-if condition (CR 603.4)' },
      ...effects,
    ];
  }

  return { abilities: [ability] };
}

function gapForTrigger(conditionText: string): GapReason {
  const lower = conditionText.toLowerCase();
  if (/\bcast\b/.test(lower) && /\bstorm\b/.test(lower)) return 'needs-history';
  if (/this turn\b/.test(lower)) return 'needs-history';
  if (/\bcopy\b/.test(lower)) return 'copy-layer';
  return 'unmodelled';
}

/** "{2}{W}, {T}: Draw a card." */
function compileActivated(clause: string, nextId: () => string): ClauseResult | null {
  const match = clause.match(/^([^:]+):\s*(.+)$/s);
  if (!match) return null;

  const costs = parseCosts(match[1]);
  if (!costs) return { abilities: [], gap: 'unmodelled' };

  const targets = new TargetCollector();
  const effects = parseEffectList(match[2].trim(), targets);

  const isMana =
    effects.length > 0 && effects.every(effect => effect.do === 'add-mana');
  const isLoyalty = costs.some(
    cost =>
      (cost.pay === 'add-counters' || cost.pay === 'remove-counters') && cost.counter === 'loyalty'
  );

  const sorceryOnly = /activate only as a sorcery/i.test(clause);

  return {
    abilities: [
      {
        kind: 'activated',
        id: nextId(),
        text: clause,
        confidence: 'exact',
        costs,
        effects,
        ...(targets.specs.length > 0 ? { targets: targets.specs } : {}),
        ...(isMana ? { isManaAbility: true } : {}),
        ...(isLoyalty ? { isLoyalty: true, timing: 'sorcery' as const } : {}),
        ...(sorceryOnly && !isLoyalty ? { timing: 'sorcery' as const } : {}),
      },
    ],
  };
}

/** "~ enters tapped." / "~ enters with two +1/+1 counters on it." */
function compileReplacement(clause: string, nextId: () => string): ClauseResult | null {
  const tapped = clause.match(new RegExp(`^${SELF_WORDS} enters tapped\\.?$`, 'i'));
  if (tapped) {
    return {
      abilities: [
        {
          kind: 'replacement',
          id: nextId(),
          text: clause,
          confidence: 'exact',
          event: { on: 'enters', who: { sel: 'self' } },
          result: { do: 'enters-tapped' },
          selfReplacement: true,
        },
      ],
    };
  }

  const counters = clause.match(
    new RegExp(`^${SELF_WORDS} enters with (${NUM}) ([+\\-]1/[+\\-]1|[a-z ]+?) counters? on it\\.?$`, 'i')
  );
  if (counters) {
    return {
      abilities: [
        {
          kind: 'replacement',
          id: nextId(),
          text: clause,
          confidence: 'exact',
          event: { on: 'enters', who: { sel: 'self' } },
          result: {
            do: 'enters-with-counters',
            counter: counters[2].trim(),
            count: readNumberOr1(counters[1]),
          },
          selfReplacement: true,
        },
      ],
    };
  }

  return null;
}

/** "Creatures you control get +1/+1." / "Other Goblins you control have haste." */
function compileStatic(clause: string, nextId: () => string): ClauseResult | null {
  const anthem = clause.match(
    /^(other )?([A-Za-z][A-Za-z' -]*?)s? you control get ([+\-]\d+)\/([+\-]\d+)\.?$/i
  );
  if (anthem) {
    const subject = anthem[2].trim().toLowerCase();
    const filter =
      subject === 'creature'
        ? { is: 'type' as const, value: 'creature' }
        : { is: 'subtype' as const, value: subject };
    return {
      abilities: [
        {
          kind: 'static',
          id: nextId(),
          text: clause,
          confidence: 'exact',
          affects: {
            sel: 'all',
            where: anthem[1] ? { is: 'and', of: [filter, { is: 'other' }] } : filter,
            controller: { who: 'you' },
          },
          modifications: [
            { layer: 'pt-modify', power: Number(anthem[3]), toughness: Number(anthem[4]) },
          ],
        },
      ],
    };
  }

  const grant = clause.match(
    /^(other )?([A-Za-z][A-Za-z' -]*?)s? you control have ([a-z, ]+?)\.?$/i
  );
  if (grant) {
    const words = grant[3]
      .split(/,| and /i)
      .map(word => normalizeKeyword(word))
      .filter(Boolean);
    if (words.length > 0 && words.every(word => KEYWORD_SET.has(word))) {
      const subject = grant[2].trim().toLowerCase();
      const filter =
        subject === 'creature'
          ? { is: 'type' as const, value: 'creature' }
          : { is: 'subtype' as const, value: subject };
      return {
        abilities: [
          {
            kind: 'static',
            id: nextId(),
            text: clause,
            confidence: 'exact',
            affects: {
              sel: 'all',
              where: grant[1] ? { is: 'and', of: [filter, { is: 'other' }] } : filter,
              controller: { who: 'you' },
            },
            modifications: [{ layer: 'ability', grant: words }],
          },
        ],
      };
    }
    // A whole nested ability rather than a keyword. Named, not half-built.
    return { abilities: [], gap: 'granted-ability' };
  }

  const cantBlock = clause.match(new RegExp(`^${SELF_WORDS} can't block\\.?$`, 'i'));
  if (cantBlock) {
    return {
      abilities: [
        {
          kind: 'static',
          id: nextId(),
          text: clause,
          confidence: 'exact',
          affects: { sel: 'self' },
          modifications: [{ layer: 'restriction', rule: { rule: 'cant-block', who: { sel: 'self' } } }],
        },
      ],
    };
  }

  const cantAttack = clause.match(new RegExp(`^${SELF_WORDS} can't attack\\.?$`, 'i'));
  if (cantAttack) {
    return {
      abilities: [
        {
          kind: 'static',
          id: nextId(),
          text: clause,
          confidence: 'exact',
          affects: { sel: 'self' },
          modifications: [{ layer: 'restriction', rule: { rule: 'cant-attack', who: { sel: 'self' } } }],
        },
      ],
    };
  }

  return null;
}

/** An instant or sorcery: the whole line is what the spell does. */
function compileSpell(clause: string, nextId: () => string): ClauseResult | null {
  const targets = new TargetCollector();
  const effects = parseEffectList(clause, targets);
  // Every sentence became a manual note, so nothing was actually understood.
  // Report it as a gap rather than as a spell that "resolves" and does nothing.
  if (effects.every(effect => effect.do === 'manual')) return null;

  return {
    abilities: [
      {
        kind: 'spell',
        id: nextId(),
        text: clause,
        confidence: 'exact',
        effects,
        ...(targets.specs.length > 0 ? { targets: targets.specs } : {}),
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Known-gap detection                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Give a clause we cannot compile the most specific gap reason that fits.
 *
 * These are matched against the ten refusals declared in the design, so
 * "what does the engine not do" stays a countable histogram rather than one
 * undifferentiated bucket of "unmodelled".
 */
const GAP_PATTERNS: Array<{ reason: GapReason; re: RegExp }> = [
  { reason: 'copy-layer', re: /\b(becomes? a copy|copy of|change the text)\b/i },
  { reason: 'alt-cast', re: /\b(cascade|suspend|foretell|flashback|madness|you may cast|rather than pay|as an additional cost to cast)\b/i },
  { reason: 'needs-history', re: /\b(storm|this turn|magecraft|second spell|each spell you've cast)\b/i },
  { reason: 'hidden-choice', re: /\b(name a card|choose a card in|separate .* into|two piles|vote|secretly)\b/i },
  { reason: 'outside-game', re: /\b(outside the game|sideboard|companion|dungeon|the ring|day and night|daybound|nightbound)\b/i },
  { reason: 'meta-replacement', re: /\b(can't be prevented|can't gain life|counters can't be)\b/i },
  { reason: 'state-trigger', re: /\bwhenever you (?:control no|have no)\b/i },
  { reason: 'duration', re: /\buntil (?:end of combat|your next end step|the end of)\b/i },
  { reason: 'complex-combat', re: /\b(banding|damage assignment order)\b/i },
  { reason: 'granted-ability', re: /\bhave "(?:when|whenever)/i },
];

function gapReasonFor(clause: string): GapReason {
  for (const { reason, re } of GAP_PATTERNS) {
    if (re.test(clause)) return reason;
  }
  return 'unmodelled';
}

/* -------------------------------------------------------------------------- */
/* The compiler                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A stable, deterministic 32-bit hash of the normalised oracle text.
 *
 * FNV-1a, because it needs to be identical on every client and in Postgres if
 * we ever push it there, not because it needs to be cryptographic. It exists so
 * a Scryfall erratum moving under a hand-authored entry is DETECTED — a stale
 * entry is downgraded to manual rather than run against text it no longer
 * matches. Silent staleness is the same bug in a different hat.
 */
export function oracleHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Normalised oracle text → `CardAbilities`.
 *
 * Pure and total: it never throws on unexpected input and never returns
 * partially-built data. `coverage` is filled in by `registry.ts`, which is the
 * single place it is derived, so this function cannot accidentally claim more
 * than it did.
 */
export function compile(input: CompileInput): Omit<CardAbilities, 'coverage'> {
  const text = normaliseOracle(input);
  const hash = oracleHash(text);
  const oracleId = input.oracleId ?? input.name.toLowerCase();

  const abilities: Ability[] = [];
  const unparsed: UnparsedClause[] = [];
  let counter = 0;
  const nextId = () => `a${counter++}`;

  const typeLine = (input.typeLine ?? '').toLowerCase();
  const isSpellCard = typeLine.includes('instant') || typeLine.includes('sorcery');

  for (const segment of splitClauses(text)) {
    const clause = segment.text;

    // A blank line carries no rules text. It is still accounted for: its span
    // belongs to a segment that produced nothing, and the accounting check
    // treats whitespace-only spans as covered.
    if (!clause) continue;

    const result =
      compileKeywordLine(clause, nextId) ??
      compileTriggered(clause, nextId) ??
      compileActivated(clause, nextId) ??
      compileReplacement(clause, nextId) ??
      compileStatic(clause, nextId) ??
      (isSpellCard ? compileSpell(clause, nextId) : null);

    if (result && result.abilities.length > 0) {
      abilities.push(...result.abilities);
      continue;
    }

    unparsed.push({
      text: clause,
      reason: result?.gap ?? gapReasonFor(clause),
      span: [segment.start, segment.end],
    });
  }

  return {
    oracleId,
    name: input.name,
    abilities,
    unparsed,
    source: 'compiler',
    oracleHash: hash,
  };
}
