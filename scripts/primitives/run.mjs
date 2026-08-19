/**
 * The harness. Runs all four gates over every spec and prints the honest table.
 *
 *   node scripts/primitives/run.mjs
 *   node scripts/primitives/run.mjs --json          # machine-readable
 *
 * A primitive COUNTS only if it passes all four gates. There is no partial
 * credit, there is no "passed except", and a failure is reported as a failure
 * rather than patched into place. The per-gate columns are printed so a bad
 * number can be attributed instead of argued about.
 *
 * `unlocked` is deliberately NOT the sum of the `unlocks.measuredSolo` column.
 * `docs/overhaul/PRIMITIVE-BUILD-ORDER.md` §3 measures why: a card needs its
 * whole primitive set at once, and summing solo columns overstates the real
 * total by a factor of fifteen. The unlock figure is recomputed from scratch by
 * `measure-unlocked.ts` against the catalogue, using only the primitives that
 * passed every gate.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { runTypecheckGate } from './gates/typecheck.mjs';
import { runPurityGate } from './gates/purity.mjs';
import { runBehaviourGate } from './gates/behaviour.mjs';
import { runDifferentialGate } from './gates/differential.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const specDir = join(here, 'specs');

const specs = readdirSync(specDir)
  .filter((f) => f.endsWith('.spec.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(specDir, f), 'utf8')));

process.stderr.write(`gate 1/4 typecheck   (${specs.length} specs)\n`);
const typecheck = runTypecheckGate(specs, root);
process.stderr.write('gate 2/4 purity\n');
const purity = runPurityGate(specs, root);
process.stderr.write('gate 3/4 behaviour\n');
const behaviour = runBehaviourGate(specs, root);
process.stderr.write('gate 4/4 differential\n');
const differential = runDifferentialGate(specs);

const rows = specs.map((spec) => {
  const t = typecheck.results[spec.id];
  const p = purity.results[spec.id];
  const b = behaviour.results[spec.id];
  const d = differential.results[spec.id];
  return {
    id: spec.id,
    name: spec.name,
    family: spec.family,
    implements: spec.implements,
    typecheck: t.pass,
    purity: p.pass,
    behaviour: b.pass,
    differential: d.pass,
    differentialStatus: d.status,
    allFour: t.pass && p.pass && b.pass && d.pass,
    detail: {
      typecheck: [...t.errors, t.signatureDetail].filter(Boolean),
      purity: p.violations,
      behaviour: [b.detail, ...b.testsFailed].filter(Boolean),
      differential: [d.detail, ...d.checks.filter((c) => !c.ok).map((c) => `FAILED: ${c.claim} (${c.kind} ${JSON.stringify(c.needle)})`)].filter(Boolean),
    },
    unlocks: spec.unlocks,
  };
});

const count = (key) => rows.filter((r) => r[key]).length;
const summary = {
  specs: rows.length,
  typecheckPassed: count('typecheck'),
  purityPassed: count('purity'),
  behaviourPassed: count('behaviour'),
  differentialPassed: count('differential'),
  differentialNoReference: rows.filter((r) => r.differentialStatus === 'no-reference').length,
  allFourPassed: count('allFour'),
  behaviourTestsRun: behaviour.totalTests,
  behaviourTestsFailed: behaviour.totalFailed,
  projectErrorsOutsidePrimitives: typecheck.projectErrorsOutsidePrimitives,
  projectErrorFilesOutsidePrimitives: typecheck.projectErrorFilesOutsidePrimitives,
  xmageClone: differential.clone,
  xmageCommit: differential.commit,
  xmageOnPinnedCommit: differential.onPinnedCommit,
};

const report = { summary, rows };
writeFileSync(join(here, '.data', 'gate-report.json'), JSON.stringify(report, null, 2));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const tick = (ok) => (ok ? 'PASS' : 'FAIL');

console.log('');
console.log('  id   primitive                  type  pure  behav diff   ALL   implements');
console.log('  ---- -------------------------- ----- ----- ----- -----  ----  ----------');
for (const r of rows) {
  console.log(
    `  ${r.id}  ${r.name.padEnd(26)} ${tick(r.typecheck).padEnd(5)} ${tick(r.purity).padEnd(5)} ${tick(r.behaviour).padEnd(5)} ${tick(r.differential).padEnd(5)}  ${r.allFour ? 'PASS' : 'FAIL'}  ${r.implements ?? '(helper)'}`
  );
}

console.log('');
console.log(`  specs                        ${summary.specs}`);
console.log(`  typecheck passed             ${summary.typecheckPassed}`);
console.log(`  purity passed                ${summary.purityPassed}`);
console.log(`  behaviour passed             ${summary.behaviourPassed}   (${summary.behaviourTestsRun} tests, ${summary.behaviourTestsFailed} failing)`);
console.log(`  differential passed          ${summary.differentialPassed}   (${summary.differentialNoReference} declare no XMage reference and are NOT counted as passes)`);
console.log(`  ALL FOUR                     ${summary.allFourPassed} / ${summary.specs}`);
console.log('');
console.log(`  XMage clone                  ${summary.xmageClone ?? 'not found'}`);
console.log(`  XMage commit                 ${summary.xmageCommit ?? '?'} ${summary.xmageOnPinnedCommit ? '(pinned)' : '(NOT the pinned commit)'}`);
console.log(`  project errors elsewhere     ${summary.projectErrorsOutsidePrimitives} in ${summary.projectErrorFilesOutsidePrimitives.length} file(s) — other authors, not attributed here`);

const failures = rows.filter((r) => !r.allFour);
if (failures.length) {
  console.log('');
  console.log('  FAILURES, in full');
  for (const r of failures) {
    console.log(`  ${r.id} ${r.name}`);
    for (const [gate, lines] of Object.entries(r.detail)) {
      for (const line of lines) console.log(`      ${gate}: ${line}`);
    }
  }
}
console.log('');
