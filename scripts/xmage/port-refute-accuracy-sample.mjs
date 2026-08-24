#!/usr/bin/env node
/**
 * THE ADVERSARIAL ACCURACY SAMPLE. Fifty cards the port speaks for and the
 * shipped verdict PASSES, drawn at RANDOM, none of them a card any earlier
 * round hand checked.
 *
 * This is not `port-open-accuracy-sample.mjs` with a bigger number. Two things
 * differ on purpose:
 *
 *   1. The draw is a seeded shuffle, not a fixed stride. A stride over a list
 *      sorted by oracle id is reproducible and unchosen, which is why the
 *      earlier rounds used it, but it is also the SAME positions every time the
 *      candidate list barely moves, so four rounds of it walked neighbouring
 *      slices of one ordering. A shuffle keyed on a seed printed in the output
 *      is reproducible for the same reason and covers the list differently.
 *   2. It excludes EVERY earlier round, including the four DSL-growth hand
 *      checks, not just the accuracy rounds.
 *
 * It grades nothing. Per card it prints Scryfall's oracle text verbatim, every
 * ability the SHIPPED compiler ended up with as `dsl.ts` shapes, and what
 * `probeBehaviour` did with them. A person marks each AGREES or DISAGREES.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied: they carry Wizards of the Coast rules text, which is not XMage's to
 * license, so every line of card wording printed below comes from Scryfall.
 * Forge is GPL-3.0 and was not fetched, read or referenced.
 *
 * Run: node --experimental-strip-types scripts/xmage/port-refute-accuracy-sample.mjs
 *      DM_SAMPLE=50 DM_SEED=20260824 ...
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

/* Every sample any earlier phase already read against Scryfall. */
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
  // Round 1 of THIS review, read against Scryfall before the first six fixes.
  'port-refute-accuracy-sample.round1.json',
  // Round 2, read after those six and before the next three.
  'port-refute-accuracy-sample.seed31415926.json',
  // Round 3, read after those three and before the general chained-call guard.
  'port-refute-accuracy-sample.seed112358.json',
].map((f) => join(ROOT, 'scratch', f));

/*
 * The output file carries the seed in its name. Round 1 was written to a fixed
 * path, a second run with a different seed overwrote it, and the graded sample
 * had to be recovered by parsing the printed log. A sample that can be
 * overwritten by the next run of the same script is not an audit trail.
 */
const WANT = Number(process.env.DM_SAMPLE ?? 50);
const SEED = Number(process.env.DM_SEED ?? 20260824);
const OUT = join(ROOT, 'scratch', `port-refute-accuracy-sample.seed${SEED}.json`);

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
console.log(`${alreadyChecked.size} cards already hand checked in ${ALREADY.length} earlier samples`);

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
let speaksFor = 0;
let passes = 0;
let excluded = 0;
for (const card of pool) {
  const t = compileWithTrace(card);
  if (t.result.source !== 'xmage') continue;
  speaksFor++;
  const v = verdictOf.get(t.result.oracleId);
  if (!v || !PASSES.has(v.v)) continue;
  passes++;
  if (alreadyChecked.has(t.result.oracleId)) { excluded++; continue; }
  candidates.push({ card, abilities: t.result.abilities, verdict: v.v });
}

/* Reproducible shuffle. mulberry32, seeded from DM_SEED, printed above. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
candidates.sort((a, b) => (a.card.oracle_id < b.card.oracle_id ? -1 : 1));
const rnd = mulberry32(SEED);
for (let i = candidates.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
}
const sample = candidates.slice(0, WANT);

console.log(`the port speaks for ${speaksFor} cards; ${passes} of them PASS`);
console.log(`${excluded} of the passing cards were hand checked earlier and are excluded`);
console.log(`shuffling the remaining ${candidates.length} with seed ${SEED}, taking ${sample.length}`);
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

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), seed: SEED, speaksFor, passes, excluded, candidates: candidates.length, sample: out }, null, 1));
console.log('wrote', OUT);
