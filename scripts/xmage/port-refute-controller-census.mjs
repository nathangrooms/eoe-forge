#!/usr/bin/env node
/**
 * EVERY `TargetController` THE RECORD CARRIES AND THE PORT DOES NOT READ,
 * counted, and counted again over the cards that shipped.
 *
 * `whoseArg` in `triggers.ts` returns `undefined` for an argument it could not
 * read, and every caller then substitutes the class's default, which is
 * `{who:'you'}`. So a card that WROTE `TargetController.EACH_PLAYER` came out
 * as "your step". Fevered Visions, "At the beginning of each player's end step,
 * that player draws a card", fired on one end step in four at a four-player
 * table. It ran, so nothing downstream could see it.
 *
 * `filterSelector`, eight lines below `whoseArg` in the same file, already draws
 * exactly the distinction `whoseArg` does not, and says in its own comment why
 * it matters. This counts what the missing half costs.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied. Forge is GPL-3.0 and was not fetched, read or referenced.
 *
 * Run: node --experimental-strip-types scripts/xmage/port-refute-controller-census.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
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

const { records } = await loadRecords();

const byMember = new Map(); // member -> {cards:Set, lowered:Set, shipped:Set, prims:Map}
for (const record of records) {
  const lowered = lowerCard(record);
  const whole = lowered.blocked.length === 0 && lowered.abilities.length > 0;
  const shipped = !!record.oracleId && !!SHIPPED?.has(record.oracleId);

  const seen = new Set();
  for (const ability of abilitiesOf(record)) {
    for (const inv of [ability.via, ...invocationsInAbility(ability)]) {
      for (const slot of inv.args ?? []) {
        if (slot.of !== 'TargetController') continue;
        if (slot.value !== undefined) continue;
        const member = slot.carried?.c === 'enum' ? slot.carried.member : 'not-an-enum';
        if (!byMember.has(member)) {
          byMember.set(member, { cards: new Set(), lowered: new Set(), shipped: new Set(), prims: new Map() });
        }
        const row = byMember.get(member);
        row.prims.set(inv.prim, (row.prims.get(inv.prim) ?? 0) + 1);
        const key = member + '|' + record.oracleId;
        if (seen.has(key)) continue;
        seen.add(key);
        row.cards.add(record.name);
        if (whole) row.lowered.add(record.name);
        if (shipped) row.shipped.add(record.oracleId);
      }
    }
  }
}

const rows = [...byMember.entries()].sort((a, b) => b[1].shipped.size - a[1].shipped.size);
console.log(`records ${records.length}, shipped rows ${SHIPPED?.size ?? 'UNKNOWN'}`);
console.log('');
console.log('| shipped | whole card lowers | card files | TargetController member | commonest class |');
console.log('|---:|---:|---:|---|---|');
for (const [member, row] of rows) {
  const top = [...row.prims.entries()].sort((a, b) => b[1] - a[1])[0];
  console.log(`| ${row.shipped.size} | ${row.lowered.size} | ${row.cards.size} | ${member} | ${top ? top[0] + ' ' + top[1] : ''} |`);
}
const all = new Set();
for (const [, row] of rows) for (const o of row.shipped) all.add(o);
console.log('');
console.log(`DISTINCT SHIPPED CARDS carrying a TargetController the port did not read: ${all.size}`);
for (const [member, row] of rows) {
  if (row.shipped.size === 0) continue;
  console.log(`  ${member}: ${[...row.lowered].slice(0, 12).join(', ')}`);
}
