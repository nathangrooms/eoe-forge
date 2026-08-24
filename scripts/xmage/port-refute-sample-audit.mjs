#!/usr/bin/env node
/**
 * AUDIT THE SAMPLE ITSELF, which is a thing a sample should have to survive.
 *
 * The fifty-card hand check found seven cards carrying one of six defect
 * families. `port-refute-defect-census.mjs` says only sixteen of the six
 * hundred and ninety four candidates carry any of them, and seven of sixteen in
 * a draw of fifty is not something a fair draw does. Either the draw is not
 * fair or the census is not counting the same population, and guessing which
 * would be exactly the kind of unchecked step this review exists to catch.
 *
 * So this rebuilds the candidate list the SAME WAY the sample does — the
 * Scryfall pool, `compileWithTrace`, the shipped verdict — and intersects it
 * with the census by oracle id, then prints where each flagged card sits in the
 * sorted list and whether the shuffle picked it.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied. Forge is GPL-3.0 and was not fetched, read or referenced.
 *
 * Run: node --experimental-strip-types scripts/xmage/port-refute-sample-audit.mjs
 */

import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../../src/lib/cards/abilities/compiler.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const VERDICTS = join(ROOT, 'scratch', 'verify-card-verdicts.json');
const CENSUS = join(ROOT, 'scratch', 'port-refute-defect-census.json');

const ALREADY = [
  'port-primary-accuracy-sample.json',
  'port-open-accuracy-sample.round1.json',
  'port-open-accuracy-sample.round2.json',
  'port-open-accuracy-sample.round3.json',
  'port-open-accuracy-sample.json',
  'port-grow-handcheck.do-if-cost-paid.json',
  'port-grow-handcheck.do-if-cost-paid.round1.json',
  'port-grow-handcheck.look-and-pick.json',
  'port-grow-handcheck.scry+surveil.json',
].map((f) => join(ROOT, 'scratch', f));

const alreadyChecked = new Set();
for (const path of ALREADY) {
  if (!existsSync(path)) continue;
  for (const row of JSON.parse(readFileSync(path, 'utf8')).sample) alreadyChecked.add(row.o);
}

const flagged = new Map();
for (const [fam, rows] of Object.entries(JSON.parse(readFileSync(CENSUS, 'utf8')).families)) {
  for (const r of rows) {
    if (!r.shipped) continue;
    flagged.set(r.oracleId, (flagged.get(r.oracleId) ?? []).concat(fam));
  }
}

const NOT_A_CARD = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'front_card']);
const NOT_A_NORMAL_GAME = new Set(['planar', 'scheme', 'vanguard']);
const NOT_A_GAME_PRODUCT = new Set(['token', 'memorabilia']);

const dumped = JSON.parse(readFileSync(VERDICTS, 'utf8'));
const verdictOf = new Map(dumped.cards.map((c) => [c.o, c]));
const PASSES = new Set(['AUTOMATED', 'PROMPTED']);

const candidates = [];
const rl = createInterface({ input: createReadStream(SRC), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  const c = JSON.parse(line);
  if (NOT_A_CARD.has(c.layout)) continue;
  if (NOT_A_GAME_PRODUCT.has(c.set_type)) continue;
  if (NOT_A_NORMAL_GAME.has(c.layout)) continue;
  if (c.digital) continue;
  if (!(c.games ?? []).includes('paper')) continue;
  const t = compileWithTrace(c);
  if (t.result.source !== 'xmage') continue;
  const v = verdictOf.get(t.result.oracleId);
  if (!v || !PASSES.has(v.v)) continue;
  if (alreadyChecked.has(t.result.oracleId)) continue;
  candidates.push({ name: c.name, oracleId: c.oracle_id });
}
candidates.sort((a, b) => (a.oracleId < b.oracleId ? -1 : 1));

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const marks = candidates.map((c) => flagged.has(c.oracleId));
console.log(`candidates ${candidates.length}, of them flagged by the census ${marks.filter(Boolean).length}`);
for (const [i, c] of candidates.entries()) {
  if (flagged.has(c.oracleId)) console.log(`  position ${i}: ${c.name}  ${flagged.get(c.oracleId).join(',')}`);
}

for (const seed of [20260824, 777, 1, 42, 99991]) {
  const idx = candidates.map((_, i) => i);
  const rnd = mulberry32(seed);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const drawn = idx.slice(0, 50);
  const hits = drawn.filter((i) => marks[i]).length;
  console.log(`seed ${seed}: ${hits} flagged in the drawn 50`);
}

/* The distribution the draw should follow, measured rather than reasoned. */
let counts = new Map();
for (let seed = 1; seed <= 5000; seed++) {
  const idx = candidates.map((_, i) => i);
  const rnd = mulberry32(seed * 7919);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const hits = idx.slice(0, 50).filter((i) => marks[i]).length;
  counts.set(hits, (counts.get(hits) ?? 0) + 1);
}
console.log('over 5,000 seeds, flagged cards drawn in 50:');
for (const k of [...counts.keys()].sort((a, b) => a - b)) console.log(`  ${k}: ${counts.get(k)}`);
