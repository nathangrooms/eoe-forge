/**
 * XMage `DynamicValue` classes as `dsl.ts` `ValueExpr` trees.
 *
 * Behaviour here is derived from **XMage**, which is MIT licensed,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
 * The XMage clone is read in place, outside this repository, and nothing from
 * it is vendored here. Forge is GPL-3.0 and was not fetched, read or
 * referenced.
 *
 * ## Why this table is small and stays small
 *
 * `scripts/xmage/census.mjs values` counted **30 distinct dynamic value
 * classes** across all 32,168 card files, and the top three cover 71.7% of the
 * cards that use one. That is the whole reason a quantity is worth resolving:
 * thirty entries reach almost every card that counts something.
 *
 * ## The rule every entry follows
 *
 * A value that cannot be expressed returns `null`. It never returns 1, never
 * returns 0, and never falls back to `{v:'x'}`. `amount ?? 1` is the failure
 * this project already paid for twice: Dockside Extortionist would create one
 * Treasure and look like it worked. A caller that gets `null` must refuse the
 * whole effect.
 */

import type { ValueExpr, Selector, CardFilter, PlayerSelector } from '../abilities/dsl.ts';
import { type Invocation, type Slot, arg } from './record.ts';
import { XMAGE_COUNTERS } from './counters.generated.ts';

/** A resolved objects argument, in the shape `Value` `{k:'objects'}` carries. */
interface Objects {
  filter: CardFilter;
  controller?: PlayerSelector;
  zone?: string;
}

function objectsArg(invocation: Invocation, name: string): Objects | null {
  const value = arg(invocation, name)?.value;
  if (value?.k !== 'objects') return null;
  return { filter: value.filter, controller: value.controller, zone: value.zone };
}

function selectorFrom(objects: Objects, zone: 'battlefield' | 'graveyard'): Selector {
  const sel: Selector = { sel: 'all', where: objects.filter, zone: (objects.zone as never) ?? zone };
  if (objects.controller) (sel as { controller?: PlayerSelector }).controller = objects.controller;
  return sel;
}

function intArg(invocation: Invocation, name: string): number | null {
  const value = arg(invocation, name)?.value;
  return value?.k === 'int' ? value.n : null;
}

/**
 * The counter name a `CounterType` reference stands for.
 *
 * XMage writes the counter as `CounterType.P1P1.createInstance()`, which the
 * extraction records as a static factory on the enum member. The member is
 * `P1P1`; the counter is `+1/+1`. `counters.generated.ts` holds all 234
 * mappings, read out of XMage's own enum.
 *
 * The factory's ARGUMENTS matter too, and this is where a silent bug lived:
 * `createInstance(2)` builds a counter whose own count is two, and
 * `AddCountersSourceEffect` reads that count rather than its `amount`
 * parameter. `scripts/xmage/build-records.mjs` was dropping those arguments, so
 * every "two +1/+1 counters" card read as one. It now keeps them and this
 * returns both parts.
 */
export function counterFrom(slot: Slot | undefined): { counter: string; count: number } | null {
  if (!slot) return null;
  const carried = slot.carried;
  if (carried?.c === 'factory' && carried.method === 'createInstance') {
    const name = XMAGE_COUNTERS[carried.on];
    if (!name) return null;
    const first = carried.args?.[0]?.value;
    const count = first?.k === 'int' ? first.n : 1;
    return { counter: name, count };
  }
  if (carried?.c === 'enum' && carried.enumName === 'CounterType') {
    const name = XMAGE_COUNTERS[carried.member];
    return name ? { counter: name, count: 1 } : null;
  }
  return null;
}

/**
 * One dynamic value class, given its invocation, as a `ValueExpr`.
 *
 * Returning `null` is a real answer and the only safe one for a class not in
 * the table.
 */
export type ValueRule = (invocation: Invocation) => ValueExpr | null;

