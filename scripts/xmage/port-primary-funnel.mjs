#!/usr/bin/env node
/**
 * WHY DOES THE PORT SPEAK FOR 1,914 CARDS WHEN IT LOWERS 7,237?
 *
 * Counted at every step, per card, over the same pool
 * `scripts/verify-ability-coverage.mjs` uses. Nothing here is sampled and
 * nothing is estimated.
 *
 * The step list:
 *
 *   in the pool -> XMage has a record -> the record lowered -> the record is in
 *   the shipped table -> the precedence rule let it speak -> the probe passed it
 *
 * ## How the PRE-swap value is obtained without replicating the gate
 *
 * The gate reads `CardAbilities.coverage`, and `compileWithTrace` OVERWRITES
 * that field on any card it swaps. So a single compile cannot tell you what the
 * gate saw. Rather than reimplement the gate here, and a copy that can drift is
 * exactly what this project keeps paying for, this script runs the REAL
 * compiler twice, in two processes:
 *
 *   pass `off`, with `DM_XMAGE_OFF=1`, so `xmageSwapFor` refuses everything and
 *                `compileWithTrace` returns the compiler's own answer untouched.
 *                That is the pre-swap truth, produced by the shipped code rather
 *                than by a copy of it. It writes one line per oracle id.
 *   pass `on`, with the flag cleared, so it behaves exactly as the shipped app
 *                does. It reads the `off` file and joins.
 *
 * TWO PROCESSES AND NOT TWO MODULE INSTANCES. A query string on an `import()`
 * specifier does give a second instance of THAT file, but the query does not
 * propagate to its own imports, so both compiler instances would share one
 * `lowered.ts` and one `DM_XMAGE_OFF`. That was the first version of this script
 * and it reported zero swaps; it is recorded here because the failure looks
 * exactly like a real finding.
 *
 * The `on` pass then PREDICTS each card's source from the pre-swap value and
 * compares that prediction against what the live compiler actually did. If the
 * gate read the post-swap value the prediction would be wrong on every swapped
 * card. That is the test, and it prints the count either way.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied; card wording comes from Scryfall. Forge is GPL-3.0 and was not
 * fetched, read or referenced.
 *
 * Run, in this order:
 *   node --experimental-strip-types scripts/xmage/port-primary-dispositions.mjs
 *   DM_CARD_DUMP=1 node --experimental-strip-types scripts/verify-ability-coverage.mjs
 *   node --experimental-strip-types scripts/xmage/port-primary-funnel.mjs
 */

import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../../src/lib/cards/abilities/compiler.ts';
import { normalizeCard } from '../../src/lib/cards/abilities/normalize.ts';
import { hasXmageRecord, xmageLoweredCardCount } from '../../src/lib/cards/xmage/lowered.ts';
import { XMAGE_LOWERED } from '../../src/lib/cards/xmage/lowered.generated.ts';
import { probeBehaviour } from '../../src/lib/game/abilities/behaviour-probe.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const VERDICTS = join(ROOT, 'scratch', 'verify-card-verdicts.json');
const DISPOSITIONS = join(ROOT, 'scratch', 'xmage-record-disposition.json');
const OUT = join(ROOT, 'scratch', 'port-primary-funnel.json');
const PRE = join(ROOT, 'scratch', 'port-primary-pre-swap.json');

const OFF_PASS = process.env.DM_XMAGE_OFF === '1';

for (const [what, p] of [['verdict dump', VERDICTS], ['record dispositions', DISPOSITIONS], ['bulk file', SRC]]) {
  if (!existsSync(p)) {
    console.error(`Missing the ${what}: ${p}. See the header for the order to run these in.`);
    process.exit(1);
  }
}

/* ---------- the pool, same filter as verify-ability-coverage.mjs ---------- */

const NOT_A_CARD = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'front_card']);
const NOT_A_NORMAL_GAME = new Set(['planar', 'scheme', 'vanguard']);
const NOT_A_GAME_PRODUCT = new Set(['token', 'memorabilia']);

