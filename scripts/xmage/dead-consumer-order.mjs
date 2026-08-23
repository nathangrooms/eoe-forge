#!/usr/bin/env node
/**
 * Rank DEAD CONSUMERS by the cards each would unlock, using the same closure
 * the effect-class order uses.
 *
 * Derived work note: this script reads no XMage source. It reads the probe's
 * own per-card dump. XMage is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com; Forge is GPL-3.0 and was not fetched or read.
 *
 * WHY THIS EXISTS
 *
 * `effect-class-order.mjs` ranks what stops a card LOWERING. That is one half.
 * The other half is a card the compiler already understood completely, whose
 * every ability the probe grades `dead` because no live consumer in
 * `src/lib/game/**` reads the DSL member it produced. Those cards are already
 * through every gate the class order measures. Nothing needs porting for them.
 *
 * THE SAME TRAP THE CLASS ORDER HAD TO CORRECT
 *
 * A card is SILENT only when NO ability of it runs. A card with three dead
 * abilities is blocked by all three, so fixing any one buys nothing. Counting
 * "ability hits" — which is what the probe's own DEAD table prints, and it says
 * so — therefore overstates. This script takes each card's SET of dead reasons
 * and reports:
 *
 *   solo     — cards whose dead set is exactly {R}. What fixing R buys alone.
 *   marginal — what R buys given every reason above it is fixed, greedy.
 *
 * WHAT IS HELD OUT, AND WHY
 *
 * A card with unparsed text (`u > 0`) or a {do:manual} marker (`m > 0`) is not
 * reachable by making a consumer live: the ability never existed to be run. Those
 * cards are excluded, not attributed to whichever reason happens to be picked
 * first. That is the 2,264-card attribution hole the class order had to fix, and
 * it is not being repeated here.
 *
 * Run: DM_CARD_DUMP=1 node --experimental-strip-types scripts/verify-ability-coverage.mjs
 *      node scripts/xmage/dead-consumer-order.mjs
 * Reads:  scratch/verify-card-verdicts.json
 * Writes: scripts/coverage/.data/dead-consumer-order.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const DUMP = path.join(REPO, 'scratch', 'verify-card-verdicts.json');
const OUT = path.join(REPO, 'scripts', 'coverage', '.data', 'dead-consumer-order.json');

const dump = JSON.parse(readFileSync(DUMP, 'utf8'));
console.log(`pool ${dump.pool}   tally ${JSON.stringify(dump.tally)}`);

/* ------------------------------------------------------------------ *
 * 1. The reachable set
 * ------------------------------------------------------------------ */

const silent = dump.cards.filter(c => c.v === 'SILENT');
const withText = silent.filter(c => (c.k ?? 0) > 0);
const reachable = withText.filter(c => (c.u ?? 0) === 0 && (c.m ?? 0) === 0 && (c.d ?? []).length > 0);
const heldOut = withText.length - reachable.length;

console.log(`SILENT ${silent.length}`);
console.log(`  of which some ability came out            ${withText.length}`);
console.log(`  of which every ability is dead and only dead ${reachable.length}`);
console.log(`  held out: unparsed text or {do:manual}    ${heldOut}`);

/* A card whose dead set does not cover all of its abilities has an ability that
 * is neither dead nor running, which would be a grading hole. Report it rather
 * than silently absorbing it. */
const partial = reachable.filter(c => c.d.length > c.k).length;
if (partial) console.log(`  WARNING ${partial} cards list more distinct reasons than abilities`);

/* ------------------------------------------------------------------ *
 * 2. Group the reasons
 *
 * The probe's `why` strings name the card-specific keyword or rule inside them
 * ("advisory keyword \"flashback\""). Ranked raw, each keyword is its own row and
 * a single fix that makes the whole advisory-keyword path live is split across
 * forty of them. Both views are reported: the raw reason, and the FAMILY, which
 * is the consumer that would have to change.
 * ------------------------------------------------------------------ */

function family(why) {
  if (why.startsWith('advisory keyword')) return 'consumer: advisory keywords (keywordSupport !== engine)';
  if (why.startsWith('engine keyword')) return 'consumer: engine keyword absent from card.keywords';
  if (why.startsWith('restriction ')) return 'consumer: combat.ts never reads these restrictions';
  if (why.startsWith('grants ')) return 'consumer: combat.ts never asks about these granted keywords';
  if (why.startsWith('trigger not owned')) return 'consumer: trigger ownership refused';
  if (why.startsWith('effect ')) return 'consumer: to-actions.ts names the verb and never resolves it';
  if (why.startsWith('cost-modify')) return 'consumer: costAdjustmentFor has no caller';
  if (why.startsWith('replacement')) return 'consumer: intrinsic.ts derives no such replacement result';
  if (why.startsWith('mana:')) return 'consumer: mana.ts';
  return `other: ${why}`;
}

function rank(keyOf, label) {
  const cards = reachable.map(c => ({ n: c.n, set: new Set(c.d.map(keyOf)) }));

  const solo = new Map();
  const blocked = new Map();
  for (const c of cards) {
    for (const k of c.set) blocked.set(k, (blocked.get(k) ?? 0) + 1);
    if (c.set.size === 1) {
      const k = [...c.set][0];
      solo.set(k, (solo.get(k) ?? 0) + 1);
    }
  }

  // Greedy marginal closure, identical in shape to effect-class-order.mjs.
  const done = new Set();
  const open = new Set(cards.map((_, i) => i));
  const rows = [];
  let cumul = 0;
  while (true) {
    const gain = new Map();
    for (const i of open) {
      const set = cards[i].set;
      let missingOne = null;
      let missingCount = 0;
      for (const k of set) {
        if (done.has(k)) continue;
        missingCount += 1;
        missingOne = k;
        if (missingCount > 1) break;
      }
      if (missingCount === 1) gain.set(missingOne, (gain.get(missingOne) ?? 0) + 1);
    }
    if (gain.size === 0) break;
    let best = null;
    let bestN = 0;
    for (const [k, n] of gain) if (n > bestN) { best = k; bestN = n; }
    if (bestN === 0) break;
    done.add(best);
    for (const i of [...open]) {
      const set = cards[i].set;
      let all = true;
      for (const k of set) if (!done.has(k)) { all = false; break; }
      if (all) open.delete(i);
    }
    cumul += bestN;
    rows.push({ key: best, marginal: bestN, solo: solo.get(best) ?? 0, blocked: blocked.get(best) ?? 0, cumul });
  }

  console.log(`\n=== ${label} ===`);
  console.log(' rank  marginal  solo  blocked  cumul  reason');
  for (const [i, r] of rows.entries()) {
    if (i >= 30) break;
    console.log(
      `  ${String(i + 1).padStart(3)}  ${String(r.marginal).padStart(8)}  ${String(r.solo).padStart(4)}` +
      `  ${String(r.blocked).padStart(7)}  ${String(r.cumul).padStart(5)}  ${r.key}`,
    );
  }
  return rows;
}

const byFamily = rank(family, 'BY CONSUMER FAMILY (the file that would change)');
const byReason = rank(w => w, 'BY RAW REASON (one row per keyword or rule)');

writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  pool: dump.pool,
  tally: dump.tally,
  silent: silent.length,
  withText: withText.length,
  reachable: reachable.length,
  heldOut,
  byFamily,
  byReason,
}, null, 2));
console.log(`\nwrote ${path.relative(REPO, OUT)}`);