export const VALUE_RULES: Record<string, ValueRule> = {
  /**
   * 573 cards. Counts permanents on the battlefield matching a filter.
   *
   * The no-argument form counts EVERY permanent, not every permanent you
   * control: XMage passes `new FilterPermanent()` and the controller id it also
   * passes is used only by predicates that ask for it. Reading it as "yours"
   * would halve the count on every card that uses it.
   */
  'xmage:PermanentsOnBattlefieldCount': (invocation) => {
    const objects = objectsArg(invocation, 'filter');
    const where: CardFilter = objects ? objects.filter : { is: 'any' };
    const sel: Selector = { sel: 'all', where, zone: 'battlefield' };
    if (objects?.controller) (sel as { controller?: PlayerSelector }).controller = objects.controller;
    // A filter argument that did not resolve is not "no filter". It is an
    // unknown narrowing, and treating it as none counts every permanent.
    if (invocation.args.some((a) => a.name === 'filter' && a.value === undefined)) return null;
    const base: ValueExpr = { v: 'count', of: sel };
    const multiplier = intArg(invocation, 'multiplier');
    return multiplier === null || multiplier === 1 ? base : { v: 'mul', of: [base, multiplier] };
  },

  /** 184 cards. Counters of one kind on the source permanent. */
  'xmage:CountersSourceCount': (invocation) => {
    const counter = counterFrom(arg(invocation, 'counterType'));
    if (!counter) return null;
    return { v: 'counters', of: { sel: 'self' }, counter: counter.counter };
  },

  /**
   * 163 cards. Cards in your graveyard.
   *
   * `dsl.ts`'s `{v:'cards-in'}` counts a zone with no filter, so a filtered
   * form is refused rather than counted as if the filter were not there. The
   * unfiltered default, `StaticFilters.FILTER_CARD`, is the common case.
   *
   * ## THE MULTIPLIER IS THE SIGN, and the filtered branch used to skip it
   *
   * `CardsInControllerGraveyardCount(filter, multiplier)` multiplies the count,
   * checked in that file's `calculate`, and a multiplier of -1 is how XMage
   * writes "gets -X/-X where X is ...". This reader had the multiplier line
   * AFTER an early return for the filtered form, so Terror Tide's
   * "All creatures get -X/-X until end of turn, where X is the number of
   * permanent cards in your graveyard" came out as +X/+X and every creature on
   * the table grew instead of dying. The multiplier is now read once, before
   * the branch, and applied to whichever shape comes out.
   */
  'xmage:CardsInControllerGraveyardCount': (invocation) => {
    const objects = objectsArg(invocation, 'filter');
    const filtered = objects && objects.filter.is !== 'any';
    const multiplier = intArg(invocation, 'multiplier');
    const scaled = (base: ValueExpr): ValueExpr =>
      multiplier === null || multiplier === 1 ? base : { v: 'mul', of: [base, multiplier] };
    if (filtered) {
      const sel: Selector = { sel: 'all', where: objects.filter, zone: 'graveyard', controller: { who: 'you' } };
      return scaled({ v: 'count', of: sel });
    }
    if (invocation.args.some((a) => a.name === 'filter' && a.value === undefined)) return null;
    return scaled({ v: 'cards-in', zone: 'graveyard', of: { who: 'you' } });
  },

  /** 70 cards. */
  'xmage:MultipliedValue': (invocation) => {
    const inner = lowerValueSlot(arg(invocation, 'value'));
    const multiplier = intArg(invocation, 'multiplier');
    if (inner === null || multiplier === null) return null;
    return { v: 'mul', of: [inner, multiplier] };
  },

  /**
   * 68 cards. Negates a value, which is how "gets -X/-X where X is ..." is
   * written. `{v:'sub'}` from zero, because `dsl.ts` has no unary minus and
   * inventing one would be a second spelling of the same idea.
   */
  'xmage:SignInversionDynamicValue': (invocation) => {
    const inner = lowerValueSlot(arg(invocation, 'value'));
    if (inner === null) return null;
    return { v: 'sub', a: 0, b: inner };
  },

  /** 37 cards. */
  'xmage:IntPlusDynamicValue': (invocation) => {
    const base = intArg(invocation, 'baseValue');
    const inner = lowerValueSlot(arg(invocation, 'value'));
    if (base === null || inner === null) return null;
    return { v: 'add', of: [base, inner] };
  },

  /** 26 cards. A varargs list of values, summed. */
  'xmage:AdditiveDynamicValue': (invocation) => {
    const slot = arg(invocation, 'dynamicValues');
    const list = slot?.value?.k === 'list' ? slot.value.items : null;
    if (!list) return null;
    const parts: ValueExpr[] = [];
    for (const item of list) {
      const one = lowerValueSlot({ value: item });
      if (one === null) return null;
      parts.push(one);
    }
    return parts.length > 0 ? { v: 'add', of: parts } : null;
  },

  /** 17 cards. Attacking creatures, on the battlefield, whoever controls them. */
  'xmage:AttackingCreatureCount': (invocation) => {
    const objects = objectsArg(invocation, 'filter');
    const where: CardFilter = objects
      ? objects.filter
      : { is: 'and', of: [{ is: 'type', value: 'Creature' }, { is: 'attacking' }] };
    if (invocation.args.some((a) => a.name === 'filter' && a.value === undefined)) return null;
    const sel: Selector = { sel: 'all', where, zone: 'battlefield' };
    if (objects?.controller) (sel as { controller?: PlayerSelector }).controller = objects.controller;
    return { v: 'count', of: sel };
  },

};

