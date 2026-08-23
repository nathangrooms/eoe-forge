#!/usr/bin/env node
/**
 * How many cards CANNOT be scored as working, whatever the port does to them.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored into this repository. Forge is GPL-3.0
 * and was not fetched, read or referenced.
 *
 * ## Why this script exists
 *
 * A tranche of target-taking effect classes was ported and moved the reported
 * numbers by five cards while adding 67 fully-lowered ones. The gap is not in
 * the port. It is a closed loop between two files:
 *
 *   1. `behaviour-probe.ts` `needsTargetBinding` returns TRUE for any ability
 *      with a non-empty `targets`, and forces the outcome to `deferred` without
 *      running it. The probe board binds no targets, so this is every targeted
 *      ability in the corpus.
 *   2. `verify-ability-coverage.mjs` DOWNGRADES an AUTOMATED card whose probe
 *      outcome is `deferred` to SILENT.
 *
 * And the card cannot land in PROMPTED instead, because PROMPTED requires the
 * STATIC grading to have called the ability a decision, and the grading calls a
 * spell with targets `{s:'run'}`, not `{s:'decision'}`.
 *
 * So a spell that targets is graded AUTOMATED, downgraded to SILENT by the
 * probe, and never considered for PROMPTED. There is no path by which it counts
 * as working, however correctly it lowers.
 *
 * This script counts that population. It changes nothing and asserts nothing
 * about whether the probe SHOULD bind targets: it reports the size of the
 * ceiling so that decision can be taken on a number.
 *
 * Run:
 *   node --experimental-strip-types scripts/xmage/target-binding-ceiling.mjs
 */

import { XMAGE_LOWERED } from '../../src/lib/cards/xmage/lowered.generated.ts';

/** The same predicate `behaviour-probe.ts` uses, copied rather than imported. */
const needsTargetBinding = (ability) =>
  'targets' in ability && Array.isArray(ability.targets) && ability.targets.length > 0;

/** Kinds the probe actually runs. Keywords, statics and replacements are skipped. */
const RESOLVING = new Set(['spell', 'activated', 'triggered', 'mana']);

let cards = 0;
let withTargets = 0;
let spellOnly = 0;
const byKind = new Map();

for (const abilities of Object.values(XMAGE_LOWERED)) {
  if (!abilities || abilities.length === 0) continue;
  cards += 1;

  const targeted = abilities.filter((a) => RESOLVING.has(a.kind) && needsTargetBinding(a));
  if (targeted.length === 0) continue;
  withTargets += 1;

  for (const a of targeted) byKind.set(a.kind, (byKind.get(a.kind) ?? 0) + 1);

  // A card whose ONLY targeted abilities are spells is the pure case: the
  // grading never calls it a decision, so PROMPTED is closed to it as well.
  if (targeted.every((a) => a.kind === 'spell')) spellOnly += 1;
}

console.log(`cards in the shipped port table with at least one ability   ${cards}`);
console.log(`  of which at least one RESOLVING ability announces targets ${withTargets}`);
console.log(`  of which every targeted ability is a SPELL                ${spellOnly}`);
console.log('');
console.log('targeted abilities by kind:');
for (const [kind, n] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${String(n).padStart(6)}  ${kind}`);
}
console.log('');
console.log('Every one of these is forced to `deferred` by needsTargetBinding');
console.log('before its effects are judged, and an AUTOMATED card the probe');
console.log('defers is downgraded to SILENT.');
