/*
 * Compare two runs of `strategy-decks.mjs`, and REFUSE when they are not
 * comparable.
 *
 * THE BUG THIS EXISTS FOR. This comparison was hand-written inline a dozen
 * times on 5-6 Sep 2026. On 6 Sep a run died partway with a database timeout,
 * produced 12 shell rows instead of 18, and the comparison happily summed 12
 * against 18 and reported "keyed +2". A truncated run looks exactly like a
 * successful one to a `grep | sum` pipeline.
 *
 *   node --experimental-strip-types scripts/probe/compare-shells.mjs BEFORE AFTER
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

const ROW =
  /named\s+(?:-|(\d+)\/\s*(\d+))\s+pkgs\s+(\d+)\/(\d+)\s+keyed\s+(\d+)%\s+ramp\s+(\d+)/;

function read(file) {
  const text = readFileSync(file, 'utf8');
  const rows = text
    .split(/\r?\n/)
    .filter(l => ROW.test(l))
    .map(l => {
      const m = l.match(ROW);
      return { named: Number(m[1] ?? 0), pk: Number(m[3]), pkd: Number(m[4]), keyed: Number(m[5]), ramp: Number(m[6]) };
    });
  /* A run that threw is not a run. `Error`, a stack frame, or a 57014 all mean
     the numbers below describe a different set of decks than the other file. */
  const broke = /\bError\b|57014|statement timeout|at async /.test(text);
  return { rows, broke };
}

const [beforeFile, afterFile] = process.argv.slice(2);
if (!beforeFile || !afterFile) {
  console.error('usage: compare-shells.mjs BEFORE AFTER');
  process.exit(2);
}
const a = read(beforeFile);
const b = read(afterFile);

for (const [label, r, f] of [['BEFORE', a, beforeFile], ['AFTER', b, afterFile]]) {
  if (r.broke) {
    console.error(`${label} (${f}) contains an error or stack trace. REFUSING to compare a run that threw.`);
    process.exit(1);
  }
}
if (a.rows.length !== b.rows.length) {
  console.error(
    `row counts differ: BEFORE ${a.rows.length}, AFTER ${b.rows.length}. ` +
      `REFUSING - a truncated run summed against a whole one is how "+2 keyed" was reported for a run that died at shell 12.`
  );
  process.exit(1);
}
if (a.rows.length === 0) {
  console.error('no shell rows in either file. REFUSING.');
  process.exit(1);
}

const sum = (rows, k) => rows.reduce((n, r) => n + r[k], 0);
let moved = 0;
for (let i = 0; i < a.rows.length; i++) {
  const d = [];
  if (a.rows[i].pk !== b.rows[i].pk) d.push(`pkgs ${a.rows[i].pk}->${b.rows[i].pk}`);
  if (a.rows[i].keyed !== b.rows[i].keyed) d.push(`keyed ${a.rows[i].keyed}->${b.rows[i].keyed}`);
  if (a.rows[i].named !== b.rows[i].named) d.push(`named ${a.rows[i].named}->${b.rows[i].named}`);
  if (a.rows[i].ramp !== b.rows[i].ramp) d.push(`ramp ${a.rows[i].ramp}->${b.rows[i].ramp}`);
  if (d.length) { moved++; console.log(`shell ${String(i + 1).padStart(2)}  ${d.join('  ')}`); }
}
const d = (k) => { const x = sum(a.rows, k), y = sum(b.rows, k); return `${x} -> ${y} (${y - x >= 0 ? '+' : ''}${y - x})`; };
console.log(`\n${a.rows.length} shells, ${moved} moved`);
console.log(`keyed ${d('keyed')}   packages ${d('pk')}   named ${d('named')}   ramp ${d('ramp')}`);
const low = b.rows.filter(r => r.ramp < 11).length;
const high = b.rows.filter(r => r.ramp > 21).length;
console.log(`ramp: ${low} under the floor of 11, ${high} over the p90 of 21`);
