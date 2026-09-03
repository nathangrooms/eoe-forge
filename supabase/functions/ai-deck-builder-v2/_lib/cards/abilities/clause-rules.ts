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
  AlternativeCost,
  CardFilter,
  Condition,
  Cost,
  Modification,
  PlayFromLimit,
  PlayerSelector,
  ReplaceableEvent,
  ReplacementResult,
  Restriction,
  Selector,
  Step,
  TriggerEvent,
  ValueExpr,
} from './dsl.ts';
import { andF, isWatchableFilter, notF, orF } from './dsl.ts';
import type { BuildCtx } from './effect-rules.ts';
import { phraseSelector } from './effect-rules.ts';
import {
  CHOICE_SUBJECT_WORDS,
  NUM,
  objectSelector,
  parseChoiceSubject,
  parseCondition,
  parseCount,
  parseForEachValue,
  parseKeywordList,
  parseKeywordWithParameter,
  parseManaValueBound,
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

/** Who "you cast", "an opponent casts", "a player casts" and "each opponent casts" name. */
function casterOf(word: string): PlayerSelector {
  if (word === 'you') return { who: 'you' };
  if (word === 'a player') return { who: 'each-player' };
  return { who: 'each-opponent' };
}

/**
 * What a spell "targets": the object phrase after "that targets".
 *
 * "targets ~" is the source (the whole heroic mechanic), "targets a creature
 * you control" is a class of permanent (Feather, the Redeemed), and "targets
 * only a single creature" (Leyline of Resonance) or "one or more permanents"
 * (Dack Fayden) carry a count word that says nothing about WHICH object is
 * targeted, so it is peeled before the phrase is read. `triggerSubject` owns
 * the rest of the vocabulary, and it is the same vocabulary because it is the
 * same question: which object satisfies this description.
 *
 * "targets a player", "targets you or a creature you control" and "targets a
 * single creature other than Ivy" all refuse, because `parseObject` refuses
 * them: a player is not a card filter, and a name is a word it does not read.
 */
function targetedSubject(phrase: string): Selector | null {
  return triggerSubject(phrase.trim().replace(/^(?:a single|one or more|any number of) /, ''));
}

/**
 * A trigger condition -> one or more `TriggerEvent`s.
 *
 * More than one is returned for "enters or attacks" and "attacks or blocks".
 * Two abilities that each fire on their own event are behaviourally identical
 * to one ability firing on either, because the two events never occur
 * simultaneously — so the split is exact, not an approximation.
 */
/**
 * "Whenever an opponent casts their first noncreature spell each turn" —
 * a cast trigger with a per-player, per-turn ordinal on it.
 *
 * The event is the ordinary cast event, read by `parseTriggerEvent` from the
 * same words with the ordinal removed, so Esper Sentinel and Mystic Remora
 * carry the identical `{on:'cast'}`. The ordinal is a CONDITION over turn
 * history: at the moment the trigger is checked, that player has cast exactly
 * N spells of that kind this turn, the one that fired the trigger included —
 * which is what "their first" means in CR 603.2. It compiles to `{v:'watch'}`
 * because the count is a fold over the action log, not something the board
 * can answer, and the trigger bridge refuses to own a condition carrying one
 * (`needsHistory`), so the card is REPRESENTED exactly and RUN by nobody
 * rather than fired on every spell.
 *
 * Not `limit: {per:'turn', count:1}`. That caps the ABILITY at once a turn,
 * and three opponents each casting their first spell are three triggers.
 *
 * `null` when the ordinal is absent, or when the spell filter is one a past
 * snapshot could not answer, in which case the whole trigger is refused
 * rather than counted against a filter that would under-count.
 */
export function parseNthCastTrigger(
  phrase: string,
  ctx: BuildCtx,
): { events: TriggerEvent[]; condition: Condition } | null {
  const p = phrase.trim().replace(/[.,]+$/, '');
  const m = p.match(/^(you|an opponent|a player|each opponent) casts? (?:your|their) (first|second|third) (?:(.+?) )?spell each turn$/);
  if (!m) return null;
  const nth = { first: 1, second: 2, third: 3 }[m[2]];
  if (nth === undefined) return null;

  const events = parseTriggerEvent(m[3] ? `${m[1]} casts a ${m[3]} spell` : `${m[1]} casts a spell`, ctx);
  if (!events || events.length !== 1 || events[0].on !== 'cast') return null;

  // "You" cast your own spells; anybody else is "the player this triggered
  // on", the same binding `{who:'trigger-player'}` gives Rhystic Study.
  const by: PlayerSelector = m[1] === 'you' ? { who: 'you' } : { who: 'trigger-player' };
  const filter = m[3] ? parseObject(m[3])?.filter : undefined;
  if (m[3] && !filter) return null;
  if (filter && !isWatchableFilter(filter)) return null;

  return {
    events,
    condition: {
      if: 'value',
      a: {
        v: 'watch',
        query: {
          event: filter ? { saw: 'spell-cast', what: filter, by } : { saw: 'spell-cast', by },
          window: 'this-turn',
          measure: 'events',
        },
      },
      cmp: 'eq',
      b: nth,
    },
  };
}

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

  /* --- tapping for mana ---
     "Whenever you tap a nonland permanent for mana" (Kinnan, Bonder Prodigy),
     "whenever a player taps a land for mana" (Mana Flare), "whenever enchanted
     land is tapped for mana" (Wild Growth), "whenever you tap a Swamp for mana"
     (Crypt Ghast). Its own event and NOT `tapped`, which fires on a creature
     attacking: Kinnan is paid only for the tap that made mana.

     The player stays on the event. "You tap a land" and "an opponent taps a
     land" are the two halves of Vorinclex, Voice of Hunger, one paying you and
     the other punishing them, and the same event without the player would
     hand the opponent's lands to you. The passive wording names nobody, so
     nobody is recorded and the body says "its controller". */
  const tapsForMana = p.match(/^(you|an opponent|a player|each player) taps? (.+?) for mana$/);
  if (tapsForMana) {
    const who = triggerSubject(tapsForMana[2]);
    if (!who) return null;
    const by: PlayerSelector =
      tapsForMana[1] === 'you' ? { who: 'you' }
      : tapsForMana[1] === 'an opponent' ? { who: 'each-opponent' }
      : { who: 'each-player' };
    return [{ on: 'tapped-for-mana', who, by }];
  }
  const tappedForMana = p.match(/^(.+?) is tapped for mana$/);
  if (tappedForMana) {
    const who = triggerSubject(tappedForMana[1]);
    if (!who) return null;
    return [{ on: 'tapped-for-mana', who }];
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

  /* --- casting ---
     "Another" is kept, not stripped: "whenever you cast another Vampire spell"
     (Edgar Markov) excludes the source itself, and `{is:'other'}` on the stack
     object says exactly that. Dropping it would make the trigger fire on the
     source being cast, which is the one case the card rules out. */
  /* "you cast an instant or sorcery spell that targets a creature you control"
     ------------------------------------------------------------------------
     The spell filter carries a RELATIVE CLAUSE about the spell's targets, and
     until this rule the whole trigger refused: `(.+) spell$` needs the phrase
     to end at "spell", so Feather, the Redeemed, Zada, Hedron Grinder, and all
     53 heroic creatures ("whenever you cast a spell that targets ~") produced
     no cast trigger at all. Measured over the catalogue with
     `scratch/shape.mjs`: 97 cards carry "cast ... spell that targets", 0 read.

     The clause is a property of the spell, so it is a FILTER on the event's
     subject — `{is:'targets'}` sits beside the type filter — rather than a
     condition bolted onto the ability. A condition would fire the trigger for
     every instant and then ask; the card fires only for that spell. The facet
     layer then reads the nested "creature you control" the way it reads any
     filter, so the plan wants instants, sorceries AND creatures, which is what
     a Feather deck is.

     "only" is kept as a flag because "targets only ~" (Zada) and "targets ~"
     (heroic) are different spells: a Zada copy trigger must not fire for a
     spell that also targets something else.

     The spell KIND is optional — "a spell that targets ~" has none — and when
     present it goes through `parseObject` exactly as the plain cast rule below
     does, so "noncreature", "aura" and "instant or sorcery" all read the same
     way in both. */
  const castTargeting = p.match(
    /^(you|an opponent|a player|each opponent) cast(?:s)? (?:a|an|your) (?:(.+?) )?spell that targets (only )?(.+)$/,
  );
  if (castTargeting) {
    const kind = castTargeting[2] ? parseObject(castTargeting[2]) : null;
    if (castTargeting[2] && (!kind || kind.targeted)) return null;
    const of = targetedSubject(castTargeting[4]);
    if (!of) return null;
    const targets: CardFilter = castTargeting[3] ? { is: 'targets', of, only: true } : { is: 'targets', of };
    const where = kind ? andF(kind.filter, targets) : targets;
    return [{ on: 'cast', what: { sel: 'all', where, zone: 'stack' }, by: casterOf(castTargeting[1]) }];
  }

  const cast = p.match(/^(you|an opponent|a player|each opponent) cast(?:s)? (a|an|your|another) (.+) spell$/);
  if (cast) {
    const ref = parseObject(cast[2] === 'another' ? `another ${cast[3]}` : cast[3]);
    if (!ref || ref.targeted) return null;
    return [{ on: 'cast', what: { sel: 'all', where: ref.filter, zone: 'stack' }, by: casterOf(cast[1]) }];
  }
  const castAny = p.match(/^(you|an opponent|a player) cast(?:s)? (?:a|an) spell$/);
  if (castAny) {
    return [{ on: 'cast', what: { sel: 'all', where: { is: 'any' }, zone: 'stack' }, by: casterOf(castAny[1]) }];
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
 * Intervening "if" — CR 603.4
 * ------------------------------------------------------------------ */

export interface InterveningIf {
  /** The condition, when `parseCondition` could read it. */
  condition: Condition | null;
  /** The normalised condition clause, "if" included, verbatim from the body. */
  text: string;
  /** The body with the clause removed: what the ability does. */
  rest: string;
}

/**
 * "[trigger], if [condition], [effect]" -> the condition and the effect apart,
 * or `null` when the body does not open with one.
 *
 * The clause between the event and the effect is not part of either. Left in
 * the body it is the first sentence the effect grammar sees, no effect rule
 * begins with "if", and the whole body collapsed into one `{do:'manual'}`
 * marker: the trigger fired and nothing under it was read. Measured over the
 * 3,000 most played cards on 2 Sep 2026, 93 triggered abilities open this
 * way — Field of the Dead's Zombie, The Ozolith's counters, Land Tax's search,
 * Kederekt Parasite's whole card. That is NOT the same failure as a blind
 * card, and it does not show in `compiler-gap-probe`, which counts a hollow
 * trigger as a record; it shows as a facet layer that saw `trig:enters` and
 * no `eff:create-token`. Peeled, the effect underneath compiles as it would
 * without the clause.
 *
 * WHAT HAPPENS TO THE CONDITION depends on whether the grammar can read it,
 * and the two answers are deliberately different:
 *
 *   readable    it rides on `TriggeredAbility.condition`, which the runtime
 *               already evaluates at both moments CR 603.4 names — when the
 *               trigger would go on the stack and again as it resolves.
 *   unreadable  the caller must put a `{do:'manual'}` marker in the effect
 *               list. That keeps `coverage` at `partial`, and `partial` is
 *               what stops the ability bridge owning the card, so the token
 *               is never created on a false condition by an engine that could
 *               not check it. A boolean flag with no marker is the failure
 *               `lowered.test.ts` pins for the XMage port, and this is the
 *               same bar.
 *
 * Splits at the FIRST comma after "if". A condition with a comma inside it is
 * rare in oracle text; an effect with a comma inside it is on half the cards
 * in the game, so the greedy split would be wrong far more often.
 */
export function peelInterveningIf(body: string): InterveningIf | null {
  const m = body.trim().match(/^if (.+?), (.+)$/);
  if (!m) return null;
  /* "If you do, …" is a consequence of a "you may" before it, never a
     condition on the trigger, and `compileEffectBody` owns that shape. It
     cannot open a trigger body, but the guard costs nothing and documents the
     boundary. */
  if (/^you do$/.test(m[1])) return null;
  return { condition: parseCondition(m[1]), text: `if ${m[1]}`, rest: m[2] };
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

    const exile = atom.match(new RegExp(`^exile (?:(${N}) )?(.+?) from your (graveyard|hand)$`));
    if (exile) {
      /* "Exile a blue card from your hand" is the Force cycle's alternative
         cost (Force of Will, rank 192; Force of Negation, 265) and was refused
         here because only the graveyard was a zone a cost could exile from.
         `activate.ts` already pays an exile cost from whatever zone `from`
         names, offering the choice of card, so the hand costs nothing new. */
      const zone = exile[3] === 'hand' ? 'hand' : 'graveyard';
      const ref = parseObject(exile[2]);
      if (!ref || ref.targeted || ref.upTo) return null;
      const count = exile[1] ? parseCount(exile[1]) : ref.count;
      if (count === null) return null;
      out.push({ pay: 'exile', from: zone, what: objectSelector({ ...ref, zone }), count });
      continue;
    }

    if (/^return ~ to (?:its|your) owners hand$/.test(atom)) {
      out.push({ pay: 'return-to-hand', what: { sel: 'self' }, count: 1 });
      continue;
    }

    /*
     * "Return an Elf you control to its owner's hand: Untap target creature."
     * Wirewood Symbiote, and twenty other cards that pay by bouncing one of
     * their own. The same shape as the sacrifice cost above and read the same
     * way: a cost names WHAT is paid and the player picks WHICH on activation,
     * which is exactly the choice `{sel:'all'} + count` already means for
     * "sacrifice a creature". The controller has to be YOU, by the phrase
     * rather than by assumption: nobody else's permanent can be paid as a cost.
     */
    const bounce = atom.match(new RegExp(`^return (?:(${N}) )?(.+?) to (?:its|their) owners hands?$`));
    if (bounce) {
      const ref = parseObject(bounce[2]);
      if (!ref || ref.targeted || ref.upTo || ref.controller?.who !== 'you') return null;
      const count = bounce[1] ? parseCount(bounce[1]) : ref.count;
      if (count === null) return null;
      out.push({ pay: 'return-to-hand', what: objectSelector(ref), count });
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

/* ------------------------------------------------------------------ *
 * Alternative costs (CR 118.9)
 * ------------------------------------------------------------------ */

/**
 * A paragraph that offers a different way to pay for the spell -> the
 * `AlternativeCost`, or `null`.
 *
 * Two printed shapes, and the compiler holds either for the spell ability
 * printed under it the way it already holds "As an additional cost":
 *
 *   "If you control a commander, you may cast ~ without paying its mana cost."
 *        the free-spell cycle: a condition, and NOTHING paid instead
 *   "You may pay 1 life and exile a blue card from your hand rather than pay
 *    ~s mana cost."
 *        Force of Will: real costs, read by `parseCosts`, and no condition
 *   "If you control a Swamp, you may pay 4 life rather than pay ~s mana cost."
 *   "You may pay {B} rather than pay ~s mana cost if there are thirteen or
 *    more creatures on the battlefield."
 *        both at once, the condition on either end
 *
 * A condition that is printed and cannot be read REFUSES the paragraph. The
 * option is only on offer when the condition holds, and an alternative cost
 * recorded without its gate is a spell the record says is free when it is
 * not. Mindbreak Trap's "if an opponent cast three or more spells this turn"
 * is therefore still a gap, correctly: that is history, and `parseCondition`
 * has no member for it.
 *
 * NOT READ, deliberately:
 *   "rather than pay the mana cost for Zombie creature spells you cast"
 *        Rooftop Storm, As Foretold, Darksteel Monolith — an alternative cost
 *        for OTHER spells is a static permission, not a cost of this one.
 *   "you may pay {0} rather than pay the equip cost"
 *        an alternative to an activation cost, and this is the spell's.
 * Both are refused by the anchor: the clause has to end in THIS spell's mana
 * cost.
 */
export function parseAlternativeCost(paragraph: string): AlternativeCost | null {
  const s = paragraph.trim().replace(/\.$/, '');

  /* Free. "If <condition>, you may cast ~ without paying its mana cost." */
  const free = s.match(/^(?:if (.+?), )?you may cast ~ without paying its mana cost$/);
  if (free) {
    const condition = free[1] ? parseCondition(free[1]) : undefined;
    if (free[1] && !condition) return null;
    return condition ? { costs: [], condition, text: paragraph } : { costs: [], text: paragraph };
  }

  /* Paid. "[If <condition>, ]you may <costs> rather than pay ~s mana cost[ if <condition>]." */
  const paid = s.match(/^(?:if (.+?), )?you may (.+?) rather than pay ~s mana cost(?: if (.+))?$/);
  if (!paid) return null;
  const said = paid[1] ?? paid[3];
  const condition = said ? parseCondition(said) : undefined;
  if (said && !condition) return null;

  /*
   * The costs are printed as prose, "pay 1 life and exile a blue card from
   * your hand", where an activation cost is printed as a list, "Pay 1 life,
   * Exile a blue card from your hand". Same atoms, different glue, so the glue
   * is rewritten and `parseCosts` reads the list it already knows. "pay {1}{B}"
   * loses its verb because a mana atom in a cost list is the bare symbols; "pay
   * 4 life" keeps it because that atom is spelled with the verb.
   */
  const list = paid[2]
    .split(/,? and |, /)
    .map(atom => atom.trim().replace(/^pay (\{)/, '$1'))
    .join(', ');
  const costs = parseCosts(list);
  if (!costs || !costs.length) return null;
  return condition ? { costs, condition, text: paragraph } : { costs, text: paragraph };
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
  /* "During each of your turns" is the same condition said of a permission
     that recurs: Muldrotha writes it, Grand Abolisher writes the short form,
     and a continuous effect is on or off by whose turn it is either way. */
  const during = p.match(/^during (?:your turn|each of your turns), (.+)$/);
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

  /*
   * A permission to play or cast out of the graveyard. See
   * `parsePlayFromGraveyard`.
   *
   * Seven of the 2,000 most played cards say "You may play lands from your
   * graveyard" word for word and every one of them produced no record, while
   * `eff:play-from-graveyard` sat in the engine's vocabulary with nothing
   * feeding it. CLAUDE.md names that shape as the fifth instance of "declared,
   * wired into a role, fed by nothing".
   */
  const playFrom = parsePlayFromGraveyard(p);
  if (playFrom) return playFrom;

  /* E4 — cost modification. See `parseCostModification`. */
  const costMod = parseCostModification(p);
  if (costMod) return costMod;

  return null;
}

/* ------------------------------------------------------------------ *
 * Playing and casting out of the graveyard
 * ------------------------------------------------------------------ */

/**
 * The types a permanent SPELL can have. A land is a permanent and is never a
 * spell (CR 305.1), so "a permanent spell" excludes it and "a permanent card"
 * does not; that is the whole reason there are two lists.
 */
const PERMANENT_SPELL_TYPES: readonly string[] = ['artifact', 'battle', 'creature', 'enchantment', 'planeswalker'];
const PERMANENT_CARD_TYPES: readonly string[] = [...PERMANENT_SPELL_TYPES, 'land'];

const anyOfTypes = (types: readonly string[]): CardFilter =>
  orF(...types.map((value): CardFilter => ({ is: 'type', value })));

/**
 * "you may play lands from your graveyard" -> a `may-play-from` static, or
 * `null`.
 *
 *   "You may play lands from your graveyard."                  Crucible of Worlds (597)
 *   "You may play Forests from your graveyard."                Titania, Nature's Force
 *   "During each of your turns, you may play a land and cast
 *    a permanent spell of each permanent type from your
 *    graveyard."                                               Muldrotha, the Gravetide (1097)
 *   "Once during each of your turns, you may cast a creature
 *    spell from your graveyard."                               Karador, Ghost Chieftain
 *   "... a permanent spell with mana value 2 or less ..."      Lurrus of the Dream-Den
 *   "... a Dragon creature spell ..."                          Rivaz of the Claw
 *
 * The "during each of your turns" on Muldrotha is peeled by `peelCondition`
 * before this runs; the "once during" form is not, because it is a LIMIT and
 * not only a condition, and the sentence is read here with both.
 *
 * Three refusals, each because reading on would say something the card did
 * not:
 *
 *   - THE CARD ITSELF. "You may cast this card from your graveyard as long as
 *     you control a Zombie" (Gravecrawler) is an alternative way to cast one
 *     card, flashback without the name, and `GAP_SIGNALS` already files that
 *     wording as `alt-cast`. Reading it here would make every recursive
 *     creature look like a graveyard engine.
 *   - A SECOND SENTENCE. Kess, Dissident Mage adds "If a spell cast this way
 *     would be put into your graveyard, exile it instead", which is half of
 *     what she does. A static ability has no `manual` marker the way an
 *     effect does, so a paragraph is read whole or not at all, and the
 *     anchored match refuses the longer one.
 *   - AN ADDED COST. Exploration Broodship's "by sacrificing a land in
 *     addition to paying its other costs" ends the sentence with words nothing
 *     below consumes, and the same anchor refuses it.
 */
function parsePlayFromGraveyard(p: string): StaticShape | null {
  const m = p.match(/^(once during each of your turns, )?you may (play|cast) (.+?) from your graveyard$/);
  if (!m) return null;
  const once = Boolean(m[1]);
  const verb = m[2];
  const phrase = m[3];

  let filter: CardFilter | null;
  let limit: PlayFromLimit | undefined = once ? 'once-per-turn' : undefined;

  if (verb === 'play' && phrase === 'a land and cast a permanent spell of each permanent type') {
    // Muldrotha. "Of each permanent type" is the limit, and a land is one of
    // those types, so the whole permission is one selector over permanent
    // cards rather than a land half and a spell half.
    filter = anyOfTypes(PERMANENT_CARD_TYPES);
    limit = 'once-per-type-per-turn';
  } else if (verb === 'play') {
    // "lands", "a land", "Forests", "land cards".
    filter = bareCardsFilter(phrase.replace(/^an? /, ''));
  } else {
    // "a creature spell", "an instant or sorcery spell", "spells", "a
    // permanent spell with mana value 2 or less". The word "spell" is the
    // noun `parseObject` does not know, so it comes off here and the bound
    // that may follow it is read by the same helper `parseObject` uses.
    const spell = phrase.match(/^(?:an? )?(.*?)\s?spells?(?: with (mana value .+))?$/);
    if (!spell) return null;
    const bound = spell[2] ? parseManaValueBound(spell[2]) : null;
    if (spell[2] && !bound) return null;
    const head = spell[1];
    if (head === '') filter = notF({ is: 'type', value: 'land' });
    else if (head === 'permanent') filter = anyOfTypes(PERMANENT_SPELL_TYPES);
    else filter = bareCardsFilter(head);
    if (filter && bound) filter = andF(filter, bound);
  }
  if (!filter) return null;

  const rule: Restriction = {
    rule: 'may-play-from',
    who: { who: 'you' },
    from: 'graveyard',
    what: { sel: 'all', where: filter, zone: 'graveyard', controller: { who: 'you' } },
    ...(limit ? { limit } : {}),
  };
  return {
    affects: { sel: 'self' },
    modifications: [{ layer: 'restriction', rule }],
    // "During each of your turns" is in the sentence whenever the limit is,
    // and a permission that counts your turns is one that exists only on them.
    ...(once ? { condition: { if: 'your-turn' } as Condition } : {}),
  };
}

/**
 * A bare object phrase, "lands" or "dragon creature", as a card filter.
 * Anything with a target, a quantity, a zone or a controller in it was not a
 * bare phrase and is refused: the caller has already placed the cards.
 */
function bareCardsFilter(phrase: string): CardFilter | null {
  const ref = parseObject(phrase);
  if (!ref || ref.targeted || ref.upTo || ref.zone || ref.controller) return null;
  return ref.filter;
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

  /* "AS THIS LAND ENTERS, CHOOSE A CREATURE TYPE."
     ------------------------------------------------------------------
     Ninety-one cards, and until now every one of them produced NO RECORD AT
     ALL, because the compiler's gap table classified `^as ~ enters, choose` as
     `hidden-choice` alongside "name a card" and "separate into piles".

     That was too broad. Naming a card is hidden information with nowhere to
     live; choosing a creature type is written on the permanent for the table to
     read, and the only thing stopping the runtime offering it is that nobody
     has written the prompt. `parseChoiceSubject` refuses "a card name" so the
     genuine gap stays a gap.

     `additional` had a renderer and no producer before this. It is the right
     result: "as it enters" is not a trigger — it never uses the stack — and the
     choice is an extra thing that happens as the permanent arrives.

     It is worth reading long before the prompt exists. Fifty of these choose a
     CREATURE TYPE, which makes Shared Triumph, Circle of Solace, Roaming Throne
     and Secluded Courtyard tribal cards the deck builder can finally see. */
  const entersChoosing = p.match(
    new RegExp(`^as ~ enters,? (?:you )?choose (?:a |an )?(${CHOICE_SUBJECT_WORDS})(?: other than [a-z]+)?$`),
  );
  if (entersChoosing) {
    const what = parseChoiceSubject(entersChoosing[1]);
    if (what) {
      return {
        event: { on: 'enters', who: { sel: 'self' } },
        result: { do: 'additional', effects: [{ do: 'choose', who: { who: 'you' }, what }] },
        selfReplacement: true,
      };
    }
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

  /* "IF YOU TAP A PERMANENT FOR MANA, IT PRODUCES TWICE AS MUCH OF THAT MANA INSTEAD."
     Mana Reflection, Nyxbloom Ancient (three times), Virtue of Strength (a
     basic land). The event is the one Kinnan's trigger uses and the result is
     the `multiply` Doubling Season uses; nothing needed inventing. It is NOT
     read as a trigger that adds mana, and that is the point of routing it
     here: a replacement never uses the stack, and "twice as much" is a factor
     on whatever was made, not an amount the record could name. */
  const manaMultiplier = p.match(
    /^if (you|a player|an opponent) taps? (.+?) for mana, it produces (twice|three times) as much of that mana instead$/,
  );
  if (manaMultiplier) {
    const ref = parseObject(manaMultiplier[2]);
    if (ref && !ref.targeted && !ref.upTo) {
      const by: PlayerSelector =
        manaMultiplier[1] === 'you' ? { who: 'you' }
        : manaMultiplier[1] === 'an opponent' ? { who: 'each-opponent' }
        : { who: 'each-player' };
      return {
        event: { on: 'tapped-for-mana', who: objectSelector(ref), by },
        result: { do: 'multiply', factor: manaMultiplier[3] === 'twice' ? 2 : 3 },
        selfReplacement: false,
      };
    }
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
