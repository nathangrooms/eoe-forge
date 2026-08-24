#!/usr/bin/env node
/**
 * Dump `buildRecord`'s own output for named cards, and say for each ability
 * whether its effect list still holds two entries that are the SAME OBJECT.
 *
 * This is the check on the sibling-collapse fix in `build-records.mjs`. Before
 * the fix, an ability constructing four `ConditionalContinuousEffect`s held
 * four references to one normalised object, so the second and later
 * constructions were gone. After it, each occurrence is spent once and the
 * remainder are normalised in their own right, so no two entries in one list
 * should be identical by reference unless the extraction genuinely stated the
 * same construction twice.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied: they carry Wizards of the Coast rules text. Forge is GPL-3.0 and was
 * not fetched, read or referenced.
 *
 * Run:
 *   node --experimental-strip-types scripts/xmage/port-open-record-dump.mjs "Wayward Angel" "Vigilant Sentry"
 */

import { createReadStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRecord, Normaliser, readStaticFilterPredicates } from './build-records.mjs';

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
  if (!names.some((n) => wanted.has(n))) continue;

  const rec = buildRecord(raw, norm, meta);
  console.log('='.repeat(70));
  console.log(names.join(' / '), '  oracleId', rec.oracleId || '(none)');

  for (const face of rec.faces ?? []) {
    for (const ability of face.abilities ?? []) {
      const effects = ability.effects ?? [];
      const seen = new Set();
      let aliased = 0;
      for (const e of effects) {
        if (seen.has(e)) aliased++;
        seen.add(e);
      }
      console.log(`  ability ${ability.id} kind=${ability.kind} via=${ability.via?.prim}`);
      console.log(`    effects ${effects.length}, distinct objects ${seen.size}, aliased ${aliased}`);
      effects.forEach((e, i) => {
        const args = (e.args ?? [])
          .map((s) => {
            const v = s.value;
            if (!v) return '?';
            if (v.k === 'invoke') return v.invocation.prim;
            if (v.k === 'lit') return JSON.stringify(v.v);
            return v.k;
          })
          .join(', ');
        console.log(`      [${i}] ${e.prim}(${args})`);
      });
    }
  }
}
