/**
 * Effect phrases -> the closed `Effect` vocabulary.
 *
 * A declarative table, in the shape `tagger.ts` proved out: one array of rules,
 * one interpreter, no imperative parser sprawl. Each rule is an anchored regex
 * over the normalised phrase plus a `build` that may still decline by returning
 * `null` — the regex says "this looks like a draw effect", `build` says "and I
 * could read every part of it". Both have to agree before an `Effect` exists.
 *
 * ## The contract this file lives by
 * `compileEffectPhrase` returns `null` when nothing matched. It NEVER returns a
 * plausible-looking default. The caller turns a `null` into `{do:'manual'}`
 * carrying the verbatim phrase, so the ability still runs its other clauses and
 * still says out loud what it did not do. Every `return null` below is a
 * deliberate refusal, and the comment next to it says what we refused.
 *
 * ## Effects deliberately not modelled, and why they are frequent
 * Scry, surveil, explore, investigate and proliferate are all common and all
 * absent from the DSL's effect vocabulary. They come out as `{do:'manual'}`
 * with a hint rather than being approximated, and `coverage.ts` counts them, so
 * "what should the vocabulary grow next" is a number rather than an opinion.
 */

import type { Effect, PlayerSelector, Selector, TargetSpec, TokenSpec, ValueExpr } from './dsl.ts';
import { manual } from './dsl.ts';
import {
  NUM,
  PLAYER,
  objectSelector,
  parseCount,
  parseKeywordList,
  parseObject,
  parsePlayer,
  registerTarget,
} from './grammar.ts';

/* ------------------------------------------------------------------ *
 * Build context
 * ------------------------------------------------------------------ */

export interface BuildCtx {
  /** Registers a target and returns its `ref`. */
  addTarget(spec: Omit<TargetSpec, 'ref'>): number;
  /** Lowercased front-face type line, for rules that need to know the card type. */
  typeLine: string;
  /**
   * Set by any rule that resolved something by inference rather than by
   * reading it — an "it" bound to the source, a "reveal" dropped as
   * information-only. The ability it belongs to is published as
   * `confidence: 'approximate'`, which the runtime logs on resolution.
   */
  approximate: boolean;
}

export interface EffectRule {
  id: string;
  re: RegExp;
  build(m: RegExpMatchArray, ctx: BuildCtx): Effect[] | null;
  note?: string;
}

/* ------------------------------------------------------------------ *
 * Shared resolvers
 * ------------------------------------------------------------------ */

/** An object phrase in effect position -> a `Selector`, or `null` to refuse. */
export function phraseSelector(phrase: string, ctx: BuildCtx, prompt: string): Selector | null {
  const p = phrase.trim().replace(/[.,]+$/, '');
  if (!p) return null;
  if (p === '~' || p === 'itself') return { sel: 'self' };
  // Auras and Equipment refer to their host, never by name.
  if (/^(enchanted|equipped) /.test(p)) return { sel: 'attached' };
  const ref = parseObject(p);
  if (!ref) return null;
  if (ref.targeted) return registerTarget(ref, ctx.addTarget, prompt);
  return objectSelector(ref);
}

/** A player phrase, defaulting to the ability's controller when omitted. */
function playerOr(phrase: string | undefined, ctx: BuildCtx, fallback: PlayerSelector = { who: 'you' }): PlayerSelector | null {
  if (!phrase) return fallback;
  return parsePlayer(phrase, (spec) => ctx.addTarget(spec));
}

/** Damage and similar effects take either an object or a player. */
function recipient(phrase: string, ctx: BuildCtx): Selector | PlayerSelector | null {
  const p = phrase.trim().replace(/[.,]+$/, '');
  if (p === 'any target') {
    return { sel: 'target', ref: ctx.addTarget({ what: 'any', min: 1, max: 1, prompt: 'Choose any target' }) };
  }
  const player = parsePlayer(p, (spec) => ctx.addTarget(spec));
  if (player) return player;
  return phraseSelector(p, ctx, 'Choose target');
}

