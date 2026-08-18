import { readFileSync } from 'node:fs';
import { measureCoverage, topOf } from '../src/lib/cards/abilities/coverage.ts';

const path = process.argv[2];
const cards = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const t0 = Date.now();
const r = measureCoverage(cards, true);
const ms = Date.now() - t0;

console.log(`cards ${r.cards}  (${ms} ms, ${(ms / r.cards * 1000).toFixed(1)} us/card)`);
console.log(`blank (no oracle text)        ${r.blank}`);
console.log(`>=1 ability                   ${r.cardsWithAnyAbility}  (${(100*r.cardsWithAnyAbility/r.cards).toFixed(1)}%)`);
console.log(`>=1 fully-automated ability   ${r.cardsWithAutomatedAbility}  (${(100*r.cardsWithAutomatedAbility/r.cards).toFixed(1)}%)`);
console.log(`coverage === 'full'           ${r.fullyCovered}  (${(100*r.fullyCovered/r.cards).toFixed(1)}%)`);
console.log(`total abilities ${r.totalAbilities}   total unparsed clauses ${r.totalUnparsed}`);
console.log(`accounting failures: ${r.accountingFailures.length}`);
for (const f of r.accountingFailures.slice(0, 5)) console.log('   ', f);
console.log('\ncoverage:', JSON.stringify(r.byCoverage));
console.log('kinds   :', JSON.stringify(r.byAbilityKind));
console.log('\n-- top rules --');
for (const [k, v] of topOf(r.byRule, 30)) console.log(String(v).padStart(7), k);
console.log('\n-- gap reasons --');
for (const [k, v] of topOf(r.byGapReason, 20)) console.log(String(v).padStart(7), k);
console.log('\n-- manual hints --');
for (const [k, v] of topOf(r.byManualHint, 20)) console.log(String(v).padStart(7), k.slice(0, 90));
