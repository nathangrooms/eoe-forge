/**
 * XMage `Cost` classes as `dsl.ts` `Cost` values.
 *
 * Behaviour here is derived from **XMage**, which is MIT licensed,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
 * Read in place, never vendored. Forge is GPL-3.0 and was not fetched, read or
 * referenced.
 *
 * ## Why costs are all or nothing
 *
 * An activated ability whose cost list is short by one entry is an ability a
 * player activates for less than the card says. That is not a display bug: it
 * changes what the game allows. So a cost class with no entry here refuses the
 * whole ability rather than contributing what it can.
 *
 * `scripts/xmage/census.mjs costs` counted **133 distinct cost classes** over
 * all 32,168 card files. The top six cover 82.1% of the cards that pay
 * anything, and mana costs sit outside that census because XMage models them as
 * a separate class.
 */

import type { Cost, PlayerSelector, Selector, ValueExpr, Zone } from '../abilities/dsl.ts';
import { type Invocation, arg } from './record.ts';
import { counterFrom, lowerValueSlot } from './values.ts';

function objectsSelector(invocation: Invocation, name: string, defaultZone: Zone): Selector | null {
  const value = arg(invocation, name)?.value;
  if (value?.k !== 'objects') return null;
  const sel: Selector = { sel: 'all', where: value.filter, zone: value.zone ?? defaultZone };
  if (value.controller) (sel as { controller?: PlayerSelector }).controller = value.controller;
  return sel;
}

/**
 * A cost whose object is given as a nested `Target` construction rather than as
 * a filter. `SacrificeTargetCost(new TargetSacrifice(...))` is the shape.
 */
function selectorFromTargetArg(invocation: Invocation, name: string, defaultZone: Zone): Selector | null {
  const value = arg(invocation, name)?.value;
  if (value?.k !== 'invoke') return null;
  const inner = value.invocation;
  const filter = arg(inner, 'filter')?.value;
  if (filter?.k !== 'objects') return null;
  const sel: Selector = { sel: 'all', where: filter.filter, zone: filter.zone ?? defaultZone };
  if (filter.controller) (sel as { controller?: PlayerSelector }).controller = filter.controller;
  return sel;
}

function intArg(invocation: Invocation, name: string): number | undefined {
  const value = arg(invocation, name)?.value;
  return value?.k === 'int' ? value.n : undefined;
}

/**
 * XMage's `ColoredManaSymbol` enum members, which are the LETTERS `W U B R G`
 * and not the colour words. This table first read `WHITE`, `BLUE` and so on,
 * which matched nothing and refused Shivan Dragon's "{R}: Shivan Dragon gets
 * +1/+0" along with every other single-coloured activation cost. It was caught
 * by putting a real card through the pipeline, not by reading the code.
 *
 * `O` is XMage's gold symbol and has no Scryfall spelling, so it is absent and
 * refuses rather than being mapped onto something.
 */
const COLOR_SYMBOL: Record<string, string> = { W: '{W}', U: '{U}', B: '{B}', R: '{R}', G: '{G}' };

export type CostRule = (invocation: Invocation) => Cost[] | null;

/**
 * Counts are cards, from `scripts/xmage/census.mjs costs`.
 */
