#!/usr/bin/env node
/**
 * For each ported primitive, real cards that use it AND fully lower, with their
 * Scryfall oracle text, so a test can be written against a card a reader knows.
 *
 * Derived from XMage (MIT, Copyright (c) 2010 betasteward@gmail.com). Read in
 * place, never vendored. Forge is GPL-3.0 and was not fetched or read.
 *
 * Oracle text comes from `scripts/coverage/.data/catalogue.json`, which is
 * Scryfall data. It never comes from XMage: XMage's display strings carry
 * Wizards of the Coast wording that is not XMage's to license, and the
 * extraction omits their contents for that reason.
 *
 * Run:
 *   node --experimental-strip-types scripts/xmage/pick-test-cards.mjs Prim [Prim...]
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRecords } from './build-records.mjs';
import { lowerCard, abilitiesOf, invocationsInAbility } from '../../src/lib/cards/xmage/index.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

const wanted = process.argv.slice(2);
const { records } = await loadRecords();

const oracle = new Map();
for (const row of JSON.parse(readFileSync(path.join(REPO, 'scripts/coverage/.data/catalogue.json'), 'utf8')).rows) {
  if (!oracle.has(row.oracle_id)) oracle.set(row.oracle_id, row);
}

for (const prim of wanted) {
  const hits = [];
  for (const record of records) {
    let uses = false;
    let abilityCount = 0;
    for (const ability of abilitiesOf(record)) {
      abilityCount += 1;
      for (const invocation of invocationsInAbility(ability)) {
        if (invocation.prim === prim || `keyword:${ability.keyword?.name}` === prim) uses = true;
      }
      if (ability.keyword?.name && `keyword:${ability.keyword.name}` === prim) uses = true;
    }
    if (!uses) continue;
    const lowered = lowerCard(record);
    if (!lowered.ok || lowered.vacuous) continue;
    const row = oracle.get(record.oracleId);
    if (!row?.oracle_text) continue;
    hits.push({ record, row, abilityCount });
  }
  hits.sort((a, b) => a.abilityCount - b.abilityCount || a.row.oracle_text.length - b.row.oracle_text.length);
  console.log('');
  console.log(`=== ${prim}: ${hits.length} cards that fully lower`);
  for (const hit of hits.slice(0, 6)) {
    console.log(`  ${hit.record.name}  [${hit.record.provenance.xmageClass}]  ${hit.row.mana_cost ?? ''} ${hit.row.type_line}`);
    console.log(`      ${hit.row.oracle_text.replace(/\n/g, ' / ')}`);
  }
}
