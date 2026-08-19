/**
 * scripts/coverage/drift.mjs — the silent-semantic-drift detector.
 *
 *   node scripts/coverage/drift.mjs --snapshot        # freeze today's baseline
 *   node scripts/coverage/drift.mjs --check           # diff a new checkout against it
 *
 * ## The failure mode this exists to prevent
 *
 * Over 12 months of XMage history the engine ability tree saw 11 deletions and
 * ONE rename — an extractor keyed on class names would break loudly about twelve
 * times a year, which is nothing. In the same period **259 engine ability files
 * (13.2% of the tree) were modified with no name change.** Those are semantic
 * corrections: a trigger condition tightened, a replacement made to apply in one
 * more case, an off-by-one in a count fixed.
 *
 * A name-keyed extractor sees NOTHING. Our note still says `DamageTargetEffect`,
 * our implementation still compiles, the card still resolves — and it is now
 * wrong, quietly, for the case upstream just corrected. That is the worst
 * outcome available: a card that LOOKS automated and is not right. It is the
 * failure `RULES-ENGINE-DECISION.md` §4 names when it insists "never silently do
 * nothing… 'Partial' has to stay a loud, visible state."
 *
 * ## How it is detected
 *
 * `engine-index.mjs` records, per engine class, a sha256 of its COMMENT-STRIPPED
 * source plus the commit that last touched it. Comment stripping matters twice:
 * a reformatted licence header must not raise an alarm nobody will read twice,
 * and XMage's `//` lines are Wizards' oracle text, which we do not store.
 *
 * `--snapshot` freezes that index as `drift-baseline.json`, alongside the
 * ranked build order. `--check`, run against a fresh XMage checkout, reports:
 *
 *   CHANGED   hash moved, name identical  <- THE DANGEROUS ONE
 *   REMOVED   class gone                  <- loud, breaks the extractor anyway
 *   ADDED     new class                   <- possible new coverage
 *
 * and — the part that makes it actionable rather than a wall of noise — it maps
 * every CHANGED primitive to **the primitives we have already implemented and
 * the number of OUR cards that depend on them.** A change to a class nobody has
 * built yet is a footnote. A change to one of our shipped verbs is a bug report.
 *
 * ## What it does NOT do
 * It cannot tell a cosmetic refactor from a rules correction — that needs a human
 * reading the diff. Its job is to guarantee the human is ASKED. Ignoring a
 * CHANGED row is a decision someone makes on the record, not a thing that
 * happens by default.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pct } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '.data');
mkdirSync(DATA, { recursive: true });

const BASELINE = join(DATA, 'drift-baseline.json');
const ENGINE = join(DATA, 'engine.json');

/** Primitives we have actually built. Empty today; this is the shipped-verb list. */
const IMPLEMENTED = join(here, 'implemented-primitives.json');

if (!existsSync(ENGINE)) throw new Error('run `node scripts/coverage/engine-index.mjs` first');
const current = JSON.parse(readFileSync(ENGINE, 'utf8'));

if (process.argv.includes('--snapshot')) {
  writeFileSync(BASELINE, JSON.stringify(current));
  console.log(`baseline frozen at ${current.meta.commit}`);
  console.log(`  ${Object.keys(current.index).length} engine classes`);
  console.log(`wrote ${BASELINE}`);
  process.exit(0);
}

if (!process.argv.includes('--check')) {
  console.log('usage: drift.mjs --snapshot | --check');
  process.exit(1);
}

if (!existsSync(BASELINE)) throw new Error(`no baseline. run: node scripts/coverage/drift.mjs --snapshot`);
const base = JSON.parse(readFileSync(BASELINE, 'utf8'));

console.log(`baseline: ${base.meta.commit}`);
console.log(`current:  ${current.meta.commit}`);
if (base.meta.commit === current.meta.commit) {
  console.log('\nSame commit — nothing to compare. Re-run engine-index.mjs against a newer checkout.');
  process.exit(0);
}

const changed = [];
const removed = [];
const added = [];
for (const [fqn, b] of Object.entries(base.index)) {
  const c = current.index[fqn];
  if (!c) {
    removed.push(fqn);
    continue;
  }
  if (c.sha256 !== b.sha256) changed.push({ fqn, from: b.lastCommit, to: c.lastCommit, loc: [b.loc, c.loc] });
}
for (const fqn of Object.keys(current.index)) if (!base.index[fqn]) added.push(fqn);

const n = Object.keys(base.index).length;
console.log(`\n=== DRIFT ===`);
console.log(`  CHANGED (same name, different body)  ${changed.length} / ${n} (${pct(changed.length, n)}%)   <- silent`);
console.log(`  REMOVED                              ${removed.length}   <- loud, extractor breaks`);
console.log(`  ADDED                                ${added.length}`);

/* ------------------------------------------------------------------ *
 * Triage: which drift actually touches us.
 * ------------------------------------------------------------------ */

let built = [];
if (existsSync(IMPLEMENTED)) built = JSON.parse(readFileSync(IMPLEMENTED, 'utf8')).primitives ?? [];
const builtSet = new Set(built);

const orderFile = join(DATA, 'primitive-order.commander.new.json');
const ranked = existsSync(orderFile) ? JSON.parse(readFileSync(orderFile, 'utf8')).order : [];
const byFqn = new Map(ranked.map((r) => [r.fqn, r]));

const hot = changed.filter((c) => builtSet.has(c.fqn));
const planned = changed.filter((c) => !builtSet.has(c.fqn) && byFqn.has(c.fqn));

console.log(`\n  of the CHANGED classes:`);
console.log(`    already implemented by us   ${hot.length}   <- REVIEW EACH DIFF. Cards may now be wrong.`);
console.log(`    on the ranked build order   ${planned.length}   <- re-read before you write them`);
console.log(`    neither                     ${changed.length - hot.length - planned.length}   <- ignore`);

if (hot.length) {
  console.log('\n  IMPLEMENTED AND DRIFTED — every one of these is a possible live defect:');
  for (const c of hot) {
    const r = byFqn.get(c.fqn);
    console.log(`    ${c.fqn}`);
    console.log(`      cards depending on it: ${r?.cardsNaming ?? '?'}   ${c.from?.slice(0, 8)} -> ${c.to?.slice(0, 8)}   LOC ${c.loc[0]} -> ${c.loc[1]}`);
  }
}

if (planned.length) {
  console.log('\n  ON THE BUILD ORDER AND DRIFTED (top 20 by rank):');
  for (const c of planned.sort((a, b) => (byFqn.get(a.fqn).rank - byFqn.get(b.fqn).rank)).slice(0, 20)) {
    const r = byFqn.get(c.fqn);
    console.log(`    #${String(r.rank).padStart(4)}  ${r.name.padEnd(40)} ${r.cardsNaming} cards`);
  }
}

if (removed.length) {
  console.log('\n  REMOVED:');
  for (const f of removed.slice(0, 40)) console.log(`    ${f}${builtSet.has(f) ? '   ** WE IMPLEMENTED THIS **' : ''}`);
}

writeFileSync(
  join(DATA, 'drift-report.json'),
  JSON.stringify({ from: base.meta.commit, to: current.meta.commit, changed, removed, added, hot: hot.map((h) => h.fqn) }, null, 1),
);
console.log(`\nwrote ${join(DATA, 'drift-report.json')}`);
process.exitCode = hot.length ? 1 : 0;