/** `"~"` or `"it"` in subject position. `"it"` is inference, so it flags approximate. */
function selfSubject(word: string, ctx: BuildCtx): Selector | null {
  const w = word.trim();
  if (w === '~') return { sel: 'self' };
  if (w === 'it') { ctx.approximate = true; return { sel: 'self' }; }
  return null;
}

/* ------------------------------------------------------------------ *
 * Tokens
 * ------------------------------------------------------------------ */

/**
 * Predefined tokens: the card says only the name, and the token's own rules text
 * belongs to the token, not to the card that makes it. Emitting the token
 * faithfully is therefore COMPLETE for this card — the token's abilities are
 * compiled when the token exists, by this same compiler, from the token's own
 * oracle text. Inventing that text here would be exactly the fabrication the
 * DSL forbids.
 */
const PREDEFINED_TOKENS: Record<string, TokenSpec> = {
  treasure: { name: 'Treasure', typeLine: 'Token Artifact — Treasure' },
  food: { name: 'Food', typeLine: 'Token Artifact — Food' },
  clue: { name: 'Clue', typeLine: 'Token Artifact — Clue' },
  blood: { name: 'Blood', typeLine: 'Token Artifact — Blood' },
  gold: { name: 'Gold', typeLine: 'Token Artifact — Gold' },
  powerstone: { name: 'Powerstone', typeLine: 'Token Artifact — Powerstone' },
  map: { name: 'Map', typeLine: 'Token Artifact — Map' },
  incubator: { name: 'Incubator', typeLine: 'Token Artifact — Incubator' },
  junk: { name: 'Junk', typeLine: 'Token Artifact — Junk' },
  shard: { name: 'Shard', typeLine: 'Token Enchantment — Shard' },
};

const TOKEN_COLORS: Record<string, 'W' | 'U' | 'B' | 'R' | 'G'> = {
  white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G',
};

const TOKEN_CARD_TYPES = new Set(['artifact', 'creature', 'enchantment', 'land', 'legendary', 'snow']);

/**
 * "1/1 white soldier creature" -> a `TokenSpec`. Every word has to land in a
 * bucket; one unread word refuses the whole token, because a token with the
 * wrong type line is a permanent that behaves wrongly for the rest of the game.
 */
function buildToken(power: string, toughness: string, descriptor: string, keywords: string[] | null): TokenSpec | null {
  const colors: Array<'W' | 'U' | 'B' | 'R' | 'G'> = [];
  const types: string[] = [];
  const subtypes: string[] = [];
  let colorless = false;

  for (const word of descriptor.split(' ').map((w) => w.trim()).filter(Boolean)) {
    if (word === 'and') continue;
    if (word === 'colorless') { colorless = true; continue; }
    if (word in TOKEN_COLORS) { colors.push(TOKEN_COLORS[word]); continue; }
    if (TOKEN_CARD_TYPES.has(word)) { types.push(word); continue; }
    // Anything left has to be a subtype, and `parseObject` owns that vocabulary.
    const asSubtype = parseObject(word);
    if (asSubtype && asSubtype.filter && !Array.isArray(asSubtype.filter)) {
      const f = asSubtype.filter as { is?: string; value?: string };
      if (f.is === 'subtype' && f.value) { subtypes.push(f.value); continue; }
      if (f.is === 'type' && f.value) { types.push(f.value); continue; }
    }
    return null; // an unread descriptor word
  }

  if (!types.includes('creature')) return null; // p/t without "creature" is not a creature token
  const typeWords = types.map((t) => t[0].toUpperCase() + t.slice(1));
  const subWords = subtypes.map((t) => t[0].toUpperCase() + t.slice(1));
  const spec: TokenSpec = {
    name: subWords.length ? subWords.join(' ') : typeWords.join(' '),
    typeLine: `Token ${typeWords.join(' ')}${subWords.length ? ' — ' + subWords.join(' ') : ''}`,
    power,
    toughness,
  };
  if (!colorless && colors.length) spec.colorIdentity = colors;
  if (colorless) spec.colorIdentity = ['C'];
  if (keywords && keywords.length) spec.keywords = keywords;
  return spec;
}

