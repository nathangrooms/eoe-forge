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
 * Explore, investigate and proliferate are common and absent from the DSL's
 * effect vocabulary. They come out as `{do:'manual'}` with a hint rather than
 * being approximated, and `coverage.ts` counts them, so "what should the
 * vocabulary grow next" is a number rather than an opinion.
 *
 * Scry and surveil USED to be on that list and are not any more. They had a DSL
 * member, a validator entry and a renderer case, and nothing produced either,
 * so the hint saying the vocabulary had no member for them had been false for
 * as long as the member existed. Measured before the fix: `Scry 2.` compiled to
 * nothing at all, not even a counted manual, so no number said it was missing.
 */

import type {
  Cost,
  Effect,
  ManaColourSource,
  ManaSpendRestriction,
  PlayerSelector,
  Selector,
  TargetSpec,
  TokenSpec,
  ValueExpr,
} from './dsl.ts';
import { manual } from './dsl.ts';
import {
  CHOICE_SUBJECT_WORDS,
  NUM,
  PLAYER,
  objectSelector,
  parseChoiceSubject,
  parseCount,
  parseForEachValue,
  parseKeywordList,
  parseManaSpendRestriction,
  parseObject,
  parsePlayer,
  parseValueExpr,
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
   * T3. The front face's printed P/T boxes, verbatim (`5`, `*`, `1+*`, `''`).
   *
   * One rule reads them: the single-characteristic CDA in `clause-rules.ts`.
   * Strings, so `*` can make that rule refuse — see
   * `NormalizedOracle.printedPower`.
   */
  printedPower?: string;
  printedToughness?: string;
  /**
   * Set by any rule that resolved something by inference rather than by
   * reading it — an "it" bound to the source, a "reveal" dropped as
   * information-only. The ability it belongs to is published as
   * `confidence: 'approximate'`, which the runtime logs on resolution.
   */
  approximate: boolean;
  /**
   * E9. What "X" means in THIS phrase, bound from a trailing ", where X is …"
   * clause. Absent, an `x` in a count position stays `{v:'x'}` — the number the
   * player announced when casting — which is a different thing entirely, and
   * conflating the two would make Dockside Extortionist create however many
   * Treasures the caster typed in.
   */
  xValue?: ValueExpr;
  /**
   * E8. A restriction peeled off the end of a mana ability's body ("Spend this
   * mana only to cast artifact spells"), waiting to be attached to the
   * `add-mana` effects in the same body.
   */
  manaRestriction?: ManaSpendRestriction;
  /**
   * Set the moment `manaRestriction` lands on an `add-mana`. If a body carries
   * a restriction and this never becomes true, the restriction was DROPPED, and
   * the caller refuses the whole body rather than shipping unrestricted mana.
   */
  manaRestrictionUsed?: boolean;
  /**
   * T2. What a bare "it" in object position is allowed to mean in this ability,
   * or absent when nothing may claim it.
   *
   * "Whenever this creature attacks, it gets +2/+0 until end of turn" says
   * nothing the compiler cannot already read except the pronoun, and the pool
   * has 44 cards blocked on exactly that and nothing else. The danger is the
   * OTHER "it": "When this creature enters, tap target creature. It doesn't
   * untap during its controller's next untap step" — bind that one to the
   * source and the wrong permanent stays tapped, which is a wrong ability
   * rather than a missing one, and this folder treats those as worse.
   *
   * So the binding is never assumed. The compiler offers it, and only for a
   * trigger whose event subject is the source itself; `compileEffectBody`
   * withdraws it again the moment the sentence names some other object before
   * the pronoun. See `itMayBind`.
   */
  itBinding?: Selector;
  /**
   * How many targets this ability has announced so far. A bare "it" after an
   * announced target is that target far more often than it is the source, so
   * the binding refuses once this is above zero.
   */
  targetsSoFar?: number;
  /**
   * Who the FIRST half of a split sentence was about, while the second half is
   * being read, and undefined at every other moment.
   *
   * "Target player draws two cards and loses 2 life" gives its second half no
   * subject because the first half already supplied one. Set and restored around
   * that one read, so the carry cannot leak into the next sentence.
   */
  subjectFallback?: PlayerSelector;
}

/**
 * Nouns that steal an "it".
 *
 * If any of these appears in the effect body BEFORE the first bare "it", the
 * pronoun is referring to that noun and not to the source. Deliberately a list
 * of NOUNS and not of verbs: "put a +1/+1 counter on it" has a verb and a
 * counter in front of the pronoun and still means the source, while "reveal it"
 * has a card in front of it and does not.
 */
const IT_REFERENT_NOUNS = /\b(target|card|cards|token|tokens|creature|creatures|permanent|permanents|artifact|artifacts|enchantment|enchantments|land|lands|player|players|opponent|opponents|spell|spells|copy)\b/;

/**
 * May a bare "it" in this effect body mean the source?
 *
 * Only when nothing else in the body claimed the pronoun first. The check runs
 * on the whole body rather than the sentence, which is the conservative
 * direction: a noun in sentence one withdraws the binding from sentence two as
 * well, so the compiler gives up a card it might have read rather than risk
 * reading one wrongly.
 */
export function itMayBind(body: string): boolean {
  const at = body.search(/\bit\b/);
  if (at < 0) return true;
  return !IT_REFERENT_NOUNS.test(body.slice(0, at));
}

export interface EffectRule {
  id: string;
  re: RegExp;
  /**
   * `depth` is the recursion depth `compileEffectPhrase` is at. A rule that
   * compiles a sub-phrase (an opponent-facing cost wrapping an effect) must
   * pass `depth + 1` down, so the recursion bound stays one bound rather than
   * one per rule that forgot about it.
   */
  build(m: RegExpMatchArray, ctx: BuildCtx, depth: number): Effect[] | null;
  note?: string;
}

/* ------------------------------------------------------------------ *
 * Shared resolvers
 * ------------------------------------------------------------------ */

/**
 * A bare "it" -> whatever the compiler said it may mean, or `null` to refuse.
 *
 * Three gates, all of which must pass. The compiler must have offered a binding
 * at all (it does that only for a trigger on the source itself), the body must
 * not have named another object first (`itMayBind`, applied by
 * `compileEffectBody`), and this ability must not have announced a target,
 * because an announced target is the likelier referent. Reading the pronoun is
 * inference rather than reading, so the ability is published `approximate` and
 * says so in the log when it resolves.
 */
