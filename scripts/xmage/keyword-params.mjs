#!/usr/bin/env node
/**
 * What a keyword ability's PARAMETER actually is, per keyword class.
 *
 * Derived from XMage (MIT, Copyright (c) 2010 betasteward@gmail.com). Read in
 * place, never vendored. Forge is GPL-3.0 and was not fetched or read.
 *
 * `dsl.ts`'s `KeywordAbility.parameter` is a verbatim printed string. A keyword
 * whose parameter is a filter or an effect does not fit that field, and
 * synthesising a phrase for it would be inventing rules text. This script is
 * how that line was drawn from measurement rather than from memory.
 */

import { loadRecords } from './build-records.mjs';
import { abilitiesOf } from '../../src/lib/cards/xmage/index.ts';

const { records } = await loadRecords();
const out = new Map();

for (const record of records) {
  for (const ability of abilitiesOf(record)) {
    if (ability.kind !== 'keyword') continue;
    const name = ability.keyword?.name ?? ability.via.prim;
    const p = ability.keyword?.parameter;
    let shape = 'none';
    if (p) {
      if (p.value) shape = `value:${p.value.k}`;
      else if (p.carried) shape = `carried:${p.carried.c}`;
      else shape = `hole:${p.hole?.reason}`;
      shape += ` of=${p.of ?? '?'}`;
    }
    const key = `${name} :: ${shape}`;
    if (!out.has(key)) out.set(key, new Set());
    out.get(key).add(record.provenance.xmageClass);
  }
}

const rows = [...out.entries()].map(([k, v]) => [k, v.size]).sort((a, b) => b[1] - a[1]);
console.log(`keyword parameter shapes, ${rows.length} distinct, denominator ${records.length} card files`);
for (const [k, n] of rows.slice(0, Number(process.argv[2] ?? 60))) {
  console.log(`  ${String(n).padStart(6)}  ${k}`);
}
