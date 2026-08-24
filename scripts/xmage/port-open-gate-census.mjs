#!/usr/bin/env node
/**
 * WHAT COULD AN HONEST GATE SEE?
 *
 * `xmageSwapFor` refuses a card when the compiler's coverage reads 'full'. On
 * 4,916 in-pool cards that hold an XMage record, that sentence fires. 3,557 of
 * those cards the shipped verdict already PASSES, and 1,359 it REFUSES. So
 * 'full' is not the same claim as "the compiler beat the port": it says the
 * compiler read every printed paragraph, which is true of all 4,916, and says
 * nothing about whether what it produced can run.
 *
 * The gate lives inside the compiler and cannot run a probe or a game. So the
 * question this script answers is narrow and factual: which STRUCTURAL tests,
 * computable from the compiled abilities alone with no engine import, separate
 * the 1,359 from the 3,557? Each candidate is scored by what it would cost and
 * what it would buy, so the gate can be opened on evidence.
 *
 * Every figure comes from recompiling the whole pool with the shipped compiler
 * and joining it to the shipped verdict dump. Nothing is sampled.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied: they carry Wizards of the Coast rules text. Forge is GPL-3.0 and was
 * not fetched, read or referenced.
 *
 * Run:
 *   node --experimental-strip-types scripts/xmage/port-open-gate-census.mjs
 *
 * Needs scratch/verify-card-verdicts.json from
 *   DM_CARD_DUMP=1 node --experimental-strip-types scripts/verify-ability-coverage.mjs
 */

import { createReadStream, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../../src/lib/cards/abilities/compiler.ts';
import { XMAGE_LOWERED } from '../../src/lib/cards/xmage/lowered.generated.ts';
import { keywordSupport } from '../../src/lib/game/keywords.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const VERDICTS = join(ROOT, 'scratch', 'verify-card-verdicts.json');
const OUT = join(ROOT, 'scratch', 'port-open-gate-census.json');

if (!existsSync(VERDICTS)) {
  console.error(`Missing ${VERDICTS}. Run verify-ability-coverage.mjs with DM_CARD_DUMP=1 first.`);
  process.exit(1);
}

const verdictRows = JSON.parse(readFileSync(VERDICTS, 'utf8')).cards;
const verdictOf = new Map(verdictRows.map((r) => [r.o, r]));

/* The same pool filter verify-ability-coverage.mjs builds, kept in step with it
 * by reading its own output for membership rather than re-deriving the rule. */
const inPool = new Set(verdictRows.map((r) => r.o));

async function* rows(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield JSON.parse(line);
}

const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const pct = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));

/* ------------------------------------------------------------------ *
 * The candidate structural tests
 *
 * Each takes the compiler's OWN trace and returns true when the compiler's
 * complete reading is nevertheless inert, so the port would be worth asking.
 * None of them may import a game predicate that reaches back into the compiler.
 * ------------------------------------------------------------------ */

/** Every ability is a keyword the engine treats as advisory: nothing enforces it. */
function allKeywordsAdvisory(abilities) {
  if (!abilities.length) return false;
  if (!abilities.every((a) => a.kind === 'keyword')) return false;
  return abilities.every((a) => keywordSupport(String(a.keyword ?? '')) !== 'engine');
}

/** At least one ability is a keyword the engine treats as advisory. */
function anyKeywordAdvisory(abilities) {
  return abilities.some((a) => a.kind === 'keyword' && keywordSupport(String(a.keyword ?? '')) !== 'engine');
}

/**
 * A paragraph the compiler marked consumed that no ability carries the text of.
 * `verify-ability-coverage.mjs` difference 2: the span is covered and nothing
 * was produced for it, which the coverage value cannot express.
 */
function unmappedParagraphs(trace) {
  const consumed = new Set(trace.consumedSpans.map(([a, b]) => `${a}:${b}`));
  const unparsedSpans = new Set(trace.result.unparsed.map((u) => `${u.span[0]}:${u.span[1]}`));
  const lines = new Set();
  for (const a of trace.result.abilities) {
    for (const line of String(a.text ?? '').split('\n')) {
      const k = line.trim();
      if (k) lines.add(k);
    }
  }
  let unmapped = 0;
  let unaccounted = 0;
  for (const para of trace.normalized.paragraphs) {
    const key = `${para.span[0]}:${para.span[1]}`;
    if (unparsedSpans.has(key)) continue;
    if (!consumed.has(key)) { unaccounted++; continue; }
    if (!lines.has(para.raw.trim())) unmapped++;
  }
  return { unmapped, unaccounted };
}

