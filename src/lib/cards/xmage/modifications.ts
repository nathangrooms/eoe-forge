/**
 * XMage continuous effects as `dsl.ts` `Modification` values, for static
 * abilities.
 *
 * Behaviour here is derived from **XMage**, which is MIT licensed,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
 * Read in place, never vendored. Forge is GPL-3.0 and was not fetched, read or
 * referenced.
 *
 * ## Why this file is the single biggest item on the work order
 *
 * `xmage:SimpleStaticAbility` heads the ranked list at **5,867 cards**, more
 * than twice the next entry. It was blocked not because the record could not
 * hold it but because `lowerAbility` had no table between the record and
 * `Modification`. `docs/engine/CARD-SEMANTICS.md` section 7 calls this "the
 * single largest gap and it is a lowering table, not a design change". This is
 * that table.
 *
 * ## The same XMage class means two different things
 *
 * `BoostSourceEffect` is a continuous effect. Inside a static ability it is a
 * permanent modification; inside an activated ability it is "{1}: this creature
 * gets +1/+1 until end of turn", which `dsl.ts` spells `{do:'pump'}` and which
 * is an effect, not a modification. Both readings are correct and which one
 * applies depends on the ability that holds the effect.
 *
 * So the split is by CONSUMER, not by class: this file answers "what does this
 * continuously change", `lower.ts` answers "what happens when this resolves",
 * and several classes appear in both. Trying to pick one reading per class
 * would be wrong on roughly half the 1,306 cards that use this one.
 *
 * ## Layers are XMage's, not inferred
 *
 * Every `Modification` here carries the CR 613 layer `dsl.ts` names, and the
 * layer matches the one XMage's own class declares
 * (`Layer.PTChangingEffects_7`, `SubLayer.ModifyPT_7c` for a boost). A layer
 * guessed from what an effect appears to do is how a set-power effect ends up
 * applying after a modify-power effect and the creature comes out the wrong
 * size.
 */

import type { CardFilter, Modification, PlayerSelector, Selector, ValueExpr } from '../abilities/dsl.ts';
import { type Invocation, arg } from './record.ts';
import { lowerValueSlot } from './values.ts';
import { grantedKeywordFrom } from './keywords.ts';

const SELF: Selector = { sel: 'self' };
const ATTACHED: Selector = { sel: 'attached' };

function selectorFromFilter(
  invocation: Invocation,
  name: string,
  fallback: Selector,
  defaultController?: PlayerSelector,
): Selector | null {
  const slot = arg(invocation, name);
  if (!slot) {
    return defaultController ? { ...(fallback as object), controller: defaultController } as Selector : fallback;
  }
  if (slot.value?.k !== 'objects') return null;
  const sel: Selector = { sel: 'all', where: slot.value.filter, zone: slot.value.zone ?? 'battlefield' };
  const controller = slot.value.controller ?? defaultController;
  if (controller) (sel as { controller?: PlayerSelector }).controller = controller;
  return sel;
}

/**
 * `excludeSource` is a constructor flag on the boost-controlled family and
 * `{is:'other'}` is the same idea in `dsl.ts`. XMage's own comment on
 * `BoostControlledEffect` says to use the flag rather than `AnotherPredicate`,
 * which is why the flag exists and why reading only the filter would miss it.
 */
function excludeSource(invocation: Invocation, sel: Selector): Selector {
  const flag = arg(invocation, 'excludeSource')?.value;
  if (flag?.k !== 'bool' || !flag.b) return sel;
  if (sel.sel !== 'all') return sel;
  const where: CardFilter = { is: 'and', of: [sel.where, { is: 'other' }] };
  return { ...sel, where };
}

export interface ModificationSet {
  affects: Selector;
  modifications: Modification[];
}

export type ModificationRule = (invocation: Invocation) => ModificationSet | null;

function boost(invocation: Invocation, affects: Selector | null): ModificationSet | null {
  if (!affects) return null;
  const power = lowerValueSlot(arg(invocation, 'power'));
  const toughness = lowerValueSlot(arg(invocation, 'toughness'));
  if (power === null || toughness === null) return null;
  return { affects, modifications: [{ layer: 'pt-modify', power, toughness }] };
}

