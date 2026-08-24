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
import { type Invocation, type PrimId, arg } from './record.ts';
import { counterFrom, lowerValueSlot } from './values.ts';

function objectsSelector(invocation: Invocation, name: string, defaultZone: Zone): Selector | null {
  const value = arg(invocation, name)?.value;
  if (value?.k !== 'objects') return null;
  const sel: Selector = { sel: 'all', where: value.filter, zone: value.zone ?? defaultZone };
  if (value.controller) (sel as { controller?: PlayerSelector }).controller = value.controller;
  return sel;
}

/**
 * TRUE when the card WROTE a filter here and this port could not read it.
 *
 * `objectsSelector` returns null for two different facts and only one of them
 * is safe. "No filter argument" means the cost is over anything, which is what
 * `DiscardCardCost()` genuinely means. "A filter argument that arrived CARRIED"
 * means XMage narrowed the cost and the narrowing is a Java predicate this port
 * has not mapped, and reading that as "anything" makes the cost CHEAPER than
 * the printed card. Sanctum Spirit prints "Discard a historic card" and was
 * lowering to "discard a card", so any card in hand paid for indestructible.
 *
 * `values.ts` already draws this distinction for `PermanentsOnBattlefieldCount`
 * and it is the same distinction: an unreadable narrowing is a hole, never an
 * absence.
 */
function filterIsWrittenButUnread(invocation: Invocation, name: string): boolean {
  const slot = arg(invocation, name);
  return !!slot && slot.value === undefined && slot.carried !== undefined;
}

/**
 * A cost whose object is given as a nested `Target` construction rather than as
 * a filter. `SacrificeTargetCost(new TargetSacrifice(...))` is the shape.
 */
/**
 * Target classes that say WHOSE zone in the class name rather than in the
 * filter, so reading the filter alone loses the word "your".
 *
 * Found by hand-checking Graveyard Marshal: "{2}{B}, Exile a creature card from
 * YOUR graveyard" arrives as `ExileFromGraveCost(new
 * TargetCardInYourGraveyard(new FilterCreatureCard()))`. The filter says
 * "creature card" and nothing else, so the cost lowered to a selector over
 * EVERY graveyard on the table and the ability could be paid for with an
 * opponent's dead creature. The restriction is in the class, so the class is
 * where it gets read.
 */
const TARGET_CLASS_CONTROLLER: Record<PrimId, PlayerSelector> = {
  'xmage:TargetCardInYourGraveyard': { who: 'you' },
  'xmage:TargetCardInOpponentsGraveyard': { who: 'each-opponent' },
  'xmage:TargetCardInHand': { who: 'you' },
  'xmage:TargetControlledPermanent': { who: 'you' },
  'xmage:TargetControlledCreaturePermanent': { who: 'you' },
};

/**
 * WHAT a cost's nested `Target` picks out, and HOW MANY of them.
 *
 * ## The count is not always one, and reading it as one is a discount
 *
 * Every rule below used to write `count: 1` beside this selector. The number is
 * not in the cost: XMage puts it on the target,
 * `new ExileFromGraveCost(new TargetCardInYourGraveyard(2, filter))`, so a rule
 * that reads only the filter produces an ability that costs HALF what the card
 * charges. Measured over all 32,168 records before this was written: 306 cost
 * constructions across 162 cards ask for two to six objects and every one of
 * them was lowered as one. Skywarp Skaab exiled one creature card where the
 * card says two, Allosaurus Rider exiled one land card where it says two, Altar
 * Golem tapped one artifact where it says five.
 *
 * That is the same failure as a dropped restriction and worse than a refusal:
 * the card runs, it looks right, and it is cheaper than it is printed.
 *
 * ## A range is refused rather than rounded
 *
 * `minNumTargets` and `maxNumTargets` can differ, which is "up to N" as a
 * TARGET. A cost is not "up to": either it is paid or it is not. There is no
 * number to write, so `null` comes back and the whole cost refuses.
 */
interface CostObjects {
  selector: Selector;
  count: number;
}

/**
 * Target classes that restrict the SET a cost may be paid from in a way a
 * `Selector` cannot say, so a cost built from their filter alone is cheaper
 * than the printed card.
 *
 * `TargetCardInASingleGraveyard` is the one a hand check found. Night Soil
 * prints "{1}, Exile two creature cards from a single graveyard" and the cost
 * came out as two creature cards from ANY graveyards, so one from each of two
 * opponents paid for it. A `Selector` picks a set; it cannot say "and all of
 * them from the same one of these sets".
 *
 * This is the cost-side twin of `REFUSED_TARGETS` in `targets.ts`. The target
 * path keeps the class's restriction in its prompt; the cost path has no prompt
 * to keep it in, which is why the two lists are not the same list.
 */
const REFUSED_COST_TARGET_CLASSES: Record<PrimId, string> = {
  'xmage:TargetCardInASingleGraveyard':
    'the cards all have to come from ONE graveyard and a Selector names a set rather than a partition of one',
};