const pool = [];
{
  const rl = createInterface({ input: createReadStream(SRC), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = JSON.parse(line);
    if (NOT_A_CARD.has(c.layout)) continue;
    if (NOT_A_GAME_PRODUCT.has(c.set_type)) continue;
    if (NOT_A_NORMAL_GAME.has(c.layout)) continue;
    if (c.digital) continue;
    if (!(c.games ?? []).includes('paper')) continue;
    pool.push(c);
  }
}

/* ---------- pass `off`: the compiler's own answer, written out and nothing else ---------- */

if (OFF_PASS) {
  const pre = Object.create(null);
  for (const card of pool) {
    const t = compileWithTrace(card);
    if (t.result.source !== 'compiler') {
      console.error('DM_XMAGE_OFF=1 did not turn the second source off. Aborting.');
      process.exit(1);
    }
    pre[t.result.oracleId] = { c: t.result.coverage, u: t.result.unparsed.length, a: t.result.abilities.length };
  }
  writeFileSync(PRE, JSON.stringify({ generatedAt: new Date().toISOString(), pool: pool.length, pre }));
  console.log('pass off: wrote', Object.keys(pre).length, 'pre-swap rows to', PRE);
  process.exit(0);
}

/* ---------- pass `on`: run the `off` pass first, then join ---------- */

{
  const child = spawnSync(
    process.execPath,
    ['--experimental-strip-types', fileURLToPath(import.meta.url)],
    { env: { ...process.env, DM_XMAGE_OFF: '1' }, stdio: 'inherit' }
  );
  if (child.status !== 0) {
    console.error('the DM_XMAGE_OFF=1 pass failed; nothing below would be trustworthy');
    process.exit(1);
  }
}
const preSwap = JSON.parse(readFileSync(PRE, 'utf8'));
if (preSwap.pool !== pool.length) {
  console.error(`the two passes disagree about the pool: ${preSwap.pool} vs ${pool.length}`);
  process.exit(1);
}

const dumped = JSON.parse(readFileSync(VERDICTS, 'utf8'));
const verdictOf = new Map(dumped.cards.map((c) => [c.o, c]));
const dispo = JSON.parse(readFileSync(DISPOSITIONS, 'utf8'));

const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const pct = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));
const PASSES = new Set(['AUTOMATED', 'PROMPTED']);

/*
 * A REFUSAL, and what is deliberately not one.
 *
 * SILENT and PROMPTABLE are refusals: the card has text and the engine could
 * not show it working. NO-TEXT is not a refusal, because the card has no oracle text
 * for anything to speak for, so it is counted apart rather than folded in.
 * This is the same 25,648 the brief names; folding NO-TEXT in gives 25,974 and
 * would be a different question wearing the same number's clothes.
 */
const REFUSALS = new Set(['SILENT', 'PROMPTABLE']);

/* ---------- the walk ---------- */

const step = {
  pool: 0,
  hasRecordAtAll: 0,      // XMage has a card file that joined to this oracle id
  recordLowers: 0,        // that record is in lowered.generated.ts
  gatePassed: 0,          // the precedence rule swapped it
  probePassed: 0,         // AUTOMATED or PROMPTED with source xmage
};

const gateRefusal = new Map();       // why the gate said no, for cards that HAVE a record
const notSpokenFor = new Map();      // for REFUSED cards only: why the port was silent
const notSpokenForBlockers = new Map();
const coverageMove = new Map();      // pre -> post, on swapped cards
const predictionMisses = [];
const swappedVerdicts = new Map();
const fullAndRefused = [];           // the prize: gate said no on coverage full, probe refused anyway
const rows = [];

let swappedWithUnparsedErased = 0;
let unparsedParagraphsErased = 0;
let swappedNowFullCoverage = 0;
let swappedNowFullWithTriggers = 0;
let swappedWouldRefuseIfReasked = 0;
const wouldProbe = new Map();
let wouldRun = 0;
const fullGateVerdict = new Map();