function grant(invocation: Invocation, affects: Selector | null): ModificationSet | null {
  if (!affects) return null;
  const keyword = grantedKeywordFrom(arg(invocation, 'ability'));
  if (!keyword) return null;
  return { affects, modifications: [{ layer: 'ability', grant: [keyword] }] };
}

/**
 * Counts are cards, from `scripts/xmage/census.mjs continuous`, denominator
 * 32,168 XMage card files.
 */
export const MODIFICATION_RULES: Record<string, ModificationRule> = {
  /** 1,306. */
  'xmage:BoostSourceEffect': (invocation) => boost(invocation, SELF),
  /** 515. An aura boosting what it enchants. */
  'xmage:BoostEnchantedEffect': (invocation) => boost(invocation, ATTACHED),
  /** 441. Equipment boosting what it is attached to. Same selector, and that is correct: `{sel:'attached'}` is "the permanent this is attached to" for both. */
  'xmage:BoostEquippedEffect': (invocation) => boost(invocation, ATTACHED),
  /** 760. */
  'xmage:BoostControlledEffect': (invocation) => {
    const sel = selectorFromFilter(
      invocation,
      'filter',
      { sel: 'all', where: { is: 'type', value: 'Creature' }, zone: 'battlefield' },
      { who: 'you' },
    );
    return boost(invocation, sel ? excludeSource(invocation, sel) : null);
  },
  /** 336. Every creature, not only yours. */
  'xmage:BoostAllEffect': (invocation) => {
    const sel = selectorFromFilter(invocation, 'filter', {
      sel: 'all',
      where: { is: 'type', value: 'Creature' },
      zone: 'battlefield',
    });
    return boost(invocation, sel ? excludeSource(invocation, sel) : null);
  },

  /** 770. */
  'xmage:GainAbilitySourceEffect': (invocation) => grant(invocation, SELF),
  /** 765. */
  'xmage:GainAbilityAttachedEffect': (invocation) => grant(invocation, ATTACHED),
  /** 764. */
  'xmage:GainAbilityControlledEffect': (invocation) =>
    grant(
      invocation,
      selectorFromFilter(
        invocation,
        'filter',
        { sel: 'all', where: { is: 'type', value: 'Creature' }, zone: 'battlefield' },
        { who: 'you' },
      ),
    ),
  /** 329. */
  'xmage:GainAbilityAllEffect': (invocation) =>
    grant(
      invocation,
      selectorFromFilter(invocation, 'filter', {
        sel: 'all',
        where: { is: 'type', value: 'Creature' },
        zone: 'battlefield',
      }),
    ),

  /**
   * 169. Sets base power and toughness, layer 7b, which applies BEFORE any
   * modification. `pt-set` and `pt-modify` are separate members of
   * `Modification` for exactly this reason.
   */
  'xmage:SetBasePowerToughnessSourceEffect': (invocation) => {
    const power = lowerValueSlot(arg(invocation, 'power'));
    const toughness = lowerValueSlot(arg(invocation, 'toughness'));
    if (power === null || toughness === null) return null;
    return { affects: SELF, modifications: [{ layer: 'pt-set', power, toughness }] };
  },

  /** 102. */
  'xmage:CantBlockTargetEffect': () => ({
    affects: { sel: 'target', ref: 0 },
    modifications: [{ layer: 'restriction', rule: { rule: 'cant-block', who: { sel: 'target', ref: 0 } } }],
  }),

  /**
   * 97 and 108. "Can't be blocked" is spelled as "can't be blocked except by
   * nothing", because `dsl.ts` has one restriction for blocking exceptions and
   * `{sel:'none'}` is the empty exception set. That is the DSL's own idiom, not
   * an invention: `attach`'s comment says detaching is `to: {sel:'none'}`.
   */
  'xmage:CantBeBlockedSourceEffect': () => ({
    affects: SELF,
    modifications: [
      { layer: 'restriction', rule: { rule: 'cant-be-blocked-except-by', who: SELF, by: { sel: 'none' } } },
    ],
  }),
  'xmage:CantBeBlockedTargetEffect': () => ({
    affects: { sel: 'target', ref: 0 },
    modifications: [
      {
        layer: 'restriction',
        rule: { rule: 'cant-be-blocked-except-by', who: { sel: 'target', ref: 0 }, by: { sel: 'none' } },
      },
    ],
  }),

  /**
   * 163 and 153. Spells you cast cost less.
   *
   * `delta` is negative because `cost-modify` adds. XMage's classes name the
   * argument `amount` and mean a reduction, so passing it straight through
   * would make every cost reducer a tax. The sign flip is the whole content of
   * this entry and it is the kind of thing that is invisible once wrong.
   */
  'xmage:SpellsCostReductionControllerEffect': (invocation) => {
    const amount = lowerValueSlot(arg(invocation, 'amount'));
    if (amount === null || typeof amount !== 'number') return null;
    const slot = arg(invocation, 'filter');
    if (slot && slot.value?.k !== 'objects') return null;
    const applies: Selector =
      slot?.value?.k === 'objects'
        ? { sel: 'all', where: slot.value.filter, zone: 'stack' }
        : { sel: 'all', where: { is: 'any' }, zone: 'stack' };
    return {
      affects: applies,
      modifications: [
        { layer: 'cost-modify', applies, delta: -amount, genericOnly: true, forWhom: { who: 'you' } },
      ],
    };
  },
  'xmage:SpellCostReductionSourceEffect': (invocation) => {
    const amount = lowerValueSlot(arg(invocation, 'amount'));
    if (amount === null || typeof amount !== 'number') return null;
    return {
      affects: SELF,
      modifications: [
        { layer: 'cost-modify', applies: SELF, delta: -amount, genericOnly: true, forWhom: { who: 'you' } },
      ],
    };
  },
};

