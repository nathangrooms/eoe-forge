#!/usr/bin/env node
/**
 * IS THE SIBLING COLLAPSE GONE? Counted over every record, not sampled.
 *
 * `port-primary-sibling-collapse.mjs` counts the cards where the EXTRACTION
 * states two effects of one class in one ability. That number cannot move: it
 * describes XMage's source, not our reading of it. What had to change is what
 * `buildRecord` does with those cards. It was handing every sibling a
 * reference to the FIRST one's normalised object, so four
 * `ConditionalContinuousEffect`s became four copies of the first.
 *
 * This walks `buildRecord`'s own output and counts, per ability, the entries in
 * its effect / cost / target lists that are the SAME JavaScript object as an
 * earlier entry in the same list. That is the collapse, measured on the thing
 * the collapse actually produced. It should be zero.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied. Forge is GPL-3.0 and was not fetched, read or referenced.
 *
 * Run: node --experimental-strip-types scripts/xmage/port-open-alias-census.mjs
 */

import { createReadStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRecord, Normaliser, readStaticFilterPredicates } from './build-records.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NDJSON = join(ROOT, 'scripts', 'coverage', '.data', 'xmage-card-effects.ndjson');
const ENGINE = join(ROOT, 'scripts', 'coverage', '.data', 'xmage-engine-index.json');

const engine = JSON.parse(readFileSync(ENGINE, 'utf8'));
const norm = new Normaliser(readStaticFilterPredicates().predicates, engine.classes);
const meta = { commit: 'alias-census', now: new Date().toISOString() };

let cards = 0;
let abilities = 0;
let aliasedEntries = 0;
let aliasedAbilities = 0;
const examples = [];

const rl = createInterface({ input: createReadStream(NDJSON), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  const rec = buildRecord(JSON.parse(line), norm, meta);
  cards++;
  for (const face of rec.faces ?? []) {
    for (const ability of face.abilities ?? []) {
      abilities++;
      let hit = 0;
      for (const list of [ability.effects, ability.costs, ability.targets]) {
        const seen = new Set();
        for (const entry of list ?? []) {
          if (seen.has(entry)) hit++;
          seen.add(entry);
        }
      }
      if (!hit) continue;
      aliasedEntries += hit;
      aliasedAbilities++;
      if (examples.length < 10) examples.push(`${(rec.names ?? [])[0] ?? rec.cls} ${ability.id} x${hit}`);
    }
  }
}

const L = (n, label) => console.log(String(n).padStart(8), label);
console.log('records built', cards);
L(abilities, 'abilities');
L(aliasedAbilities, 'abilities whose effect/cost/target list repeats one OBJECT');
L(aliasedEntries, 'repeated entries in total  <- the sibling collapse, and it must be 0');
if (examples.length) console.log('examples:', examples.join(', '));
