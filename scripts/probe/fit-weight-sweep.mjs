/**
 * Sweep `EMPTY_DECK_COMMANDER_FIT` and measure what each value costs.
 *
 *   node scripts/probe/fit-weight-sweep.mjs
 *
 * ## Why this is being re-opened
 *
 * 3.6 was set deliberately, and the comment above the constant gives the reason
 * a player asked for: *"it needs to understand the commander and find cards that
 * synergise and complement it, rank cannot be the answer."* That was right, and
 * nothing here disputes it.
 *
 * What changed underneath it is that THEME IS NOW BOUGHT EXPLICITLY. When 3.6
 * was chosen the commander-fit reserve was a fixed six-to-eight slots ordered by
 * want weight, so the quota loop leaning hard on fit was the only way a deck
 * came out looking like its commander. The reserve now scales with how many
 * things the commander asks for, spends on the wants the deck has NOT got, and
 * orders by urgency rather than by score — so it does not read this constant at
 * all.
 *
 * Two mechanisms now buy the same thing, and the quota loop's copy is the one
 * that costs staples: Swiftfoot Boots is rank 12 with fit 0.000, so it loses its
 * own role slot to a rank-10,744 equipment carrying one matching facet. Boots
 * and Lightning Greaves are missing from five of seven audit decks, and the
 * `protection` role was created in the first place because Boots was missing
 * from every generated deck.
 *
 * ## What is measured, and none of it is optional
 *
 *   staples    the format's auto-includes, counted only where colours allow.
 *              This is the number the change is FOR.
 *   keyed      how much of the deck serves the commander. This is what the
 *              change RISKS, and the whole reason 3.6 exists.
 *   median     EDHREC rank of the non-land cards.
 *   past15k    "cards he would absolutely never include".
 *
 * A value that raises staples and drops keyed has not won. Both have to hold.
 *
 * Restores the original constant on the way out, including on a crash, because
 * leaving a swept value behind is how a measurement becomes a silent change.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const FILE = 'src/engine/build/generate.ts';
const original = readFileSync(FILE, 'utf8');
const CURRENT = /const EMPTY_DECK_COMMANDER_FIT = ([\d.]+);/.exec(original)?.[1];
if (!CURRENT) throw new Error('could not find EMPTY_DECK_COMMANDER_FIT');

const VALUES = (process.env.VALUES ?? '3.6,3.0,2.4,2.0,1.6').split(',');

const run = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: true });

const results = [];
try {
  for (const v of VALUES) {
    writeFileSync(
      FILE,
      original.replace(
        /const EMPTY_DECK_COMMANDER_FIT = [\d.]+;/,
        `const EMPTY_DECK_COMMANDER_FIT = ${v};`
      )
    );
    run('npm', ['run', 'vendor']);
    const out = run('node', ['--experimental-strip-types', 'scripts/generator-synergy-audit.mjs']);

    /* One line per deck: "Name  keyed 53/68 (78%)  staples 8/9  median rank 748  past 15k 3" */
    const decks = [...out.matchAll(
      /keyed\s+(\d+)\/(\d+)\s+\((\d+)%\)\s+staples\s+(\d+)\/(\d+)\s+median rank\s+(\d+)\s+past 15k\s+(\d+)/g
    )].map(m => ({
      keyedHit: +m[1], keyedOf: +m[2], keyedPct: +m[3],
      staplesHit: +m[4], staplesOf: +m[5], median: +m[6], deep: +m[7],
    }));
    if (!decks.length) { console.error(`  ${v}: no deck lines parsed`); continue; }

    const sum = (f) => decks.reduce((a, d) => a + f(d), 0);
    results.push({
      value: v,
      decks: decks.length,
      staples: `${sum(d => d.staplesHit)}/${sum(d => d.staplesOf)}`,
      staplesPct: (sum(d => d.staplesHit) / sum(d => d.staplesOf)) * 100,
      keyed: sum(d => d.keyedPct) / decks.length,
      median: Math.round(sum(d => d.median) / decks.length),
      deep: sum(d => d.deep),
    });
    const r = results.at(-1);
    console.error(
      `  ${v.padEnd(5)} staples ${r.staples.padEnd(7)} keyed ${r.keyed.toFixed(0)}%  ` +
      `median ${String(r.median).padStart(5)}  past15k ${r.deep}`
    );
  }
} finally {
  writeFileSync(FILE, original);
  run('npm', ['run', 'vendor']);
  console.error(`\nrestored EMPTY_DECK_COMMANDER_FIT = ${CURRENT}`);
}

console.log(`\nEMPTY_DECK_COMMANDER_FIT, ${results[0]?.decks ?? 0} decks each\n`);
console.log(`  value   staples        keyed   median   past15k`);
for (const r of results) {
  console.log(
    `  ${r.value.padEnd(6)}  ${r.staples.padEnd(8)} ${r.staplesPct.toFixed(0).padStart(3)}%  ` +
    `${r.keyed.toFixed(0).padStart(4)}%   ${String(r.median).padStart(5)}   ${String(r.deep).padStart(5)}`
  );
}
console.log(`\n  A value that raises staples and drops keyed has NOT won. Both hold or it is not taken.`);