/**
 * Continuous effects deliberately left out, with the reason. Counts are cards.
 */
export const REFUSED_MODIFICATIONS: Record<string, string> = {
  'xmage:ConditionalContinuousEffect':
    '811 cards. Wraps another continuous effect in a condition, and 167 distinct condition classes stand behind it. `StaticAbility.condition` exists; the condition table does not yet, and a conditional effect applied unconditionally is a card that is always on.',
  'xmage:RegenerateSourceEffect':
    '177 cards. Regeneration is a replacement shield the reducer does not model. `dsl.ts` has no member for it, and a destroy that quietly does not happen is worse than a card that refuses.',
  'xmage:BecomesCreatureSourceEffect':
    '136 cards. Two layers at once, type and power/toughness, driven by a Token argument the record holds as a nested construction. Splitting it into two `Modification` entries is straightforward and is not done yet, which is why it is named here rather than approximated.',
  'xmage:GainControlTargetEffect':
    '177 cards. `{layer:"control"}` exists and the duration does not survive: XMage carries a Duration on the effect and `Modification` has no duration field, so an "until end of turn" theft would read as permanent.',
  'xmage:PreventDamageToTargetEffect':
    '105 cards. `{rule:"damage-prevention"}` exists, but the shield is consumed as it absorbs and the record has no place for a remaining amount.',
  'xmage:DontUntapInControllersNextUntapStepTargetEffect':
    '84 cards. `{rule:"cant-untap"}` exists and applies for one untap step only. `Modification` has no duration, so it would apply for ever.',
};

/**
 * The modifications a static ability applies, or the reason it cannot.
 */
export function lowerModifications(effects: readonly Invocation[]): {
  ok: boolean;
  sets: ModificationSet[];
  missing: string[];
  refused: Array<{ prim: string; why: string }>;
} {
  const sets: ModificationSet[] = [];
  const missing: string[] = [];
  const refused: Array<{ prim: string; why: string }> = [];
  for (const invocation of effects) {
    const why = REFUSED_MODIFICATIONS[invocation.prim];
    if (why) {
      missing.push(invocation.prim);
      refused.push({ prim: invocation.prim, why });
      continue;
    }
    const rule = MODIFICATION_RULES[invocation.prim];
    if (!rule) {
      missing.push(invocation.prim);
      continue;
    }
    const produced = rule(invocation);
    if (produced === null) {
      refused.push({ prim: invocation.prim, why: 'arguments did not resolve into a modification' });
      continue;
    }
    sets.push(produced);
  }
  return { ok: missing.length === 0 && refused.length === 0, sets, missing, refused };
}

/** Re-exported so a caller needs one import for the static path. */
export type { Modification, ValueExpr };
