#!/usr/bin/env node
/**
 * Ad hoc censuses over the built records, so a table is written against
 * measured frequencies rather than against a memory of what Magic contains.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. Read in place, never
 * vendored. Forge is GPL-3.0 and was not fetched, read or referenced.
 *
 * Run:
 *   node --experimental-strip-types scripts/xmage/census.mjs keywords
 *   node --experimental-strip-types scripts/xmage/census.mjs tokens
 *   node --experimental-strip-types scripts/xmage/census.mjs conditions
 *   node --experimental-strip-types scripts/xmage/census.mjs values
 *   node --experimental-strip-types scripts/xmage/census.mjs costs
 *   node --experimental-strip-types scripts/xmage/census.mjs targets
 *   node --experimental-strip-types scripts/xmage/census.mjs continuous
 *   node --experimental-strip-types scripts/xmage/census.mjs grants
 */

import { loadRecords } from './build-records.mjs';
import { abilitiesOf, invocationsInAbility } from '../../src/lib/cards/xmage/index.ts';

const what = process.argv[2] ?? 'keywords';
const limit = Number(process.argv[3] ?? 60);
const { records } = await loadRecords();

/** cards, not invocations: a table entry pays per card, not per mention. */
const bump = (map, key, oracleId) => {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(oracleId);
};

const out = new Map();

for (const record of records) {
  const id = record.provenance.xmageClass;
  for (const ability of abilitiesOf(record)) {
    if (what === 'keywords') {
      if (ability.kind === 'keyword') bump(out, ability.keyword?.name ?? ability.via.prim, id);
      continue;
    }
    for (const invocation of invocationsInAbility(ability)) {
      if (what === 'tokens' && invocation.role === 'token') bump(out, invocation.prim, id);
      if (what === 'conditions' && invocation.role === 'condition') bump(out, invocation.prim, id);
      if (what === 'values' && invocation.role === 'dynamic-value') bump(out, invocation.prim, id);
      if (what === 'costs' && invocation.role === 'cost') bump(out, invocation.prim, id);
      if (what === 'targets' && invocation.role === 'target') bump(out, invocation.prim, id);
      if (what === 'continuous' && invocation.role === 'continuous-effect') bump(out, invocation.prim, id);
    }
    if (what === 'conditions' && ability.interveningIf) {
      const slot = ability.interveningIf;
      if (slot.carried?.c === 'const') bump(out, `const:${slot.carried.holder}.${slot.carried.field}`, id);
      if (slot.carried?.c === 'construct') bump(out, slot.carried.prim, id);
      if (slot.hole) bump(out, `hole:${slot.hole.localName ?? slot.hole.reason}`, id);
    }
  }
}

console.log(`census: ${what}, ${out.size} distinct, denominator ${records.length} card files`);
let running = 0;
const rows = [...out.entries()].map(([k, v]) => [k, v.size]).sort((a, b) => b[1] - a[1]);
const total = rows.reduce((n, r) => n + r[1], 0);
for (const [k, n] of rows.slice(0, limit)) {
  running += n;
  console.log(`  ${String(n).padStart(6)}  ${String(((100 * running) / total).toFixed(1)).padStart(5)}%  ${k}`);
}
