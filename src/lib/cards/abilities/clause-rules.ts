/**
 * Clause-level rules: the shapes an ability comes in.
 *
 * `effect-rules.ts` reads what an ability DOES. This file reads what KIND of
 * ability it is — the trigger condition, the activation cost, the continuous
 * modification, the replacement — and hands the remainder to the effect table.
 *
 * The same refusal discipline applies at every level. A trigger condition that
 * does not parse means the whole triggered ability is refused, not that it
 * becomes an ability that fires on nothing. An activation cost with one
 * unreadable atom refuses the whole activated ability, not just that atom: a
 * cost you can pay too cheaply is worse than a cost you cannot pay at all.
 */

import type {
  CardFilter,
  Condition,
  Cost,
  Modification,
  PlayerSelector,
  ReplaceableEvent,
  ReplacementResult,
  Selector,
  Step,
  TriggerEvent,
  ValueExpr,
} from './dsl.ts';
import { notF } from './dsl.ts';
import type { BuildCtx } from './effect-rules.ts';
import { phraseSelector } from './effect-rules.ts';
import {
  NUM,
  objectSelector,
  parseCondition,
  parseCount,
  parseForEachValue,
  parseKeywordList,
  parseKeywordWithParameter,
  parseObject,
  parsePlayer,
  parseValueExpr,
} from './grammar.ts';

const N = NUM;

/* ------------------------------------------------------------------ *
 * Trigger events
 * ------------------------------------------------------------------ */

/** Step phrases, longest first. `whose` is who the step belongs to. */
const STEP_TRIGGERS: Array<[RegExp, Step, PlayerSelector]> = [
  [/^your upkeep$/, 'upkeep', { who: 'you' }],
  [/^your end step$/, 'end', { who: 'you' }],
  [/^your draw step$/, 'draw', { who: 'you' }],
  [/^your untap step$/, 'untap', { who: 'you' }],
  [/^your (?:first |precombat )?main phase$/, 'precombat_main', { who: 'you' }],
  [/^your (?:second |postcombat )main phase$/, 'postcombat_main', { who: 'you' }],
  [/^combat on your turn$/, 'begin_combat', { who: 'you' }],
  [/^each upkeep$/, 'upkeep', { who: 'each-player' }],
  [/^each players upkeep$/, 'upkeep', { who: 'each-player' }],
  [/^each end step$/, 'end', { who: 'each-player' }],
  [/^each players end step$/, 'end', { who: 'each-player' }],
  [/^each players draw step$/, 'draw', { who: 'each-player' }],
  [/^each opponents upkeep$/, 'upkeep', { who: 'each-opponent' }],
  [/^each opponents end step$/, 'end', { who: 'each-opponent' }],
  [/^each opponents draw step$/, 'draw', { who: 'each-opponent' }],
  [/^each combat$/, 'begin_combat', { who: 'each-player' }],
  // "the end step" / "the upkeep" with no owner is the current turn's.
  [/^the end step$/, 'end', { who: 'active' }],
  [/^the upkeep$/, 'upkeep', { who: 'active' }],
];

/**
 * The thing a trigger is about: the source, an Aura's or Equipment's host, or a
 * group of permanents. Anything else — a player, a spell, a phrase we cannot
 * read — comes back `null` and the whole triggered ability is refused.
 */
function triggerSubject(phrase: string): Selector | null {
  const s = phrase.trim();
  if (s === '~') return { sel: 'self' };
  if (/^(equipped|enchanted) /.test(s)) return { sel: 'attached' };
  const ref = parseObject(s);
  if (!ref || ref.targeted) return null;
  return objectSelector(ref);
}

/**
 * A trigger condition -> one or more `TriggerEvent`s.
 *
 * More than one is returned for "enters or attacks" and "attacks or blocks".
 * Two abilities that each fire on their own event are behaviourally identical
 * to one ability firing on either, because the two events never occur
 * simultaneously — so the split is exact, not an approximation.
 */
