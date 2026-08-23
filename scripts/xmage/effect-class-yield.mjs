#!/usr/bin/env node
/**
 * What each unported XMage effect class would buy AFTER THE PROBE.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. Read in place,
 * nothing vendored, no display string copied. Forge is GPL-3.0 and was not
 * fetched, read or referenced.
 *
 * Reads, and joins row by row rather than comparing percentages:
 *   scripts/coverage/.data/xmage-effect-class-order.json  (effect-class-order.mjs)
 *   scratch/verify-card-verdicts.json                     (verify-ability-coverage.mjs, DM_CARD_DUMP=1)
 *   scratch/scryfall/oracle-cards.jsonl                   (legality, cached, never downloaded)
 *
 * ## The four gates between "a class exists" and "a player sees the card work"
 *
 * A class making a card LOWER is the first of four gates, and PORT-LOG already
 * says a lowered shape is not a running card. This script counts how many cards
 * survive each one, because a class that unlocks cards which then die at a
 * later gate has bought nothing.
 *
 *   gate 1  the card lowers          closure, measured by effect-class-order.mjs
 *   gate 2  the probe can see it     the card has an oracle id in the pool
 *   gate 3  the record is CONSULTED  lowered.ts precedence: the oracle-text
 *                                    compiler wins outright wherever its
 *                                    coverage is 'full', and on those cards the
 *                                    XMage lowering is never read at all
 *   gate 4  the card is not working  if it already reads AUTOMATED or PROMPTED,
 *                                    the class moves nothing
 *
 * Cards surviving all four are the CEILING for that class: the largest number
 * that could possibly become AUTOMATED or PROMPTED. It is a ceiling and not a
 * forecast, because whether the new ability then survives the probe depends on
 * whether a live consumer in src/lib/game runs the DSL member it lowers to, and
 * no class that does not exist can be probed.
 *
 * The exchange rate from ceiling to outcome is not guessed either. It is
 * measured on the cards THIS PORT ALREADY LOWERS that passed gates 2 and 3, and
 * printed as a rate with its own denominator so anyone can check it.
 *
 * Run: node scripts/xmage/effect-class-yield.mjs
 * Writes: scripts/coverage/.data/xmage-effect-class-yield.json
 */

import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const DATA = path.join(REPO, 'scripts', 'coverage', '.data');

const closure = JSON.parse(readFileSync(path.join(DATA, 'xmage-effect-class-order.json'), 'utf8'));
const verdictFile = JSON.parse(readFileSync(path.join(REPO, 'scratch', 'verify-card-verdicts.json'), 'utf8'));

const verdict = new Map();
const coverage = new Map();
const source = new Map();
const backFace = new Map();
for (const r of verdictFile.cards) {
  verdict.set(r.o, r.v); coverage.set(r.o, r.c); source.set(r.o, r.s); backFace.set(r.o, r.f);
}
console.log(`probe pool ${verdictFile.cards.length}   tally ${JSON.stringify(verdictFile.tally)}`);
console.log(`by source ${JSON.stringify(verdictFile.bySource)}`);

