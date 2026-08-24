#!/usr/bin/env node
/**
 * The whole record for named cards, as JSON, plus what `lowerCard` makes of it.
 *
 * `port-open-record-dump.mjs` prints effect lists and alias counts, which is
 * what the phase that wrote it needed. This prints the record itself, because
 * the questions this phase is asking are about COSTS, FILTERS and CHAINED
 * CALLS, and none of those are in an effect list.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied. Forge is GPL-3.0 and was not fetched, read or referenced.
 *
 * Run: node --experimental-strip-types scripts/xmage/port-refute-record-json.mjs "Sanctum Spirit"
 */

import { createReadStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRecord, Normaliser, readStaticFilterPredicates } from './build-records.mjs';
import { lowerCard } from '../../src/lib/cards/xmage/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NDJSON = join(ROOT, 'scripts', 'coverage', '.data', 'xmage-card-effects.ndjson');
const ENGINE = join(ROOT, 'scripts', 'coverage', '.data', 'xmage-engine-index.json');

const wanted = new Set(process.argv.slice(2));
if (!wanted.size) {
  console.error('name at least one card');
  process.exit(1);
}

const engine = JSON.parse(readFileSync(ENGINE, 'utf8'));
const staticFilters = readStaticFilterPredicates();
const norm = new Normaliser(staticFilters.predicates, engine.classes);
const meta = { commit: 'dump', now: new Date().toISOString() };

const rl = createInterface({ input: createReadStream(NDJSON), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  const raw = JSON.parse(line);
  const names = raw.names ?? [];
  if (!names.some((n) => wanted.has(n)) && !wanted.has(raw.cls)) continue;
  const record = buildRecord(raw, norm, meta);
  console.log('='.repeat(70));
  console.log(record.name, record.oracleId);
  console.log(JSON.stringify(record, null, 1));
  const lowered = lowerCard(record);
  console.log('--- LOWERED ---');
  console.log(JSON.stringify({ abilities: lowered.abilities, blocked: lowered.blocked }, null, 1));
}