for (const card of pool) {
  step.pool++;

  const post = compileWithTrace(card);
  const oracleId = post.result.oracleId;
  const pre = preSwap.pre[oracleId];
  if (!pre) { console.error('no pre-swap row for', oracleId, card.name); process.exit(1); }
  const normalized = normalizeCard(card);
  const backFace = normalized.paragraphs.some((p) => p.face > 0);

  const has = hasXmageRecord(oracleId);
  const recordState = dispo.disposition[oracleId] ?? null;
  if (recordState) step.hasRecordAtAll++;
  if (has) step.recordLowers++;

  // The prediction, made from the PRE-swap coverage only.
  let predicted;
  if (!has) predicted = 'no XMage record for this oracle id';
  else if (pre.c === 'full') predicted = 'compiler understands this card completely';
  else if (backFace) predicted = 'the card has text on a face the engine does not play';
  else predicted = 'SWAP';

  const actuallySwapped = post.result.source === 'xmage';
  if ((predicted === 'SWAP') !== actuallySwapped) {
    predictionMisses.push({ name: card.name, oracleId, predicted, actuallySwapped, pre: pre.c });
  }

  if (has && predicted !== 'SWAP') bump(gateRefusal, predicted);

  const v = verdictOf.get(oracleId);
  const verdict = v?.v ?? 'NOT-IN-DUMP';
  const refused = REFUSALS.has(verdict);

  if (actuallySwapped) {
    step.gatePassed++;
    bump(coverageMove, `${pre.c} -> ${post.result.coverage}`);
    bump(swappedVerdicts, verdict);
    if (PASSES.has(verdict)) step.probePassed++;
    if (pre.u > 0) {
      swappedWithUnparsedErased++;
      unparsedParagraphsErased += pre.u;
    }
    if (post.result.coverage === 'full') {
      swappedNowFullCoverage++;
      if (post.result.abilities.some((a) => a.kind === 'triggered')) swappedNowFullWithTriggers++;
    }
    // Would the gate refuse this same card if it were handed the POST-swap
    // record? This is the named bug, asked directly.
    if (post.result.coverage === 'full') swappedWouldRefuseIfReasked++;
  }

  if (has && predicted === 'compiler understands this card completely') {
    bump(fullGateVerdict, PASSES.has(verdict) ? 'the compiler already passes this card' : `the compiler does not: ${verdict}`);
  }

  if (refused && !actuallySwapped) {
    // The 25,648. Why did the port not speak?
    let why;
    if (!recordState) why = '1. XMage has no record joined to this oracle id';
    else if (recordState === 'join-not-exact') why = '2. the record joined to Scryfall inexactly, so it may be another card';
    else if (recordState === 'blocked') why = '3. the record exists and did not lower';
    else if (recordState === 'vacuous') why = '4. the record lowered to nothing at all';
    else if (recordState === 'manual-marker') why = '5. the record lowered to a manual marker';
    else if (recordState === 'duplicate-oracle-id') why = '6. two XMage classes claim this oracle id';
    else if (predicted === 'compiler understands this card completely') why = '7. it lowers, and the gate refused: compiler coverage is full';
    else if (predicted === 'the card has text on a face the engine does not play') why = '8. it lowers, and the gate refused: text on a face the engine does not play';
    else why = '9. the gate passed and nothing ran it';
    bump(notSpokenFor, why);

    if (why.startsWith('3.')) {
      for (const prim of dispo.blockers[oracleId] ?? []) bump(notSpokenForBlockers, prim);
    }
    if (why.startsWith('7.')) {
      fullAndRefused.push({ name: card.name, oracleId, verdict, reasons: v?.d ?? [] });
      // The addressable population, measured rather than projected. Build the
      // ability list the swap WOULD have produced and put it to the same probe
      // the verify script uses. This changes no precedence: it is a read-only
      // question asked of the shipped probe, in a script the app never imports.
      const text = normalized.paragraphs.map((p) => p.raw).join('\n');
      const would = (XMAGE_LOWERED[oracleId] ?? []).map((a) => ({ ...a, text }));
      const pr = probeBehaviour(would);
      bump(wouldProbe, pr.outcome);
      if (pr.outcome === 'ran' && pr.actions > 0) wouldRun++;
    }
  }

  rows.push({
    o: oracleId,
    n: card.name,
    pre: pre.c,
    post: post.result.coverage,
    rec: recordState,
    swap: actuallySwapped,
    v: verdict,
  });
}

/* ---------- output ---------- */

const L = (n, label) => console.log(String(n).padStart(7), label);

console.log('THE FUNNEL, pool', step.pool);
console.log('');
L(step.pool, 'cards in the pool');
L(step.hasRecordAtAll, `XMage has a record joined to this oracle id  ${pct(step.hasRecordAtAll, step.pool)}%`);
L(step.recordLowers, `that record lowered and is in the shipped table  ${pct(step.recordLowers, step.pool)}%`);
L(step.gatePassed, `the precedence rule let it speak  ${pct(step.gatePassed, step.pool)}%`);
L(step.probePassed, `and the probe then passed the card  ${pct(step.probePassed, step.pool)}%`);
console.log('');
console.log('shipped table holds', xmageLoweredCardCount(), 'cards;', step.recordLowers, 'of them are in this pool');
console.log('');

