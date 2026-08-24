#!/usr/bin/env node
/**
 * HOW MANY CARDS DOES THE SIBLING COLLAPSE REACH?
 *
 * `build-records.mjs:836` builds an ability's effect list with
 *
 *     const reuse = (raw) => fromVia.get(`xmage:${raw.cls}`) ?? ... ?? norm.invocation(raw);
 *
 * `fromVia` is keyed by CLASS NAME. When one ability constructs two or more
 * effects OF THE SAME CLASS, every one of them resolves to the FIRST one's
 * normalised object, and the second and later constructions, with their own
 * arguments, are replaced by a copy of the first.
 *
 * Wayward Angel is the card that showed it. Its threshold static builds four
 * `ConditionalContinuousEffect`s wrapping, in order, a boost, a colour change
 * and two ability grants. The record holds four copies of the boost. The card
 * therefore lowered, because the colour change would have refused it, and the engine
 * gives it +12/+12 where the card says +3/+3.
 *
 * This script counts, over every XMage record, the abilities whose raw effect
 * list holds two or more entries of one class, and splits the cards by what the
 * emitter then did with them. It reads the SAME ndjson the record builder reads,
 * before any normalising, so the count is of the extraction's own words.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied. Forge is GPL-3.0 and was not fetched, read or referenced.
 *
 * Run: node --experimental-strip-types scripts/xmage/port-primary-sibling-collapse.mjs
 *   (needs scratch/xmage-record-disposition.json from port-primary-dispositions.mjs)
 */

import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NDJSON = join(ROOT, 'scripts', 'coverage', '.data', 'xmage-card-effects.ndjson');
const DISPOSITIONS = join(ROOT, 'scratch', 'xmage-record-disposition.json');
const OUT = join(ROOT, 'scratch', 'port-primary-sibling-collapse.json');

const dispo = JSON.parse(readFileSync(DISPOSITIONS, 'utf8'));

const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);

let cards = 0;
let cardsWithCollapse = 0;
let abilitiesWithCollapse = 0;
let effectsReplaced = 0;
const byDisposition = new Map();
const byClass = new Map();
/** The collapse that also HID a sibling of a different class, the dangerous half. */
let cardsWhereASiblingWasADifferentEffect = 0;
const emittedExamples = [];

const rl = createInterface({ input: createReadStream(NDJSON), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  const raw = JSON.parse(line);
  cards++;

  let cardHit = false;
  let cardHidDifferent = false;
  for (const a of raw.abilities ?? []) {
    const list = a.effects ?? [];
    if (list.length < 2) continue;
    const counts = new Map();
    for (const e of list) bump(counts, e.cls);
    let hit = false;
    for (const [cls, n] of counts) {
      if (n < 2) continue;
      hit = true;
      bump(byClass, cls, n - 1);
      effectsReplaced += n - 1;
      // Did the siblings of that class actually differ? Compare the JSON of
      // each sibling's own arguments: identical siblings lose nothing, and it is
      // the differing ones that produce a card that runs and is wrong.
      const sameClass = list.filter((e) => e.cls === cls);
      const shapes = new Set(sameClass.map((e) => JSON.stringify(e.args ?? e)));
      if (shapes.size > 1) cardHidDifferent = true;
    }
    if (hit) { abilitiesWithCollapse++; cardHit = true; }
  }

  if (!cardHit) continue;
  cardsWithCollapse++;
  if (cardHidDifferent) cardsWhereASiblingWasADifferentEffect++;

  const state = raw.oracleIds?.[0] ? (dispo.disposition[raw.oracleIds[0]] ?? 'no oracle id') : 'no oracle id';
  bump(byDisposition, state);
  if (state === 'emitted' && emittedExamples.length < 25) emittedExamples.push(raw.names?.[0] ?? raw.cls);
}

const L = (n, label) => console.log(String(n).padStart(7), label);

console.log('XMage records read', cards);
console.log('');
L(cardsWithCollapse, 'cards with at least one ability whose raw effect list repeats a class');
L(abilitiesWithCollapse, 'such abilities');
L(effectsReplaced, "effect constructions replaced by an earlier sibling's");
L(cardsWhereASiblingWasADifferentEffect, 'cards where the repeated siblings were NOT identical, so something was lost');
console.log('');
console.log('what the emitter did with those cards:');
for (const [k, n] of [...byDisposition.entries()].sort((a, b) => b[1] - a[1])) L(n, k);
console.log('');
console.log('top classes repeated in one effect list:');
for (const [k, n] of [...byClass.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) L(n, k);
console.log('');
console.log('emitted examples:', emittedExamples.join(', '));

writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  cards,
  cardsWithCollapse,
  abilitiesWithCollapse,
  effectsReplaced,
  cardsWhereASiblingWasADifferentEffect,
  byDisposition: Object.fromEntries(byDisposition),
  byClass: Object.fromEntries(byClass),
  emittedExamples,
}, null, 1));
console.log('wrote', OUT);
