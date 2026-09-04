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
  CardDestination,
  CardFilter,
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
import { manual, PROTECTION_FROM_CHOSEN_COLOR } from './dsl.ts';
import type { GrantList } from './grammar.ts';
import {
  CHOICE_SUBJECT_WORDS,
  NUM,
  PLAYER,
  objectSelector,
  parseChoiceSubject,
  parseCount,
  parseForEachValue,
  parseGrantList,
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
  /**
   * True once a sentence of THIS ability compiled to a revealed draw, so that
   * a later "that card's mana value" has a card to mean. Set by
   * `compileEffectBody` from the effects it actually kept, never by a rule
   * from a match it may have discarded, and read by `valueOf`.
   *
   * Without the antecedent the phrase is refused. "You lose life equal to its
   * mana value" on a card that revealed nothing is a pronoun with no referent,
   * and binding it anyway is exactly the confident wrong number the value
   * grammar was written to avoid.
   */
  revealedCard?: boolean;
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

/**
 * What a dig takes out of the cards it looked at, or `null` to refuse.
 *
 * "one of them", "up to two of them", "a non-Human creature card from among
 * them", "any number of Rat cards from among them". The trailing "of them" /
 * "from among them" has already been cut off by the rule; what arrives is the
 * quantity and, when the card names one, the filter.
 *
 * A bare count carries no filter, so `what` is absent: any of the looked cards
 * may be taken, which is what `look-and-pick` says when the field is missing.
 * "Any number" is `pick = look` with `upTo`, the spelling the XMage lowering
 * already uses for `Integer.MAX_VALUE`, so the two producers agree on the shape.
 */
function parseDigPick(
  phrase: string,
  look: ValueExpr,
): { pick: ValueExpr; upTo: boolean; what?: CardFilter } | null {
  const s = phrase.trim();
  const bare = s.match(new RegExp(`^(up to )?(${NUM})$`));
  if (bare) {
    const n = parseCount(bare[2]);
    if (n === null) return null;
    return { pick: n, upTo: Boolean(bare[1]) };
  }
  if (s === 'any number') return { pick: look, upTo: true };

  const ref = parseObject(s);
  if (!ref || ref.targeted) return null;
  // The cards are the ones just looked at. A phrase naming a zone or a
  // controller ("a creature card in your graveyard") is not describing them.
  if (ref.zone || ref.controller) return null;
  const anyNumber = /^any number of /.test(s);
  const out: { pick: ValueExpr; upTo: boolean; what?: CardFilter } = {
    pick: anyNumber ? look : ref.count,
    upTo: anyNumber || ref.upTo,
  };
  if (ref.filter.is !== 'any') out.what = ref.filter;
  return out;
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
 * Who receives the mana a "tapped for mana" trigger adds.
 *
 * Three subjects and they name three different players. Bare "add" is the
 * controller. "That player adds" is Mana Flare: the player whose tap fired the
 * trigger, which is exactly what `trigger-player` means and why it exists.
 * "Its controller adds" is Wild Growth: the controller of the permanent that
 * was tapped, which is the trigger subject.
 *
 * The third reading is refused once a target has been announced, for the same
 * reason a bare "it" is: after "tap target land", "its controller" is the
 * target's controller, and pointing it at the trigger subject would pay the
 * wrong player. `targetsSoFar` is the check the pronoun rule already uses.
 */
function manaRecipient(subject: string | undefined, ctx: BuildCtx): PlayerSelector | null {
  if (!subject) return playerOr(undefined, ctx);
  if (subject === 'that player') return { who: 'trigger-player' };
  if ((ctx.targetsSoFar ?? 0) > 0) return null;
  return { who: 'controller-of', of: { sel: 'trigger-subject' } };
}

/**
 * A pump that grants what `parseGrantList` read, with the colour choice it
 * owes put IN FRONT of it.
 *
 * "Gains protection from the color of your choice" is two things happening in
 * order: the player picks a colour, then the creature has protection from it.
 * The pump alone cannot say the first half, and saying only the second half
 * with a colour filled in is the wrong-ability failure this file exists to
 * prevent. `{do:'choose', what:'color'}` is the member the DSL already has for
 * an open choice, and "of your choice" names the chooser: you.
 *
 * "The chosen color" (Brave the Elements, Glory) sets no `choosesColor`, so
 * no second choice is emitted; the "Choose a color." sentence before it
 * compiles to the `choose` on its own.
 */
function granting(list: GrantList, pump: Effect): Effect[] {
  if (!list.choosesColor) return [pump];
  return [{ do: 'choose', who: { who: 'you' }, what: 'color' }, pump];
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

/**
 * Whose library "exile the top card of X library" reads from, for the impulse
 * rule. `null` refuses.
 *
 * "That player" is accepted only while no target has been announced, the
 * same gate `boundIt` applies to a bare "it": inside Ragavan's combat-damage
 * trigger it is the damaged player and `{who:'trigger-player'}` is the only
 * selector that says so, but after "target player ..." in the same ability it
 * would be that target, and binding it to the trigger would read the card
 * wrong rather than not at all.
 */
function libraryOwner(phrase: string, ctx: BuildCtx): PlayerSelector | null {
  switch (phrase) {
    case 'your': return { who: 'you' };
    case 'that players':
      if ((ctx.targetsSoFar ?? 0) > 0) return null;
      return { who: 'trigger-player' };
    case 'target opponents': return parsePlayer('target opponent', (spec) => ctx.addTarget(spec));
    case 'target players': return parsePlayer('target player', (spec) => ctx.addTarget(spec));
    default: return null;
  }
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

/**
 * "That card's mana value", "its mana value", "the card's mana value" — the
 * spellings a card uses for the card it just revealed. Apostrophes are gone by
 * the time a phrase gets here (`normalize.ts` strips them), so "cards" is the
 * possessive.
 */
const REVEALED_MANA_VALUE = /^(?:that cards|its|the cards|the revealed cards) mana value$/;

/**
 * An amount phrase -> a `ValueExpr`, with what THIS ability has bound in scope.
 *
 * `parseValueExpr` is deliberately context-free and refuses every phrase whose
 * subject an earlier sentence bound, because it cannot know what "that card"
 * was. This ability can: once a sentence of it compiled to a revealed draw, the
 * next sentence's "that card" is that card and nothing else, and the value is
 * `{v:'mana-value', of:{sel:'revealed'}}`. Every other bound phrase is still
 * refused, so "its power" on a card that revealed nothing stays a marker.
 */
function valueOf(phrase: string, ctx: BuildCtx): ValueExpr | null {
  const parsed = parseValueExpr(phrase);
  if (parsed !== null) return parsed;
  const s = phrase.trim().toLowerCase().replace(/[.,]+$/, '');
  if (ctx.revealedCard && REVEALED_MANA_VALUE.test(s)) return { v: 'mana-value', of: { sel: 'revealed' } };
  return null;
}

/** True when any effect in the tree, however nested, is a revealed draw. */
export function revealsACard(effects: readonly Effect[]): boolean {
  return effects.some((e) => {
    if (e.do === 'draw' && e.revealed) return true;
    if (e.do === 'if' || e.do === 'do-if-cost-paid') return revealsACard(e.then) || (e.else ? revealsACard(e.else) : false);
    if (e.do === 'for-each' || e.do === 'repeat' || e.do === 'may' || e.do === 'unless-pays') return revealsACard(e.effects);
    if (e.do === 'choose-mode') return e.modes.some((m) => revealsACard(m.effects));
    return false;
  });
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
      // "Discards their hand for each …" is not a card, and a whole hand has no
      // number to multiply. Refused rather than multiplied by a literal.
      if (effect.count === 'hand') return null;
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
  {
    /*
     * "Reveal the top card of your library and put that card into your hand."
     *
     * Dark Confidant, Yuriko, Ad Nauseam, Dark Tutelage, Pain Seer, Ruin Raider,
     * Sorin's +1 and Twilight Prophet all open with this sentence and follow it
     * with a life total computed from the card. Before this rule the sentence
     * fell to `NAMED_MANUAL_EFFECTS` with the hint "no reveal effect in the
     * vocabulary", the next sentence had no card to mean, and Yuriko, the
     * payoff of an entire archetype, read as a Ninja trigger that did nothing.
     *
     * A `draw` carrying `revealed: true`, for the reason on the DSL member: it
     * moves the top card to the hand exactly as a draw does and every consumer
     * that understands a draw understands this. What the flag keeps is that it
     * is NOT a draw under CR 121.1, and what it binds is `{sel:'revealed'}`
     * for the sentence after it.
     *
     * "Your library" only, on purpose. "Each player reveals the top card of
     * their library" is a different card doing a different thing to everyone,
     * and the one-card, one-player shape is the one measured here.
     *
     * Approximate, the same way `search-library` marks a dropped reveal: the
     * runtime moves the card without showing it and fires it as a `DRAW`.
     */
    id: 'reveal-top-to-hand',
    re: /^(?:you )?reveal the top card of your library(?:,| and)?(?: then)? put (?:it|that card|the card) into your hand$/,
    note: 'A revealed draw. The sentence after it may read "that card\'s mana value".',
    build(_m, ctx) {
      ctx.approximate = true;
      return [{ do: 'draw', who: { who: 'you' }, count: 1, revealed: true }];
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
    /*
     * THE WHEEL. "Each player discards their hand, then draws seven cards" is
     * Wheel of Fortune (rank 569), Reforge the Soul, Magus of the Wheel, Wheel
     * of Fate, Dragon Mage and Runehorn Hellkite, and every one of them produced
     * no record at all: this rule used to refuse, on the grounds that the DSL
     * had no way to bind "the size of THAT player's hand" inside a loop over
     * players. That was true and the refusal was still the wrong answer,
     * because `{v:'cards-in'}` sums over the players it resolves to and the
     * only alternative was silence, which every consumer reads as "does
     * nothing".
     *
     * `count: 'hand'` is the honest spelling: all of it, counted per player by
     * whatever runs the effect. The three printed forms are one rule because
     * they are one effect — "discards their hand", "discards all the cards in
     * their hand" (Dark Deal, Collective Defiance, Incendiary Command) and
     * "discard your hand" as an effect rather than a cost.
     *
     * The subject is optional for the same reason it is on `draw`: the second
     * half of "target player draws three cards, then discards their hand"
     * has none, and `playerOr` carries the first half's over.
     */
    id: 'discard-hand',
    re: new RegExp(
      `^(?:(${P}) )?discards? (?:(?:their|his or her|your) hand|all (?:the )?cards (?:in|from) (?:their|his or her|your) hand)$`,
    ),
    note: '"each player discards their hand", "discards all the cards in their hand". The count is the hand, per player.',
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      if (!who) return null;
      return [{ do: 'discard', who, count: 'hand' }];
    },
  },
  {
    /*
     * THE OTHER HALF OF WINDFALL, said out loud rather than swallowed.
     *
     * "…then draws cards equal to the greatest number of cards a player
     * discarded this way" (Windfall, rank 157; Jace's Archivist; Whispering
     * Madness) and "…then draws that many cards" (Dark Deal, Collective
     * Defiance, Incendiary Command) both name a PER-PLAYER quantity from a
     * moment that has passed: how many cards this player, or the player who
     * discarded most, just put in the graveyard. `ValueExpr` has no per-player
     * binding and no maximum over players, and inventing the number with
     * `{v:'cards-in'}` after the hands are already empty would draw zero.
     *
     * So this is the first rule in the table whose product is a `manual`
     * marker. It exists because the connective split above accepts a sentence
     * ONLY when both halves compile, and without it the discard half — which
     * IS read — was thrown away with the draw half, leaving the whole card
     * blind. A marker keeps coverage at `partial`, keeps `needsManual` on the
     * stack item, and lets the facet reader see a wheel that empties every
     * hand. It is deliberately narrow: two exact wordings, not "draws (.+)".
     */
    id: 'draw-that-many',
    re: /^draws? (?:cards equal to the greatest number of cards a player discarded this way|that many cards(?: (?:plus|minus) one)?)$/,
    note: 'Windfall and Dark Deal. A per-player count from the discard that just happened, which the value vocabulary cannot name.',
    build(m) {
      return [manual(m[0], 'draw-that-many: how many cards each player (or the player who discarded most) just discarded is a per-player quantity the value vocabulary cannot express')];
    },
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
     * IMPULSE DRAW. "Exile the top card of your library. Until end of turn,
     * you may play that card."
     *
     * TWO SENTENCES READ AS ONE EFFECT, which no other rule in this table
     * does, and the reason is in the `{do:'impulse'}` note in `dsl.ts`: the
     * exile half alone is Mystic Forge, a card that throws the top card away,
     * and the permission half alone has nothing to permit. Neither sentence
     * may compile without the other, so the regex carries the full stop and
     * `compileEffectBody` joins the two sentences back together before it
     * asks, guarded by `IMPULSE_EXILE_TAIL` and `IMPULSE_GRANT` so no other
     * pair of sentences is ever glued.
     *
     * 107 commander-legal cards say it in one of exactly two orders: the
     * window first ("Until the end of your next turn, you may play those
     * cards", Light Up the Stage, Reckless Impulse, Prosper) or last ("You
     * may play that card this turn", Laelia, Faldorn, Act on Impulse). Both
     * are read. A permission with NO window is refused on purpose: Chandra,
     * Torch of Defiance's "You may cast that card" is a cast during
     * resolution, and the ruling on her says so.
     *
     * "Until your next end step" (Haste Magic, Inti, Opera Love Song) is the
     * declared `duration` gap and stays refused here for the same reason
     * `parseDuration` refuses it: it ends at the beginning of the end step,
     * not at cleanup, and an instant is castable in the gap between.
     *
     * IT MUST SIT ABOVE `exile`, like the blink rule below it, because that
     * rule anchors on `^exile (.+)$`. It cannot actually misread this shape
     * today, since `parseObject` refuses "the top card of your library", but
     * a rule that is correct only because another rule happens to refuse is
     * one that stops being correct the day that refusal is relaxed.
     */
    id: 'impulse',
    re: new RegExp(
      `^exile the top (card|(${N}) cards) of (your|that players|target opponents|target players) library\\. ` +
      `(?:until (end of turn|the end of your next turn), you may (play|cast) (?:that card|those cards|them|it)` +
      `|you may (play|cast) (?:that card|those cards|them|it) this turn)$`,
    ),
    note: 'Exile from the top of a library plus a windowed permission to play the exiled cards. Refuses free casts, mana-as-any-colour riders, "choose one of them" and "for as long as it remains exiled".',
    build(m, ctx) {
      const count = m[2] ? countOf(m[2], ctx) : 1;
      if (count === null) return null;
      const who = libraryOwner(m[3], ctx);
      if (!who) return null;
      const until = m[4] === 'the end of your next turn' ? 'end-of-your-next-turn' : 'end-of-turn';
      const permission = (m[5] ?? m[6]) === 'cast' ? 'cast' : 'play';
      return [{ do: 'impulse', who, count, until, permission }];
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
    note: 'Uses the PROPOSED {do:"counter"} member. "unless its controller pays" fails the anchor here and is read by the unless-pays rule, which wraps this one.',
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
    /*
     * "Put a land card from your hand onto the battlefield."
     *
     * 151 cards say it and every one of them was refused whole, because the
     * object is an untargeted, bounded choice — exactly what `phraseSelector`
     * declines, since `{sel:'all'}` means EVERY match. But `return-from` was
     * built for precisely this shape: "return a creature card from your
     * graveyard to your hand" is the same sentence with a different zone, and
     * the runtime's `returnFromForced` already treats a pool larger than
     * `count` as a decision to defer. Reading from the hand is the same verb
     * with `zone: 'hand'`; nothing new is needed on the play side.
     *
     * Most of the 151 are the compound "draw a card, then you may put a land
     * card from your hand onto the battlefield": Chulane, Teller of Tales,
     * Uro, Growth Spiral, Spelunking, Pendant of Prosperity. The split on
     * ", then " and the "you may" wrapper both existed; the whole compound
     * landed in `manual` only because this half had no rule.
     *
     * Two readings are refused on purpose and the reason is the same for both:
     * `count` is a fixed number and the card's is not. "Put any number of
     * creature cards" (Ghalta, Stampede Tyrant) and "up to two creature cards"
     * (Tooth and Nail) are the player's number, and a fixed 1 would resolve
     * them as one card — the wrong ability rather than the missing one.
     *
     * "Tapped and attacking" (Kaalia, Ilharg, Preeminent Captain) fails the
     * anchor and stays in manual: the runtime cannot put a creature onto the
     * battlefield attacking, and recording the move without the attack would
     * resolve Kaalia's whole reason for existing as a tapped creature that
     * does nothing this combat.
     *
     * The facet layer reads this as `eff:extra-land-drop` when the card names
     * a land and `eff:put-onto-battlefield` otherwise — NOT `eff:return-from`,
     * which is in the `draw` role and means recursion. See the note on
     * `readEffect` in `src/lib/deck/recommend/behaviour.ts`.
     */
    id: 'put-from-hand-onto-battlefield',
    re: /^put (.+?) from your hand onto the battlefield( tapped)?$/,
    note: 'Sakura-Tribe Scout, Elvish Piper, and the second half of every "draw a card, then you may put a land card" trigger.',
    build(m) {
      const ref = parseObject(`${m[1].trim()} from your hand`);
      if (!ref) return null;
      // A card in your hand is hidden information and cannot be targeted.
      if (ref.targeted) return null;
      // "Up to N" and "any number of" are the player's number to pick.
      if (ref.upTo || ref.each) return null;
      const e: Extract<Effect, { do: 'return-from' }> = {
        do: 'return-from', zone: 'hand', who: { who: 'you' },
        what: objectSelector({ ...ref, zone: 'hand' }), count: ref.count, to: 'battlefield',
      };
      if (m[2]) e.tapped = true;
      return [e];
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
  {
    /*
     * THE DIG. Look at the top few cards, take what the card names, and put
     * the rest somewhere. Three sentences on the card and ONE effect here,
     * because the DSL member for it (`look-and-pick`) carries all three
     * quantities and both destinations, and was written for exactly this
     * sentence — and then nothing produced it. Every `look-and-pick` in the
     * catalogue came from the XMage port; the oracle-text compiler classified
     * "look at the top" as a named manual and read none of them.
     *
     * Kinnan, Bonder Prodigy (rank 1,360) is the card that made this a rule:
     * "Look at the top five cards of your library. You may put a non-Human
     * creature card from among them onto the battlefield. Put the rest on the
     * bottom of your library in a random order." Collected Company, Impulse,
     * Dig Through Time and Ureni of the Unwritten are the same three sentences
     * with different numbers and filters. The rule matches the WHOLE body,
     * which is how `compileEffectBody` offers it first, so a card whose dig is
     * preceded by another sentence (Professor Onyx's "you lose 1 life") is
     * still refused: splitting the body by sentence would leave "put the rest
     * on the bottom" as an orphan with nothing to refer to.
     *
     * What it will not read, on purpose:
     *
     *   "if you don't, put a card from among them into your hand"  a branch
     *   "and the rest into your hand"                               two takes
     *   "reveal X from among them" with no "and put it"             not a take
     *   a fourth sentence after the rest is placed                  unread text
     *
     * "You may put" is `upTo`: the player may take fewer, down to none, which
     * is the field's stated meaning and the spelling the XMage lowering uses
     * for its `optional` flag. A "reveal" before the take is information-only
     * and marks the ability approximate, the way `search-library` already does.
     */
    id: 'dig',
    re: new RegExp(
      `^look at the top (${N}) cards? of your library\\. ` +
      `(you may )?(put|reveal) (.+?) (?:from among them|of them|of those cards)` +
      `( and put (?:it|them|that card|those cards|the revealed cards?))? ` +
      `(onto the battlefield|into your hand|into your graveyard)( tapped)?` +
      `(?:\\. (?:then )?put the rest|,? and (?:put )?the (?:rest|other)) ` +
      `(?:on the bottom of your library(?: in (a random|any) order)?|(into your graveyard))$`,
    ),
    note: 'A three-sentence dig read as one look-and-pick. A dropped "reveal" is information-only and marks the ability approximate.',
    build(m, ctx) {
      const look = parseCount(m[1]);
      if (look === null) return null;
      // "reveal X and put it" needs both halves; "put X" has neither. A reveal
      // with no take is not a dig, and a put with an "and put it" is not a
      // sentence.
      const revealed = m[3] === 'reveal';
      if (revealed !== Boolean(m[5])) return null;
      const picked = parseDigPick(m[4], look);
      if (!picked) return null;
      if (m[7] && m[6] !== 'onto the battlefield') return null; // "into your hand tapped"
      if (revealed) ctx.approximate = true;

      const pickedTo: CardDestination =
        m[6] === 'onto the battlefield' ? { zone: 'battlefield' }
          : m[6] === 'into your hand' ? { zone: 'hand' }
            : { zone: 'graveyard' };
      if (m[7]) pickedTo.tapped = true;
      const restTo: CardDestination = m[9]
        ? { zone: 'graveyard' }
        : { zone: 'library', position: 'bottom' };
      if (m[8]) restTo.order = m[8] === 'any' ? 'any' : 'random';

      const e: Effect = {
        do: 'look-and-pick', who: { who: 'you' },
        look, pick: picked.pick, upTo: picked.upTo || Boolean(m[2]),
        pickedTo, restTo,
      };
      if (picked.what) (e as { what?: CardFilter }).what = picked.what;
      return [e];
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
    /*
     * "CREATE THIRTEEN TAPPED 2/2 BLACK ZOMBIE CREATURE TOKENS" refused, because
     * the count had to sit immediately against the power and toughness.
     *
     * `tapped` is a field the DSL has always carried on `create-token`, so
     * reading it is exact rather than an approximation. Army of the Damned
     * (rank 1,800) produced no token facet at all for want of one word.
     *
     * "tapped AND ATTACKING" is deliberately still refused: there is no
     * `attacking` field, so emitting the tapped half alone would publish a
     * token that arrives tapped and does not attack - a card that reads as done
     * and plays wrong, which the shockland note in this repo argues is worse
     * than leaving it manual.
     */
    id: 'create-token',
    re: new RegExp(
      `^(?:(${P}) )?creates? (${N}) (tapped )?((?:\\d+|x)/(?:\\d+|x)) ([a-z ]+?) tokens?` +
      '(?: with ([a-z, ]+))?$',
    ),
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      const count = countOf(m[2], ctx);
      if (!who || count === null) return null;
      const [power, toughness] = m[4].split('/');
      const keywords = m[6] ? parseKeywordList(m[6]) : null;
      if (m[6] && !keywords) return null; // "with flying" yes, "with haste that attacks" no
      const token = buildToken(power, toughness, m[5], keywords);
      if (!token) return null;
      return [{ do: 'create-token', who, token, count, ...(m[3] ? { tapped: true } : {}) }];
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
      const grant = parseGrantList(m[4]);
      if (!what || !grant) return null;
      return granting(grant, { do: 'pump', what, power: Number(m[2]), toughness: Number(m[3]), grant: grant.grant, duration: 'end-of-turn' });
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
  /*
   * "Protection from artifacts or from the color of your choice" — Giver of
   * Runes (rank 1387), Apostle's Blessing, Angelic Intervention, Razor Barrier.
   *
   * The "or" is a player DECISION on resolution (CR 608.2c), and the DSL has
   * exactly one member for a decision between printed options, the same one
   * the dual lands use for "Add {R} or {G}". One mode grants the printed
   * quality verbatim; the other is the colour-choice shape below, choose and
   * then grant. The target is registered ONCE, above both modes, because the
   * card announces one target and both modes act on it.
   *
   * "From artifacts" and "from colorless" are admitted HERE and not in
   * `parseGrantList`, because here they are one half of a choice the record
   * spells out mode by mode, and a reader sees the two options side by side.
   * The runtime files both as a quality it does not classify and hands the
   * player the colour and the combat question alike, which is what it does
   * for every printed protection it cannot read; nothing is guessed.
   *
   * Sits before `grant-keyword` because that regex also matches this sentence
   * and would refuse it, and a refused build does fall through, but reading
   * the specific shape first is what the ordering of this table means.
   */
  {
    id: 'protection-of-choice-or',
    re: /^(.+?) gains? protection from (artifacts|colorless) or from the color of your choice until end of turn$/,
    build(m, ctx) {
      const what = phraseSelector(m[1], ctx, 'Choose a permanent');
      if (!what) return null;
      const pump = (grant: string[]): Effect => ({ do: 'pump', what, power: 0, toughness: 0, grant, duration: 'end-of-turn' });
      return [{
        do: 'choose-mode', min: 1, max: 1,
        modes: [
          { text: `Protection from ${m[2]}`, effects: [pump([`protection from ${m[2]}`])] },
          {
            text: 'Protection from the color of your choice',
            effects: granting({ grant: [PROTECTION_FROM_CHOSEN_COLOR], choosesColor: true }, pump([PROTECTION_FROM_CHOSEN_COLOR])),
          },
        ],
      }];
    },
  },
  {
    id: 'grant-keyword',
    re: /^(.+?) gains? ([a-z, ]+?) until end of turn$/,
    note:
      '"Target creature you control gains protection from the color of your choice ' +
      'until end of turn" is Mother of Runes, Gods Willing, Shelter and twenty-six ' +
      'more, and every one produced no record because the grant list wanted a bare ' +
      'keyword. The colour is not in the text and is never guessed: `granting` ' +
      'puts a colour CHOICE in front of the pump and the pump grants ' +
      '`PROTECTION_FROM_CHOSEN_COLOR`.',
    build(m, ctx) {
      const what = phraseSelector(m[1], ctx, 'Choose a creature');
      const grant = parseGrantList(m[2]);
      if (!what || !grant) return null;
      return granting(grant, { do: 'pump', what, power: 0, toughness: 0, grant: grant.grant, duration: 'end-of-turn' });
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
  /*
   * "ONE MANA OF ANY TYPE THAT PERMANENT PRODUCED."
   *
   * Kinnan, Bonder Prodigy, Zendikar Resurgent, Mirari's Wake, Vorinclex,
   * Voice of Hunger, and the four cards that say "that player adds one mana of
   * any type that land produced" (Mana Flare, Dictate of Karametra, Heartbeat
   * of Spring, Zhur-Taa Ancient). None produced an ability record before this,
   * because the colour is not a choice among five: it is whatever the tapped
   * permanent just made. That is an `among` source like the commander's
   * identity, so the record keeps `eff:add-mana` and everything that
   * understands Sol Ring understands Kinnan.
   *
   * SIX-WAY HYBRID, NOT FIVE. "Type" includes colourless, and the most played
   * partner of every card on this list is Sol Ring: the extra mana is {C}.
   * Reflecting Pool's rule above spells its "any type" as five colours, which
   * is a decision about that land; copying it here would take the colourless
   * off exactly the cards this rule exists for.
   */
  {
    id: 'add-mana-tapped-permanent',
    re: /^(?:(that player|its controller) adds|add) (?:an additional )?(one|two|three) (?:additional )?mana of any type that (?:permanent|land) produced$/,
    note: 'Kinnan, Bonder Prodigy; Zendikar Resurgent; Mana Flare, where "that player" is the one whose tap fired it.',
    build(m, ctx) {
      const who = manaRecipient(m[1], ctx);
      if (!who) return null;
      const n = m[2] === 'one' ? 1 : m[2] === 'two' ? 2 : 3;
      return [restrictedMana(
        { do: 'add-mana', who, mana: '{W/U/B/R/G/C}'.repeat(n), among: 'tapped-permanent' },
        ctx,
      )];
    },
  },
  /*
   * "ADD AN ADDITIONAL {G}."
   *
   * The wording of every mana aura and every "whenever you tap a Swamp"
   * creature: Wild Growth, Overgrowth, Crypt Ghast, Nirkana Revenant, Nissa,
   * Who Shakes the World. "Additional" is not a property of the mana, the
   * trigger IS the addition, so it compiles to the same `add-mana` a land's
   * own ability does. "Of the chosen color" and "in any combination of colors"
   * both fail these anchors and stay manual, which is right: the first is a
   * colour the card remembered and the second is a split the DSL cannot
   * spell, and reading either as any colour would be inventing a choice.
   */
  {
    id: 'add-mana-additional',
    re: /^(?:(that player|its controller) adds|add) an additional ((?:\{[wubrgc]\})+)$/,
    note: 'Wild Growth ("its controller adds"), Crypt Ghast, Nissa, Who Shakes the World.',
    build(m, ctx) {
      const who = manaRecipient(m[1], ctx);
      if (!who) return null;
      return [restrictedMana({ do: 'add-mana', who, mana: m[2].toUpperCase() }, ctx)];
    },
  },
  {
    id: 'add-mana-additional-any-color',
    re: /^(?:(that player|its controller) adds|add) an additional (one|two|three) mana of any (?:one )?color$/,
    note: 'Fertile Ground. The five enumerated modes `add-mana-any-color` uses, with the recipient the sentence named.',
    build(m, ctx) {
      const who = manaRecipient(m[1], ctx);
      if (!who) return null;
      const n = m[2] === 'one' ? 1 : m[2] === 'two' ? 2 : 3;
      const colors = ['{W}', '{U}', '{B}', '{R}', '{G}'];
      return [{
        do: 'choose-mode', min: 1, max: 1,
        modes: colors.map((c) => {
          const mana = c.repeat(n);
          return { text: `Add ${mana}`, effects: [restrictedMana({ do: 'add-mana', who, mana }, ctx)] };
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
      const amount = valueOf(m[2], ctx);
      if (!who || amount === null) return null;
      return [{ do: 'gain-life', who, amount }];
    },
  },
  {
    id: 'lose-life-equal-to',
    re: new RegExp(`^(${P}) loses? life equal to (.+)$`),
    build(m, ctx) {
      const who = playerOr(m[1], ctx);
      // `valueOf`, not `parseValueExpr`: "that card's mana value" is readable
      // here when, and only when, this ability revealed a card first.
      const amount = valueOf(m[2], ctx);
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

  /* ---------------- pump by the creature's own power ----------------
   *
   * "Another target creature you control gains haste and gets +X/+X until end
   * of turn, where X is that creature's power" — Xenagos, God of Revels, and
   * 34 more cards in the catalogue with the same trailing clause. The generic
   * ", where X is …" path two screens down cannot reach them, because
   * `parseValueExpr` refuses "its power" and "that creature's power" on
   * principle: a subject bound by an earlier sentence is a guess. Here it is
   * not a guess. The phrase that binds X is the phrase that names the
   * creature, so the pump's own selector IS the thing whose power X is, and
   * `{v:'power', of:<that selector>}` is the value the DSL already had.
   *
   * Three spellings, resolved three ways, and the third is the one to keep
   * strict:
   *   `~s power`            "this creature's" / the card's name — the source.
   *                         Any subject may take it: Wild Beastmaster pumps
   *                         each other creature by HIS power.
   *   `its power`           the one object this phrase named, whether that is
   *                         a target (Berserk), the source (Chameleon Colossus)
   *                         or the trigger's subject (Arahbo's "it").
   *   `that creatures power` a target announced in this very phrase, and
   *                         nothing else. A card that meant the source would
   *                         have said "its"; a card whose "that creature" was
   *                         bound by an earlier sentence — Dina, Soul Steeper's
   *                         "the sacrificed creature's power" — does not match
   *                         and stays refused.
   * Either bound spelling on a plural subject is refused too: `{v:'power', of:
   * {sel:'all'}}` SUMS, so "each creature gets +X/+X where X is its power" would
   * hand every creature the total.
   *
   * The evaluator reads the value ONCE, on resolution (`ptModifyPart`), which is
   * CR 608.2h: X is locked in as the ability resolves. A continuous re-read
   * would compound and Xenagos would quadruple rather than double. */
  {
    id: 'pump-by-own-stat',
    re: /^(.+?) (?:gains? ([a-z, ]+?) and )?gets? \+x\/\+(x|0)(?: and gains? ([a-z, ]+?))? until end of turn,? where x is (~s|its|that creatures|that permanents) (power|toughness)$/,
    note: 'Xenagos, God of Revels. The pumped creature is the creature whose power X is, so the binding needs no earlier sentence.',
    build(m, ctx) {
      const what = phraseSelector(m[1], ctx, 'Choose a creature');
      if (!what) return null;
      const grantText = m[2] ?? m[4];
      const grant = grantText ? parseKeywordList(grantText) : undefined;
      if (grantText && !grant) return null;

      let of: Selector;
      if (m[5] === '~s') {
        of = { sel: 'self' };
      } else {
        const single = what.sel === 'self' || what.sel === 'target' || what.sel === 'trigger-subject' || what.sel === 'attached';
        if (!single) return null;
        if (m[5] !== 'its' && what.sel !== 'target') return null;
        of = what;
      }
      const stat: ValueExpr = { v: m[6] as 'power' | 'toughness', of };
      return [{
        do: 'pump',
        what,
        power: stat,
        toughness: m[3] === 'x' ? stat : 0,
        ...(grant ? { grant } : {}),
        duration: 'end-of-turn',
      }];
    },
  },

  /* ---------------- E4: an opponent-facing optional cost ----------------
   *
   * Both spellings of one rule. The player being offered the cost is the one
   * the trigger was about, and `{who:'trigger-player'}` is the only selector
   * that says so — `{who:'each-opponent'}` would tax the whole table for one
   * opponent's draw. */
  {
    id: 'unless-pays',
    re: /^(.+?) unless (that player|its controller) pays ((?:\{[^}]+\})+)$/,
    note: 'Rhystic Study, Mana Leak, Esper Sentinel. The "you may" stays INSIDE, because the opponent decides first and the controller decides second.',
    build(m, ctx, depth) {
      /*
       * Two spellings of who is offered the cost, and they are NOT one
       * selector.
       *
       *   "that player"     the player the trigger was about. Rhystic Study.
       *   "its controller"  whoever controls the thing the effect acts on.
       *                     "Counter target spell unless its controller pays
       *                     {3}" — 60 cards in the census, Mana Leak and
       *                     Force Spike among them, and the single largest
       *                     unread shape in the interaction role.
       *
       * "Its controller" was the one that stopped this rule reading a
       * counterspell for a year: the payer is the controller of the TARGET,
       * and the target does not exist until the inner phrase has registered
       * it. So the inner phrase is read first and the payer is derived from
       * what it produced, and if that derivation fails the whole clause is
       * refused rather than taxed at the wrong seat. `{who:'each-opponent'}`
       * is never guessed for either; a counterspell that taxed every
       * opponent would be a wrong ability, and a wrong ability is the failure
       * this file exists to refuse.
       *
       * "Unless THEY pay" is not here. Every card that prints it ("each
       * opponent sacrifices a permanent of their choice unless they pay {1}",
       * "that player loses 2 life unless they pay {2}") has an inner clause
       * this compiler already refuses, so a "they" branch would be code no
       * real card reaches and no test could exercise. It joins when a card
       * does.
       */
      const inner = compileEffectPhrase(m[1], ctx, depth + 1);
      if (!inner) return null;
      const who = unlessPayer(m[2], inner);
      if (!who) return null;
      return [{ do: 'unless-pays', who, cost: [unlessManaCost(m[3], ctx)], effects: inner }];
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

/**
 * Who "unless <payer> pays" is asking, derived from the effect the payment
 * buys out of. `null` refuses: an unless clause whose payer cannot be named
 * from the record is a tax at the wrong seat, so the clause goes to manual.
 */
function unlessPayer(payer: string, inner: readonly Effect[]): PlayerSelector | null {
  if (payer === 'that player') return { who: 'trigger-player' };

  // The thing being countered, bounced or destroyed. One effect, one object:
  // "counter target spell and draw a card unless its controller pays" would
  // leave "its" pointing at nothing this rule can name.
  const object = inner.length === 1 ? (inner[0] as { what?: Selector }).what : undefined;
  const objectIsSelector = object !== undefined && typeof object === 'object' && 'sel' in object;
  return objectIsSelector ? { who: 'controller-of', of: object } : null;
}

/**
 * The mana half of "unless … pays {…}".
 *
 * "{X}" means two different things and the context says which. With a
 * ", where X is …" clause bound (Esper Sentinel: "pays {X}, where X is this
 * creature's power") the amount is COMPUTED, and `{pay:'generic-mana'}` carries
 * the expression. Unbound (Syncopate: "pays {X}" on a spell with {X} in its
 * cost) it is the announced X, and the mana string carries it exactly as the
 * card prints it.
 */
function unlessManaCost(symbols: string, ctx: BuildCtx): Cost {
  const cost = symbols.toUpperCase();
  if (cost === '{X}' && ctx.xValue !== undefined) return { pay: 'generic-mana', amount: ctx.xValue };
  return { pay: 'mana', cost };
}

/* ------------------------------------------------------------------ *
 * Effects the vocabulary has no member for, named so they are counted
 * rather than absorbed. Each becomes a `{do:'manual'}` with a hint, and
 * `coverage.ts` histograms the hints — which is how "what should the
 * vocabulary grow next" becomes a number instead of an opinion.
 * ------------------------------------------------------------------ */

export const NAMED_MANUAL_EFFECTS: Array<{
  id: string;
  re: RegExp;
  hint: string;
  /** A second look at the match, for a shape a regex alone cannot vouch for. */
  accept?: (m: RegExpMatchArray) => boolean;
}> = [
  { id: 'explore', re: /^it explores$|^~ explores$/, hint: 'explore: compound reveal + branch, not modelled' },
  {
    /*
     * OWN-BOUNCE, the untargeted kind: "return a creature you control to its
     * owner's hand". Whitemane Lion, Shrieking Drake, Kor Skyfisher, Dream
     * Stalker, Roaring Primadox, Cloudstone Curio, Temur Sabertooth.
     *
     * The `bounce` rule above refuses the phrase, and it is RIGHT to: "a
     * creature you control" is one creature its controller picks on
     * resolution, and the only untargeted selector is `{sel:'all'}`, which
     * means every match. Compiling it would turn Whitemane Lion into a
     * one-sided board wipe, and `compiler.test.ts` pins that refusal.
     *
     * But a refusal that says NOTHING costs the deck builder the whole card.
     * The manual marker used to carry only the raw text, so the facet layer
     * could not tell Shrieking Drake from an unread paragraph, and a Chulane
     * or Animar plan asking for creatures that come back to hand found none
     * of the cards the archetype is built on. Naming the marker is the same
     * move as `proliferate`: the choice is still the player's, coverage stays
     * `partial`, and `MANUAL_IDS` in the facet layer reads the id.
     *
     * WHAT IS REFUSED, still. The middle of the phrase must be a plain
     * description of the thing: no second controller, no target, no player.
     * "Return a creature you control or an opponent controls" would otherwise
     * sneak through on the substring. And a LAND is not this shape at all:
     * "return a land you control to its owner's hand" is the karoo clause,
     * thirty-six cards led by Simic Growth Chamber at rank 308, and none of
     * them is a card a bounce-your-creatures deck wants. They keep the plain
     * marker they had.
     *
     * "That shares a permanent type with it" is Cloudstone Curio alone, and
     * it is THE card of the archetype, so the tail is allowed by name rather
     * than parsed.
     */
    id: 'bounce-own',
    re: new RegExp(
      '^(?:you may )?return (?:a|an|another|one|two|three|up to (?:one|two|three)) ' +
        '([a-z0-9 /+-]+?) you control' +
        '(?: that shares a (?:permanent|card) type with it)?' +
        ' to (?:its|their) owners hands?$'
    ),
    hint: 'bounce-own: which of your own permanents comes back is a choice made on resolution',
    accept: (m) => {
      const middle = m[1];
      if (/\b(control|controls|opponent|target|player|owner|each|all)\b/.test(middle)) return false;
      const head = middle.split(' ').pop() ?? '';
      return !/^(land|lands|forest|forests|island|islands|plains|swamp|swamps|mountain|mountains)$/.test(head);
    },
  },
  { id: 'investigate', re: /^investigate$/, hint: 'investigate: Clue token plus its own ability' },
  { id: 'proliferate', re: /^proliferate$/, hint: 'proliferate: needs a player-directed multi-permanent choice' },
  { id: 'mana-combination', re: /^add (two|three|four|five) mana in any combination of colors$/, hint: 'mana in any combination: N independent colour choices, not one' },
  { id: 'regenerate', re: /^regenerate (.+)$/, hint: 'regenerate: a replacement shield the DSL has no result for' },
  { id: 'reveal', re: /^reveal (.+)$/, hint: 'reveal: no reveal effect in the vocabulary' },
  { id: 'look-at-top', re: /^look at the top (.+)$/, hint: 'library peeking: no look/reorder effect in the vocabulary' },
  /* Only the taxes the unless-pays rule refuses reach this: "pays {2} plus an
     additional {1} for each Faerie you control" (Spell Stutter), "pays mana
     equal to the greatest power among creatures you control" (Repulsive
     Mutation). A plain "{N}" is read now. */
  { id: 'counter-unless-pay', re: /^counter target (.+) unless (.+)$/, hint: 'counter-unless-pay: a tax the cost grammar cannot spell' },
  /*
   * "You may cast a spell with mana value 5 or less from your hand without
   * paying its mana cost" (Rishkar's Expertise, 243), "then you may cast any
   * number of spells from among those cards without paying their mana costs"
   * (Etali, Primal Storm, 266), "copy it, and you may cast the copy without
   * paying its mana cost" (Mizzix's Mastery, 805).
   *
   * Casting is a player ACTION — which spell, whether at all, what it targets
   * — and the resolver has no way to take one, so this is a marker and not a
   * verb. What the marker buys is the NAME: `eff:cast-free` has been in the
   * engine's vocabulary since the facet layer was written and the compiler
   * had never once produced it, so every card that cheats a spell into play
   * was invisible to a plan asking for exactly that, and the deck builder was
   * told about them only by Tagger. The id is read by `MANUAL_IDS` in the
   * facet producer, the same route proliferate and extra-turn take.
   *
   * The sentence may carry a prefix, because the free cast is almost always
   * the second half of one: "exile the top card ..., then you may cast". A
   * prefix has to END in a connective so that "you can't cast ... without
   * paying" is never claimed — the verb must follow "then ", "and ", "you may
   * " or the start of the sentence, and nothing else. `(?!~ )` keeps the
   * spell's own alternative cost out, which is a cost and lives on the
   * ability (`SpellAbility.alternativeCosts`), not in its effects.
   */
  {
    id: 'cast-free',
    re: /^(?:.+?\b(?:then|and) |if you do, )?(?:you may )?cast (?!~ )(.+?) without paying (?:its|their) mana costs?$/,
    hint: 'cast-free: which spell to cast, and whether to, is a player action the resolver cannot take',
  },
];

/** `null` if the phrase is not a named-but-unmodelled effect. */
export function namedManual(phrase: string): Effect | null {
  for (const { re, hint, accept } of NAMED_MANUAL_EFFECTS) {
    const m = phrase.match(re);
    if (m && (!accept || accept(m))) return manual(phrase, hint);
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * The phrase compiler
 * ------------------------------------------------------------------ */

/**
 * The two halves of an impulse draw, as `compileEffectBody` recognises them
 * before joining the sentences the ". " split pulled apart. They are the SAME
 * two halves the `impulse` rule's regex is built from, kept as two anchors
 * here because the body compiler sees them one sentence at a time. Widen the
 * rule and widen these together, or the rule can never be reached.
 */
const IMPULSE_EXILE_TAIL = new RegExp(
  `exile the top (?:card|${N} cards) of (?:your|that players|target opponents|target players) library$`,
);
const IMPULSE_GRANT =
  /^(?:until (?:end of turn|the end of your next turn), you may (?:play|cast) (?:that card|those cards|them|it)|you may (?:play|cast) (?:that card|those cards|them|it) this turn)$/;

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
  /*
   * A sentence-initial "Then" is sequencing, and the effect list already IS
   * the sequence. "Draw a card. Then you may put a land card from your hand
   * onto the battlefield tapped." (Insidious Fungus, Nick Fury) is the same
   * compound as "draw a card, then you may put …" written across a full stop,
   * and the word carried no meaning the position did not. Only the bare word
   * is stripped; "then" inside a phrase is a connective and is split below.
   */
  const p = phrase.trim().replace(/^,\s*/, '').replace(/^then /, '').replace(/[.]+$/, '').trim();
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
    // `valueOf` so that "where X is that card's mana value" (Twilight Prophet)
    // binds after a revealed draw, and is refused on any ability without one.
    const bound = valueOf(whereX[2], ctx);
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
  const sentences = cleaned.split(/\.\s+/);
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i].trim().replace(/[.]+$/, '');
    if (!s) continue;

    /* IMPULSE DRAW is one effect printed as two sentences, and the split on
     * ". " just above has separated them. Joined back together, the pair is
     * handed to the phrase compiler, which reaches the `impulse` rule either
     * directly or through a connective split when the first sentence has an
     * effect in front of the exile: "create a Treasure token and exile the top
     * card of that player's library. Until end of turn, you may cast that
     * card" is Ragavan, and the left half of the " and " is the Treasure.
     *
     * Two guards, both cheap, so no other pair of sentences is ever glued: the
     * first must END with the exile-from-the-top phrase and the second must BE
     * a windowed permission. A pair that passes both and still refuses (an
     * unreadable library owner, say) falls through to being read one sentence
     * at a time, exactly as before, and lands in manual. */
    const next = i + 1 < sentences.length ? sentences[i + 1].trim().replace(/[.]+$/, '') : '';
    if (next && IMPULSE_EXILE_TAIL.test(s) && IMPULSE_GRANT.test(next)) {
      const pair = compileEffectPhrase(`${s}. ${next}`, ctx);
      if (pair) {
        out.push(...pair);
        i += 1;
        continue;
      }
    }

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
    /* "That card's mana value" means the card THIS ability revealed, and only
     * the sentences already KEPT decide whether it did. Set from `out` rather
     * than by the reveal rule itself, because a rule fires on every split
     * `compileEffectPhrase` tries and most of those are thrown away; a flag
     * raised by a discarded attempt would let a sentence read a card the
     * ability never actually put in hand. */
    if (!ctx.revealedCard && revealsACard(out)) ctx.revealedCard = true;

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
