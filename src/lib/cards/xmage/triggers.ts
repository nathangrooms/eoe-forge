/**
 * XMage triggered-ability classes as `dsl.ts` `TriggerEvent` values.
 *
 * Behaviour here is derived from **XMage**, which is MIT licensed,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
 * Read in place, never vendored. Forge is GPL-3.0 and was not fetched, read or
 * referenced.
 *
 * ## Where the event lives, and why it is not a field
 *
 * `record.ts` puts a triggered ability's event in `via`, the ability class
 * itself, because in the source that is where it is. XMage does not carry an
 * event object; it carries `EntersBattlefieldTriggeredAbility`. So this file is
 * the mapping from the class to the event, and nothing upstream had to invent a
 * field for it.
 *
 * ## Scale
 *
 * `scripts/coverage/.data/xmage-effect-rank.all.json` counts **296 distinct
 * triggered-ability classes**. The top ten cover 59.5% of the cards that have a
 * trigger and the top twenty cover 68.3%. The entries below are that head plus
 * the ones whose event `dsl.ts` already names exactly.
 *
 * ## The defaults are read out of XMage, not assumed
 *
 * `BeginningOfUpkeepTriggeredAbility(effect)` delegates to
 * `(TargetController.YOU, effect, false)`, so its default is YOUR upkeep, and
 * that was checked in BeginningOfUpkeepTriggeredAbility.java rather than
 * guessed from the name. `DiesCreatureTriggeredAbility(effect, optional,
 * another)` adds `AnotherPredicate` when `another` is true, which is
 * `{is:'other'}` here. Getting either default wrong makes a card fire on the
 * wrong turn or on itself, and neither shows up as an error.
 */

import type { CardFilter, PlayerSelector, Selector, Step, TriggerEvent, Zone } from '../abilities/dsl.ts';
import { type AbilityRecord, type Invocation, arg } from './record.ts';

const SELF: Selector = { sel: 'self' };
const CREATURE: CardFilter = { is: 'type', value: 'Creature' };

function boolArg(invocation: Invocation, name: string): boolean | undefined {
  const value = arg(invocation, name)?.value;
  return value?.k === 'bool' ? value.b : undefined;
}

/**
 * A player argument XMage spells as `TargetController`, or `null` when the card
 * wrote one this port could not read.
 *
 * `undefined` and `null` are different answers and the difference is load
 * bearing, exactly as in `filterSelector` below: `undefined` means the card
 * passed no controller and the class's own default applies; `null` means it
 * passed one the record left CARRIED, and substituting the default in that case
 * silently narrows the trigger.
 *
 * This used to return `undefined` for both, and every caller then wrote
 * `?? { who: 'you' }`. Fevered Visions prints "At the beginning of each
 * player's end step, that player draws a card" and was firing on YOUR end step
 * alone, so at a four-player table it did a quarter of what it says. It RAN, so
 * nothing downstream could see it. Found by hand check;
 * `scripts/xmage/port-refute-controller-census.mjs` counts the rest.
 */
function whoseArg(invocation: Invocation, name = 'targetController'): PlayerSelector | null | undefined {
  const slot = arg(invocation, name);
  if (!slot) return undefined;
  return slot.value?.k === 'players' ? slot.value.who : null;
}

/** A step trigger, refused whole when its controller argument did not resolve. */
function stepTrigger(invocation: Invocation, step: Step): TriggerEvent | null {
  const read = whoseArg(invocation);
  if (read === null) return null;
  return { on: 'step', step, whose: read ?? { who: 'you' } };
}

/**
 * A filter argument as a selector over the battlefield, or `null` when the
 * argument is present and did not resolve.
 *
 * `undefined` and `null` are different answers here and the difference is load
 * bearing: `undefined` means the card did not pass a filter and the class's own
 * default applies; `null` means it passed one this port could not read, and
 * falling back to the default in that case would widen the trigger to fire on
 * permanents the card does not mention.
 */
function filterSelector(
  invocation: Invocation,
  name: string,
  zone: Zone = 'battlefield',
): Selector | null | undefined {
  const slot = arg(invocation, name);
  if (!slot) return undefined;
  if (slot.value?.k !== 'objects') return null;
  const sel: Selector = { sel: 'all', where: slot.value.filter, zone: slot.value.zone ?? zone };
  if (slot.value.controller) (sel as { controller?: PlayerSelector }).controller = slot.value.controller;
  return sel;
}