console.log('THE GATE, over the', step.recordLowers, 'in-pool cards the table can speak for:');
L(step.gatePassed, 'SWAPPED');
for (const [why, n] of [...gateRefusal.entries()].sort((a, b) => b[1] - a[1])) L(n, why);
console.log('');

console.log('DOES THE GATE READ THE PRE-SWAP VALUE?');
console.log('  cards where the source predicted from the PRE-swap coverage');
console.log('  disagrees with what the live compiler did:', predictionMisses.length);
for (const m of predictionMisses.slice(0, 10)) console.log('   ', JSON.stringify(m));
console.log('');
console.log('  coverage on the swapped cards, before -> after:');
for (const [move, n] of [...coverageMove.entries()].sort((a, b) => b[1] - a[1])) L(n, move);
console.log('');
L(swappedNowFullCoverage, "swapped cards whose RETURNED coverage now reads 'full'");
L(swappedWouldRefuseIfReasked, 'of which the gate would refuse if it were re-asked on its own output');
L(swappedWithUnparsedErased, 'swapped cards that had unread paragraphs, erased by the swap');
L(unparsedParagraphsErased, 'unread paragraphs erased in total');
L(swappedNowFullWithTriggers, "swapped cards now reading 'full' that carry a triggered ability");
console.log('');

console.log('VERDICTS ON THE', step.gatePassed, 'SWAPPED CARDS:');
for (const [v, n] of [...swappedVerdicts.entries()].sort((a, b) => b[1] - a[1])) L(n, v);
console.log('');

const refusedTotal = [...notSpokenFor.values()].reduce((a, b) => a + b, 0);
console.log('THE REFUSED CARDS THE PORT NEVER SPOKE FOR:', refusedTotal);
for (const [why, n] of [...notSpokenFor.entries()].sort()) L(n, `${why}  ${pct(n, refusedTotal)}%`);
console.log('');

console.log('top primitives blocking the records in row 3:');
for (const [prim, n] of [...notSpokenForBlockers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) L(n, prim);
console.log('');

console.log('row 7 verdicts (the gate refused on full coverage and the probe refused anyway):');
const r7 = new Map();
for (const c of fullAndRefused) bump(r7, c.verdict);
for (const [v, n] of [...r7.entries()].sort((a, b) => b[1] - a[1])) L(n, v);
console.log('  top reasons those cards were refused:');
const r7why = new Map();
for (const c of fullAndRefused) for (const d of c.reasons) bump(r7why, d);
for (const [d, n] of [...r7why.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) L(n, d);
console.log('  first 20 by name:', fullAndRefused.slice(0, 20).map((c) => c.name).join(', '));
console.log('');

console.log('WHAT THE GATE IS PROTECTING, over the', [...fullGateVerdict.values()].reduce((a, b) => a + b, 0),
  "cards it refused on 'compiler coverage is full':");
for (const [k, n] of [...fullGateVerdict.entries()].sort((a, b) => b[1] - a[1])) L(n, k);
console.log('');

console.log('IF THE GATE OPENED ON ROW 7 ONLY, measured on the shipped probe:');
L(fullAndRefused.length, 'cards in row 7, the whole addressable population');
for (const [k, n] of [...wouldProbe.entries()].sort((a, b) => b[1] - a[1])) L(n, `the XMage abilities probe as ${k}`);
L(wouldRun, "of which 'ran' with at least one action, which is the probe's own bar");
console.log('  This is a CEILING on that row and not a verdict. The verify script');
console.log('  applies further bars after the probe, and every one of them can only');
console.log('  take cards away from this number.');

writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  step,
  gateRefusal: Object.fromEntries(gateRefusal),
  notSpokenFor: Object.fromEntries(notSpokenFor),
  coverageMove: Object.fromEntries(coverageMove),
  swappedVerdicts: Object.fromEntries(swappedVerdicts),
  predictionMisses,
  swappedNowFullCoverage,
  swappedWithUnparsedErased,
  unparsedParagraphsErased,
  swappedNowFullWithTriggers,
  fullGateVerdict: Object.fromEntries(fullGateVerdict),
  wouldProbe: Object.fromEntries(wouldProbe),
  wouldRun,
  fullAndRefused,
  rows,
}));
console.log('');
console.log('wrote', OUT);