export const COST_RULES: Record<string, CostRule> = {
  /* mana. XMage keeps these outside the Cost hierarchy, which is why they are
   * not in the cost census, and why forgetting them would silently make every
   * activated ability free. */
  'xmage:ManaCostsImpl': (invocation) => {
    const value = arg(invocation, 'mana')?.value;
    return value?.k === 'mana' ? [{ pay: 'mana', cost: value.cost }] : null;
  },
  'xmage:GenericManaCost': (invocation) => {
    const n = intArg(invocation, 'mana');
    return n === undefined ? null : [{ pay: 'mana', cost: `{${n}}` }];
  },
  'xmage:ColoredManaCost': (invocation) => {
    const slot = arg(invocation, 'mana');
    const member = slot?.carried?.c === 'enum' ? slot.carried.member : null;
    const symbol = member ? COLOR_SYMBOL[member] : null;
    return symbol ? [{ pay: 'mana', cost: symbol }] : null;
  },

  'xmage:TapSourceCost': () => [{ pay: 'tap' }], // 3,303
  'xmage:UntapSourceCost': () => [{ pay: 'untap' }], // 18
  'xmage:SacrificeSourceCost': () => [{ pay: 'sacrifice', what: { sel: 'self' }, count: 1 }], // 1,030

  /** 1,013 cards. Sacrifice something you control matching a filter. */
  'xmage:SacrificeTargetCost': (invocation) => {
    const what =
      objectsSelector(invocation, 'filter', 'battlefield') ??
      selectorFromTargetArg(invocation, 'target', 'battlefield');
    if (!what) return null;
    return [{ pay: 'sacrifice', what, count: intArg(invocation, 'numToSac') ?? 1 }];
  },

  /**
   * 385 cards. `DiscardCardCost()` is one card of the player's choice, so there
   * is no `what`: `Cost`'s `what` is optional precisely for this.
   */
  'xmage:DiscardCardCost': (invocation) => {
    const filter = objectsSelector(invocation, 'filter', 'hand');
    const random = arg(invocation, 'randomDiscard')?.value;
    const cost: Cost = { pay: 'discard', count: 1 };
    if (filter) (cost as { what?: Selector }).what = filter;
    if (random?.k === 'bool' && random.b) (cost as { random?: boolean }).random = true;
    return [cost];
  },

  /** 98 cards. */
  'xmage:DiscardTargetCost': (invocation) => {
    const what = selectorFromTargetArg(invocation, 'target', 'hand');
    const cost: Cost = { pay: 'discard', count: 1 };
    if (what) (cost as { what?: Selector }).what = what;
    return [cost];
  },

  /** 21 cards. Your whole hand, which is a count the DSL can express. */
  'xmage:DiscardHandCost': () => [
    { pay: 'discard', count: { v: 'cards-in', zone: 'hand', of: { who: 'you' } } as ValueExpr },
  ],

  /** 261 cards. */
  'xmage:PayLifeCost': (invocation) => {
    const amount = lowerValueSlot(arg(invocation, 'amount'));
    return amount === null ? null : [{ pay: 'life', amount }];
  },

  /**
   * 279 cards, and only the form that names the counter.
   *
   * `RemoveCountersSourceCost(int)` removes that many counters of ANY kind,
   * checked in RemoveCountersSourceCost.java. `dsl.ts` names the counter, so
   * that form is refused rather than filled in with `+1/+1`, which would be
   * right on most cards and wrong on the ones people play for it.
   */
  'xmage:RemoveCountersSourceCost': (invocation) => {
    const counter = counterFrom(arg(invocation, 'counter'));
    if (!counter) return null;
    return [{ pay: 'remove-counters', counter: counter.counter, count: counter.count, from: { sel: 'self' } }];
  },

  /** 194 cards. Tap other permanents you control. */
  'xmage:TapTargetCost': (invocation) => {
    const what =
      objectsSelector(invocation, 'filter', 'battlefield') ??
      selectorFromTargetArg(invocation, 'target', 'battlefield');
    if (!what) return null;
    const count = intArg(invocation, 'amount') ?? intArg(invocation, 'minAmount') ?? 1;
    return [{ pay: 'tap-others', what, count }];
  },

  /** 113 cards. */
  'xmage:ExileFromGraveCost': (invocation) => {
    const what = selectorFromTargetArg(invocation, 'target', 'graveyard') ?? {
      sel: 'all',
      where: { is: 'any' },
      zone: 'graveyard',
      controller: { who: 'you' },
    };
    return [{ pay: 'exile', from: 'graveyard', what, count: 1 }];
  },

  /** 81 cards. */
  'xmage:ExileSourceFromGraveCost': () => [
    { pay: 'exile', from: 'graveyard', what: { sel: 'self' }, count: 1 },
  ],

  /** 62 cards. */
  'xmage:ExileSourceCost': () => [{ pay: 'exile', from: 'battlefield', what: { sel: 'self' }, count: 1 }],

  /** 72 cards. */
  'xmage:ReturnToHandChosenControlledPermanentCost': (invocation) => {
    const what = selectorFromTargetArg(invocation, 'target', 'battlefield') ?? {
      sel: 'all',
      where: { is: 'any' },
      zone: 'battlefield',
      controller: { who: 'you' },
    };
    return [{ pay: 'return-to-hand', what, count: 1 }];
  },

  /** 45 cards. */
  'xmage:RevealTargetFromHandCost': (invocation) => {
    const what = selectorFromTargetArg(invocation, 'target', 'hand') ?? {
      sel: 'all',
      where: { is: 'any' },
      zone: 'hand',
      controller: { who: 'you' },
    };
    return [{ pay: 'reveal', what, count: 1 }];
  },

  /** 16 cards. */
  'xmage:ReturnToHandFromBattlefieldSourceCost': () => [
    { pay: 'return-to-hand', what: { sel: 'self' }, count: 1 },
  ],
};

/** Cost classes deliberately left out, with the reason. Counts are cards. */
export const REFUSED_COSTS: Record<string, string> = {
  'xmage:PayEnergyCost':
    '96 cards. Energy is a player counter `dsl.ts` has (`player-counter`) but `Cost` has no member for spending one, and spending is not the same as adding a negative amount.',
  'xmage:OrCost':
    '74 cards. `Cost[]` is a conjunction. An alternative between two costs needs a member the DSL does not have, and picking one of the two would let a player pay the cheaper one always.',
  'xmage:CompositeCost':
    '45 cards. A nested cost tree whose parts include costs not in this table; flattening it would drop the parts that are missing.',
  'xmage:RemoveVariableCountersSourceCost':
    '42 cards. The player chooses how many to remove and that number becomes X, which links a cost to a value elsewhere in the ability. The record has no such link.',
  'xmage:BlightCost': '16 cards. Bespoke to one mechanic.',
  'xmage:CollectEvidenceCost': '13 cards. Exiles cards until their total mana value reaches a threshold.',
};

export interface CostLowering {
  ok: boolean;
  costs: Cost[];
  missing: string[];
  refused: Array<{ prim: string; why: string }>;
}

/**
 * Every cost of an ability, or the reasons it cannot be paid as written.
 *
 * All or nothing, because a partly lowered cost is a discount.
 */
export function lowerCosts(invocations: readonly Invocation[]): CostLowering {
  const costs: Cost[] = [];
  const missing: string[] = [];
  const refused: Array<{ prim: string; why: string }> = [];
  for (const invocation of invocations) {
    const why = REFUSED_COSTS[invocation.prim];
    if (why) {
      missing.push(invocation.prim);
      refused.push({ prim: invocation.prim, why });
      continue;
    }
    const rule = COST_RULES[invocation.prim];
    if (!rule) {
      missing.push(invocation.prim);
      continue;
    }
    const produced = rule(invocation);
    if (produced === null) {
      refused.push({ prim: invocation.prim, why: 'arguments did not resolve into a cost' });
      continue;
    }
    costs.push(...produced);
  }
  return { ok: missing.length === 0 && refused.length === 0, costs, missing, refused };
}