/* ------------------------------------------------------------------ *
 * The rule table
 * ------------------------------------------------------------------ */

const N = NUM;
const P = PLAYER;

export const EFFECT_RULES: EffectRule[] = [
  /* ---------------- cards ---------------- */
  {
    id: 'draw',
    re: new RegExp(`^(?:(${P}) )?draws? (${N}) cards?$`),
    note: '"draw a card" (implicit you), "each opponent draws two cards".',
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      const count = parseCount(m[2]);
      if (!who || count === null) return null;
      return [{ do: 'draw', who, count }];
    },
  },
  {
    id: 'mill',
    re: new RegExp(`^(?:(${P}) )?mills? (${N}) cards?$`),
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      const count = parseCount(m[2]);
      if (!who || count === null) return null;
      return [{ do: 'mill', who, count }];
    },
  },
  {
    id: 'discard',
    re: new RegExp(`^(?:(${P}) )?discards? (${N}) cards?( at random)?$`),
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      const count = parseCount(m[2]);
      if (!who || count === null) return null;
      const e: Effect = { do: 'discard', who, count };
      if (m[3]) (e as { random?: boolean }).random = true;
      return [e];
    },
  },
  {
    id: 'discard-hand',
    re: new RegExp(`^(?:(${P}) )?discards? (?:their|his or her) hand$`),
    note: 'Refused: the count is the hand size, and the DSL has no "cards-in hand of that player" bound to a per-player loop here.',
    build: () => null,
  },
  {
    id: 'shuffle',
    re: /^shuffle(?: your library)?$/,
    build: () => [{ do: 'shuffle', who: { who: 'you' } }],
  },

  /* ---------------- life, damage, poison ---------------- */
  {
    id: 'gain-life',
    re: new RegExp(`^(?:(${P}) )?gains? (${N}) life$`),
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      const amount = parseCount(m[2]);
      if (!who || amount === null) return null;
      return [{ do: 'gain-life', who, amount }];
    },
  },
  {
    id: 'lose-life',
    re: new RegExp(`^(${P}) loses? (${N}) life$`),
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      const amount = parseCount(m[2]);
      if (!who || amount === null) return null;
      return [{ do: 'lose-life', who, amount }];
    },
  },
  {
    id: 'damage',
    re: new RegExp(`^(~|it) deals (${N}) damage to (.+)$`),
    note: 'Covers "~ deals 3 damage to any target" and every recipient shape.',
    build(m, ctx) {
      if (!selfSubject(m[1], ctx)) return null;
      const amount = parseCount(m[2]);
      if (amount === null) return null;
      const to = recipient(m[3], ctx);
      if (!to) return null;
      return [{ do: 'damage', to, amount }];
    },
  },
  {
    id: 'poison',
    re: new RegExp(`^(${P}) gets? (${N}) poison counters?$`),
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      const amount = parseCount(m[2]);
      if (!who || amount === null) return null;
      return [{ do: 'poison', who, amount }];
    },
  },
  {
    id: 'energy',
    re: /^you get ((?:\{e\})+)$/,
    build(m) {
      return [{ do: 'player-counter', who: { who: 'you' }, counter: 'energy', count: m[1].length / 3 }];
    },
  },
  {
    id: 'experience',
    re: new RegExp(`^you get (${N}) experience counters?$`),
    build(m) {
      const count = parseCount(m[1]);
      if (count === null) return null;
      return [{ do: 'player-counter', who: { who: 'you' }, counter: 'experience', count }];
    },
  },

  /* ---------------- removal ---------------- */
  {
    id: 'destroy',
    re: /^destroy (.+)$/,
    build(m, ctx) {
      const what = phraseSelector(m[1], ctx, 'Choose what to destroy');
      if (!what) return null;
      return [{ do: 'destroy', what }];
    },
  },
  {
    id: 'exile',
    re: /^exile (.+)$/,
    note: '"exile ... until ..." is temporary exile, a duration the DSL refuses; it fails the anchor and lands in manual.',
    build(m, ctx) {
      if (/ until | unless /.test(m[1])) return null;
      const what = phraseSelector(m[1], ctx, 'Choose what to exile');
      if (!what) return null;
      return [{ do: 'exile', what }];
    },
  },
  {
    id: 'counter-spell',
    re: /^counter target (.+)$/,
    note: 'Uses the PROPOSED {do:"counter"} member. "unless its controller pays" fails the anchor.',
    build(m, ctx) {
      const phrase = m[1].trim();
      if (phrase === 'spell') {
        return [{
          do: 'counter',
          what: { sel: 'target', ref: ctx.addTarget({ what: 'card', zone: 'stack', min: 1, max: 1, prompt: 'Choose target spell' }) },
        }];
      }
      const stripped = phrase.replace(/ spell$/, '');
      if (stripped === phrase) return null; // not a spell-shaped phrase
      const ref = parseObject(stripped);
      if (!ref) return null;
      const spec: Omit<TargetSpec, 'ref'> = { what: 'card', zone: 'stack', filter: ref.filter, min: 1, max: 1, prompt: 'Choose target spell' };
      if (ref.controller) spec.controller = ref.controller;
      return [{ do: 'counter', what: { sel: 'target', ref: ctx.addTarget(spec) } }];
    },
  },
  {
    id: 'sacrifice',
    re: new RegExp(`^(?:(${P}) )?sacrifices? (.+)$`),
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      if (!who) return null;
      const phrase = m[2].trim().replace(/[.,]+$/, '');
      if (phrase === '~') return [{ do: 'sacrifice', who, what: { sel: 'self' }, count: 1 }];
      const ref = parseObject(phrase);
      if (!ref || ref.targeted) return null; // you cannot target something you sacrifice
      return [{ do: 'sacrifice', who, what: objectSelector(ref), count: ref.count }];
    },
  },

  /* ---------------- zones ---------------- */
  {
    id: 'bounce',
    re: /^return (.+) to (?:its|their) owners hand$/,
    build(m, ctx) {
      const what = phraseSelector(m[1], ctx, 'Choose what to return');
      if (!what) return null;
      return [{ do: 'move-zone', what, to: 'hand' }];
    },
  },
  {
    id: 'recursion',
    re: /^return (.+) from your graveyard to (your hand|the battlefield)$/,
    build(m, ctx) {
      const phrase = m[1].trim();
      const ref = parseObject(phrase);
      if (!ref) return null;
      const to = m[2] === 'your hand' ? 'hand' : 'battlefield';
      if (ref.targeted) {
        const spec: Omit<TargetSpec, 'ref'> = {
          what: 'card', zone: 'graveyard', filter: ref.filter, min: ref.upTo ? 0 : 1, max: 1,
          controller: { who: 'you' }, prompt: 'Choose a card in your graveyard',
        };
        return [{ do: 'return-from', zone: 'graveyard', who: { who: 'you' }, what: { sel: 'target', ref: ctx.addTarget(spec) }, count: 1, to }];
      }
      return [{ do: 'return-from', zone: 'graveyard', who: { who: 'you' }, what: objectSelector({ ...ref, zone: 'graveyard' }), count: ref.count, to }];
    },
  },
  {
    id: 'return-self-from-graveyard',
    re: /^return ~ from your graveyard to (your hand|the battlefield)$/,
    build(m) {
      return [{
        do: 'return-from', zone: 'graveyard', who: { who: 'you' }, what: { sel: 'self' }, count: 1,
        to: m[1] === 'your hand' ? 'hand' : 'battlefield',
      }];
    },
  },
  {
    id: 'search-library',
    re: new RegExp(
      '^search your library for (.+?),' +
      '(?: reveal (?:it|them|that card|those cards),)?' +
      '(?: and)?(?: then)? put (?:it|them|that card|those cards) (onto the battlefield|into your hand|into your graveyard)( tapped)?,' +
      '(?: then| and) shuffle$',
    ),
    note: 'A dropped "reveal" is information-only, so the rule accepts it and marks the ability approximate.',
    build(m, ctx) {
      const ref = parseObject(m[1]);
      if (!ref || ref.targeted) return null;
      if (/ reveal /.test(m[0])) ctx.approximate = true;
      const to = m[2] === 'onto the battlefield' ? 'battlefield' : m[2] === 'into your hand' ? 'hand' : 'graveyard';
      const e: Effect = {
        do: 'search-library', who: { who: 'you' },
        what: objectSelector({ ...ref, zone: 'library' }),
        count: ref.count, to, thenShuffle: true,
      };
      if (m[3]) (e as { tapped?: boolean }).tapped = true;
      return [e];
    },
  },

  /* ---------------- permanents ---------------- */
  {
    id: 'create-token-predefined',
    re: new RegExp(`^(?:(${P}) )?creates? (${N}) ([a-z]+) tokens?$`),
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      const count = parseCount(m[2]);
      const token = PREDEFINED_TOKENS[m[3]];
      if (!who || count === null || !token) return null;
      return [{ do: 'create-token', who, token, count }];
    },
  },
  {
    id: 'create-token',
    re: new RegExp(
      `^(?:(${P}) )?creates? (${N}) ((?:\\d+|x)/(?:\\d+|x)) ([a-z ]+?) tokens?` +
      '(?: with ([a-z, ]+))?$',
    ),
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      const count = parseCount(m[2]);
      if (!who || count === null) return null;
      const [power, toughness] = m[3].split('/');
      const keywords = m[5] ? parseKeywordList(m[5]) : null;
      if (m[5] && !keywords) return null; // "with flying" yes, "with haste that attacks" no
      const token = buildToken(power, toughness, m[4], keywords);
      if (!token) return null;
      return [{ do: 'create-token', who, token, count }];
    },
  },
  {
    id: 'add-counters',
    re: new RegExp(`^put (${N}) (\\+\\d+/\\+\\d+|-\\d+/-\\d+|[a-z]+) counters? on (.+)$`),
    build(m, ctx) {
      const count = parseCount(m[1]);
      if (count === null) return null;
      const what = phraseSelector(m[3], ctx, 'Choose where to put counters');
      if (!what) return null;
      return [{ do: 'add-counters', what, counter: m[2], count }];
    },
  },
  {
    id: 'remove-counters',
    re: new RegExp(`^remove (${N}) (\\+\\d+/\\+\\d+|-\\d+/-\\d+|[a-z]+) counters? from (.+)$`),
    build(m, ctx) {
      const count = parseCount(m[1]);
      if (count === null) return null;
      const what = phraseSelector(m[3], ctx, 'Choose where to remove counters');
      if (!what) return null;
      return [{ do: 'remove-counters', what, counter: m[2], count }];
    },
  },
  {
    id: 'pump-and-gain',
    re: /^(.+?) gets? ([+-]\d+)\/([+-]\d+) and gains? ([a-z, ]+?) until end of turn$/,
    build(m, ctx) {
      const what = phraseSelector(m[1], ctx, 'Choose a creature');
      const grant = parseKeywordList(m[4]);
      if (!what || !grant) return null;
      return [{ do: 'pump', what, power: Number(m[2]), toughness: Number(m[3]), grant, duration: 'end-of-turn' }];
    },
  },
  {
    id: 'pump',
    re: /^(.+?) gets? ([+-]\d+)\/([+-]\d+) until end of turn$/,
    build(m, ctx) {
      const what = phraseSelector(m[1], ctx, 'Choose a creature');
      if (!what) return null;
      return [{ do: 'pump', what, power: Number(m[2]), toughness: Number(m[3]), duration: 'end-of-turn' }];
    },
  },
  {
    id: 'grant-keyword',
    re: /^(.+?) gains? ([a-z, ]+?) until end of turn$/,
    build(m, ctx) {
      const what = phraseSelector(m[1], ctx, 'Choose a creature');
      const grant = parseKeywordList(m[2]);
      if (!what || !grant) return null;
      return [{ do: 'pump', what, power: 0, toughness: 0, grant, duration: 'end-of-turn' }];
    },
  },
  {
    id: 'tap-untap',
    re: /^(tap|untap) (.+)$/,
    build(m, ctx) {
      const what = phraseSelector(m[2], ctx, m[1] === 'tap' ? 'Choose what to tap' : 'Choose what to untap');
      if (!what) return null;
      return [{ do: m[1] as 'tap' | 'untap', what }];
    },
  },
  {
    id: 'gain-control',
    re: /^gain control of (.+?)(?: (until end of turn))?$/,
    build(m, ctx) {
      const what = phraseSelector(m[1], ctx, 'Choose what to gain control of');
      if (!what) return null;
      return [{ do: 'gain-control', what, who: { who: 'you' }, duration: m[2] ? 'end-of-turn' : 'permanent' }];
    },
  },

  /* ---------------- mana ---------------- */
  {
    id: 'add-mana',
    re: /^add ((?:\{[wubrgcs0-9x]\})+)$/,
    build(m) {
      return [{ do: 'add-mana', who: { who: 'you' }, mana: m[1].toUpperCase() }];
    },
  },
  {
    id: 'add-mana-choice',
    re: /^add (\{[wubrgc]\})(?:, (\{[wubrgc]\}))?,? or (\{[wubrgc]\})$/,
    note: 'A dual land\'s "add {R} or {G}" is a player CHOICE, and {do:"choose-mode"} is exactly the DSL member for one — no new vocabulary needed, and the decision lands in the action log as an ANSWER_CHOICE like every other decision.',
    build(m) {
      const symbols = [m[1], m[2], m[3]].filter(Boolean).map((s) => s.toUpperCase());
      return [{
        do: 'choose-mode', min: 1, max: 1,
        modes: symbols.map((s) => ({ text: `Add ${s}`, effects: [{ do: 'add-mana', who: { who: 'you' }, mana: s } as Effect] })),
      }];
    },
  },
  {
    id: 'add-mana-any-color',
    re: /^add (one|two|three) mana of any (?:one )?color$/,
    note: 'Every signet, every Sol-Ring-alike, every "any color" land. Five enumerated modes, which is what "any color" means.',
    build(m) {
      const n = m[1] === 'one' ? 1 : m[1] === 'two' ? 2 : 3;
      const colors = ['{W}', '{U}', '{B}', '{R}', '{G}'];
      return [{
        do: 'choose-mode', min: 1, max: 1,
        modes: colors.map((c) => {
          const mana = c.repeat(n);
          return { text: `Add ${mana}`, effects: [{ do: 'add-mana', who: { who: 'you' }, mana } as Effect] };
        }),
      }];
    },
  },

  /* ---------------- table state ---------------- */
  {
    id: 'monarch',
    re: /^you become the monarch$/,
    build: () => [{ do: 'set-monarch', who: { who: 'you' } }],
  },
  {
    id: 'win-game',
    re: /^you win the game$/,
    build: () => [{ do: 'win-game', who: { who: 'you' } }],
  },
  {
    id: 'lose-game',
    re: new RegExp(`^(${P}) loses? the game$`),
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      return who ? [{ do: 'lose-game', who }] : null;
    },
  },
];

