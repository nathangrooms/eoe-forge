#!/usr/bin/env node
/**
 * Census of every CONDITION an XMage record hands to a conditional effect.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored into this repository. XMage's display
 * strings are never copied. Forge is GPL-3.0 and was not fetched, read or
 * referenced.
 *
 * Why this exists: `docs/engine/EFFECT-CLASS-ORDER.md` ranks
 * `ConditionalContinuousEffect` and `ConditionalOneShotEffect` first and
 * second, and both are one shared class in front of a LONG TAIL of condition
 * classes. Porting the outer class buys nothing without the inner table, and
 * writing the inner table against a guess buys nothing either. So: count the
 * conditions first, ranked by cards, and write only the head of that list.
 *
 * A condition reaches a record in one of three shapes and they are not
 * interchangeable:
 *   value.k === 'invoke'   a constructed Condition with arguments
 *   carried.c === 'enum'   a singleton, `MyTurnCondition.instance`
 *   carried.c === 'const'  a shared static field
 * plus `hole`, which is a card-local Condition class and is not shared work.
 *
 * Run:
 *   node --experimental-strip-types scripts/xmage/condition-census.mjs
 */

import { loadRecords } from './build-records.mjs';
import { abilitiesOf, invocationsInAbility } from '../../src/lib/cards/xmage/index.ts';

/** The effect classes whose `condition` slot this census reads. */
const CARRIERS = new Set([
  'xmage:ConditionalContinuousEffect',
  'xmage:ConditionalOneShotEffect',
  'xmage:ConditionalRestrictionEffect',
  'xmage:ConditionalAsThoughEffect',
  'xmage:ConditionalReplacementEffect',
  'xmage:ConditionalCostModificationEffect',
  'xmage:ConditionalRequirementEffect',
  'xmage:ConditionalPreventionEffect',
  'xmage:ConditionalTriggeredAbility',
  'xmage:ConditionalActivatedAbility',
  'xmage:ConditionalManaEffect',
  'xmage:ConditionalOneShotEffect2',
]);

/** How a condition slot names itself, or null when it is a card-local hole. */
function conditionKey(slot) {
  if (!slot) return null;
  if (slot.value?.k === 'invoke') return slot.value.invocation.prim;
  if (slot.carried?.c === 'enum') return `enum:${slot.carried.enumName}`;
  if (slot.carried?.c === 'const') return `const:${slot.carried.holder}.${slot.carried.field}`;
  if (slot.carried?.c === 'construct') return `construct:${slot.carried.prim}`;
  if (slot.hole) return `hole:${slot.hole.reason}${slot.hole.declared ? `/${slot.hole.declared}` : ''}`;
  return `other:${slot.value?.k ?? slot.carried?.c ?? '?'}`;
}

const { records } = await loadRecords();

/** condition key -> Set of card names, so the rank is CARDS and not invocations. */
const cards = new Map();
/** condition key -> Map of argument shape -> count, so the lowering is written against real shapes. */
const shapes = new Map();
const carrierCards = new Map();

const shapeOf = (invocation) =>
  invocation.args
    .map((slot) => {
      const label = slot.name ?? '?';
      if (slot.value) {
        const v = slot.value;
        if (v.k === 'invoke') return `${label}=invoke:${v.invocation.prim}`;
        if (v.k === 'objects') return `${label}=objects`;
        if (v.k === 'int') return `${label}=int(${v.n})`;
        if (v.k === 'bool') return `${label}=bool(${v.b})`;
        if (v.k === 'name') return `${label}=name(${v.name})`;
        return `${label}=${v.k}`;
      }
      if (slot.carried) {
        const c = slot.carried;
        if (c.c === 'enum') return `${label}~enum:${c.enumName}.${c.member}`;
        if (c.c === 'const') return `${label}~const:${c.holder}.${c.field}`;
        if (c.c === 'construct') return `${label}~construct:${c.prim}`;
        if (c.c === 'factory') return `${label}~factory:${c.on}.${c.method}`;
        return `${label}~${c.c}`;
      }
      return `${label}!hole:${slot.hole?.reason}`;
    })
    .join(', ');

for (const record of records) {
  for (const ability of abilitiesOf(record)) {
    for (const invocation of invocationsInAbility(ability)) {
      if (!CARRIERS.has(invocation.prim)) continue;
      if (!carrierCards.has(invocation.prim)) carrierCards.set(invocation.prim, new Set());
      carrierCards.get(invocation.prim).add(record.name);
      const slot = invocation.args.find((a) => a.name === 'condition');
      const key = conditionKey(slot);
      if (!key) continue;
      if (!cards.has(key)) cards.set(key, new Set());
      cards.get(key).add(record.name);
      if (slot.value?.k === 'invoke') {
        if (!shapes.has(key)) shapes.set(key, new Map());
        const s = shapeOf(slot.value.invocation);
        shapes.get(key).set(s, (shapes.get(key).get(s) ?? 0) + 1);
      }
    }
  }
}

console.log('=== carriers');
for (const [prim, set] of [...carrierCards.entries()].sort((a, b) => b[1].size - a[1].size)) {
  console.log(`${String(set.size).padStart(6)}  ${prim}`);
}

const ranked = [...cards.entries()].sort((a, b) => b[1].size - a[1].size);
let shared = 0;
let local = 0;
for (const [key, set] of ranked) {
  if (key.startsWith('hole:')) local += set.size;
  else shared += set.size;
}
console.log('');
console.log(`=== ${ranked.length} distinct condition keys; shared ${shared} card-slots, holes ${local}`);
console.log('');
for (const [key, set] of ranked.slice(0, 70)) {
  console.log(`${String(set.size).padStart(6)}  ${key}`);
  const s = shapes.get(key);
  if (s) {
    for (const [shape, n] of [...s.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) {
      console.log(`          ${String(n).padStart(4)}  (${shape})`);
    }
  }
}
