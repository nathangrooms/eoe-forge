#!/usr/bin/env node
/**
 * SIZE EVERY DEFECT THE FIFTY-CARD HAND CHECK FOUND, over the whole corpus and
 * over the rows that actually SHIPPED, and say how many of them sit on a card
 * an EARLIER round already graded and passed.
 *
 * That last column is the point. A hand check that missed a defect present on
 * the card it was reading is not an unlucky sample, it is a lenient grading,
 * and the two have to be told apart before any disagreement rate means
 * anything.
 *
 * Each family is detected STRUCTURALLY on the record, not by card name:
 *
 *   D1 withAdditionalTokens   CreateTokenEffect(...).withAdditionalTokens(...)
 *                             lowers to the first token only.
 *   D2 negative multiplier    CardsInControllerGraveyardCount(filter, -1) — the
 *                             filtered branch of the lowering returns before it
 *                             reads the multiplier, so -X/-X becomes +X/+X.
 *   D3 ExhaustAbility         maxActivationsPerGame = 1 and an optional sorcery
 *                             timing, neither of which the lowering reads.
 *   D4 unread cost filter     a cost whose `filter` argument arrived CARRIED,
 *                             read as "no filter" instead of as a refusal.
 *   D5 alternate cast ability an ability that is a way of CASTING the card,
 *                             lowered as an ordinary activated ability.
 *   D6 withOtherwiseEffect    the else branch of a look-and-pick, dropped.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied. Forge is GPL-3.0 and was not fetched, read or referenced.
 *
 * Run: node --experimental-strip-types scripts/xmage/port-refute-defect-census.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRecords } from './build-records.mjs';
import { lowerCard } from '../../src/lib/cards/xmage/index.ts';
import { abilitiesOf, invocationsInAbility } from '../../src/lib/cards/xmage/record.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

const SHIPPED = (() => {
  const at = path.join(REPO, 'src', 'lib', 'cards', 'xmage', 'lowered.generated.ts');
  if (!existsSync(at)) return null;
  const src = readFileSync(at, 'utf8');
  const start = src.indexOf('= {"');
  const end = src.indexOf('} as unknown as Readonly<Record<string, readonly Ability[]>>;');
  if (start < 0 || end < 0) return null;
  return new Set(Object.keys(JSON.parse(src.slice(start + 2, end + 1))));
})();

/* Every oracle id any earlier round already read against Scryfall and passed. */
const ALREADY = [
  'port-primary-accuracy-sample.json',
  'port-open-accuracy-sample.round1.json',
  'port-open-accuracy-sample.round2.json',
  'port-open-accuracy-sample.round3.json',
  'port-open-accuracy-sample.json',
  'port-grow-handcheck.do-if-cost-paid.json',
  'port-grow-handcheck.do-if-cost-paid.round1.json',
  'port-grow-handcheck.look-and-pick.json',
  'port-grow-handcheck.scry+surveil.json',
];
const handChecked = new Map(); // oracleId -> which round
for (const file of ALREADY) {
  const at = path.join(REPO, 'scratch', file);
  if (!existsSync(at)) continue;
  for (const row of JSON.parse(readFileSync(at, 'utf8')).sample) handChecked.set(row.o, file);
}

/* Costs whose `filter` argument the lowering reads through `objectsSelector`. */
const FILTER_COSTS = new Set([
  'xmage:DiscardCardCost',
  'xmage:SacrificeTargetCost',
  'xmage:ExileFromGraveCost',
  'xmage:RevealTargetFromHandCost',
  'xmage:TapTargetCost',
]);

/* Ability classes that are a way of CASTING the card, not an ordinary ability. */
const CASTING_ABILITIES = new Set([
  'xmage:PayMoreToCastAsThoughtItHadFlashAbility',
  'xmage:AlternativeCostSourceAbility',
  'xmage:CastFromHandForFreeAbility',
]);

const { records } = await loadRecords();

const families = {
  D1_withAdditionalTokens: [],
  D2_negativeMultiplier: [],
  D3_exhaustAbility: [],
  D4_unreadCostFilter: [],
  D5_castingAbilityAsActivated: [],
  D6_withOtherwiseEffect: [],
};

for (const record of records) {
  const lowered = lowerCard(record);
  const whole = lowered.blocked.length === 0 && lowered.abilities.length > 0;
  const shipped = !!record.oracleId && !!SHIPPED?.has(record.oracleId);
  const hit = (family) => {
    families[family].push({
      name: record.name,
      oracleId: record.oracleId,
      wholeCardLowers: whole,
      shipped,
      handCheckedIn: handChecked.get(record.oracleId) ?? null,
    });
  };

  const seen = new Set();
  for (const ability of abilitiesOf(record)) {
    if (CASTING_ABILITIES.has(ability.via.prim) && !seen.has('D5')) {
      seen.add('D5');
      hit('D5_castingAbilityAsActivated');
    }
    if (ability.via.prim === 'xmage:ExhaustAbility' && !seen.has('D3')) {
      seen.add('D3');
      hit('D3_exhaustAbility');
    }
    for (const inv of invocationsInAbility(ability)) {
      for (const m of inv.mods ?? []) {
        if (m.m === 'withAdditionalTokens' && !seen.has('D1')) {
          seen.add('D1');
          hit('D1_withAdditionalTokens');
        }
        if (m.m === 'withOtherwiseEffect' && !seen.has('D6')) {
          seen.add('D6');
          hit('D6_withOtherwiseEffect');
        }
      }
      if (inv.prim === 'xmage:CardsInControllerGraveyardCount' && !seen.has('D2')) {
        // The filtered branch returns early, so the multiplier is lost only when
        // a filter actually resolved AND a multiplier is written.
        const filterArg = inv.args?.find((a) => a.name === 'filter');
        const multArg = inv.args?.find((a) => a.name === 'multiplier');
        const filtered = filterArg?.value?.k === 'objects' && filterArg.value.filter?.is !== 'any';
        const mult = multArg?.value?.k === 'int' ? multArg.value.n : null;
        if (filtered && mult !== null && mult !== 1) {
          seen.add('D2');
          hit('D2_negativeMultiplier');
        }
      }
      if (FILTER_COSTS.has(inv.prim) && !seen.has('D4')) {
        const filterArg = inv.args?.find((a) => a.name === 'filter');
        if (filterArg && filterArg.value === undefined && filterArg.carried) {
          seen.add('D4');
          hit('D4_unreadCostFilter');
        }
      }
    }
  }
}

console.log(`records ${records.length}, shipped rows ${SHIPPED?.size ?? 'UNKNOWN'}`);
console.log(`${handChecked.size} oracle ids were hand checked and passed in ${ALREADY.length} earlier samples`);
console.log('');
console.log('| family | card files | whole card lowers | SHIPPED | of those, hand checked and PASSED earlier |');
console.log('|---|---:|---:|---:|---:|');
for (const [family, rows] of Object.entries(families)) {
  const shipped = rows.filter((r) => r.shipped);
  const missed = shipped.filter((r) => r.handCheckedIn);
  console.log(
    `| ${family} | ${rows.length} | ${rows.filter((r) => r.wholeCardLowers).length} | ${shipped.length} | ${missed.length} |`,
  );
  for (const r of missed) console.log(`|   ↳ missed in ${r.handCheckedIn} | ${r.name} | | | |`);
}

writeFileSync(
  path.join(REPO, 'scratch', 'port-refute-defect-census.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), shippedRows: SHIPPED?.size ?? null, families }, null, 1),
);
console.log('');
console.log('wrote scratch/port-refute-defect-census.json');
