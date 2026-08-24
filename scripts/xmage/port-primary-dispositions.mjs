#!/usr/bin/env node
/**
 * One line per XMage record: which oracle id it joined to, and what the emitter
 * did with it.
 *
 * `scripts/xmage/emit-lowered.mjs` already makes this decision for all 32,168
 * records and prints only the TOTALS. This script makes the identical decision,
 * in the identical order, using the identical imports, and writes the answer
 * PER ORACLE ID so a later join can ask a question the totals cannot answer:
 * for one named Scryfall card the engine refused, did XMage have a record for
 * it at all, and if so did that record lower?
 *
 * It is a read-only sibling of the emitter and writes nothing the app reads.
 * Its bars are copied verbatim from `emit-lowered.mjs` and it reconciles
 * against `XMAGE_LOWERED_STATS` before it writes, so a copy that drifted is a
 * failed run rather than a wrong file.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied. Forge is GPL-3.0 and was not fetched, read or referenced.
 *
 * Run: node --experimental-strip-types scripts/xmage/port-primary-dispositions.mjs
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRecords } from './build-records.mjs';
import { LOWERINGS, lowerCard, xmageBodyLowerings } from '../../src/lib/cards/xmage/lower.ts';
import { hasManualEffect, effectsOf } from '../../src/lib/cards/abilities/dsl.ts';
import { TRANSLATED_BODIES } from '../../src/lib/game/xmage/bodies.generated.ts';
import { XMAGE_LOWERED_STATS } from '../../src/lib/cards/xmage/lowered.generated.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const OUT = path.join(REPO, 'scratch', 'xmage-record-disposition.json');

const JOIN_MUST_BE = 'exact';

const bodyKeys = Object.entries(TRANSLATED_BODIES)
  .filter(([, body]) => !body.trivial)
  .map(([key]) => key);
const LOWERINGS_WITH_BODIES = { ...LOWERINGS, ...xmageBodyLowerings(bodyKeys) };

const stats = {
  records: 0,
  noOracleId: 0,
  badJoin: 0,
  duplicateOracleId: 0,
  blocked: 0,
  vacuous: 0,
  manualEffect: 0,
  emitted: 0,
};

/** oracle id -> what the emitter did with it. */
const disposition = Object.create(null);
/** oracle id -> the primitives that blocked it, when it was blocked. */
const blockers = Object.create(null);

const { records } = await loadRecords();
const seen = new Set();

for (const record of records) {
  stats.records++;

  if (!record.oracleId) { stats.noOracleId++; continue; }
  if (record.provenance?.join !== JOIN_MUST_BE) {
    stats.badJoin++;
    disposition[record.oracleId] = 'join-not-exact';
    continue;
  }

  const lowered = lowerCard(record, LOWERINGS_WITH_BODIES);

  if (!lowered.ok) {
    stats.blocked++;
    disposition[record.oracleId] = 'blocked';
    const missing = new Set();
    for (const b of lowered.blocked) for (const m of b.result.missing ?? []) missing.add(m);
    blockers[record.oracleId] = [...missing];
    continue;
  }
  if (lowered.vacuous) {
    stats.vacuous++;
    disposition[record.oracleId] = 'vacuous';
    continue;
  }

  const abilities = lowered.abilities.map((a) => a.ability).filter(Boolean);
  if (abilities.length === 0) {
    stats.vacuous++;
    disposition[record.oracleId] = 'vacuous';
    continue;
  }
  if (abilities.some((a) => hasManualEffect(effectsOf(a)))) {
    stats.manualEffect++;
    disposition[record.oracleId] = 'manual-marker';
    continue;
  }
  if (seen.has(record.oracleId)) {
    stats.duplicateOracleId++;
    disposition[record.oracleId] = 'duplicate-oracle-id';
    continue;
  }
  seen.add(record.oracleId);
  disposition[record.oracleId] = 'emitted';
  stats.emitted++;
}

/* The copy proves itself faithful before it is allowed to write. */
const shipped = XMAGE_LOWERED_STATS;
const mismatches = [];
for (const key of ['records', 'noOracleId', 'badJoin', 'duplicateOracleId', 'blocked', 'vacuous', 'manualEffect', 'emitted']) {
  if (stats[key] !== shipped[key]) mismatches.push(`${key}: this run ${stats[key]}, shipped file ${shipped[key]}`);
}
if (mismatches.length) {
  console.error('This script no longer makes the same decision as emit-lowered.mjs:');
  for (const m of mismatches) console.error('  ' + m);
  process.exit(1);
}

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), stats, disposition, blockers }));

console.log('records                 ', stats.records);
console.log('  no oracle id          ', stats.noOracleId);
console.log('  join not exact        ', stats.badJoin);
console.log('  an ability did not lower', stats.blocked);
console.log('  vacuous               ', stats.vacuous);
console.log('  a manual marker       ', stats.manualEffect);
console.log('  duplicate oracle id   ', stats.duplicateOracleId);
console.log('EMITTED                 ', stats.emitted);
console.log('distinct oracle ids seen', Object.keys(disposition).length);
console.log('reconciles with XMAGE_LOWERED_STATS on all eight counters');
console.log('wrote', OUT);
