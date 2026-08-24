#!/usr/bin/env node
/**
 * THE ACCURACY SAMPLE, ROUND N. A FRESH 30 cards the port passes, none of them
 * a card any earlier round already hand checked.
 *
 * `docs/engine/PORT-PRIMARY.md` section 5 measured 46.7% disagreement over 30
 * cards and named the sibling collapse in `build-records.mjs` as the largest
 * cause. That bug is fixed, and so is the family of dropped restrictions the
 * next round found. Re-grading a sample the fixes were DERIVED from would
 * measure the fix against its own worked examples, which is the oldest way
 * there is to report a number that is true and means nothing. So this script
 * excludes every card of every earlier round by oracle id and strides over what
 * is left.
 *
 * It does not grade anything. It prints, per card:
 *
 *   Scryfall's oracle text, verbatim
 *   every ability the engine ended up with, as `dsl.ts` shapes
 *   what `probeBehaviour` did with them on the shipped probe board
 *
 * and a person marks each AGREES or DISAGREES against the printed card.
 *
 * ## The sample is not chosen
 *
 * A fixed stride over the candidate list sorted by oracle id: an arbitrary
 * order nobody controls, at an interval fixed by the count. Run it twice and it
 * returns the same 30 cards. There is no seed to nudge and no filter on what
 * makes an interesting card. The ONE filter is the exclusion above, and it can
 * only make the sample harder to flatter, never easier.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied; every line of card wording printed below comes from Scryfall. Forge
 * is GPL-3.0 and was not fetched, read or referenced.
 *
 * Run: node --experimental-strip-types scripts/xmage/port-open-accuracy-sample.mjs
 *      DM_SAMPLE=60 ... to widen it.
 */

import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../../src/lib/cards/abilities/compiler.ts';
import { probeBehaviour } from '../../src/lib/game/abilities/behaviour-probe.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const VERDICTS = join(ROOT, 'scratch', 'verify-card-verdicts.json');
/*
 * EVERY SAMPLE ALREADY HAND CHECKED, excluded. One entry per round.
 *
 * A round of fixes derived from a sample cannot be graded on that sample. That
 * is true of round 1 against round 0 and it stays true of round 2 against
 * round 1, so this is a list rather than a single file and it grows by one
 * line each time the rate is re-measured.
 */
const ALREADY = [
  join(ROOT, 'scratch', 'port-primary-accuracy-sample.json'),
  join(ROOT, 'scratch', 'port-open-accuracy-sample.round1.json'),
  join(ROOT, 'scratch', 'port-open-accuracy-sample.round2.json'),
  join(ROOT, 'scratch', 'port-open-accuracy-sample.round3.json'),
];
const OUT = join(ROOT, 'scratch', 'port-open-accuracy-sample.json');

const WANT = Number(process.env.DM_SAMPLE ?? 30);

if (!existsSync(VERDICTS)) {
  console.error(`Missing ${VERDICTS}. Run DM_CARD_DUMP=1 verify-ability-coverage.mjs first.`);
  process.exit(1);
}
const alreadyChecked = new Set();
for (const path of ALREADY) {
  if (!existsSync(path)) {
    console.error(`Missing ${path}. An earlier sample has to be readable to be excluded.`);
    process.exit(1);
  }
  for (const row of JSON.parse(readFileSync(path, 'utf8')).sample) alreadyChecked.add(row.o);
}
console.log(`${alreadyChecked.size} cards already hand checked in ${ALREADY.length} earlier rounds`);

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

const dumped = JSON.parse(readFileSync(VERDICTS, 'utf8'));
const verdictOf = new Map(dumped.cards.map((c) => [c.o, c]));
const PASSES = new Set(['AUTOMATED', 'PROMPTED']);

const candidates = [];
let excluded = 0;
for (const card of pool) {
  const t = compileWithTrace(card);
  if (t.result.source !== 'xmage') continue;
  const v = verdictOf.get(t.result.oracleId);
  if (!v || !PASSES.has(v.v)) continue;
  if (alreadyChecked.has(t.result.oracleId)) { excluded++; continue; }
  candidates.push({ card, abilities: t.result.abilities, verdict: v.v });
}

candidates.sort((a, b) => (a.card.oracle_id < b.card.oracle_id ? -1 : 1));

const stride = Math.floor(candidates.length / WANT);
const sample = [];
for (let i = 0; sample.length < WANT && i * stride < candidates.length; i++) {
  sample.push(candidates[i * stride]);
}

console.log(`the port passes ${candidates.length + excluded} cards`);
console.log(`${excluded} of them were hand checked in an earlier round and are excluded`);
console.log(`sampling every ${stride}th of the remaining ${candidates.length}, ${sample.length} cards`);
console.log('');

const out = [];
for (const [i, c] of sample.entries()) {
  const probe = probeBehaviour(c.abilities);
  const text = c.card.oracle_text ?? (c.card.card_faces ?? []).map((f) => f.oracle_text).filter(Boolean).join('\n//\n') ?? '';

  console.log('='.repeat(78));
  console.log(`${String(i + 1).padStart(2)}. ${c.card.name}   [${c.verdict}]   ${c.card.oracle_id}`);
  console.log(`    ${c.card.type_line}   ${c.card.mana_cost ?? ''}`);
  console.log('');
  console.log('SCRYFALL ORACLE TEXT:');
  for (const line of String(text).split('\n')) console.log('    ' + line);
  console.log('');
  console.log('WHAT THE ENGINE RUNS:');
  for (const a of c.abilities) {
    const { text: _t, ...rest } = a;
    console.log('    ' + JSON.stringify(rest));
  }
  console.log('');
  console.log(`PROBE: ${probe.outcome}, ${probe.actions} actions`);
  for (const p of probe.perAbility) console.log(`    ${p.id} ${p.kind}: ${p.outcome}, ${p.actions} actions`);
  if (probe.answered.length) console.log('    answered: ' + probe.answered.join(' | '));
  if (probe.unbound.length) console.log('    unbound: ' + probe.unbound.join(' | '));
  if (probe.deferred.length) console.log('    deferred: ' + probe.deferred.join(' | '));
  console.log('');

  out.push({
    n: c.card.name,
    o: c.card.oracle_id,
    typeLine: c.card.type_line,
    oracle: text,
    verdict: c.verdict,
    abilities: c.abilities.map(({ text: _t, ...rest }) => rest),
    probe: { outcome: probe.outcome, actions: probe.actions, perAbility: probe.perAbility, answered: probe.answered, unbound: probe.unbound, deferred: probe.deferred },
  });
}

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), excluded, candidates: candidates.length, stride, sample: out }, null, 1));
console.log('wrote', OUT);
