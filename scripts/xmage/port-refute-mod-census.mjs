#!/usr/bin/env node
/**
 * EVERY CHAINED CALL ON AN EFFECT THAT THE LOWERING NEVER READS, counted, and
 * counted again over the cards that actually SHIPPED.
 *
 * ## Why this exists
 *
 * XMage writes a lot of an effect's meaning after the constructor closes:
 *
 *     new CreateTokenEffect(new WolfToken()).withAdditionalTokens(new BeastToken(), ...)
 *
 * The extraction keeps every one of those calls on `Invocation.mods`. A
 * lowering that reads only the constructor arguments therefore drops the rest
 * WITHOUT SAYING SO, and produces a card that runs and does less, or more, than
 * it prints. `lower.ts` already has the machinery for two of them
 * (`modArgs`, `unnamedChildEffects`); this script asks how many OTHERS there
 * are and what they cost, instead of waiting for the next hand check to trip
 * over one.
 *
 * `READ` below is IMPORTED from `chained-calls.ts`, which is the one list the
 * three lowering paths consult, so this census cannot report green because
 * somebody updated a copy. Every other chained call, on an effect or on an
 * ability, is reported here with what it costs.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied. Forge is GPL-3.0 and was not fetched, read or referenced.
 *
 * Run: node --experimental-strip-types scripts/xmage/port-refute-mod-census.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRecords } from './build-records.mjs';
import { lowerCard } from '../../src/lib/cards/xmage/index.ts';
import { abilitiesOf, invocationsInAbility } from '../../src/lib/cards/xmage/record.ts';
import { EFFECT_MODS_READ, EFFECT_MODS_INERT } from '../../src/lib/cards/xmage/chained-calls.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

/* The shipped table's keys, read out of the artifact the app imports. */
const SHIPPED = (() => {
  const at = path.join(REPO, 'src', 'lib', 'cards', 'xmage', 'lowered.generated.ts');
  if (!existsSync(at)) return null;
  const src = readFileSync(at, 'utf8');
  const start = src.indexOf('= {"');
  const end = src.indexOf('} as unknown as Readonly<Record<string, readonly Ability[]>>;');
  if (start < 0 || end < 0) return null;
  return new Set(Object.keys(JSON.parse(src.slice(start + 2, end + 1))));
})();

/*
 * The lists are IMPORTED from the port rather than retyped here, so this
 * census cannot go green because somebody updated one copy. A call is READ
 * when a lowering consumes it and INERT when this project has written down
 * why it carries no rules meaning; everything else is what the census counts.
 */
const READ = new Set([...EFFECT_MODS_READ, ...Object.keys(EFFECT_MODS_INERT)]);

const { records } = await loadRecords();

const byMod = new Map(); // mod name -> {constructions, cards:Set, lowered:Set, shipped:Set, prims:Map}
let cardsWhereEveryAbilityLowers = 0;

for (const record of records) {
  const lowered = lowerCard(record);
  const whole = lowered.blocked.length === 0 && lowered.abilities.length > 0;
  if (whole) cardsWhereEveryAbilityLowers += 1;

  const invocations = [];
  for (const ability of abilitiesOf(record)) invocations.push(...invocationsInAbility(ability));

  /*
   * ABILITY-level chained calls too, and for the same reason. Thunderfoot
   * Baloth writes its second half as `.addLieutenantEffect(...)` on the
   * ABILITY, so a guard that only looked at effects walked straight past it and
   * the card lost "and have trample". The role filter below therefore includes
   * the ability roles as well as the effect ones.
   */
  for (const ability of abilitiesOf(record)) invocations.push(ability.via);

  const id = record.name + '|' + record.oracleId;
  const seen = new Set();
  for (const inv of invocations) {
    const role = ((inv.role ?? '') + '');
    if (!role.endsWith('-effect') && role !== 'token' && !role.endsWith('-ability')) continue;
    for (const m of inv.mods ?? []) {
      if (READ.has(m.m)) continue;
      const key = m.m;
      if (!byMod.has(key)) {
        byMod.set(key, { constructions: 0, cards: new Set(), lowered: new Set(), shipped: new Set(), prims: new Map() });
      }
      const row = byMod.get(key);
      row.constructions += 1;
      row.prims.set(inv.prim, (row.prims.get(inv.prim) ?? 0) + 1);
      if (!seen.has(key)) {
        seen.add(key);
        row.cards.add(id);
        if (whole) row.lowered.add(id);
        if (record.oracleId && SHIPPED?.has(record.oracleId)) row.shipped.add(record.oracleId);
      }
    }
  }
}

const rows = [...byMod.entries()].sort((a, b) => b[1].shipped.size - a[1].shipped.size || b[1].cards.size - a[1].cards.size);

console.log(`records ${records.length}, cards where every ability lowers ${cardsWhereEveryAbilityLowers}`);
console.log(`shipped table holds ${SHIPPED ? SHIPPED.size : 'UNKNOWN'} oracle ids`);
console.log('');
console.log('chained call, on an effect or an ability, that nothing reads:');
console.log('');
console.log('| shipped oracle ids | cards whose whole card lowers | card files | constructions | call | commonest effect class |');
console.log('|---:|---:|---:|---:|---|---|');
for (const [name, row] of rows) {
  const top = [...row.prims.entries()].sort((a, b) => b[1] - a[1])[0];
  console.log(
    `| ${row.shipped.size} | ${row.lowered.size} | ${row.cards.size} | ${row.constructions} | \`${name}\` | ${top ? top[0] + ' ' + top[1] : ''} |`,
  );
}

const total = new Set();
for (const [, row] of rows) for (const o of row.shipped) total.add(o);
console.log('');
console.log(`DISTINCT SHIPPED ORACLE IDS carrying at least one unread chained call: ${total.size}`);

writeFileSync(
  path.join(REPO, 'scratch', 'port-refute-mod-census.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      records: records.length,
      cardsWhereEveryAbilityLowers,
      shippedRows: SHIPPED ? SHIPPED.size : null,
      shippedAffected: total.size,
      mods: rows.map(([name, row]) => ({
        mod: name,
        constructions: row.constructions,
        cardFiles: row.cards.size,
        wholeCardLowers: row.lowered.size,
        shipped: row.shipped.size,
        shippedIds: [...row.shipped],
        prims: [...row.prims.entries()].sort((a, b) => b[1] - a[1]),
      })),
    },
    null,
    1,
  ),
);
console.log('wrote scratch/port-refute-mod-census.json');