export function parseTriggerEvent(phrase: string, ctx: BuildCtx): TriggerEvent[] | null {
  const p = phrase.trim().replace(/[.,]+$/, '');

  /* --- the source itself --- */
  if (/^~ enters(?: the battlefield)?$/.test(p)) return [{ on: 'enters', who: { sel: 'self' } }];
  if (/^~ enters or attacks$/.test(p)) return [{ on: 'enters', who: { sel: 'self' } }, { on: 'attacks', who: { sel: 'self' } }];
  if (/^~ dies$/.test(p)) return [{ on: 'dies', who: { sel: 'self' } }];
  if (/^~ attacks$/.test(p)) return [{ on: 'attacks', who: { sel: 'self' } }];
  if (/^~ attacks or blocks$/.test(p)) return [{ on: 'attacks', who: { sel: 'self' } }, { on: 'blocks', who: { sel: 'self' } }];
  if (/^~ blocks$/.test(p)) return [{ on: 'blocks', who: { sel: 'self' } }];
  if (/^~ becomes blocked$/.test(p)) return [{ on: 'becomes-blocked', who: { sel: 'self' } }];
  if (/^~ becomes tapped$/.test(p)) return [{ on: 'tapped', who: { sel: 'self' } }];
  if (/^~ becomes untapped$/.test(p)) return [{ on: 'untapped', who: { sel: 'self' } }];
  if (/^~ is dealt damage$/.test(p)) return [{ on: 'dealt-damage', who: { sel: 'self' } }];
  if (/^~ leaves the battlefield$/.test(p)) return [{ on: 'leaves', who: { sel: 'self' }, from: 'battlefield' }];
  if (/^~ is put into a graveyard from anywhere$/.test(p)) {
    return [{ on: 'zone-change', who: { sel: 'self' }, from: 'any', to: 'graveyard' }];
  }

  /* --- damage a subject deals. The subject may be the source, an Aura's or
         Equipment's host, or a whole group ("a creature you control"). --- */
  const dealt = p.match(/^(.+?) deals (combat )?damage(?: to (a player|an opponent|a creature|a planeswalker|any target))?$/);
  if (dealt) {
    const source = triggerSubject(dealt[1]);
    if (!source) return null;
    const e: TriggerEvent = { on: 'deals-damage', source };
    if (dealt[2]) (e as { combatOnly?: boolean }).combatOnly = true;
    const to = dealt[3];
    if (to === 'a player' || to === 'an opponent') (e as { to?: string }).to = 'player';
    else if (to === 'a creature') (e as { to?: string }).to = 'creature';
    else if (to === 'a planeswalker') (e as { to?: string }).to = 'planeswalker';
    else if (to === 'any target') (e as { to?: string }).to = 'any';
    return [e];
  }

  /* --- steps --- */
  const step = p.match(/^at the beginning of (.+)$/);
  if (step) {
    for (const [re, s, whose] of STEP_TRIGGERS) {
      if (re.test(step[1])) return [{ on: 'step', step: s, whose }];
    }
    return null; // an owner phrase we cannot name — "enchanted player's upkeep"
  }

  /* --- casting --- */
  const cast = p.match(/^(you|an opponent|a player|each opponent) cast(?:s)? (?:a|an|your) (.+) spell$/);
  if (cast) {
    const by =
      cast[1] === 'you' ? { who: 'you' } as PlayerSelector
      : cast[1] === 'a player' ? { who: 'each-player' } as PlayerSelector
      : { who: 'each-opponent' } as PlayerSelector;
    const ref = parseObject(cast[2]);
    if (!ref || ref.targeted) return null;
    return [{ on: 'cast', what: { sel: 'all', where: ref.filter, zone: 'stack' }, by }];
  }
  const castAny = p.match(/^(you|an opponent|a player) cast(?:s)? (?:a|an) spell$/);
  if (castAny) {
    const by =
      castAny[1] === 'you' ? { who: 'you' } as PlayerSelector
      : castAny[1] === 'a player' ? { who: 'each-player' } as PlayerSelector
      : { who: 'each-opponent' } as PlayerSelector;
    return [{ on: 'cast', what: { sel: 'all', where: { is: 'any' }, zone: 'stack' }, by }];
  }

  /* --- players --- */
  if (/^you gain life$/.test(p)) return [{ on: 'gains-life', whose: { who: 'you' } }];
  if (/^you lose life$/.test(p)) return [{ on: 'loses-life', whose: { who: 'you' } }];
  const draws = p.match(/^(you|an opponent|each opponent|a player) draws? a card$/);
  if (draws) {
    const whose = parsePlayer(draws[1] === 'an opponent' ? 'each opponent' : draws[1] === 'a player' ? 'each player' : draws[1], null);
    return whose ? [{ on: 'draws-card', whose }] : null;
  }

  /* --- "~ or another creature you control ..." ---
     The source is itself a member of the group it names, so "~ or another
     creature you control enters" is exactly "a creature you control enters".
     Rewriting it that way is a rules identity, not an approximation. */
  const orAnother = p.match(/^~ or another (.+?) (enters|dies|attacks|enters or attacks)$/);
  if (orAnother) {
    const ref = parseObject(orAnother[1]);
    if (!ref || ref.targeted) return null;
    const who = objectSelector(ref);
    switch (orAnother[2]) {
      case 'enters': return [{ on: 'enters', who }];
      case 'attacks': return [{ on: 'attacks', who }];
      case 'enters or attacks': return [{ on: 'enters', who }, { on: 'attacks', who }];
      default: return [{ on: 'dies', who }];
    }
  }

  /* --- any other subject: another permanent, a group, an Aura's host ---
         `triggerSubject` owns the vocabulary, so "another creature you control
         dies", "a creature you control attacks" and "equipped creature attacks"
         all take the same path and none of them needs its own rule. */
  const subjectEvent = p.match(
    /^(?:(?:a|an|another|one or more) )?(.+?) (enters|dies|attacks|blocks|becomes tapped|becomes untapped|is put into a graveyard from the battlefield)(?: under your control)?$/,
  );
  if (subjectEvent) {
    const who = triggerSubject(
      /^(?:a|an|another|one or more) /.test(p) && /^another /.test(p)
        ? 'another ' + subjectEvent[1]
        : subjectEvent[1],
    );
    if (!who) return null;
    switch (subjectEvent[2]) {
      case 'enters': return [{ on: 'enters', who }];
      case 'attacks': return [{ on: 'attacks', who }];
      case 'blocks': return [{ on: 'blocks', who }];
      case 'becomes tapped': return [{ on: 'tapped', who }];
      case 'becomes untapped': return [{ on: 'untapped', who }];
      default: return [{ on: 'dies', who }];
    }
  }

  const sacrificed = p.match(/^you sacrifice (?:a|an) (.+)$/);
  if (sacrificed) {
    const ref = parseObject(sacrificed[1] + ' you control');
    if (!ref) return null;
    return [{ on: 'sacrificed', who: objectSelector(ref) }];
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Activation costs
 * ------------------------------------------------------------------ */

const MANA_ATOM = /^(?:\{[^}]+\})+$/;

/**
 * A cost string -> `Cost[]`, or `null` to refuse the whole ability.
 *
 * Refusing the whole ability on one unreadable atom is deliberate. An activated
 * ability whose cost is partly read is an ability a player can activate too
 * cheaply, and there is no marker that makes that safe — unlike a partly-read
 * EFFECT, which the `{do:'manual'}` marker does make safe.
 */
export function parseCosts(costText: string): Cost[] | null {
  const atoms = costText.split(',').map((a) => a.trim()).filter(Boolean);
  if (!atoms.length) return null;

  const out: Cost[] = [];
  for (const atom of atoms) {
    if (atom === '{t}') { out.push({ pay: 'tap' }); continue; }
    if (atom === '{q}') { out.push({ pay: 'untap' }); continue; }
    if (MANA_ATOM.test(atom)) { out.push({ pay: 'mana', cost: atom.toUpperCase() }); continue; }

    if (atom === 'sacrifice ~') { out.push({ pay: 'sacrifice', what: { sel: 'self' }, count: 1 }); continue; }

    const sac = atom.match(new RegExp(`^sacrifice (?:(${N}) )?(.+)$`));
    if (sac) {
      const ref = parseObject(sac[2]);
      if (!ref || ref.targeted || ref.upTo) return null;
      const count = sac[1] ? parseCount(sac[1]) : ref.count;
      if (count === null) return null;
      out.push({ pay: 'sacrifice', what: objectSelector(ref), count });
      continue;
    }

    const discard = atom.match(new RegExp(`^discard (${N}) cards?( at random)?$`));
    if (discard) {
      const count = parseCount(discard[1]);
      if (count === null) return null;
      const c: Cost = { pay: 'discard', count };
      if (discard[2]) (c as { random?: boolean }).random = true;
      out.push(c);
      continue;
    }

    const life = atom.match(new RegExp(`^pay (${N}) life$`));
    if (life) {
      const amount = parseCount(life[1]);
      if (amount === null) return null;
      out.push({ pay: 'life', amount });
      continue;
    }

    const removeCounters = atom.match(new RegExp(`^remove (${N}) ([a-z+/-]+) counters? from ~$`));
    if (removeCounters) {
      const count = parseCount(removeCounters[1]);
      if (count === null) return null;
      out.push({ pay: 'remove-counters', counter: removeCounters[2], count, from: { sel: 'self' } });
      continue;
    }

    const exile = atom.match(new RegExp(`^exile (?:(${N}) )?(.+?) from your graveyard$`));
    if (exile) {
      const ref = parseObject(exile[2]);
      if (!ref || ref.targeted || ref.upTo) return null;
      const count = exile[1] ? parseCount(exile[1]) : ref.count;
      if (count === null) return null;
      out.push({ pay: 'exile', from: 'graveyard', what: objectSelector({ ...ref, zone: 'graveyard' }), count });
      continue;
    }

    if (/^return ~ to (?:its|your) owners hand$/.test(atom)) {
      out.push({ pay: 'return-to-hand', what: { sel: 'self' }, count: 1 });
      continue;
    }

    const tapOthers = atom.match(new RegExp(`^tap (?:(${N}) )?untapped (.+?) you control$`));
    if (tapOthers) {
      const ref = parseObject(tapOthers[2] + ' you control');
      if (!ref) return null;
      const count = tapOthers[1] ? parseCount(tapOthers[1]) : 1;
      if (count === null) return null;
      out.push({ pay: 'tap-others', what: objectSelector(ref), count });
      continue;
    }

    return null; // an unread cost atom refuses the ability
  }
  return out;
}

/** Loyalty costs: `+1`, `0`, `-7` (the U+2212 minus is flattened upstream). */
export function parseLoyaltyCost(symbol: string): Cost[] | null {
  const m = symbol.trim().match(/^([+-]?)(\d+)$/);
  if (!m) return null;
  const n = Number(m[2]);
  if (m[1] === '-') return [{ pay: 'remove-counters', counter: 'loyalty', count: n, from: { sel: 'self' } }];
  return [{ pay: 'add-counters', counter: 'loyalty', count: n, to: { sel: 'self' } }];
}

/* ------------------------------------------------------------------ *
 * Static (continuous) abilities
 * ------------------------------------------------------------------ */

export interface StaticShape {
  affects: Selector;
  modifications: Modification[];
  /**
   * "As long as …". Present only when the paragraph stated one, and
   * `scanStatics` evaluates it before the effect reaches the layer engine, so an
   * anthem whose condition is false is simply not in the continuous-effect list
   * rather than being in it and inert.
   */
  condition?: Condition;
}

/**
 * A printed P/T box as a number, or `null` when it is not a plain integer.
 *
 * Deliberately NOT `parseInt`. `printed.ts`'s own header names `parseInt` as
 * the lossy read that turns Tarmogoyf's `1+*` into a confident `1`, and the
 * whole value of this helper is that it refuses that string instead. `-1`
 * (Char-Rumbler and friends) is a real printed value and is accepted.
 */
function plainInteger(box: string | undefined): number | null {
  const s = (box ?? '').trim();
  if (!/^-?\d+$/.test(s)) return null;
  return Number(s);
}

/** The subject of a continuous effect: a group, or an Aura/Equipment's host. */
function staticSubject(phrase: string, ctx: BuildCtx): Selector | null {
  const p = phrase.trim();
  if (p === '~') return { sel: 'self' };
  if (/^(enchanted|equipped) /.test(p)) return { sel: 'attached' };
  const ref = parseObject(p);
  if (!ref) return null;
  if (ref.targeted) return null; // a target is not a continuous effect's subject
  return objectSelector(ref);
}

/**
 * A whole paragraph -> a continuous effect, or `null`.
 *
 * Every rule here writes an EXPLICIT layer, following XMage's model, where a
 * continuous effect declares the CR 613 layers it acts in rather than having
 * them deduced from whichever fields it happens to set. Deduction reads tidier
 * and is wrong exactly where it matters: an effect that both changes a type and
 * modifies power belongs in two layers, and a scheme that infers one layer per
 * effect silently picks one of them. CR 613 is an ordering rule, so the
 * ordering has to be stated rather than guessed.
 */
export function parseStatic(paragraph: string, ctx: BuildCtx): StaticShape | null {
  const p = paragraph.trim().replace(/[.]+$/, '');

  /* "As long as …" and "during your turn", in either order.
   *
   * A conditional continuous effect is an ordinary static ability carrying a
   * `condition`, not a new kind of clause, so the condition comes OFF here and
   * the remainder goes through the same table every unconditional static uses.
   * That is where the leverage is: one peel, and every rule below composes with
   * every condition `parseCondition` can read, rather than each rule growing its
   * own "as long as" variant.
   *
   * Both halves must parse. A readable condition on an unreadable effect, or the
   * reverse, is refused whole — an anthem that switches on under the wrong
   * circumstances is a wrong ability, and this file has no marker that makes a
   * wrong continuous effect safe the way `{do:'manual'}` makes a wrong one-shot
   * safe.
   */
  const conditional = peelCondition(p);
  if (conditional) {
    const inner = parseStaticBody(conditional.rest, ctx);
    if (inner && !inner.condition) return { ...inner, condition: conditional.condition };
    return null;
  }

  return parseStaticBody(p, ctx);
}

/**
 * Splits "as long as <condition>, <effect>" or "<effect> as long as <condition>".
 *
 * "For as long as" is deliberately excluded. It is a DURATION — "target land
 * doesn't untap for as long as ~ remains tapped" — and reading it as a condition
 * would turn a one-shot effect with a lasting consequence into a continuous
 * effect that switches itself off, which is a different card.
 */
function peelCondition(p: string): { condition: Condition; rest: string } | null {
  /* Prefix: "As long as you control an artifact, ~ gets +1/+0." */
  const prefix = p.match(/^as long as (.+?), (.+)$/);
  if (prefix) {
    const condition = parseCondition(prefix[1]);
    if (condition) return { condition, rest: prefix[2] };
    return null;
  }

  /* Prefix: "During your turn, ~ has first strike." */
  const during = p.match(/^during your turn, (.+)$/);
  if (during) return { condition: { if: 'your-turn' }, rest: during[1] };

  /* Suffix: "~ gets +2/+2 as long as you control three or more artifacts."
     Written as a capture rather than a lookbehind on purpose: a lookbehind is
     ES2018 and this module is bundled for browsers, so the duration guard is a
     captured "for " that the code then rejects. */
  const suffix = p.match(/^(.+?) (for )?as long as (.+)$/);
  if (suffix && !suffix[2]) {
    const condition = parseCondition(suffix[3]);
    if (condition) return { condition, rest: suffix[1] };
    return null;
  }

  return null;
}

/** Every static rule that does NOT read an "as long as" for itself. */
function parseStaticBody(paragraph: string, ctx: BuildCtx): StaticShape | null {
  const p = paragraph.trim().replace(/[.]+$/, '');

  /* Layer 7b — a characteristic-defining power and toughness.
   *
   * `pt-set` and `{v:'count'}` have both been in the DSL since it was written
   * and `toEffectPart` maps the first straight onto sublayer 7b; what was
   * missing was a rule that produced them, so every Nightmare, every Tarmogoyf-
   * shaped creature and every "equal to the number of lands you control" was an
   * `unrecognised` clause.
   *
   * Only the "power AND toughness are EACH equal to" spelling is read. "~'s
   * power is equal to the number of creatures you control" sets one of the two,
   * and `pt-set` has no member for that — writing the same expression into both
   * fields would give the creature a toughness the card never granted it. */
  const definedPT = p.match(/^~s power and toughness are each equal to (.+)$/);
  if (definedPT) {
    const value = parseValueExpr(definedPT[1]);
    if (value !== null) {
      return { affects: { sel: 'self' }, modifications: [{ layer: 'pt-set', power: value, toughness: value }] };
    }
  }

  /* T3 — Layer 7b, ONE characteristic defined.
   *
   * "Uurg's power is equal to the number of land cards in your graveyard" on a
   * card printed `*`/`5`. Tranche 2 recorded this as blocked and recorded the
   * blocker in the wrong place: it said `pt-set` needs both fields and that
   * making one optional "changes what `layers.ts` reads". `layers.ts` line 400
   * already declares `{ kind:'set-pt'; power?; toughness? }` and line 962 checks
   * each field for `undefined` before writing it, so the layer engine has
   * supported one-sided set-pt all along. The real blocker is one function
   * lower: `toEffectPart` in `src/lib/game/abilities/statics.ts` calls
   * `evalValue(modification.power, ctx)` unconditionally, so an absent field
   * arrives as a number that was never computed. That file belongs to another
   * workflow, so the optional field is still not made here.
   *
   * What IS available is the other half of the box, printed on the card. Uurg's
   * toughness is 5; writing 5 into the toughness field states the card's own
   * printed value rather than inventing one, and the creature stops being the
   * 0/5 that `printed.ts`'s `parseInt` fallback currently reports it as.
   *
   * Two refusals keep that honest:
   *
   *   - the other box must be a plain integer. Lhurgoyf is `*`/`1+*` and
   *     Nethergoyf is `*`/`1+*`; their toughness is a second CDA this rule
   *     cannot read, and `parseInt` would turn `1+*` into a confident 1. Those
   *     cards stay unparsed.
   *   - the card must have a P/T box at all. An Aura that says "enchanted
   *     creature's power is equal to …" is a different sentence with a
   *     different subject and is not matched here anyway.
   *
   * The layer is 7b, not the 7a a printed CDA really occupies, which is the
   * same approximation `toEffectPart` already applies to the two-sided rule
   * above. It is visible in exactly one situation — another effect setting base
   * P/T in the same layer — and it is recorded here rather than left to be
   * discovered. */
  const definedOne = p.match(/^~s (power|toughness) is equal to (.+)$/);
  if (definedOne) {
    const value = parseValueExpr(definedOne[2]);
    const otherBox = definedOne[1] === 'power' ? ctx.printedToughness : ctx.printedPower;
    const other = plainInteger(otherBox);
    if (value !== null && other !== null) {
      const modification: Modification =
        definedOne[1] === 'power'
          ? { layer: 'pt-set', power: value, toughness: other }
          : { layer: 'pt-set', power: other, toughness: value };
      return { affects: { sel: 'self' }, modifications: [modification] };
    }
  }

  /* Layer 7c — "~ gets -X/-X, where X is your life total."
   *
   * THIS IS THE DRAWBACK CASE, and it is the reason the rule exists.
   *
   * Death's Shadow is printed 13/13 for one mana. Its whole cost is the line
   * above: at 20 life it is a -7/-7 that dies the instant it arrives. With the
   * line unparsed the compiler produced no abilities at all, nothing modified
   * its P/T, and the engine rendered the printed 13/13 — a one-mana 13/13,
   * which is not a card that has ever existed. A benefit that goes missing
   * costs a player a card. A DRAWBACK that goes missing hands them a card
   * nobody balanced.
   *
   * The shape generalises past that one card. "gets ±X/±X, where X is <thing>"
   * is a single sentence pattern with a quantity on the end, so it routes the
   * quantity straight through `parseValueExpr` and reaches every phrase that
   * function can already read. `parseValueExpr` refusing a phrase it cannot
   * read is what keeps the rest unparsed rather than guessed.
   *
   * The two signs are read independently: "-X/-0" and "+X/+0" are both real
   * templating, and forcing them to match would silently mis-size the card.
   * `sub` from zero is the negation, chosen over `{v:'mul', of:[-1, …]}`
   * because `statics.ts` can carry `sub` across into a layer-native
   * `DynamicValue` and cannot carry `mul`. */
  const whereX = p.match(/^(.+?) gets? ([+-])x\/([+-])x,? where x is (.+)$/);
  if (whereX) {
    const affects = staticSubject(whereX[1], ctx);
    const value = parseValueExpr(whereX[4]);
    if (affects && value !== null) {
      const signed = (sign: string): ValueExpr => (sign === '-' ? { v: 'sub', a: 0, b: value } : value);
      return {
        affects,
        modifications: [
          { layer: 'pt-modify', power: signed(whereX[2]), toughness: signed(whereX[3]) },
        ],
      };
    }
  }

  /* Layer 7c — an anthem whose size is counted. "~ gets +1/+0 for each artifact
     you control." Same `pt-modify` the flat anthem produces, with a computed
     magnitude instead of a literal one. */
  const countedAnthem = p.match(/^(.+?) gets? ([+-]\d+)\/([+-]\d+) for each (.+)$/);
  if (countedAnthem) {
    const affects = staticSubject(countedAnthem[1], ctx);
    const factor = parseForEachValue(countedAnthem[4]);
    if (affects && factor !== null) {
      const scale = (n: number): ValueExpr => (n === 0 ? 0 : { v: 'mul', of: [n, factor] });
      return {
        affects,
        modifications: [{ layer: 'pt-modify', power: scale(Number(countedAnthem[2])), toughness: scale(Number(countedAnthem[3])) }],
      };
    }
  }

  /* Layer 7c — anthems. "Creatures you control get +1/+1". */
  const anthem = p.match(/^(.+?) gets? ([+-]\d+)\/([+-]\d+)$/);
  if (anthem) {
    const affects = staticSubject(anthem[1], ctx);
    if (affects) {
      return { affects, modifications: [{ layer: 'pt-modify', power: Number(anthem[2]), toughness: Number(anthem[3]) }] };
    }
  }

  /* Layer 7c plus layer 6 — "Creatures you control get +1/+1 and have vigilance". */
  const anthemPlus = p.match(/^(.+?) gets? ([+-]\d+)\/([+-]\d+) and (?:have|has|gains?) ([a-z, ]+)$/);
  if (anthemPlus) {
    const affects = staticSubject(anthemPlus[1], ctx);
    const grant = parseKeywordList(anthemPlus[4]);
    if (affects && grant) {
      return {
        affects,
        modifications: [
          { layer: 'pt-modify', power: Number(anthemPlus[2]), toughness: Number(anthemPlus[3]) },
          { layer: 'ability', grant },
        ],
      };
    }
  }

  /* Layer 6 — keyword granting. KEYWORDS ONLY: granting a whole nested ability
     is the declared `granted-ability` gap, and `parseKeywordList` refusing a
     non-keyword list is what keeps us on the right side of it. */
  const grantKw = p.match(/^(.+?) (?:have|has|gains?) ([a-z, ]+)$/);
  if (grantKw) {
    const affects = staticSubject(grantKw[1], ctx);
    const grant = parseKeywordList(grantKw[2]);
    if (affects && grant) return { affects, modifications: [{ layer: 'ability', grant }] };
  }

  /* Layer 6 — keyword removal. */
  const loseKw = p.match(/^(.+?) loses? ([a-z, ]+)$/);
  if (loseKw) {
    const affects = staticSubject(loseKw[1], ctx);
    const remove = parseKeywordList(loseKw[2]);
    if (affects && remove) return { affects, modifications: [{ layer: 'ability', remove }] };
  }

  /* Restrictions. */
  const cantBlock = p.match(/^(.+?) cant block$/);
  if (cantBlock) {
    const who = staticSubject(cantBlock[1], ctx);
    if (who) return { affects: who, modifications: [{ layer: 'restriction', rule: { rule: 'cant-block', who } }] };
  }
  const cantAttack = p.match(/^(.+?) cant attack$/);
  if (cantAttack) {
    const who = staticSubject(cantAttack[1], ctx);
    if (who) return { affects: who, modifications: [{ layer: 'restriction', rule: { rule: 'cant-attack', who } }] };
  }
  const mustAttack = p.match(/^(.+?) attacks? each combat if able$/);
  if (mustAttack) {
    const who = staticSubject(mustAttack[1], ctx);
    if (who) return { affects: who, modifications: [{ layer: 'restriction', rule: { rule: 'must-attack', who } }] };
  }
  const cantBlocked = p.match(/^(.+?) cant be blocked$/);
  if (cantBlocked) {
    const who = staticSubject(cantBlocked[1], ctx);
    if (who) {
      return { affects: who, modifications: [{ layer: 'restriction', rule: { rule: 'cant-be-blocked-except-by', who, by: { sel: 'none' } } }] };
    }
  }
  const cantBlockedExcept = p.match(/^(.+?) cant be blocked except by (.+)$/);
  if (cantBlockedExcept) {
    const who = staticSubject(cantBlockedExcept[1], ctx);
    const by = staticSubject(cantBlockedExcept[2], ctx);
    if (who && by) {
      return { affects: who, modifications: [{ layer: 'restriction', rule: { rule: 'cant-be-blocked-except-by', who, by } }] };
    }
  }
  const cantUntap = p.match(/^(.+?) doesnt untap during (?:your|its controllers) untap step$/);
  if (cantUntap) {
    const who = staticSubject(cantUntap[1], ctx);
    if (who) return { affects: who, modifications: [{ layer: 'restriction', rule: { rule: 'cant-untap', who } }] };
  }

  /*
   * "You may play an additional land on each of your turns."
   *
   * Exploration (300), Dryad of the Ilysian Grove (301), Oracle of Mul Daya
   * (504), Azusa, Aesi and The Gitrog Monster — eleven of the 2,000 most played
   * cards, all of them the centre of a lands-matter deck, and every one of them
   * produced NO ability record at all.
   *
   * `max-lands-per-turn` has been in the Restriction vocabulary the whole time
   * with nothing producing it and nothing reading it, which is the third
   * instance of the shape CLAUDE.md names: wired to the engine, never fed.
   * `moves.ts` hardcoded the limit to one, so this rule is only worth writing
   * together with the change there that reads it.
   *
   * THE NUMBER IS THE TOTAL, not the extra, because that is what the renderer
   * already says: "you may play 2 lands each turn". Two of these cards stack in
   * Magic, so the runtime sums `n - 1` over every source rather than taking the
   * largest — Exploration plus Azusa is four land drops, not three.
   */
  const extraLands = p.match(
    new RegExp(`^you may play (?:(${N}) )?additional lands?(?: on each of your turns| each turn| during each of your turns)$`)
  );
  if (extraLands) {
    const extra = extraLands[1] ? parseCount(extraLands[1]) : 1;
    if (typeof extra === 'number' && extra > 0) {
      return {
        affects: { sel: 'self' },
        modifications: [
          { layer: 'restriction', rule: { rule: 'max-lands-per-turn', who: { who: 'you' }, n: extra + 1 } },
        ],
      };
    }
  }

  /* E4 — cost modification. See `parseCostModification`. */
  const costMod = parseCostModification(p);
  if (costMod) return costMod;

  return null;
}

/* ------------------------------------------------------------------ *
 * E4 — cost modification
 *
 * Four spellings of one rule, and the differences between them are the whole
 * point, because they differ in WHOSE spells get cheaper:
 *
 *   "Artifact spells you cast cost {1} less"    -> the controller only
 *   "Spells your opponents cast cost {1} more"  -> the opponents only
 *   "Noncreature spells cost {1} more"          -> every player, you included
 *   "This spell costs {1} less for each …"      -> the source itself, computed
 *
 * The old rule read only the first and hardcoded `forWhom: you`. Read that way,
 * Sphere of Resistance taxes the table and not its controller — a tax the
 * caster silently never pays. The catalogue writes all four, so `forWhom` is
 * read from the sentence rather than assumed.
 *
 * The fourth is E4 meeting E9: `delta` has always been a `ValueExpr`, and
 * "for each artifact you control" is the single most common cost-modifying
 * clause in the catalogue (36 rows). Nothing but a front end was missing.
 * ------------------------------------------------------------------ */

/** `{is:'any'}` when the phrase named no restriction at all — "spells you cast". */
function spellFilter(phrase: string | undefined): CardFilter | null {
  const s = (phrase ?? '').trim();
  if (!s) return { is: 'any' };
  const ref = parseObject(s);
  if (!ref || ref.targeted) return null;
  return ref.filter;
}

/** A flat delta, or a computed one when the clause ended in "for each …". */
function costDelta(magnitude: number, direction: string, forEach: string | undefined): ValueExpr | null {
  const signed = direction === 'less' ? -magnitude : magnitude;
  if (!forEach) return signed;
  const factor = parseForEachValue(forEach);
  return factor === null ? null : { v: 'mul', of: [signed, factor] };
}

/**
 * A `{layer:'cost-modify'}` static, or `null`.
 *
 * `applies` is written with `zone:'stack'` because the thing being made cheaper
 * is a SPELL. `costAdjustmentFor` matches the filter against the card wherever
 * it actually is when somebody asks — which is the hand, because a cost is
 * computed before the spell is announced. That mismatch is why cost reduction
 * measured exactly zero for as long as it existed; see the note in `statics.ts`.
 */
function parseCostModification(p: string): StaticShape | null {
  const you = { who: 'you' } as PlayerSelector;

  /* "This spell costs {1} less to cast for each artifact you control." */
  const selfForEach = p.match(/^~ costs \{(\d+)\} (less|more) to cast for each (.+)$/);
  if (selfForEach) {
    const delta = costDelta(Number(selfForEach[1]), selfForEach[2], selfForEach[3]);
    if (delta === null) return null;
    return {
      affects: { sel: 'self' },
      modifications: [{ layer: 'cost-modify', applies: { sel: 'self' }, delta, genericOnly: true, forWhom: you }],
    };
  }

  /* "This spell costs {1} less to cast." */
  const self = p.match(/^~ costs \{(\d+)\} (less|more) to cast$/);
  if (self) {
    return {
      affects: { sel: 'self' },
      modifications: [{
        layer: 'cost-modify',
        applies: { sel: 'self' },
        delta: Number(self[1]) * (self[2] === 'less' ? -1 : 1),
        genericOnly: true,
        forWhom: you,
      }],
    };
  }

  /* "<kind> spells you cast cost {N} less/more to cast", optionally "for each …". */
  const yours = p.match(/^(?:(.+?) )?spells you cast cost \{(\d+)\} (less|more) to cast(?: for each (.+))?$/);
  if (yours) {
    const filter = spellFilter(yours[1]);
    const delta = costDelta(Number(yours[2]), yours[3], yours[4]);
    if (!filter || delta === null) return null;
    return {
      affects: { sel: 'self' },
      modifications: [{
        layer: 'cost-modify',
        applies: { sel: 'all', where: filter, zone: 'stack' },
        delta, genericOnly: true, forWhom: you,
      }],
    };
  }

  /* "<kind> spells your opponents cast cost {N} more to cast." */
  const theirs = p.match(/^(?:(.+?) )?spells your opponents cast cost \{(\d+)\} (less|more) to cast$/);
  if (theirs) {
    const filter = spellFilter(theirs[1]);
    if (!filter) return null;
    return {
      affects: { sel: 'self' },
      modifications: [{
        layer: 'cost-modify',
        applies: { sel: 'all', where: filter, zone: 'stack' },
        delta: Number(theirs[2]) * (theirs[3] === 'less' ? -1 : 1),
        genericOnly: true,
        forWhom: { who: 'each-opponent' },
      }],
    };
  }

  /* "<kind> spells cost {N} more to cast" — no "you cast", so EVERY player, the
     controller included. Sphere of Resistance, not a one-sided tax. */
  const everyone = p.match(/^(?:(.+?) )?spells cost \{(\d+)\} (less|more) to cast$/);
  if (everyone) {
    const filter = spellFilter(everyone[1]);
    if (!filter) return null;
    return {
      affects: { sel: 'self' },
      modifications: [{
        layer: 'cost-modify',
        applies: { sel: 'all', where: filter, zone: 'stack' },
        delta: Number(everyone[2]) * (everyone[3] === 'less' ? -1 : 1),
        genericOnly: true,
        forWhom: { who: 'each-player' },
      }],
    };
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Replacement effects
 * ------------------------------------------------------------------ */

export interface ReplacementShape {
  event: ReplaceableEvent;
  result: ReplacementResult;
  selfReplacement: boolean;
  /**
   * When present, the replacement applies only while this holds.
   *
   * `ReplacementAbility` in the DSL has carried a `condition` since it was
   * written; nothing filled it in, so every conditional replacement was refused
   * whole and the card kept no ability at all. For a land that is not a small
   * omission: "enters tapped unless you control a legendary creature" with no
   * ability means it ALWAYS enters untapped, which is the drawback deleted and
   * the card played stronger than it is printed.
   */
  condition?: Condition;
}

/**
 * "you control a Swamp or an Island", and the rest of the check lands.
 *
 * `parseCondition` reads "you control a Swamp" and refuses the two-type form,
 * which on its own leaves out the whole check land cycle: Drowned Catacomb,
 * Clifftop Retreat, Sunpetal Grove and their friends are among the most played
 * lands there are, and every one of them was entering untapped for free.
 *
 * Rather than teach the main condition grammar a new shape, this composes the
 * one it already reads. "control a permanent that is an A or a B" and "control
 * an A, or control a B" answer identically for an at-least-one check, and the
 * second is built out of parts that are already tested.
 *
 * Deliberately narrow. Only "you control ..." splits, only on a single " or ",
 * and both halves must parse on their own or the whole thing is refused. A
 * clause this cannot read keeps its card unchanged rather than guessing, which
 * is the same bargain the caller makes.
 */
function parseControlsEither(clause: string): Condition | null {
  const controls = clause.trim().toLowerCase().match(/^you control (.+)$/);
  if (!controls) return null;

  const halves = controls[1].split(/ or /);
  if (halves.length !== 2) return null;

  const of: Condition[] = [];
  for (const half of halves) {
    const parsed = parseCondition(`you control ${half.trim()}`);
    if (!parsed) return null;
    of.push(parsed);
  }
  return { if: 'or', of };
}

export function parseReplacement(paragraph: string): ReplacementShape | null {
  const p = paragraph.trim().replace(/[.]+$/, '');

  if (/^~ enters tapped$/.test(p)) {
    return { event: { on: 'enters', who: { sel: 'self' } }, result: { do: 'enters-tapped' }, selfReplacement: true };
  }

  /* "~ enters tapped UNLESS <condition>."
     ------------------------------------------------------------------
     Twenty recorded games found this as the largest single cluster of cards
     playing stronger than printed: around twenty lands, all entering untapped
     every time, because the rule above is an EXACT match and every conditional
     wording fell straight through it to no ability at all.

     "Unless X" is "not X", so the condition is negated here and the runtime
     needs no special case for the word. A condition this file cannot read is
     still refused whole rather than downgraded to an unconditional tap: being
     wrong in the other direction would tap a land that should have come in
     ready, which is a penalty the card does not carry. */
  const unlessTapped = p.match(/^~ enters tapped unless (.+)$/);
  if (unlessTapped) {
    /*
     * "UNLESS YOU CONTROL TWO OR MORE OTHER LANDS" — the check lands, twenty of
     * them, Dreamroot Cascade at rank 177 the most played.
     *
     * `parseCondition` refuses any "controls" phrase carrying `{is:'other'}`,
     * and it is right to in general: `{if:'controls'}` counts a set with no
     * source to exclude, so "another creature" would count the source itself
     * and the condition would be true one card too early.
     *
     * HERE the exclusion is free, and only here. CR 614.12 applies a
     * replacement that changes how a permanent enters BEFORE it is on the
     * battlefield, so at the moment this condition is asked the land is not
     * among the lands you control. "Two or more other lands" and "two or more
     * lands" are the same question, and the word the general rule cannot handle
     * is one this reading does not need.
     *
     * Scoped to this branch on purpose. It is sound because the event is the
     * source entering, and it would be unsound on a static ability or an
     * activation, where the source IS on the battlefield and "other" is doing
     * real work.
     */
    const said = unlessTapped[1];
    const condition =
      parseCondition(said) ??
      parseControlsEither(said) ??
      (/^you control .*\bother\b/.test(said)
        ? parseCondition(said.replace(/\bother\s+/, ''))
        : null);
    if (!condition) return null;
    return {
      event: { on: 'enters', who: { sel: 'self' } },
      result: { do: 'enters-tapped' },
      selfReplacement: true,
      condition: { if: 'not', of: condition },
    };
  }

  const counters = p.match(new RegExp(`^~ enters with (${N}) (\\+\\d+/\\+\\d+|-\\d+/-\\d+|[a-z]+) counters? on it$`));
  if (counters) {
    const count = parseCount(counters[1]);
    if (count === null) return null;
    return {
      event: { on: 'enters', who: { sel: 'self' } },
      result: { do: 'enters-with-counters', counter: counters[2], count },
      selfReplacement: true,
    };
  }

  const tappedAnd = p.match(new RegExp('^~ enters tapped and (?:you )?gains? (\\d+) life$'));
  if (tappedAnd) {
    return {
      event: { on: 'enters', who: { sel: 'self' } },
      result: { do: 'enters-tapped' },
      selfReplacement: true,
    };
  }

  /* Doublers. `{do:'multiply'}` and both events have been in the DSL since it
     was written; the front end had no rule that produced them, which is why
     Doubling Season compiled to two `unrecognised` clauses and a coverage of
     'manual' — a card the compiler read none of, for want of two regexes.

     `counter` is left OFF the `counter-placed` event on purpose: the card says
     "one or more counters", so naming a kind would double +1/+1 counters and
     quietly not double loyalty. */
  const tokenDoubler = p.match(
    /^if an effect would create one or more tokens under your control, it creates (twice|three times) that many(?: of those)? tokens instead$/,
  );
  if (tokenDoubler) {
    return {
      event: { on: 'token-created', whose: { who: 'you' } },
      result: { do: 'multiply', factor: tokenDoubler[1] === 'twice' ? 2 : 3 },
      selfReplacement: false,
    };
  }

  const counterDoubler = p.match(
    /^if an effect would put one or more counters on a permanent you control, it puts (twice|three times) that many(?: of those)? counters on that permanent instead$/,
  );
  if (counterDoubler) {
    return {
      event: {
        on: 'counter-placed',
        target: { sel: 'all', where: { is: 'any' }, controller: { who: 'you' }, zone: 'battlefield' },
      },
      result: { do: 'multiply', factor: counterDoubler[1] === 'twice' ? 2 : 3 },
      selfReplacement: false,
    };
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Keyword lines
 * ------------------------------------------------------------------ */

export interface KeywordHit { keyword: string; parameter?: string; }

/**
 * A paragraph that is nothing but keywords. Refuses the whole line if any
 * comma-separated element is not a keyword, because "flying, then draw a card"
 * is a sentence, not a keyword list.
 */
export function parseKeywordLine(paragraph: string): KeywordHit[] | null {
  const p = paragraph.trim().replace(/[.]+$/, '');
  if (!p) return null;

  // "Enchant creature" defines what an Aura may attach to; it is a keyword
  // ability with a filter as its parameter, and 936 rows carry it.
  const enchant = p.match(/^enchant (.+)$/);
  if (enchant) {
    const what = enchant[1];
    // Auras enchant objects ("creature you control") or players ("player",
    // "opponent"). Both are legal parameters; anything else we cannot read is
    // refused so the runtime never attaches an Aura to the wrong thing.
    const isPlayer = /^(player|opponent|player or planeswalker)$/.test(what);
    if (!isPlayer && !parseObject(what)) return null;
    return [{ keyword: 'enchant', parameter: what }];
  }

  const parts = p.split(',').map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return null;
  const out: KeywordHit[] = [];
  for (const part of parts) {
    const hit = parseKeywordWithParameter(part);
    if (!hit) return null;
    out.push(hit);
  }
  return out;
}