function objectsFromTargetArg(invocation: Invocation, name: string, defaultZone: Zone): CostObjects | null {
  const value = arg(invocation, name)?.value;
  if (value?.k !== 'invoke') return null;
  const inner = value.invocation;
  if (inner.prim in REFUSED_COST_TARGET_CLASSES) return null;
  const filter = arg(inner, 'filter')?.value;
  if (filter?.k !== 'objects') return null;
  const sel: Selector = { sel: 'all', where: filter.filter, zone: filter.zone ?? defaultZone };
  // The filter first, because a filter that names a controller is the more
  // specific statement. A filter that names none must not erase the class's.
  const controller = filter.controller ?? TARGET_CLASS_CONTROLLER[inner.prim];
  if (controller) (sel as { controller?: PlayerSelector }).controller = controller;

  const exactly = intArg(inner, 'numTargets');
  const least = intArg(inner, 'minNumTargets');
  const most = intArg(inner, 'maxNumTargets');
  let count: number;
  if (exactly !== undefined) count = exactly;
  else if (least !== undefined && most !== undefined) {
    if (least !== most) return null;
    count = least;
  } else if (least !== undefined || most !== undefined) {
    // One end of a range and not the other. `TargetPermanent(2)` means exactly
    // two and `TargetPermanent(0, 2, …)` means up to two, so a lone bound is a
    // shape this reader has not been shown. Refusing beats picking an end.
    return null;
  } else count = 1;

  if (count < 1) return null;
  return { selector: sel, count };
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
    if (filterIsWrittenButUnread(invocation, 'filter')) return null;
    const fromFilter = objectsSelector(invocation, 'filter', 'battlefield');
    const fromTarget = fromFilter ? null : objectsFromTargetArg(invocation, 'target', 'battlefield');
    const what = fromFilter ?? fromTarget?.selector;
    if (!what) return null;
    // `numToSac` is the cost's own word and wins where it is written; the
    // target's count is the only other place the number can be.
    return [{ pay: 'sacrifice', what, count: intArg(invocation, 'numToSac') ?? fromTarget?.count ?? 1 }];
  },

  /**
   * 385 cards. `DiscardCardCost()` is one card of the player's choice, so there
   * is no `what`: `Cost`'s `what` is optional precisely for this. A filter the
   * card WROTE and this port could not read is a different fact and refuses.
   */
  'xmage:DiscardCardCost': (invocation) => {
    if (filterIsWrittenButUnread(invocation, 'filter')) return null;
    const filter = objectsSelector(invocation, 'filter', 'hand');
    const random = arg(invocation, 'randomDiscard')?.value;
    const cost: Cost = { pay: 'discard', count: 1 };
    if (filter) (cost as { what?: Selector }).what = filter;
    if (random?.k === 'bool' && random.b) (cost as { random?: boolean }).random = true;
    return [cost];
  },

  /** 98 cards. */
  'xmage:DiscardTargetCost': (invocation) => {
    const picked = objectsFromTargetArg(invocation, 'target', 'hand');
    // A target argument this reader could not read is not "no filter". Avatar of
    // Discord discards two cards and Anurid Brushhopper discards two, and both
    // read as one before the count was carried.
    if (arg(invocation, 'target')?.value?.k === 'invoke' && !picked) return null;
    const cost: Cost = { pay: 'discard', count: picked?.count ?? 1 };
    if (picked) (cost as { what?: Selector }).what = picked.selector;
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
    if (filterIsWrittenButUnread(invocation, 'filter')) return null;
    const fromFilter = objectsSelector(invocation, 'filter', 'battlefield');
    const fromTarget = fromFilter ? null : objectsFromTargetArg(invocation, 'target', 'battlefield');
    const what = fromFilter ?? fromTarget?.selector;
    if (!what) return null;
    const count =
      intArg(invocation, 'amount') ?? intArg(invocation, 'minAmount') ?? fromTarget?.count ?? 1;
    return [{ pay: 'tap-others', what, count }];
  },

  /** 113 cards. */
  'xmage:ExileFromGraveCost': (invocation) => {
    const picked = objectsFromTargetArg(invocation, 'target', 'graveyard');
    if (arg(invocation, 'target')?.value?.k === 'invoke' && !picked) return null;
    const what: Selector = picked?.selector ?? {
      sel: 'all',
      where: { is: 'any' },
      zone: 'graveyard',
      controller: { who: 'you' },
    };
    return [{ pay: 'exile', from: 'graveyard', what, count: picked?.count ?? 1 }];
  },

  /** 81 cards. */
  'xmage:ExileSourceFromGraveCost': () => [
    { pay: 'exile', from: 'graveyard', what: { sel: 'self' }, count: 1 },
  ],

  /** 62 cards. */
  'xmage:ExileSourceCost': () => [{ pay: 'exile', from: 'battlefield', what: { sel: 'self' }, count: 1 }],

  /** 72 cards. */
  'xmage:ReturnToHandChosenControlledPermanentCost': (invocation) => {
    const picked = objectsFromTargetArg(invocation, 'target', 'battlefield');
    if (arg(invocation, 'target')?.value?.k === 'invoke' && !picked) return null;
    const what: Selector = picked?.selector ?? {
      sel: 'all',
      where: { is: 'any' },
      zone: 'battlefield',
      controller: { who: 'you' },
    };
    return [{ pay: 'return-to-hand', what, count: picked?.count ?? 1 }];
  },

  /** 45 cards. */
  'xmage:RevealTargetFromHandCost': (invocation) => {
    const picked = objectsFromTargetArg(invocation, 'target', 'hand');
    if (arg(invocation, 'target')?.value?.k === 'invoke' && !picked) return null;
    const what: Selector = picked?.selector ?? {
      sel: 'all',
      where: { is: 'any' },
      zone: 'hand',
      controller: { who: 'you' },
    };
    return [{ pay: 'reveal', what, count: picked?.count ?? 1 }];
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
