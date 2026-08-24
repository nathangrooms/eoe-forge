#!/usr/bin/env node
/**
 * TWENTY CARDS WHERE THE COMPILER AND THE PORT BOTH SPOKE AND DIFFERED, drawn
 * at random from the census, printed with BOTH answers and the printed card, so
 * a person can say which one was right.
 *
 * The census counts disagreements and records their direction. It cannot say
 * who is correct, because that is a reading of the printed card. This puts the
 * three side by side and grades nothing.
 *
 * Per card it prints Scryfall's oracle text, the abilities the ORACLE-TEXT
 * COMPILER produced with the second source off, the abilities the PORT produced
 * from the XMage record, which of the two the shipped precedence rule picked,
 * and the census's own account of how they differ.
 *
 * The draw is a seeded shuffle over the substantive disagreements sorted by
 * oracle id, with the seed printed. `{do:'manual'}`-only differences are
 * excluded, exactly as the census excludes them from its own headline: a
 * compiler that emitted a "resolve by hand" marker has not disagreed about
 * anything, it has declined to answer.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied. Forge is GPL-3.0 and was not fetched, read or referenced.
 *
 * Run: node --experimental-strip-types scripts/xmage/port-refute-disagreement-sample.mjs
 */

import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../../src/lib/cards/abilities/compiler.ts';
import { XMAGE_LOWERED } from '../../src/lib/cards/xmage/lowered.generated.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const CENSUS = join(ROOT, 'scratch', 'port-disagreement-census.json');
const WANT = Number(process.env.DM_SAMPLE ?? 20);
const SEED = Number(process.env.DM_SEED ?? 8675309);
const OUT = join(ROOT, 'scratch', `port-refute-disagreement-sample.seed${SEED}.json`);

if (!existsSync(CENSUS)) {
  console.error(`Missing ${CENSUS}. Run DM_XMAGE_OFF=1 port-disagreement-census.mjs first.`);
  process.exit(1);
}
/*
 * MUST be run with the second source off, for the same reason the census is:
 * with it on, `compileWithTrace` returns the PORT's abilities on every swapped
 * card, and printing those under the heading "the compiler says" would compare
 * the port against itself. `XMAGE_LOWERED` is a table and is read directly, so
 * the port side is unaffected by the flag.
 */
if (process.env.DM_XMAGE_OFF !== '1') {
  console.error('Run this with DM_XMAGE_OFF=1, so the compiler side is the compiler\'s own answer.');
  process.exit(1);
}

const census = JSON.parse(readFileSync(CENSUS, 'utf8'));
const rows = census.cards.filter((c) => !c.onlyACompilerRefusal);
rows.sort((a, b) => (a.o < b.o ? -1 : 1));

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
for (let i = rows.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [rows[i], rows[j]] = [rows[j], rows[i]];
}
const picked = rows.slice(0, WANT);
const wanted = new Map(picked.map((r) => [r.o, r]));

const NOT_A_CARD = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'front_card']);
const NOT_A_NORMAL_GAME = new Set(['planar', 'scheme', 'vanguard']);
const NOT_A_GAME_PRODUCT = new Set(['token', 'memorabilia']);

const found = new Map();
{
  const rl = createInterface({ input: createReadStream(SRC), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = JSON.parse(line);
    if (!wanted.has(c.oracle_id)) continue;
    if (NOT_A_CARD.has(c.layout)) continue;
    if (NOT_A_GAME_PRODUCT.has(c.set_type)) continue;
    if (NOT_A_NORMAL_GAME.has(c.layout)) continue;
    found.set(c.oracle_id, c);
  }
}

console.log(`${census.substantive} substantive disagreements, sampling ${WANT} with seed ${SEED}`);
console.log('');

const out = [];
for (const [i, row] of picked.entries()) {
  const c = found.get(row.o);
  if (!c) {
    console.log(`${i + 1}. ${row.n} — not in the pool file, skipped`);
    continue;
  }
  const trace = compileWithTrace(c);
  const text = c.oracle_text ?? (c.card_faces ?? []).map((f) => f.oracle_text).filter(Boolean).join('\n//\n') ?? '';

  /*
   * The compiler's own answer, taken from the trace's pre-swap abilities so it
   * is never the port's answer wearing the compiler's name. `compileWithTrace`
   * keeps both when it swaps.
   */
  const compilerAbilities = trace.result.abilities;

  console.log('='.repeat(78));
  console.log(`${String(i + 1).padStart(2)}. ${c.name}   ${c.oracle_id}`);
  console.log(`    ${c.type_line}   ${c.mana_cost ?? ''}`);
  console.log(`    shipped rule picked: ${row.shippedSource}, verdict ${row.shippedVerdict}`);
  console.log(`    census says they differ on: ${row.diffs.join(', ')}`);
  console.log('');
  console.log('SCRYFALL ORACLE TEXT:');
  for (const line of String(text).split(String.fromCharCode(10))) console.log('    ' + line);
  console.log('');
  console.log('THE COMPILER SAYS:');
  for (const a of compilerAbilities) {
    const { text: _t, ...rest } = a;
    console.log('    ' + JSON.stringify(rest));
  }
  console.log('');
  console.log('THE PORT SAYS:');
  for (const a of XMAGE_LOWERED[row.o] ?? []) {
    const { text: _t, ...rest } = a;
    console.log('    ' + JSON.stringify(rest));
  }
  console.log('');
  console.log('CENSUS DETAIL:');
  console.log('    ' + JSON.stringify(row.detail));
  console.log('');

  out.push({ n: c.name, o: c.oracle_id, oracle: text, shipped: row.shippedSource, diffs: row.diffs, detail: row.detail });
}

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), seed: SEED, sample: out }, null, 1));
console.log('wrote', OUT);