/* ------------------------------------------------------------------ *
 * Effects the vocabulary has no member for, named so they are counted
 * rather than absorbed. Each becomes a `{do:'manual'}` with a hint, and
 * `coverage.ts` histograms the hints — which is how "what should the
 * vocabulary grow next" becomes a number instead of an opinion.
 * ------------------------------------------------------------------ */

export const NAMED_MANUAL_EFFECTS: Array<{ id: string; re: RegExp; hint: string }> = [
  { id: 'scry', re: new RegExp(`^scry ${N}$`), hint: 'scry: no library-ordering effect in the vocabulary' },
  { id: 'surveil', re: new RegExp(`^surveil ${N}$`), hint: 'surveil: no library-ordering effect in the vocabulary' },
  { id: 'explore', re: /^it explores$|^~ explores$/, hint: 'explore: compound reveal + branch, not modelled' },
  { id: 'investigate', re: /^investigate$/, hint: 'investigate: Clue token plus its own ability' },
  { id: 'proliferate', re: /^proliferate$/, hint: 'proliferate: needs a player-directed multi-permanent choice' },
  { id: 'mana-combination', re: /^add (two|three|four|five) mana in any combination of colors$/, hint: 'mana in any combination: N independent colour choices, not one' },
  { id: 'regenerate', re: /^regenerate (.+)$/, hint: 'regenerate: a replacement shield the DSL has no result for' },
  { id: 'reveal', re: /^reveal (.+)$/, hint: 'reveal: no reveal effect in the vocabulary' },
  { id: 'look-at-top', re: /^look at the top (.+)$/, hint: 'library peeking: no look/reorder effect in the vocabulary' },
  { id: 'counter-unless-pay', re: /^counter target (.+) unless (.+)$/, hint: 'counter-unless-pay: an opponent-facing optional cost' },
];