const commander = new Set();
{
  const rl = createInterface({
    input: createReadStream(path.join(REPO, 'scratch', 'scryfall', 'oracle-cards.jsonl')),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = JSON.parse(line);
    if (c.oracle_id && c.legalities && c.legalities.commander === 'legal') commander.add(c.oracle_id);
  }
}
console.log(`commander legal oracle ids in the bulk file ${commander.size}`);

/* ---------------- the exchange rate, measured on what already lowers -------- */

/*
 * THE EXCHANGE RATE. Measured on the cards the port already lowers, and read
 * off `source`, not off `coverage`.
 *
 * The trap, recorded because it inverted this figure once already: the coverage
 * in the dump is the POST-swap value. `compileWithTrace` recomputes coverage
 * from the swapped ability list with an empty unparsed list, so a card the
 * XMage record actually spoke for usually reports 'full' — the exact opposite
 * of the pre-swap value `xmageSwapFor` tested. Filtering the port's own cards
 * on `coverage !== 'full'` therefore selects the cards the port did NOT speak
 * for, and the first version of this script did exactly that and reported an
 * exchange rate of 0.0% off 391 cards. `source === 'xmage'` is true on
 * precisely the swapped set and is the only honest discriminator.
 *
 * Candidate cards are unaffected by the trap: none of them lowers today, so
 * none was swapped, so their reported coverage IS the pre-swap value the rule
 * will test. That is why the gates below may read `coverage` and this may not.
 */
/* Vacuous records lower to NO abilities, and `xmageSwapFor` refuses those by
 * name ("the record lowered to no abilities"). Leaving them in the denominator
 * would deflate the exchange rate with 351 vanilla creatures that were never
 * eligible for it. */
const alreadyLowering = closure.cards.filter((c) => c.ok && !c.vacuous);
const rate = {
  lowering: alreadyLowering.length, vacuousExcluded: closure.cards.filter((c) => c.vacuous).length, inPool: 0, consulted: 0,
  AUTOMATED: 0, PROMPTED: 0, PROMPTABLE: 0, SILENT: 0, 'NO-TEXT': 0,
};
for (const c of alreadyLowering) {
  if (!c.oracleId || !verdict.has(c.oracleId)) continue;
  rate.inPool += 1;
  if (source.get(c.oracleId) !== 'xmage') continue;
  rate.consulted += 1;
  rate[verdict.get(c.oracleId)] += 1;
}
const works = rate.AUTOMATED + rate.PROMPTED;
const RATE = works / rate.consulted;
console.log('');
console.log('THE EXCHANGE RATE, measured on the cards this port already lowers');
console.log(`  lower fully, with at least one ability      ${rate.lowering}   (${rate.vacuousExcluded} vacuous records excluded: no abilities, never eligible for the swap)`);
console.log(`  of which the probe can see                 ${rate.inPool}`);
console.log(`  of which the record was actually SWAPPED   ${rate.consulted}   (source === 'xmage')`);
console.log(`      AUTOMATED  ${String(rate.AUTOMATED).padStart(5)}`);
console.log(`      PROMPTED   ${String(rate.PROMPTED).padStart(5)}`);
console.log(`      PROMPTABLE ${String(rate.PROMPTABLE).padStart(5)}`);
console.log(`      SILENT     ${String(rate.SILENT).padStart(5)}`);
console.log(`      NO-TEXT    ${String(rate['NO-TEXT']).padStart(5)}`);
console.log(`  works (AUTOMATED + PROMPTED) / swapped      ${works} / ${rate.consulted} = ${(100 * RATE).toFixed(1)}%`);
console.log(`  and swapped / lowering                      ${rate.consulted} / ${rate.lowering} = ${((100 * rate.consulted) / rate.lowering).toFixed(1)}%  <- the compiler already had the rest`);

/* ---------------- greedy closure, carrying the gates ------------------------ */

const blocked = closure.cards.filter((c) => !c.ok && c.missing.length > 0);
const live0 = blocked.map((c) => ({ key: c.key, oracleId: c.oracleId, need: new Set(c.missing) }));

/*
 * The gates, in the order `xmageSwapFor` applies them. First one that fires
 * wins, so every card lands in exactly one bucket and the buckets sum to the
 * marginal.
 */
const gateOf = (c) => {
  if (!c.oracleId || !verdict.has(c.oracleId)) return 'unseen';        // gate 2
  if (coverage.get(c.oracleId) === 'full') return 'compilerWins';      // gate 3a
  if (backFace.get(c.oracleId)) return 'backFace';                     // gate 3b
  const v = verdict.get(c.oracleId);
  if (v === 'NO-TEXT') return 'noText';
  if (v === 'AUTOMATED' || v === 'PROMPTED') return 'alreadyWorks';    // gate 4
  return 'movable';
};

const soloSet = new Map();
for (const c of blocked) {
  if (c.missing.length !== 1) continue;
  const p = c.missing[0];
  if (!soloSet.has(p)) soloSet.set(p, []);
  soloSet.get(p).push(c);
}

const TOP = 90;
const done = new Set();
let live = live0;
const rows = [];
for (let step = 0; step < TOP; step++) {
  const completes = new Map();
  const freq = new Map();
  for (const c of live) {
    const need = [...c.need].filter((p) => !done.has(p));
    for (const p of need) freq.set(p, (freq.get(p) ?? 0) + 1);
    if (need.length === 1) completes.set(need[0], (completes.get(need[0]) ?? 0) + 1);
  }
  if (freq.size === 0) break;
  let best = null;
  for (const p of freq.keys()) {
    const gain = completes.get(p) ?? 0;
    const f = freq.get(p) ?? 0;
    if (!best || gain > best.gain || (gain === best.gain && f > best.freq)) best = { prim: p, gain, freq: f };
  }
  done.add(best.prim);
  const freed = live.filter((c) => ![...c.need].some((p) => !done.has(p)));
  live = live.filter((c) => [...c.need].some((p) => !done.has(p)));

  const tally = { unseen: 0, compilerWins: 0, backFace: 0, alreadyWorks: 0, noText: 0, movable: 0 };
  let movableCommander = 0;
  for (const c of freed) {
    const g = gateOf(c);
    tally[g] += 1;
    if (g === 'movable' && commander.has(c.oracleId)) movableCommander += 1;
  }
  const soloCards = soloSet.get(best.prim) ?? [];
  const soloMovable = soloCards.filter((c) => gateOf(c) === 'movable').length;

  rows.push({
    rank: rows.length + 1,
    prim: best.prim,
    marginal: freed.length,
    solo: soloCards.length,
    soloMovable,
    ...tally,
    movableCommander,
    projectedWorking: Math.round(tally.movable * RATE),
  });
}

console.log('');
console.log(' rank  marg  solo | unseen  cmpWin  back  alrdy  MOVABLE  cmdr  proj  class');
for (const r of rows) {
  console.log(
    `${String(r.rank).padStart(5)} ${String(r.marginal).padStart(5)} ${String(r.solo).padStart(5)} |` +
    `${String(r.unseen).padStart(7)} ${String(r.compilerWins).padStart(7)} ${String(r.backFace).padStart(5)} ${String(r.alreadyWorks).padStart(6)} ` +
    `${String(r.movable).padStart(8)} ${String(r.movableCommander).padStart(5)} ${String(r.projectedWorking).padStart(5)}  ${r.prim}`,
  );
}

const totalMarginal = rows.reduce((a, r) => a + r.marginal, 0);
const totalMovable = rows.reduce((a, r) => a + r.movable, 0);
const totalProj = rows.reduce((a, r) => a + r.projectedWorking, 0);
console.log('');
console.log(`${rows.length} classes: ${totalMarginal} cards lower, of which MOVABLE ${totalMovable}, projected working ${totalProj}`);

writeFileSync(
  path.join(DATA, 'xmage-effect-class-yield.json'),
  JSON.stringify({
    meta: {
      script: 'scripts/xmage/effect-class-yield.mjs',
      measuredAt: new Date().toISOString(),
      closureFrom: closure.meta,
      probeTally: verdictFile.tally,
      probePool: verdictFile.cards.length,
    },
    exchangeRate: { ...rate, works, ratePct: Number((100 * RATE).toFixed(2)) },
    rows,
    totals: { marginal: totalMarginal, movable: totalMovable, projectedWorking: totalProj },
  }, null, 1),
);
console.log('wrote scripts/coverage/.data/xmage-effect-class-yield.json');