export interface TriggerLowering {
  ok: boolean;
  event?: TriggerEvent;
  optional?: boolean;
  missing?: string;
  why?: string;
}

export type TriggerRule = (invocation: Invocation) => TriggerEvent | null;

/** Counts are cards, from `xmage-effect-rank.all.json`. */
export const TRIGGER_RULES: Record<string, TriggerRule> = {
  /** 4,206 cards, the single most common ability class in the corpus. */
  'xmage:EntersBattlefieldTriggeredAbility': () => ({ on: 'enters', who: SELF }),

  /** 982. Your upkeep unless the card says otherwise. */
  'xmage:BeginningOfUpkeepTriggeredAbility': (invocation) => stepTrigger(invocation, 'upkeep'),

  /** 602. */
  'xmage:BeginningOfEndStepTriggeredAbility': (invocation) => stepTrigger(invocation, 'end'),

  /** 322. */
  'xmage:BeginningOfCombatTriggeredAbility': (invocation) =>
    stepTrigger(invocation, 'begin_combat' as Step),

  /** 976. */
  'xmage:AttacksTriggeredAbility': () => ({ on: 'attacks', who: SELF }),

  /** 623. */
  'xmage:DiesSourceTriggeredAbility': () => ({ on: 'dies', who: SELF }),

  /** 138. */
  'xmage:LeavesBattlefieldTriggeredAbility': () => ({ on: 'leaves', who: SELF, from: 'battlefield' }),

  /** 84. */
  'xmage:CastSourceTriggeredAbility': () => ({ on: 'cast', what: SELF }),

  /** 63. */
  'xmage:BecomesTappedSourceTriggeredAbility': () => ({ on: 'tapped', who: SELF }),

  /** 60. */
  'xmage:BecomesBlockedSourceTriggeredAbility': () => ({ on: 'becomes-blocked', who: SELF }),

  /** 71. */
  'xmage:DealtDamageToSourceTriggeredAbility': () => ({ on: 'dealt-damage', who: SELF }),

  /** 484. Combat damage only, and to a player, which are two separate flags. */
  'xmage:DealsCombatDamageToAPlayerTriggeredAbility': () => ({
    on: 'deals-damage',
    source: SELF,
    to: 'player',
    combatOnly: true,
  }),

  /**
   * 306. `another` is a constructor flag, not a filter, and it adds
   * `AnotherPredicate` inside XMage. `{is:'other'}` is the same idea in
   * `dsl.ts`. Without it a card that triggers when another creature dies would
   * also trigger on itself, which is a real and common misprint.
   */
  'xmage:DiesCreatureTriggeredAbility': (invocation) => {
    const explicit = filterSelector(invocation, 'filter');
    if (explicit === null) return null;
    if (explicit) return { on: 'dies', who: explicit };
    const another = boolArg(invocation, 'another') === true;
    const where: CardFilter = another ? { is: 'and', of: [CREATURE, { is: 'other' }] } : CREATURE;
    return { on: 'dies', who: { sel: 'all', where, zone: 'battlefield' } };
  },

  /** 255. Something you control entering. */
  'xmage:EntersBattlefieldControlledTriggeredAbility': (invocation) => {
    const what = filterSelector(invocation, 'filter');
    if (!what) return null;
    return { on: 'enters', who: { ...what, controller: (what as { controller?: PlayerSelector }).controller ?? { who: 'you' } } as Selector };
  },

  /** 206. Anything entering, whoever controls it. */
  'xmage:EntersBattlefieldAllTriggeredAbility': (invocation) => {
    const what = filterSelector(invocation, 'filter');
    if (!what) return null;
    return { on: 'enters', who: what };
  },

  /** 177. A land entering under your control. */
  'xmage:LandfallAbility': () => ({
    on: 'enters',
    who: { sel: 'all', where: { is: 'type', value: 'Land' }, zone: 'battlefield', controller: { who: 'you' } },
  }),

  /** 710. */
  'xmage:SpellCastControllerTriggeredAbility': (invocation) => {
    const what = filterSelector(invocation, 'filter', 'stack');
    if (what === null) return null;
    return { on: 'cast', what: what ?? { sel: 'all', where: { is: 'any' }, zone: 'stack' }, by: { who: 'you' } };
  },

  /** 82. */
  'xmage:SpellCastOpponentTriggeredAbility': (invocation) => {
    const what = filterSelector(invocation, 'filter', 'stack');
    if (what === null) return null;
    return {
      on: 'cast',
      what: what ?? { sel: 'all', where: { is: 'any' }, zone: 'stack' },
      by: { who: 'each-opponent' },
    };
  },

  /** 77. */
  'xmage:SpellCastAllTriggeredAbility': (invocation) => {
    const what = filterSelector(invocation, 'filter', 'stack');
    if (what === null) return null;
    return { on: 'cast', what: what ?? { sel: 'all', where: { is: 'any' }, zone: 'stack' } };
  },

  /** 78. */
  'xmage:GainLifeControllerTriggeredAbility': () => ({ on: 'gains-life', whose: { who: 'you' } }),

  /** 90. */
  'xmage:SacrificePermanentTriggeredAbility': (invocation) => {
    const what = filterSelector(invocation, 'filter');
    if (what === null) return null;
    return { on: 'sacrificed', who: what ?? { sel: 'all', where: { is: 'any' }, zone: 'battlefield', controller: { who: 'you' } } };
  },
};

