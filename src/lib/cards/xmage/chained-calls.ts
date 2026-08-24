/**
 * CHAINED CALLS: which ones are read, which carry no rules meaning, and the
 * one function that refuses everything else.
 *
 * Derived from **XMage**, which is MIT licensed, `Copyright (c) 2010
 * betasteward@gmail.com`, https://github.com/magefree/mage. The clone is read
 * in place and nothing from it is vendored here. XMage display strings are
 * never copied: the reasons below describe what a call DOES, in this project's
 * own words, and card wording comes from Scryfall. Forge is GPL-3.0 and was not
 * fetched, read or referenced.
 *
 * This lives in its own file because THREE lowering paths need it and two of
 * them are in modules `lower.ts` imports. A guard that only one path consults
 * is a guard with a hole, and the hole is where the next dropped clause goes.
 */

import type { Invocation } from './record.ts';
/* ------------------------------------------------------------------ *
 * An unread chained call is a dropped clause
 *
 * XMage writes a lot of an effect's meaning AFTER the constructor closes, and
 * the extraction keeps every one of those calls on `Invocation.mods`. A
 * lowering that reads only the constructor arguments therefore drops the rest
 * WITHOUT SAYING SO. That is not a hypothetical: it produced Somberwald
 * Beastmaster making one token of three, Triplicate Titan one of three,
 * Forbidden Friendship one of two, and Contagious Vorrac losing "If you didn't
 * put a card into your hand this way, proliferate" entirely. Every one of them
 * RAN, and every one of them had already shipped.
 *
 * Fixing those four one at a time leaves the NEXT one to be found by the next
 * hand check. So the rule is inverted: a chained call on an effect is either
 * READ by a lowering here, or listed as INERT with the reason, or the effect
 * REFUSES. Adding a reader means adding a name to the first list; deciding a
 * call carries no rules meaning means adding it to the second with an argument.
 * Neither can be done by accident, and nothing new can be dropped in silence.
 * `scripts/xmage/port-refute-mod-census.mjs` counts what each list costs.
 * ------------------------------------------------------------------ */

/**
 * Chained calls a lowering in this file, or `build-records.mjs`, consumes.
 *
 * The list covers ABILITY-level calls as well as effect-level ones, because
 * the two are the same hazard and Thunderfoot Baloth was lost to the ability
 * half: `.addLieutenantEffect(...)` is a whole printed clause and no guard
 * looked at it. Where a call is read by the RECORD BUILDER rather than by this
 * file, the reader is named beside it, because "nothing here reads it" and
 * "nothing anywhere reads it" are different facts and only the second is a bug.
 */
export const EFFECT_MODS_READ: ReadonlySet<string> = new Set([
  // Intercepted by the extraction into `children.effects`; see `modArgs`.
  'addEffect',
  'addOtherwiseEffect',
  'withAdditionalTokens',
  // Read only to REFUSE, in `LookLibraryAndPickControllerEffect`, which is
  // still reading it: a named refusal is a decision and a silent drop is not.
  'withOtherwiseEffect',
  // `conditionSlotsOf`, and `build-records.mjs` into `AbilityRecord.interveningIf`.
  'withTriggerCondition',
  'withInterveningIf',
  // `usageLimitOf`.
  'setMaxActivationsPerTurn',
  'setTriggersLimitEachTurn',
  'setDoOnlyOnceEachTurn',
  'setOnce',
  // Read at the top of `lowerAbility`, each of them to refuse the ability.
  'setMayActivate',
  'setTargetAdjuster',
  'setCostAdjuster',
  // `build-records.mjs` into `AbilityRecord.modeLimits`, which `lowerResolving`
  // reads when it builds the `choose-mode`.
  'getModes.setMinModes',
  'getModes.setMaxModes',
  // `abilityTiming` below.
  'setTiming',
]);

/**
 * Chained calls that change what a PLAYER READS and not what the game does,
 * each with the argument for saying so. XMage's display strings are never
 * copied out of it in any case: `Ability.text` is filled from Scryfall.
 */
export const EFFECT_MODS_INERT: Record<string, string> = {
  setOutcome: "XMage's `Outcome` is its AI's hint about whether an effect is good for a player. It is not a rule, and this file already reads and discards it on `AttachEffect` for the same reason.",
  withTargetDescription: 'names the target inside the printed rules text',
  withText: 'replaces the printed rules text',
  setText: 'replaces the printed rules text',
  withTextThatCard: 'chooses between "that card" and a longer phrase in the printed rules text',
  withTheyText: 'chooses between "they" and a longer phrase in the printed rules text',
  setOtherwiseText: 'the printed wording of an else branch that is read from the effect itself',
  withPhantomText: 'the printed wording used by the Phantom cards',
  withConditionTextAtEnd: 'moves the condition to the end of the printed rules text',
  withDurationRuleAtStart: 'moves the duration to the start of the printed rules text',
  withForceQuotes: 'puts quotation marks round a granted ability in the printed rules text',
  withQuotes: 'puts quotation marks round a granted ability in the printed rules text',
  withTargetName: 'names the target inside the printed rules text',
  withChooseHint: 'a hint shown beside a choice, which the choice does not depend on',
  setRuleAtTheTop: 'prints this ability above the rest of the card',
  setAbilityWord: 'prints an ability word such as "Threshold" before the rules text',
  setFlavorWord: 'prints a flavour word before the rules text',
  withFlavorWord: 'prints a flavour word before the rules text',
  'getModes.setChooseText': 'the wording of the "choose one" line above a modal spell',
  withRuleTextReplacement: 'swaps one phrase for another in the printed rules text',
  setUndoPossible: "an XMage CLIENT flag saying whether the player may take this activation back. It is not a rule and no engine state depends on it.",
  /*
   * The same decision, and the same hook, as `noRegen` in PORT-LOG.md section 6:
   * "damage can't be prevented" only means something once something prevents
   * damage, and nothing in this engine does. If damage prevention is ever
   * added, a grep for `withCantBePrevented` finds this line.
   */
  withCantBePrevented: 'nothing in this engine prevents damage, so a clause forbidding prevention changes no outcome. Revisit with `noRegen` if prevention is ever added.',
};

/**
 * The first chained call on this invocation that nothing reads and nothing has
 * declared inert, or `null` when it carries none.
 *
 * Used on EFFECTS and on ABILITIES. Both carry `mods`, both had calls nobody
 * read, and both produced cards that ran and were wrong.
 */
export function unreadChainedCall(invocation: Invocation): string | null {
  for (const m of invocation.mods ?? []) {
    if (EFFECT_MODS_READ.has(m.m)) continue;
    if (m.m in EFFECT_MODS_INERT) continue;
    return m.m;
  }
  return null;
}