/**
 * Classes deliberately left out, with the reason, so the gap is a decision and
 * not an omission. Counts are cards, from `scripts/xmage/census.mjs values`.
 */
export const REFUSED_VALUES: Record<string, string> = {
  'xmage:HalfValue':
    '9 cards. Halving rounds up or down and `dsl.ts` division has no rounding mode, so the result would be wrong by one on half the cards that use it.',
  'xmage:CardsInAllGraveyardsCount':
    '27 cards. `{v:"cards-in"}` takes one player selector; summing across every graveyard is not the same question and guessing which one is meant would be inventing.',
  'xmage:ColorsOfManaSpentToCastCount':
    '23 cards. Needs the mana spent on the spell, which is history the record does not hold and `{v:"watch"}` does not record.',
  'xmage:GreatestAmongPermanentsValue':
    '10 cards. A maximum over a computed attribute of a set; `{v:"max"}` takes a fixed list of expressions, not a fold over a selector.',
  'xmage:EffectKeyValue':
    '9 cards. Reads a value another effect stashed under a string key. That is a channel between effects the DSL deliberately does not have.',
  'xmage:EquipmentAttachedCount':
    "10 cards. It had an entry and the entry was wrong TWICE, found by hand-checking Goblin Gaveleer: \"This creature gets +2/+0 for each Equipment attached to it\" was counting every Equipment on the battlefield rather than the ones attached to this creature, and was dropping the class's `multiplier` argument, so a Gaveleer wearing one Equipment while an opponent wore three read +4/+0 instead of +2/+0. No `Selector` means \"objects attached to the source\". `{sel:'attached'}` points the other way, at what this card is attached TO. So the set cannot be spelled, and a quantity wrong in two directions at once is exactly what this file refuses for.",
};

/**
 * Any slot that should hold a quantity, as a `ValueExpr`.
 *
 * This is the single entry point, and it is deliberately the only one: a
 * literal, a dynamic value construction, `{X}`, and a `StaticValue` all mean
 * "how many" and all four appear in the same argument position across the
 * corpus. Handling them in one place is what stops a lowering from resolving
 * three of the four and refusing the card on the fourth.
 */
export function lowerValueSlot(slot: Slot | undefined): ValueExpr | null {
  if (!slot) return null;
  const value = slot.value;
  if (value?.k === 'int') return value.n;
  if (value?.k === 'amount') return value.expr;
  if (value?.k === 'invoke') return lowerValueInvocation(value.invocation);

  const carried = slot.carried;
  // `GetXValue.instance` is the {X} in the spell's own cost.
  if (carried?.c === 'enum' && carried.enumName === 'GetXValue') return { v: 'x' };
  if (carried?.c === 'factory' && carried.on === 'GetXValue') return { v: 'x' };
  // `StaticValue.get(2)` is a literal wearing a class.
  if (carried?.c === 'factory' && carried.on === 'StaticValue' && carried.method === 'get') {
    const first = carried.args?.[0]?.value;
    if (first?.k === 'int') return first.n;
  }
  return null;
}

export function lowerValueInvocation(invocation: Invocation): ValueExpr | null {
  if (invocation.prim === 'xmage:StaticValue') {
    const value = arg(invocation, 'value')?.value;
    return value?.k === 'int' ? value.n : null;
  }
  const rule = VALUE_RULES[invocation.prim];
  return rule ? rule(invocation) : null;
}