/**
 * Trigger classes deliberately left out, with the reason. Counts are cards.
 *
 * The recurring theme is that `TriggeredAbility` in `dsl.ts` holds ONE event.
 * A class that fires on either of two events is not expressible, and picking
 * one of the two would produce a card that misses half its triggers with no
 * sign that it did.
 */
export const REFUSED_TRIGGERS: Record<string, string> = {
  'xmage:EntersBattlefieldOrAttacksSourceTriggeredAbility':
    '148 cards. Two events, one `TriggeredAbility`. Choosing one silently halves the card.',
  'xmage:AttacksOrBlocksTriggeredAbility': '59 cards. Same.',
  'xmage:OrTriggeredAbility': '72 cards. Same, generalised.',
  'xmage:EntersBattlefieldThisOrAnotherTriggeredAbility': '97 cards. Same.',
  'xmage:ReflexiveTriggeredAbility':
    '142 cards. A trigger another effect creates while resolving. It is not an ability of the card until that effect runs.',
  'xmage:AtTheBeginOfNextUpkeepDelayedTriggeredAbility':
    '57 cards. A delayed trigger, which exists only after something set it up. Same reason.',
  'xmage:CumulativeUpkeepAbility': '83 cards. An upkeep cost with an age counter and a sacrifice on refusal.',
  'xmage:TurnedFaceUpSourceTriggeredAbility': '91 cards. Face-down permanents are outside the record.',
  'xmage:CycleTriggeredAbility': '56 cards. Depends on cycling, which is a refused keyword.',
  'xmage:ProwessAbility': '86 cards. XMage models prowess as a trigger class; it is a keyword and is refused there too.',
  'xmage:DrawNthCardTriggeredAbility':
    '66 cards. "The second card you draw each turn" needs a per-turn count of draws, which is a `{v:"watch"}` query nothing evaluates yet.',
  'xmage:AttacksWithCreaturesTriggeredAbility':
    '163 cards. Fires on attacking with N or more creatures, which is a threshold on the attack event that `TriggerEvent` does not carry.',
};

/**
 * The event a triggered ability fires on, plus whether it is optional.
 *
 * `WardAbility` is in the corpus as a triggered ability class and is handled as
 * a keyword instead, because that is what the card prints. Where XMage's class
 * hierarchy and the printed card disagree, the card wins.
 */
export function lowerTrigger(ability: AbilityRecord): TriggerLowering {
  const invocation = ability.via;
  const refused = REFUSED_TRIGGERS[invocation.prim];
  if (refused) return { ok: false, missing: invocation.prim, why: refused };

  const rule = TRIGGER_RULES[invocation.prim];
  if (!rule) return { ok: false, missing: invocation.prim, why: 'no entry in the trigger table' };

  const event = rule(invocation);
  if (!event) {
    // No `missing`, for the same reason `targets.ts` gives: the class has an
    // entry and this card's arguments did not resolve. Counting it as a missing
    // primitive would put a class that is already written at the top of the
    // work order.
    return { ok: false, why: 'the trigger arguments did not resolve into an event' };
  }
  return { ok: true, event, optional: boolArg(invocation, 'optional') === true };
}
