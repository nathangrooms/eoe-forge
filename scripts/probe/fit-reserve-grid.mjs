/**
 * Two levers at once: how hard the QUOTA LOOP leans on commander fit, and how
 * many slots the RESERVE may spend on it.
 *
 *   node scripts/probe/fit-reserve-grid.mjs
 *   GRID="2.4:16,2.4:22,2.0:22" node scripts/probe/fit-reserve-grid.mjs
 *
 * ## The hypothesis this exists to test
 *
 * Sweeping the fit weight alone gives a clean trade and no winner: every value
 * below 3.6 buys staples and kills junk (past-15k 22 -> 14) and pays for it in
 * keyed synergy, 72% -> 68%. Both halves are real, so there is nothing to pick.
 *
 * But the two mechanisms buy the same thing in different ways, and they are not
 * equally good at it. The quota loop buys theme by letting a themed card win a
 * ROLE slot, which is how a rank-10,744 equipment takes the slot Swiftfoot Boots
 * (rank 12) should have. The reserve buys theme by spending a slot on the want
 * the deck is most short of, which is aimed.
 *
 * So the question is whether theme bought by the AIMED mechanism can replace
 * theme bought by the blunt one: drop the fit weight, raise the reserve cap, and
 * see whether keyed holds while staples and the junk tail improve.
 *
 * If keyed does not hold, the answer is that the quota loop's fit weight is
 * buying something the reserve cannot, and 3.6 stays.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const FILE = 'src/engine/build/generate.ts';
const original = readFileSync(FILE, 'utf8');
if (!/const EMPTY_DECK_COMMANDER_FIT = [\d.]+;/.test(original)) throw new Error('fit constant');
if (!/Math\.min\(16, COMMANDER_FIT_RESERVE \+ Math\.max\(0, loudWants - 3\)\)/.test(original))
  throw new Error('reserve cap expression');

const GRID = (process.env.GRID ?? '3.6:16,2.4:16,2.4:22,2.0:22,2.4:28').split(',');

const run = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: true });

const results = [];
try {
  for (const cell of GRID) {
    const [fit, cap] = cell.split(':');
    writeFileSync(
      FILE,
      original
        .replace(/const EMPTY_DECK_COMMANDER_FIT = [\d.]+;/, `const EMPTY_DECK_COMMANDER_FIT = ${fit};`)
        .replace(
          /Math\.min\(16, COMMANDER_FIT_RESERVE \+ Math\.max\(0, loudWants - 3\)\)/,
          `Math.min(${cap}, COMMANDER_FIT_RESERVE + Math.max(0, loudWants - 3))`
        )
    );
    run('npm', ['run', 'vendor']);
    const out = run('node', ['--experimental-strip-types', 'scripts/generator-synergy-audit.mjs']);

    const decks = [...out.matchAll(
      /keyed\s+(\d+)\/(\d+)\s+\((\d+)%\)\s+staples\s+(\d+)\/(\d+)\s+median rank\s+(\d+)\s+past 15k\s+(\d+)/g
    )].map(m => ({
      keyedPct: +m[3], staplesHit: +m[4], staplesOf: +m[5], median: +m[6], deep: +m[7],
    }));
    if (!decks.length) { console.error(`  ${cell}: no deck lines parsed`); continue; }

    const sum = (f) => decks.reduce((a, d) => a + f(d), 0);
    const r = {
      cell, fit, cap,
      staples: `${sum(d => d.staplesHit)}/${sum(d => d.staplesOf)}`,
      keyed: sum(d => d.keyedPct) / decks.length,
      median: Math.round(sum(d => d.median) / decks.length),
      deep: sum(d => d.deep),
    };
    results.push(r);
    console.error(
      `  fit ${fit.padEnd(4)} cap ${String(cap).padEnd(3)} staples ${r.staples.padEnd(7)} ` +
      `keyed ${r.keyed.toFixed(0)}%  median ${String(r.median).padStart(5)}  past15k ${r.deep}`
    );
  }
} finally {
  writeFileSync(FILE, original);
  run('npm', ['run', 'vendor']);
  console.error('\nrestored both constants');
}

console.log(`\n  fit   cap   staples   keyed   median   past15k`);
for (const r of results) {
  console.log(
    `  ${r.fit.padEnd(5)} ${String(r.cap).padEnd(5)} ${r.staples.padEnd(9)} ` +
    `${r.keyed.toFixed(0).padStart(4)}%   ${String(r.median).padStart(5)}   ${String(r.deep).padStart(5)}`
  );
}
console.log(`\n  Baseline is fit 3.6 cap 16. A cell only wins if keyed HOLDS against it`);
console.log(`  while staples rise or the junk tail falls. Otherwise 3.6 stays.`);
