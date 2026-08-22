#!/usr/bin/env node
/**
 * Show the REAL argument shapes a primitive is used with, over the whole
 * corpus, before anybody writes a lowering for it.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored into this repository. Forge is GPL-3.0
 * and was not fetched, read or referenced.
 *
 * This exists because a lowering written against a guess at the argument list
 * is a lowering that returns null on every real card and looks like a gap in
 * the extraction. Every lowering in `src/lib/cards/xmage/lower.ts` was written
 * against the output of this script.
 *
 * Run:
 *   node --experimental-strip-types scripts/xmage/inspect-prim.mjs CreateTokenEffect [more...]
 */

import { loadRecords } from './build-records.mjs';
import { abilitiesOf, invocationsInAbility } from '../../src/lib/cards/xmage/index.ts';

const wanted = process.argv.slice(2);
if (wanted.length === 0) {
  console.error('usage: inspect-prim.mjs <ClassName> [...]');
  process.exit(2);
}

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

const { records } = await loadRecords();

for (const cls of wanted) {
  const prim = cls.startsWith('xmage:') || cls.startsWith('local:') ? cls : `xmage:${cls}`;
  const shapes = new Map();
  const kinds = new Map();
  let cards = 0;
  let seen = 0;
  const examples = new Map();

  for (const record of records) {
    let hit = false;
    for (const ability of abilitiesOf(record)) {
      for (const invocation of invocationsInAbility(ability)) {
        if (invocation.prim !== prim) continue;
        hit = true;
        seen += 1;
        const shape = `${invocation.role} | ${shapeOf(invocation)}${invocation.mods?.length ? ` | mods: ${invocation.mods.map((m) => m.m).join(',')}` : ''}`;
        shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
        if (!examples.has(shape)) examples.set(shape, `${record.name} [${record.provenance.xmageClass}]`);
        kinds.set(ability.kind, (kinds.get(ability.kind) ?? 0) + 1);
      }
    }
    if (hit) cards += 1;
  }

  console.log('');
  console.log(`=== ${prim} : ${cards} cards, ${seen} invocations, ${shapes.size} distinct shapes`);
  console.log(`    ability kinds: ${[...kinds.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  for (const [shape, n] of [...shapes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
    console.log(`  ${String(n).padStart(6)}  ${shape}`);
    console.log(`          e.g. ${examples.get(shape)}`);
  }
}
