/**
 * WHICH CARDS MOVED when the probe started asking, and whether they deserved to.
 *
 * This script grades nothing and measures nothing. It reads two per-card dumps
 * written by `scripts/verify-ability-coverage.mjs` under `DM_CARD_DUMP=1`, joins
 * them on `oracle_id`, and prints every verdict that changed together with the
 * card's real Scryfall oracle text and the probe's own record of what it was
 * given and what it did.
 *
 * The reason it exists is the failure mode of the whole exercise: a card that
 * moved and does not deserve to. Two totals cannot be argued with. A card's text
 * beside the actions its abilities produced can be.
 *
 * Usage:
 *   node --experimental-strip-types scripts/probe-movers.mjs \
 *        scratch/verify-card-verdicts.BASELINE.json scratch/verify-card-verdicts.json
 *
 * Local files only. No Supabase, no network, no model.
 */

import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const abs = p => (isAbsolute(p) ? p : join(ROOT, p));

const BEFORE = abs(process.argv[2] ?? 'scratch/verify-card-verdicts.BASELINE.json');
const AFTER = abs(process.argv[3] ?? 'scratch/verify-card-verdicts.json');
const CARDS = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT = join(ROOT, 'scratch', 'probe-movers.json');

for (const path of [BEFORE, AFTER, CARDS]) {
  if (!existsSync(path)) {
    console.error(`Missing ${path}.`);
    process.exit(1);
  }
}

const before = JSON.parse(readFileSync(BEFORE, 'utf8'));
const after = JSON.parse(readFileSync(AFTER, 'utf8'));

const wasBy = new Map();
for (const row of before.cards) wasBy.set(row.o, row);

const moved = [];
const sameCount = new Map();
const transitions = new Map();
const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);

for (const row of after.cards) {
  const was = wasBy.get(row.o);
  if (!was) continue;
  if (was.v === row.v) {
    bump(sameCount, row.v);
    continue;
  }
  bump(transitions, `${was.v} -> ${row.v}`);
  moved.push({ o: row.o, n: row.n, from: was.v, to: row.v, probe: row.p, actions: row.pa, answered: row.an ?? [], unbound: row.ub ?? [], deferred: row.df ?? [] });
}

/* The oracle text, read from the same cached bulk file the grading used. */
const wanted = new Set(moved.map(m => m.o));
const oracleById = new Map();
{
  const rl = createInterface({ input: createReadStream(CARDS), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const card = JSON.parse(line);
    if (!wanted.has(card.oracle_id)) continue;
    if (oracleById.has(card.oracle_id)) continue;
    oracleById.set(card.oracle_id, { text: card.oracle_text ?? '', type: card.type_line ?? '' });
  }
}

const L = [];
const say = s => { L.push(s); console.log(s); };

const RANK = { AUTOMATED: 0, PROMPTED: 1, PROMPTABLE: 2, SILENT: 3, 'NO-TEXT': 4 };
const gained = moved.filter(m => RANK[m.to] < RANK[m.from]);
const lost = moved.filter(m => RANK[m.to] > RANK[m.from]);

say('='.repeat(78));
say('CARDS THAT MOVED, and what the engine actually did with them');
say('='.repeat(78));
say('');
say(`before  ${BEFORE}`);
say(`after   ${AFTER}`);
say('');
say(`pool                ${after.cards.length}`);
say(`MOVED               ${moved.length}`);
say(`  toward passing    ${gained.length}`);
say(`  away from passing ${lost.length}`);
say('');
say('--- EVERY TRANSITION ---');
for (const [k, v] of [...transitions.entries()].sort((a, b) => b[1] - a[1])) {
  say(`  ${String(v).padStart(6)}  ${k}`);
}
say('');
say('--- BEFORE AND AFTER ---');
for (const key of ['AUTOMATED', 'PROMPTED', 'PROMPTABLE', 'SILENT', 'NO-TEXT']) {
  say(`  ${key.padEnd(11)} ${String(before.tally[key] ?? 0).padStart(6)} -> ${String(after.tally[key] ?? 0).padStart(6)}`);
}

/*
 * The sample. Spread evenly across the moved list rather than taken off the
 * front, because the front of a Scryfall bulk file is alphabetical and would
 * hand back twenty cards from the same corner of the catalogue.
 *
 * Sixteen of the twenty come from the cards that moved TOWARD passing, because
 * that is the only direction in which a wrong answer flatters the number. The
 * other four are cards the new questions REFUSED, which is the direction the
 * project law asks for and is worth seeing too.
 */
function spread(list, n) {
  if (list.length <= n) return list;
  const step = list.length / n;
  return Array.from({ length: n }, (_, i) => list[Math.floor(i * step)]);
}
const sample = [...spread(gained, 16), ...spread(lost, 4)];

say('');
say('='.repeat(78));
say('SAMPLE OF 20 MOVERS — the oracle text, then what the engine did');
say('='.repeat(78));
for (const m of sample) {
  const card = oracleById.get(m.o) ?? { text: '', type: '' };
  say('');
  say(`${m.n}  (${card.type})`);
  say(`  ${m.from} -> ${m.to}`);
  for (const line of String(card.text).split('\n')) say(`  | ${line}`);
  say(`  probe: ${m.probe}, ${m.actions} action(s)`);
  for (const a of m.answered) say(`  answered: ${a}`);
  for (const u of m.unbound) say(`  could not bind: ${u}`);
  for (const d of m.deferred) say(`  deferred: ${d}`);
}

writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  before: BEFORE,
  after: AFTER,
  moved: moved.length,
  gained: gained.length,
  lost: lost.length,
  transitions: Object.fromEntries(transitions),
  tallyBefore: before.tally,
  tallyAfter: after.tally,
  sample: sample.map(m => ({ ...m, oracle: oracleById.get(m.o)?.text ?? '', type: oracleById.get(m.o)?.type ?? '' })),
  all: moved,
}, null, 2));
console.log(`\nwrote ${OUT}`);