/** `null` if the phrase is not a named-but-unmodelled effect. */
export function namedManual(phrase: string): Effect | null {
  for (const { re, hint } of NAMED_MANUAL_EFFECTS) {
    if (re.test(phrase)) return manual(phrase, hint);
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * The phrase compiler
 * ------------------------------------------------------------------ */

/** Connectives worth splitting on, longest first so ", then" beats ", ". */
const CONNECTIVES = [', then ', ' then ', ', and then ', ', and ', ' and ', ', '];

/**
 * One effect phrase -> `Effect[]`, or `null` to refuse.
 *
 * Two passes. First the rule table, which handles a whole phrase. Then a split
 * on connectives — but a split is accepted ONLY when BOTH halves compile. That
 * requirement is what makes splitting safe: "you gain 2 life and draw a card"
 * splits because both halves are effects, while "destroy target creature and
 * put a +1/+1 counter on each creature its controller controls" does not,
 * because the right half refuses, so the whole phrase goes to manual instead of
 * half-resolving.
 */
export function compileEffectPhrase(phrase: string, ctx: BuildCtx, depth = 0): Effect[] | null {
  const p = phrase.trim().replace(/^,\s*/, '').replace(/[.]+$/, '').trim();
  if (!p) return null;

  for (const rule of EFFECT_RULES) {
    const m = p.match(rule.re);
    if (!m) continue;
    const built = rule.build(m, ctx);
    if (built) return built;
    // A rule that matched and declined does not stop the search: another rule
    // may read the same phrase, and splitting may still succeed.
  }

  // "you may <effect>" — an optional effect, only if the inner half compiles.
  const may = p.match(/^you may (.+)$/);
  if (may && depth < 4) {
    const inner = compileEffectPhrase(may[1], ctx, depth + 1);
    if (inner) return [{ do: 'may', who: { who: 'you' }, text: p, effects: inner }];
  }

  if (depth >= 4) return null;

  for (const connective of CONNECTIVES) {
    let from = 0;
    for (;;) {
      const at = p.indexOf(connective, from);
      if (at < 0) break;
      from = at + 1;
      const left = compileEffectPhrase(p.slice(0, at), ctx, depth + 1);
      if (!left) continue;
      const right = compileEffectPhrase(p.slice(at + connective.length), ctx, depth + 1);
      if (!right) continue;
      return [...left, ...right];
    }
  }

  return null;
}

/**
 * A whole effect body -> `Effect[]`, with every unreadable sentence preserved as
 * a `{do:'manual'}` marker rather than dropped. This is the load-bearing
 * honesty mechanism: the ability still runs the clauses we read, and the stack
 * item carries `needsManual` so the marker is visible BEFORE it resolves.
 */
export function compileEffectBody(body: string, ctx: BuildCtx): Effect[] {
  const cleaned = body.trim().replace(/[.]+$/, '');
  if (!cleaned) return [];

  const whole = compileEffectPhrase(cleaned, ctx);
  if (whole) return whole;

  const out: Effect[] = [];
  for (const sentence of cleaned.split(/\.\s+/)) {
    const s = sentence.trim().replace(/[.]+$/, '');
    if (!s) continue;
    const compiled = compileEffectPhrase(s, ctx);
    if (compiled) { out.push(...compiled); continue; }
    out.push(namedManual(s) ?? manual(s));
  }
  return out;
}