function boundIt(ctx: BuildCtx): Selector | null {
  if (!ctx.itBinding) return null;
  if ((ctx.targetsSoFar ?? 0) > 0) return null;
  ctx.approximate = true;
  return ctx.itBinding;
}

/** An object phrase in effect position -> a `Selector`, or `null` to refuse. */
export function phraseSelector(phrase: string, ctx: BuildCtx, prompt: string): Selector | null {
  const p = phrase.trim().replace(/[.,]+$/, '');
  if (!p) return null;
  if (p === '~' || p === 'itself') return { sel: 'self' };
  if (p === 'it') return boundIt(ctx);
  // Auras and Equipment refer to their host, never by name.
  if (/^(enchanted|equipped) /.test(p)) return { sel: 'attached' };
  const ref = parseObject(p);
  if (!ref) return null;
  if (ref.targeted) {
    // `TargetSpec.min`/`max` are numbers, so "up to X target creatures" has no
    // faithful spelling. `registerTarget` used to round a computed count down to
    // 1, which announces one target for a card that named several — an
    // under-resolution that looks like a resolution.
    if (typeof ref.count !== 'number') return null;
    return registerTarget(ref, ctx.addTarget, prompt);
  }
  // "Up to five lands" is a NUMBER THE PLAYER PICKS, anywhere from zero to five,
  // and `objectSelector` can only say "every match". Peregrine Drake's "untap up
  // to five lands" therefore compiled to "untap all lands" — every land on the
  // table, the opponents' included — and because nothing was left unparsed the
  // card was reported as fully covered. That is the wrong-ability failure this
  // file exists to prevent, and it is worse than a gap because no marker says it
  // happened. A targeted "up to" is fine and is handled above: `TargetSpec` has
  // `min` and `max` and `registerTarget` writes `min: 0`.
  if (ref.upTo) return null;
  // An untargeted phrase naming a BOUNDED quantity — "a creature you control",
  // "another creature", "two lands you control" — is a choice its controller
  // makes on resolution, and the `Selector` union cannot say "one of these,
  // chosen later": `objectSelector` only ever produces `{sel:'all'}`, which
  // means EVERY match. Building it anyway compiles "return a land you control
  // to its owner's hand" into "return all your lands" — a wrong effect wearing
  // the clothes of a modelled one, and now that the trigger runtime resolves
  // compiled abilities for real, one the engine would actually perform.
  //
  // So refuse, exactly as this file refuses anything it cannot read: the caller
  // turns the `null` into `{do:'manual'}`, coverage stops being 'full', and
  // `abilityEngineOwns` leaves the card with the old detector, which asks for
  // it by hand. Only `each`/`all`/plural phrases genuinely mean every match.
  if (!ref.each) return null;
  return objectSelector(ref);
}

/**
 * A player phrase, defaulting to the ability's controller when omitted.
 *
 * `ctx.subjectFallback` beats the controller when it is set, which happens only
 * while the second half of "A does X and does Y" is being read. See the
 * ellipsis note in `compileEffectPhrase`.
 */
function playerOr(phrase: string | undefined, ctx: BuildCtx, fallback: PlayerSelector = { who: 'you' }): PlayerSelector | null {
  if (!phrase) return ctx.subjectFallback ?? fallback;
  return parsePlayer(phrase, (spec) => ctx.addTarget(spec));
}

/**
 * Who the first half of a split sentence was about, if it was about anybody.
 *
 * The RESOLVED selector, not the words. That distinction is the whole point:
 * re-reading the text "target player" would call `ctx.addTarget` a second time
 * and Sign in Blood would ask the caster to choose a target twice, once to draw
 * and once to lose the life, off a card that has one target.
 */