/** An ability that produced no effect at all and grants nothing. */
function anyEmptyAbility(abilities) {
  return abilities.some((a) => {
    if (a.kind === 'keyword' || a.kind === 'static' || a.kind === 'replacement') return false;
    return !(a.effects ?? []).length;
  });
}

const CANDIDATES = {
  'C1 every ability is an advisory keyword': (t) => allKeywordsAdvisory(t.result.abilities),
  'C2 any ability is an advisory keyword': (t) => anyKeywordAdvisory(t.result.abilities),
  'C3 a consumed paragraph produced no ability': (t) => {
    const { unmapped, unaccounted } = unmappedParagraphs(t);
    return unmapped > 0 || unaccounted > 0;
  },
  'C4 an effect-bearing ability has no effects': (t) => anyEmptyAbility(t.result.abilities),
  'C1|C3|C4 union': (t) =>
    allKeywordsAdvisory(t.result.abilities) ||
    anyEmptyAbility(t.result.abilities) ||
    (() => { const u = unmappedParagraphs(t); return u.unmapped > 0 || u.unaccounted > 0; })(),
};

/* ------------------------------------------------------------------ */

let seen = 0;
let population = 0;
let compilerPasses = 0;
let compilerRefuses = 0;
const score = new Map();
for (const k of Object.keys(CANDIDATES)) score.set(k, { buys: 0, costs: 0 });
const refusedWhy = new Map();
const buysExamples = new Map();

for await (const card of rows(SRC)) {
  if (!card.oracle_id || !inPool.has(card.oracle_id)) continue;
  seen++;

  const trace = compileWithTrace(card);
  const result = trace.result;

  // The population the gate's `full` sentence actually refuses: the compiler
  // spoke, its coverage read full, the port has a record, and the front-face
  // bar would not have refused it anyway.
  if (result.source !== 'compiler') continue;
  if (result.coverage !== 'full') continue;
  if (!Object.prototype.hasOwnProperty.call(XMAGE_LOWERED, card.oracle_id)) continue;
  if (trace.normalized.paragraphs.some((p) => p.face > 0)) continue;

  population++;
  const v = verdictOf.get(card.oracle_id);
  const passes = v && (v.v === 'AUTOMATED' || v.v === 'PROMPTED');
  if (passes) compilerPasses++; else { compilerRefuses++; bump(refusedWhy, v?.v ?? '?'); }

  for (const [name, test] of Object.entries(CANDIDATES)) {
    let fires = false;
    try { fires = !!test(trace); } catch { fires = false; }
    if (!fires) continue;
    const s = score.get(name);
    if (passes) s.costs++;
    else {
      s.buys++;
      const ex = buysExamples.get(name) ?? [];
      if (ex.length < 12) { ex.push(card.name); buysExamples.set(name, ex); }
    }
  }
}

const L = (n, label) => console.log(String(n).padStart(7), label);

console.log('pool rows compiled', seen);
console.log('');
console.log('THE POPULATION THE `full` SENTENCE REFUSES, with a record and a playable face');
L(population, 'cards');
L(compilerPasses, 'the shipped verdict PASSES (AUTOMATED or PROMPTED), which a gate opening risks');
L(compilerRefuses, 'the shipped verdict REFUSES, which a gate opening could only help');
console.log('  refused verdicts:', [...refusedWhy.entries()].map(([k, n]) => `${k} ${n}`).join(', '));
console.log('');
console.log('CANDIDATE STRUCTURAL TESTS, scored on that population');
console.log('  buys  = cards the compiler REFUSES that the test would hand to the port');
console.log('  costs = cards the compiler PASSES that the test would hand to the port');
console.log('');
for (const [name, s] of score) {
  console.log(
    `${String(s.buys).padStart(6)} buys  ${String(s.costs).padStart(6)} costs   ` +
    `${pct(s.buys, compilerRefuses).padStart(6)}% of the refused, ${pct(s.costs, compilerPasses).padStart(6)}% of the passing   ${name}`
  );
}
console.log('');
for (const [name, ex] of buysExamples) console.log(`  ${name}: ${ex.join(', ')}`);

writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  poolCompiled: seen,
  population,
  compilerPasses,
  compilerRefuses,
  refusedWhy: Object.fromEntries(refusedWhy),
  candidates: Object.fromEntries([...score].map(([k, v]) => [k, v])),
  buysExamples: Object.fromEntries(buysExamples),
}, null, 1));
console.log('wrote', OUT);