function subjectOf(effects: readonly Effect[]): PlayerSelector | null {
  for (const e of effects) {
    const who = (e as { who?: PlayerSelector }).who;
    if (who) return who;
  }
  return null;
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

/* ------------------------------------------------------------------ *
 * E9 — amounts
 * ------------------------------------------------------------------ */

/**
 * A count word in an effect rule, with `x` rebound when the phrase said what X
 * is.
 *
 * Every rule in the table below reads its amount through this rather than
 * through `parseCount` directly. That is the whole of E9's front end at the
 * rule level: one function, called everywhere a number used to be read, so
 * "where X is the number of …" works on every rule at once instead of on the
 * handful somebody remembered to update.
 */
function countOf(word: string, ctx: BuildCtx): ValueExpr | null {
  const parsed = parseCount(word);
  if (parsed === null) return null;
  if (typeof parsed !== 'number' && parsed.v === 'x' && ctx.xValue !== undefined) return ctx.xValue;
  return parsed;
}

/** `base × factor`, without the `{v:'mul', of:[1, …]}` noise for the common base of 1. */
function scaleValue(base: ValueExpr, factor: ValueExpr): ValueExpr {
  if (base === 1) return factor;
  if (base === 0) return 0;
  return { v: 'mul', of: [base, factor] };
}

/**
 * One effect, with its single quantity multiplied — how " for each …" is read.
 *
 * `null` for every effect whose quantity is not a single scalar, and that is
 * the guard, not a limitation: "destroy target creature for each artifact you
 * control" has no number to scale, so the phrase is refused and reported rather
 * than compiled into something that destroys one creature and looks fine.
 *
 * `set-life` is excluded deliberately. "Your life total becomes 3 for each …"
 * is not a card, and scaling a SET rather than a DELTA is the kind of quiet
 * arithmetic error that only shows up mid-game.
 */
function scaleEffect(effect: Effect, factor: ValueExpr): Effect | null {
  switch (effect.do) {
    case 'gain-life':
    case 'lose-life':
    case 'poison':
      return { ...effect, amount: scaleValue(effect.amount, factor) };
    case 'damage':
      return { ...effect, amount: scaleValue(effect.amount, factor) };
    case 'draw':
    case 'mill':
      return { ...effect, count: scaleValue(effect.count, factor) };
    case 'discard':
      return { ...effect, count: scaleValue(effect.count, factor) };
    case 'create-token':
      return { ...effect, count: scaleValue(effect.count, factor) };
    case 'add-counters':
    case 'remove-counters':
      return { ...effect, count: scaleValue(effect.count, factor) };
    case 'player-counter':
      return { ...effect, count: scaleValue(effect.count, factor) };
    case 'add-mana':
      return { ...effect, count: scaleValue(effect.count ?? 1, factor) };
    case 'pump': {
      // "+1/+0 for each …" scales the side that has a number and leaves the
      // other at zero, which is what the card says.
      const scaled: Effect = {
        ...effect,
        power: effect.power === 0 ? 0 : scaleValue(effect.power, factor),
        toughness: effect.toughness === 0 ? 0 : scaleValue(effect.toughness, factor),
      };
      return scaled;
    }
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * E8 — attaching a spend restriction
 * ------------------------------------------------------------------ */

/**
 * One `add-mana`, carrying whatever spend restriction the body declared.
 *
 * Every rule that produces mana goes through this, and it is the only place
 * `manaRestrictionUsed` is set — so "the restriction reached the mana" is a
 * fact the code records rather than one a reader has to verify by eye.
 */
function restrictedMana(effect: Extract<Effect, { do: 'add-mana' }>, ctx: BuildCtx): Effect {
  if (!ctx.manaRestriction) return effect;
  ctx.manaRestrictionUsed = true;
  return { ...effect, restriction: ctx.manaRestriction };
}

/**
 * `"~"` or `"it"` in subject position.
 *
 * T2. `"it"` used to bind to the source unconditionally here, and that was
 * wrong on real cards: Traitor's Roar reads "Tap target untapped creature. It
 * deals damage equal to its power to its controller", where "it" is the
 * creature that was just tapped. Bound to the source, the card dealt the
 * WRONG creature's power to the WRONG player and reported itself understood.
 * Both pronouns now go through the same gate.
 */
function selfSubject(word: string, ctx: BuildCtx): Selector | null {
  const w = word.trim();
  if (w === '~') return { sel: 'self' };
  if (w === 'it') return boundIt(ctx);
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
  // `TokenSpec.power` is a STRING, printed on the token, and there is no member
  // of it that can hold a `ValueExpr`. So an X/X token is not something this
  // vocabulary can express, and emitting one puts the literal text "x" where a
  // number belongs: `powerOf` reads it as 0, state-based actions bin the token
  // on the spot, and the card looks like it resolved.
  //
  // "Create an X/X green Spirit creature token, where X is the number of lands
  // you control" is therefore refused outright. E9 binds the X — the token's
  // COUNT could use it — but the token's own printed power cannot, and being
  // able to read half a sentence is not permission to compile it.
  if (!/^\d+$/.test(power) || !/^\d+$/.test(toughness)) return null;

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
    /* Wizards' own type-line notation, so the dash is card data and stays.
       Written as two whole type lines rather than one with the dash spliced in
       mid-expression, so it still reads as a type line to anything checking. */
    typeLine: subWords.length
      ? `Token ${typeWords.join(' ')} — ${subWords.join(' ')}`
      : `Token ${typeWords.join(' ')}`,
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
      const count = countOf(m[2], ctx);
      if (!who || count === null) return null;
      return [{ do: 'draw', who, count }];
    },
  },
  /*
   * Scry and surveil had a DSL member, a validator entry and a line in
   * `render.ts`, and NOTHING PRODUCED EITHER. `NAMED_MANUAL_EFFECTS` still
   * carried them with the hint "no library-ordering effect in the vocabulary",
   * which stopped being true when `{do:'scry'}` was added and nobody came back.
   *
   * That is the unreachable-capability shape CLAUDE.md records from play mode,
   * happening inside the compiler: every part of the path existed except the
   * one that starts it. Measured before the fix, `Scry 2.` on its own compiled
   * to nothing at all, not even a counted manual, so it did not appear in the
   * coverage histogram either and there was no number saying it was missing.
   *
   * Scry is on Preordain, Serum Visions, Opt and several hundred more.
   */
  {
    id: 'choose-open-subject',
    re: new RegExp(
      `^(?:(${P}) )?choose (?:a |an )?(${CHOICE_SUBJECT_WORDS})(?: other than [a-z]+)?$`
    ),
    note:
      '"As this land enters, choose a creature type." Fifty cards choose a type ' +
      'and forty-one choose a colour, and all of them produced no record at all ' +
      'while `as ~ enters, choose` was classified as hidden-choice. An open ' +
      'choice written on the permanent is not hidden information.',
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      if (!who) return null;
      const what = parseChoiceSubject(m[2]);
      if (!what) return null;
      return [{ do: 'choose', who, what }];
    },
  },
  {
    id: 'scry',
    re: new RegExp(`^(?:(${P}) )?(?:scry|scries) (${N})$`),
    note: '"Scry 2" and "each player scries 1". The reminder text in brackets is stripped upstream.',
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      const count = countOf(m[2], ctx);
      if (!who || count === null) return null;
      return [{ do: 'scry', who, count }];
    },
  },
  {
    id: 'surveil',
    re: new RegExp(`^(?:(${P}) )?surveils? (${N})$`),
    note: 'Same shape as scry, and the same reason it was missing.',
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      const count = countOf(m[2], ctx);
      if (!who || count === null) return null;
      return [{ do: 'surveil', who, count }];
    },
  },
  {
    id: 'mill',
    re: new RegExp(`^(?:(${P}) )?mills? (${N}) cards?$`),
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      const count = countOf(m[2], ctx);
      if (!who || count === null) return null;
      return [{ do: 'mill', who, count }];
    },
  },
  {
    id: 'discard',
    re: new RegExp(`^(?:(${P}) )?discards? (${N}) cards?( at random)?$`),
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      const count = countOf(m[2], ctx);
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
      const amount = countOf(m[2], ctx);
      if (!who || amount === null) return null;
      return [{ do: 'gain-life', who, amount }];
    },
  },
  {
    id: 'lose-life',
    /* The player is optional here for the same reason it always was on
       `gain-life` directly above, which had it and this did not. The asymmetry
       was an oversight and it cost real cards: the second half of "You draw two
       cards and lose 2 life" could not be read, so Night's Whisper compiled to
       nothing at all. Who "lose" refers to is decided by `playerOr`, which
       prefers a subject carried over from the first half of the sentence. */
    re: new RegExp(`^(?:(${P}) )?loses? (${N}) life$`),
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      const amount = countOf(m[2], ctx);
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
      const amount = countOf(m[2], ctx);
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
      const amount = countOf(m[2], ctx);
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
    build(m, ctx) {
      const count = countOf(m[1], ctx);
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
    /*
     * "Exile all graveyards", "exile each opponent's graveyard".
     *
     * The rule below reads a phrase describing an OBJECT, and a graveyard is a
     * ZONE, so every piece of graveyard hate in the format fell through it:
     * Soul-Guide Lantern, Relic of Progenitus, Tormod's Crypt. They are common
     * cards and the generator has been putting them in graveyard decks, because
     * a card with no record cannot be scored as working AGAINST the plan any
     * more than it can be scored as working for it.
     *
     * WHO the exile hits is kept, and it is the whole value of reading these.
     * "Each opponent's graveyard" is asymmetric hate and belongs in a graveyard
     * deck perfectly happily; "all graveyards" empties yours too and is the
     * card that should never have been suggested. A rule that flattened the two
     * would be worse than no rule, because it would file Bojuka Bog as a
     * mistake.
     */
    id: 'exile-graveyard-zone',
    re: /^exile (all graveyards|each opponents graveyard|your graveyard)$/,
    build(m) {
      const who = m[1];
      const what: Selector =
        who === 'all graveyards'
          ? { sel: 'all', zone: 'graveyard', where: { is: 'any' } }
          : {
              sel: 'all',
              zone: 'graveyard',
              where: { is: 'any' },
              controller: who === 'your graveyard' ? { who: 'you' } : { who: 'each-opponent' },
            };
      return [{ do: 'exile', what }];
    },
  },
  {
    /*
     * BLINK. "Exile target creature you control, then return it to the
     * battlefield under its owner's control."
     *
     * IT MUST SIT ABOVE `exile`, because that rule anchors on `^exile (.+)$`
     * and would swallow the whole sentence, recording a blink spell as an exile
     * with a trailing clause it never read. Order in this list IS the
     * precedence, first match wins.
     *
     * 47 cards carried this clause completely unread, and they are the purest
     * blink cards in the format: Ephemerate, Cloudshift, Ghostly Flicker,
     * Eldrazi Displacer, Momentary Blink, Emiel the Blessed, Another Round.
     * The owner built a Syr Vondam blink deck and said "nothing in here is
     * really blink", and this clause is why: he is paid when his own creatures
     * are exiled, his plan correctly asked for it, and not one blink spell
     * carried a single facet to match against.
     *
     * THE DELAYED WORDING ALREADY WORKED, which is what made this hard to see.
     * "Exile target permanent you control. Return that card to the battlefield
     * at the beginning of the next end step" is two sentences and compiles
     * fine, so Flickerwisp, Eerie Interlude and Teferi's Time Twist were read
     * while Cloudshift was not. One mechanic, two wordings, one of them silent.
     *
     * TWO EFFECTS, NOT A NEW VERB. Exile with `from: 'battlefield'` and then
     * return from exile is exactly what the card does, and it means the facet
     * layer needs nothing new: the direction reader already turns a self-aimed
     * exile into `eff:exile-own`, which is in the `protection` role, and
     * blinking your own creature in response to removal IS protection. The
     * return contributes `eff:return-from` and `cares:zone:exile`.
     *
     * The return targets the SAME ref, which is right and not a shortcut: the
     * thing that comes back is the thing you chose.
     */
    id: 'blink',
    /*
     * WIDENED 1 Sep 2026, after measuring rather than reading.
     *
     * `scripts/probe/blink-read.mjs` compiles the cards our own tagger calls
     * blink. Of the sixty most played, the compiler read TWENTY-FIVE. The other
     * thirty-five are not exotic; they are four wordings this anchor refused:
     *
     *   you may exile ...          Restoration Angel (1375). An optional blink
     *                              is still a blink.
     *   ... transformed under      Urabrask, Sheoldred, and every Praetor whose
     *                              back face is reached by blinking itself.
     *   ... with a +1/+1 counter   Planar Incision (2259).
     *   ... under your control     Ghostly Flicker (585) — allowed already, but
     *                              only after the mods group learned to end.
     *
     * The mods group is a TAIL now rather than a closed list, because the tail
     * is decoration on a mechanic that has already happened: the card was
     * exiled and it came back, and whether it came back tapped, transformed or
     * carrying a counter does not change that. Bounded to 48 characters and
     * stopped at a full stop so it cannot swallow a following sentence, which
     * is the failure the `exile` rule below this one is guarded against.
     *
     * "Under an opponent's control" is still refused in `build`, because that
     * is a gift rather than a blink and the two are opposites.
     */
    re: new RegExp(
      `^(?:you may )?exile (.+?),? then return (?:it|that card|those cards|them)` +
        `(?: to the battlefield)?` +
        `(?<mods>(?: tapped| attacking| transformed` +
        `| under (?:its owners|their owners|your|an opponents) control` +
        `| with [^.]{1,48})*)$`
    ),
    note:
      'The immediate wording. The delayed one ("... at the beginning of the ' +
      'next end step") is two sentences and is read by the spell rules already.',
    build(m, ctx) {
      const what = phraseSelector(m[1], ctx, 'Choose what to blink');
      if (!what) return null;
      const mods = String(m.groups?.mods ?? '');
      /*
       * "Under an opponent's control" is NOT a blink, it is a gift. Sol'Kanar
       * returns itself to an opponent, and recording that as protection would
       * be exactly backwards. Refused rather than guessed.
       */
      if (/an opponents control/.test(mods)) return null;
      return [
        { do: 'exile', what, from: 'battlefield' },
        {
          do: 'return-from',
          zone: 'exile',
          who: { who: 'you' },
          what,
          count: 1,
          to: 'battlefield',
          ...(/ tapped/.test(mods) ? { tapped: true } : {}),
        },
      ];
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
      /* Read the phrase a second time for its ZONE alone. `phraseSelector`
         hands a targeted phrase to `registerTarget`, which puts the zone on the
         `TargetSpec`, so the effect's own selector cannot say where the card is
         being exiled from. See `from` on the DSL member. */
      const from = parseObject(m[1])?.zone;
      return [from ? { do: 'exile', what, from } : { do: 'exile', what }];
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
      if (ref.upTo) return null; // "up to two" is the player's number to pick, not ours
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
        // The count is the number of targets, and `TargetSpec` holds numbers.
        // "Return up to X target Zombie cards …, where X is the number of
        // opponents you have" cannot be spelled, and the old hardcoded `max: 1`
        // returned one card for a card that named several.
        if (typeof ref.count !== 'number') return null;
        const spec: Omit<TargetSpec, 'ref'> = {
          what: 'card', zone: 'graveyard', filter: ref.filter, min: ref.upTo ? 0 : ref.count, max: ref.count,
          controller: { who: 'you' }, prompt: 'Choose a card in your graveyard',
        };
        if (ref.count > 1) spec.distinct = true;
        return [{ do: 'return-from', zone: 'graveyard', who: { who: 'you' }, what: { sel: 'target', ref: ctx.addTarget(spec) }, count: ref.count, to }];
      }
      if (ref.upTo) return null; // an untargeted "up to" is a number the player picks
      return [{ do: 'return-from', zone: 'graveyard', who: { who: 'you' }, what: objectSelector({ ...ref, zone: 'graveyard' }), count: ref.count, to }];
    },
  },
  {
    /*
     * Reanimate is ranked 56 and had NO ability record at all, and so did every
     * card shaped like it. The rule above accepts exactly one sentence:
     * "return X from YOUR graveyard to the battlefield". Reanimation spells are
     * mostly not written that way.
     *
     *   Reanimate   put target creature card from A graveyard onto the
     *               battlefield under your control
     *   Persist     return ... to the battlefield WITH a -1/-1 counter on it
     *
     * Three differences and every one of them refused the whole card: the verb
     * is "put" rather than "return", the graveyard is anyone's, and the
     * preposition is "onto". None of the three changes what the card does for a
     * deck: it is a reanimation spell, it wants big creatures in the yard, and
     * `eff:return-from` plus `cares:zone:graveyard` is what says so.
     *
     * WHICH GRAVEYARD IS KEPT rather than flattened. "A graveyard" reaches an
     * opponent's, which is a different card in a game — Reanimate on the
     * creature somebody else just lost is most of why it is played — so the
     * target spec carries no controller when the card names none.
     *
     * The rule above is left exactly as it is and this one runs after it, so
     * the sentence it already reads keeps taking the path it has tests for.
     */
    id: 'recursion-any-graveyard',
    re: /^(?:return|put) (.+?) from (a|your) graveyard (?:on|in)?to (the battlefield|your hand)(?: under your control)?$/,
    build(m, ctx) {
      const which = m[2];
      const ref = parseObject(`${m[1].trim()} from ${which} graveyard`);
      if (!ref || ref.upTo) return null;
      const to = m[3] === 'your hand' ? 'hand' : 'battlefield';
      const mine = which === 'your';

      if (ref.targeted) {
        if (typeof ref.count !== 'number') return null;
        const spec: Omit<TargetSpec, 'ref'> = {
          what: 'card',
          zone: 'graveyard',
          filter: ref.filter,
          min: ref.count,
          max: ref.count,
          prompt: mine ? 'Choose a card in your graveyard' : 'Choose a card in any graveyard',
        };
        if (mine) spec.controller = { who: 'you' };
        if (ref.count > 1) spec.distinct = true;
        return [{
          do: 'return-from', zone: 'graveyard', who: { who: 'you' },
          what: { sel: 'target', ref: ctx.addTarget(spec) }, count: ref.count, to,
        }];
      }
      return [{
        do: 'return-from', zone: 'graveyard', who: { who: 'you' },
        what: objectSelector({ ...ref, zone: 'graveyard' }), count: ref.count, to,
      }];
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
      /*
       * "Search your library for up to three artifact cards" lets the searcher
       * stop at nought, one or two, and `count` alone cannot say that: a fixed
       * three would fetch three every time, which is how Disciples of Gix
       * milled three artifacts off a card that says it may fetch none.
       *
       * This used to `return null` for that reason, and it was right about the
       * number and wrong about the silence. Refusing the whole card left
       * Cultivate and Kodama's Reach, ranked 20 and 37 in Commander, with NO
       * ability record at all, which every consumer reads as "this card does
       * nothing" rather than "we did not read this clause".
       *
       * The flag is the same one `look-and-pick` already carries for the same
       * sentence, and P06 defers the choice to the player rather than picking
       * a number on their behalf.
       */
      if (ref.upTo) (e as { upTo?: boolean }).upTo = true;
      if (m[3]) (e as { tapped?: boolean }).tapped = true;
      return [e];
    },
  },

  {
    /*
     * The tutors that put the card on top instead of in your hand: Vampiric
     * (rank 12), Enlightened (123), Mystical (160), Worldly (166) and Sylvan.
     * All of them produced NO ability record, because `search-library` above
     * accepts three destinations and none of them is the library.
     *
     * This is EXACT, not an approximation. `MOVE_ZONE` already carries
     * `position`, so the runtime can put the card on top; and the shuffle is
     * ordered before the placement by `searchLibraryForced`, because the card
     * says "shuffle and put that card on top" and doing it the other way round
     * buries the card that was just found.
     *
     * The reveal is information-only and is marked approximate, the same way
     * the plain search rule marks it.
     */
    id: 'search-library-to-top',
    re: new RegExp(
      '^search your library for (.+?),' +
      '(?: reveal (?:it|them|that card|those cards),)?' +
      '(?: then| and)? shuffle,? (?:then |and )?put (?:it|that card|the card) on top(?: of your library)?$',
    ),
    note: 'A tutor that leaves the card on top of the library. Exact: MOVE_ZONE carries the position.',
    build(m, ctx) {
      const ref = parseObject(m[1]);
      if (!ref || ref.targeted || ref.upTo) return null;
      if (/ reveal /.test(m[0])) ctx.approximate = true;
      return [{
        do: 'search-library', who: { who: 'you' },
        what: objectSelector({ ...ref, zone: 'library' }),
        count: ref.count, to: 'library', thenShuffle: true, toPosition: 'top',
      }];
    },
  },
  {
    /*
     * Cultivate and Kodama's Reach, ranked 20 and 37 in Commander, and until
     * now both had NO ability record at all.
     *
     * "put one onto the battlefield tapped and the other into your hand" is
     * one search with TWO destinations, and `search-library` above carries a
     * single `to`. That is the whole reason the rule refused, and refusing
     * meant every consumer read the two commonest green ramp spells in the
     * format as doing nothing: not ramp for the deck builder, not a land
     * fetcher for a commander plan, nothing on resolution.
     *
     * TWO SEARCHES RATHER THAN ONE, which is the honest approximation. The
     * card searches once and splits the result; this searches twice for one
     * card each. Every destination gets the right number of the right cards
     * and the deck-building reading is exact. What it is not is the shuffle
     * count and the number of prompts, so the ability is marked approximate,
     * which is the flag that already exists for precisely this distance.
     *
     * Modelling it as one search of two to the battlefield would be worse
     * than refusing: it would put a land into play that the card puts in
     * hand, and a wrong resolution is a worse failure than a missing one.
     */
    id: 'search-library-split-destination',
    re: new RegExp(
      '^search your library for up to two (.+?) cards,' +
      '(?: reveal those cards,)?' +
      ' put one onto the battlefield( tapped)? and the other into your hand,' +
      '(?: then| and) shuffle$',
    ),
    note: 'One search with two destinations, modelled as two searches of one card. Approximate by construction.',
    build(m, ctx) {
      const ref = parseObject(`a ${m[1]} card`);
      if (!ref || ref.targeted) return null;
      ctx.approximate = true;
      const what = objectSelector({ ...ref, zone: 'library' });
      const onto: Effect = {
        do: 'search-library', who: { who: 'you' }, what, count: 1, to: 'battlefield', thenShuffle: true,
      };
      if (m[2]) (onto as { tapped?: boolean }).tapped = true;
      return [
        onto,
        { do: 'search-library', who: { who: 'you' }, what, count: 1, to: 'hand', thenShuffle: true },
      ];
    },
  },

  /* ---------------- permanents ---------------- */
  {
    id: 'create-token-predefined',
    re: new RegExp(`^(?:(${P}) )?creates? (${N}) ([a-z]+) tokens?$`),
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      const count = countOf(m[2], ctx);
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
      const count = countOf(m[2], ctx);
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
      const count = countOf(m[1], ctx);
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
      const count = countOf(m[1], ctx);
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

  /* ---------------- mana ----------------
   *
   * E8 lands here as one line per rule: `restrictedMana`. The restriction is
   * peeled off the body by `compileEffectBody` and parked on the context, and
   * every rule that produces mana asks for it. A rule that forgot to would ship
   * unrestricted mana, so `compileEffectBody` refuses any body whose restriction
   * nothing claimed. */
  {
    id: 'add-mana',
    re: /^add ((?:\{[wubrgcs0-9x]\})+)$/,
    build(m, ctx) {
      return [restrictedMana({ do: 'add-mana', who: { who: 'you' }, mana: m[1].toUpperCase() }, ctx)];
    },
  },
  {
    id: 'add-mana-choice',
    re: /^add (\{[wubrgc]\})(?:, (\{[wubrgc]\}))?,? or (\{[wubrgc]\})$/,
    note: 'A dual land\'s "add {R} or {G}" is a player CHOICE, and {do:"choose-mode"} is exactly the DSL member for one. No new vocabulary is needed, and the decision lands in the action log as an ANSWER_CHOICE like every other decision.',
    build(m, ctx) {
      const symbols = [m[1], m[2], m[3]].filter(Boolean).map((s) => s.toUpperCase());
      return [{
        do: 'choose-mode', min: 1, max: 1,
        modes: symbols.map((s) => ({
          text: `Add ${s}`,
          effects: [restrictedMana({ do: 'add-mana', who: { who: 'you' }, mana: s }, ctx)],
        })),
      }];
    },
  },
  /*
   * "One mana of any colour, from a source the card names."
   *
   * Command Tower and Arcane Signet are ranked 2 and 3 in Commander and neither
   * produced an ability record before this rule, because `add-mana-any-color`
   * below anchors on `$` and every one of these sentences carries a qualifier
   * after "color". Four sentences, six of the most played mana sources in the
   * format, and one `among` field that keeps the facet `eff:add-mana` so
   * everything reading Sol Ring reads these too.
   *
   * The five-way hybrid is a colour CHOICE, so P05 defers it. `among` is what
   * says which colours the choice is actually between, and it is on the record
   * rather than inferred, so a mono-red deck's Arcane Signet is never read as
   * making blue.
   */
  {
    id: 'add-mana-any-color-among',
    re: new RegExp(
      '^add (one|two|three) mana of any (?:color|type)' +
      /* No apostrophe: `normalize.ts` strips them, so the phrase that reaches
         here is "commanders color identity". Matching the printed form instead
         is why Command Tower and Arcane Signet, ranked 2 and 3, stayed blind
         through the first draft of this rule while the four cards without an
         apostrophe in them all worked. */
      ' (?:in your commanders color identity' +
      '|that a land an opponent controls could produce' +
      '|that a land you control could produce' +
      '|among legendary creatures and planeswalkers you control)$'
    ),
    note: 'Command Tower, Arcane Signet, Exotic Orchard, Fellwar Stone, Reflecting Pool, Mox Amber.',
    build(m, ctx) {
      const n = m[1] === 'one' ? 1 : m[1] === 'two' ? 2 : 3;
      const phrase = m[0];
      const among: ManaColourSource | null =
        phrase.includes("commanders color identity") ? 'commander-identity'
        : phrase.includes('a land an opponent controls') ? 'opponent-lands'
        : phrase.includes('a land you control') ? 'your-lands'
        : phrase.includes('legendary creatures and planeswalkers you control') ? 'your-legendary-permanents'
        : null;
      if (!among) return null;
      return [restrictedMana(
        { do: 'add-mana', who: { who: 'you' }, mana: '{W/U/B/R/G}'.repeat(n), among },
        ctx
      )];
    },
  },
  {
    id: 'add-mana-any-color',
    re: /^add (one|two|three) mana of any (?:one )?color$/,
    note: 'Every signet, every Sol-Ring-alike, every "any color" land. Five enumerated modes, which is what "any color" means.',
    build(m, ctx) {
      const n = m[1] === 'one' ? 1 : m[1] === 'two' ? 2 : 3;
      const colors = ['{W}', '{U}', '{B}', '{R}', '{G}'];
      return [{
        do: 'choose-mode', min: 1, max: 1,
        modes: colors.map((c) => {
          const mana = c.repeat(n);
          return { text: `Add ${mana}`, effects: [restrictedMana({ do: 'add-mana', who: { who: 'you' }, mana }, ctx)] };
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

  /* ---------------- E9: amounts written as a phrase ----------------
   *
   * "Draw cards equal to the number of …" is the shape that cannot go through
   * `countOf`, because there is no count WORD to read — the quantity IS the
   * phrase. These rules are appended rather than folded into the ones above so
   * that a card the compiler already handled takes exactly the same path it did
   * before, and a coverage delta is a card that was gained rather than a card
   * that quietly changed shape. */
  {
    id: 'draw-equal-to',
    re: new RegExp(`^(?:(${P}) )?draws? cards equal to (.+)$`),
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      const count = parseValueExpr(m[2]);
      if (!who || count === null) return null;
      return [{ do: 'draw', who, count }];
    },
  },
  {
    id: 'gain-life-equal-to',
    re: new RegExp(`^(?:(${P}) )?gains? life equal to (.+)$`),
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      const amount = parseValueExpr(m[2]);
      if (!who || amount === null) return null;
      return [{ do: 'gain-life', who, amount }];
    },
  },
  {
    id: 'lose-life-equal-to',
    re: new RegExp(`^(${P}) loses? life equal to (.+)$`),
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      const amount = parseValueExpr(m[2]);
      if (!who || amount === null) return null;
      return [{ do: 'lose-life', who, amount }];
    },
  },
  {
    id: 'damage-equal-to',
    re: /^(~|it) deals damage equal to (.+?) to (.+)$/,
    build(m, ctx) {
      if (!selfSubject(m[1], ctx)) return null;
      const amount = parseValueExpr(m[2]);
      if (amount === null) return null;
      const to = recipient(m[3], ctx);
      if (!to) return null;
      return [{ do: 'damage', to, amount }];
    },
  },
  {
    id: 'pump-x',
    re: /^(.+?) gets? \+x\/\+x until end of turn$/,
    note: 'Only reachable once a ", where X is …" clause has bound X; unbound, `{v:"x"}` would be the announced X of a spell that never announced one.',
    build(m, ctx) {
      if (ctx.xValue === undefined) return null;
      const what = phraseSelector(m[1], ctx, 'Choose a creature');
      if (!what) return null;
      return [{ do: 'pump', what, power: ctx.xValue, toughness: ctx.xValue, duration: 'end-of-turn' }];
    },
  },

  /* ---------------- E4: an opponent-facing optional cost ----------------
   *
   * Both spellings of one rule. The player being offered the cost is the one
   * the trigger was about, and `{who:'trigger-player'}` is the only selector
   * that says so — `{who:'each-opponent'}` would tax the whole table for one
   * opponent's draw. */
  {
    id: 'unless-that-player-pays',
    re: /^(.+?) unless that player pays ((?:\{[^}]+\})+)$/,
    note: 'Rhystic Study. The "you may" stays INSIDE, because the opponent decides first and the controller decides second.',
    build(m, ctx, depth) {
      const inner = compileEffectPhrase(m[1], ctx, depth + 1);
      if (!inner) return null;
      return [{
        do: 'unless-pays',
        who: { who: 'trigger-player' },
        cost: [{ pay: 'mana', cost: m[2].toUpperCase() } as Cost],
        effects: inner,
      }];
    },
  },
  {
    id: 'that-player-may-pay',
    re: /^that player may pay ((?:\{[^}]+\})+)\. if (?:the|that) player doesnt, (.+)$/,
    note: 'Smothering Tithe. Same rule as above, written the other way round by the card.',
    build(m, ctx, depth) {
      const inner = compileEffectPhrase(m[2], ctx, depth + 1);
      if (!inner) return null;
      return [{
        do: 'unless-pays',
        who: { who: 'trigger-player' },
        cost: [{ pay: 'mana', cost: m[1].toUpperCase() } as Cost],
        effects: inner,
      }];
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
    const built = rule.build(m, ctx, depth);
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

  /* E9 — ", where X is <value>".
   *
   * Bound BEFORE the phrase is re-read, and restored after, so X means one
   * thing inside this phrase and nothing outside it. A ctx field that stayed
   * set would leak the binding into the next sentence of the same ability,
   * which is how "create X Treasures" and "draw X cards" end up agreeing when
   * the card never said they should. */
  const whereX = p.match(/^(.+?),? where x is (.+)$/);
  if (whereX && ctx.xValue === undefined) {
    const bound = parseValueExpr(whereX[2]);
    if (bound !== null) {
      ctx.xValue = bound;
      const inner = compileEffectPhrase(whereX[1], ctx, depth + 1);
      ctx.xValue = undefined;
      if (inner) return inner;
    }
  }

  /* E9 — "<effect> for each <thing>".
   *
   * Accepted only when the left half compiles to EXACTLY ONE effect that has
   * exactly one quantity to scale. Two effects would leave the scope of "for
   * each" ambiguous — "you gain 1 life and draw a card for each creature" does
   * not say which half repeats — and an effect with no quantity has nothing to
   * multiply, so both are refused rather than resolved with a guess. */
  const forEach = p.match(/^(.+?) for each (.+)$/);
  if (forEach) {
    const factor = parseForEachValue(forEach[2]);
    if (factor !== null) {
      const inner = compileEffectPhrase(forEach[1], ctx, depth + 1);
      if (inner && inner.length === 1) {
        const scaled = scaleEffect(inner[0], factor);
        if (scaled) return [scaled];
      }
    }
  }

  for (const connective of CONNECTIVES) {
    let from = 0;
    for (;;) {
      const at = p.indexOf(connective, from);
      if (at < 0) break;
      from = at + 1;
      const leftText = p.slice(0, at);
      const rightText = p.slice(at + connective.length);
      const left = compileEffectPhrase(leftText, ctx, depth + 1);
      if (!left) continue;

      /*
       * The second half is read with the FIRST half's subject in scope, not
       * after failing without it.
       *
       * Reading it without the subject first and only retrying on failure looks
       * more conservative and is worse, measured on Sign in Blood: "loses 2
       * life" reads perfectly well on its own, so the retry never happened and
       * the card compiled to the TARGET player drawing and YOU losing the life.
       * A wrong ability, off a card ranked 232 in Commander, which is exactly
       * what this file treats as worse than a missing one.
       *
       * `subjectOf` returns the resolved selector rather than the words, so the
       * one "target player" is announced once. Restored straight after, so the
       * carry cannot leak into the next sentence.
       */
      const carried = subjectOf(left);
      const savedSubject = ctx.subjectFallback;
      if (carried) ctx.subjectFallback = carried;
      let right: Effect[] | null;
      try {
        right = compileEffectPhrase(rightText, ctx, depth + 1);
      } finally {
        ctx.subjectFallback = savedSubject;
      }

      /*
       * ENGLISH ELLIPSIS. The second half of "Target player draws two cards and
       * loses 2 life" has no subject because the first half already gave it one,
       * and Magic templates that way constantly.
       *
       * Both halves read perfectly well on their own WITH a subject and the
       * split still failed, which is how Night's Whisper (rank 182) and Sign in
       * Blood (232) had no ability record at all:
       *
       *   "You lose 2 life."   READ
       *   "Lose 2 life."       BLIND
       *
       * The obvious repair, letting the life rules default to "you" the way
       * `draw` does, is WRONG and the second card is why: Sign in Blood would
       * compile to the target player drawing and YOU losing the life. That is a
       * wrong ability rather than a missing one, and this folder treats those as
       * worse.
       *
       * So the subject is carried over from the left half rather than assumed,
       * and only when the right half could not be read alone. The right half
       * keeps its own verb, so "target player" meets "loses" and "you" meets
       * "lose" without either being rewritten.
       */

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

  /* T2 — withdraw the "it" binding when this body names something else first.
   *
   * Saved and restored rather than cleared, because a modal bullet and a nested
   * "you may …" both come back through here on the same context, and a body that
   * stole the pronoun must not steal it from its siblings too. */
  if (ctx.itBinding && !itMayBind(cleaned)) {
    const saved = ctx.itBinding;
    ctx.itBinding = undefined;
    try {
      return compileEffectBody(cleaned, ctx);
    } finally {
      ctx.itBinding = saved;
    }
  }

  /* E8 — peel "Spend this mana only to …" off the end.
   *
   * It is a property of the mana the rest of the body produced, not a separate
   * effect, and left in the sentence list it becomes a `{do:'manual'}` note —
   * a note a player reads AFTER spending the mana on something the card said
   * they could not. So it comes off first, rides on the context, and every
   * `add-mana` rule attaches it.
   *
   * If nothing attached it, the body was not a mana ability after all (or was
   * one we misread), and the ORIGINAL text is recompiled with no restriction
   * set, so the clause lands in `manual` exactly as it did before. Never
   * "restriction dropped, mana kept". */
  const restrictionAt = cleaned.search(/(^|\. )spend this mana only /);
  if (restrictionAt >= 0 && !ctx.manaRestriction) {
    const head = cleaned.slice(0, restrictionAt).replace(/[.\s]+$/, '');
    const tail = cleaned.slice(restrictionAt).replace(/^\.\s*/, '');
    const restriction = parseManaSpendRestriction(tail);
    // The head must actually produce mana. Without this the discarded attempt
    // below could have registered targets on the shared build context, leaving
    // an ability carrying `TargetSpec`s nothing points at.
    if (restriction && head && /(^|\. )add /.test(head)) {
      ctx.manaRestriction = restriction;
      ctx.manaRestrictionUsed = false;
      const attempt = compileEffectBody(head, ctx);
      const used = ctx.manaRestrictionUsed as boolean;
      ctx.manaRestriction = undefined;
      ctx.manaRestrictionUsed = undefined;
      if (used) return attempt;
      // Fall through and compile the whole thing unrestricted-but-honest: the
      // restriction sentence stays in the body and becomes a visible note.
    }
  }

  const whole = compileEffectPhrase(cleaned, ctx);
  if (whole) return whole;

  const out: Effect[] = [];
  for (const sentence of cleaned.split(/\.\s+/)) {
    const s = sentence.trim().replace(/[.]+$/, '');
    if (!s) continue;

    /* T2 — "If you do, <effect>" belongs INSIDE the "you may" before it.
     *
     * "You may discard a card. If you do, draw a card" arrives here as two
     * sentences. The first compiles to `{do:'may'}` and the second used to
     * become a `{do:'manual'}` marker sitting beside it, which made the whole
     * card SILENT: coverage stopped being 'full', so nothing ran and the player
     * was never offered the choice at all.
     *
     * Folded in, the option carries its consequence. `to-actions.ts` prints a
     * `may` as "<player> may: <text>" and never takes it automatically, so the
     * player is offered the whole trade rather than half of it, and the card
     * lands in PROMPTABLE instead of SILENT. It is NOT counted as automated,
     * and must not be: the decision is still the player's and no prompt for it
     * exists yet.
     *
     * Only ever attaches to a `may` that is the immediately preceding effect.
     * "If you do" after anything else names a cost or an event this compiler
     * has not read, and guessing which one would be inventing the antecedent. */
    const ifYouDo = s.match(/^if you do,? (.+)$/);
    const prior = out[out.length - 1];
    if (ifYouDo && prior && prior.do === 'may') {
      const consequence = compileEffectPhrase(ifYouDo[1], ctx);
      if (consequence) {
        out[out.length - 1] = {
          ...prior,
          text: `${prior.text}. ${s}`,
          effects: [...prior.effects, ...consequence],
        };
        continue;
      }
    }

    const compiled = compileEffectPhrase(s, ctx);
    if (compiled) { out.push(...compiled); continue; }
    out.push(namedManual(s) ?? manual(s));
  }
  return out;
}
