/**
 * Does the purity gate actually catch anything?
 *
 *   node scripts/primitives/gates/selftest-purity.mjs
 *
 * The gate passed 20 of 20 on its first run, which is exactly the result that
 * should not be believed without evidence. A check that cannot fail is not a
 * check, and a report quoting "purity 20/20" from a vacuous gate is worse than
 * no report at all.
 *
 * So this writes deliberately impure functions to a scratch file, runs the real
 * gate over it, and asserts each one is REJECTED. If a mutant slips through, the
 * gate is weaker than the report claims and this script says which mutant did it.
 *
 * The last two cases are controls: they must PASS. A gate that rejects everything
 * is equally useless, and pushing into a local array is legitimate.
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { runPurityGate } from './purity.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const MUTANTS = [
  { id: 'M01', name: 'readsClock', shouldPass: false, body: `export function readsClock(): number { return Date.now(); }` },
  { id: 'M02', name: 'readsRandom', shouldPass: false, body: `export function readsRandom(): number { return Math.random(); }` },
  { id: 'M03', name: 'mutatesParam', shouldPass: false, body: `export function mutatesParam(state: any): void { state.turn = 9; }` },
  { id: 'M04', name: 'mutatesNested', shouldPass: false, body: `export function mutatesNested(state: any): void { state.cards.a.damage = 1; }` },
  { id: 'M05', name: 'pushesIntoParam', shouldPass: false, body: `export function pushesIntoParam(out: any[]): void { out.push(1); }` },
  { id: 'M06', name: 'sortsParamDerived', shouldPass: false, body: `export function sortsParamDerived(state: any): any { const ids = state.zones.library; ids.sort(); return ids; }` },
  { id: 'M07', name: 'isAsync', shouldPass: false, body: `export async function isAsync(): Promise<number> { return 1; }` },
  { id: 'M08', name: 'usesPerformance', shouldPass: false, body: `export function usesPerformance(): number { return performance.now(); }` },
  { id: 'M09', name: 'usesCrypto', shouldPass: false, body: `export function usesCrypto(): string { return crypto.randomUUID(); }` },
  { id: 'M10', name: 'readsProcess', shouldPass: false, body: `export function readsProcess(): any { return process.env.X; }` },
  // Controls.
  { id: 'M11', name: 'pushesIntoLocal', shouldPass: true, body: `export function pushesIntoLocal(n: number): number[] { const out: number[] = []; for (let i = 0; i < n; i++) out.push(i); return out; }` },
  { id: 'M12', name: 'readsParamDeeply', shouldPass: true, body: `export function readsParamDeeply(state: any): number { return state.cards.a.damage + state.turn; }` },
];

const AMBIENT = { id: 'M13', name: 'usesModuleLet', shouldPass: false, body: `export function usesModuleLet(): number { counter = counter + 1; return counter; }`, prelude: 'let counter = 0;' };

const dir = mkdtempSync(join(tmpdir(), 'dm-purity-'));
const primitiveDir = join(dir, 'src/lib/game/abilities/primitives');
mkdirSync(primitiveDir, { recursive: true });

function check(cases, file, prelude = '') {
  writeFileSync(join(primitiveDir, file), `${prelude}\n${cases.map((c) => c.body).join('\n\n')}\n`);
  const specs = cases.map((c) => ({
    id: c.id,
    name: c.name,
    file,
    purity: { noClock: true, noRandom: true, noMutation: true, noAmbientState: true },
  }));
  return runPurityGate(specs, dir).results;
}

const results = { ...check(MUTANTS, 'mutants.ts'), ...check([AMBIENT], 'ambient.ts', AMBIENT.prelude) };
const all = [...MUTANTS, AMBIENT];

let wrong = 0;
console.log('');
console.log('  case  function              expected  actual   verdict');
console.log('  ----  --------------------  --------  -------  -------');
for (const c of all) {
  const got = results[c.id].pass;
  const ok = got === c.shouldPass;
  if (!ok) wrong++;
  console.log(
    `  ${c.id}   ${c.name.padEnd(20)}  ${(c.shouldPass ? 'pass' : 'REJECT').padEnd(8)}  ${(got ? 'pass' : 'REJECT').padEnd(7)}  ${ok ? 'correct' : 'GATE IS WRONG'}`
  );
  if (!ok && !got) console.log(`        (rejected for: ${results[c.id].violations.join('; ')})`);
  if (!ok && got) console.log('        (the gate did NOT catch this — it is weaker than the report claims)');
}

rmSync(dir, { recursive: true, force: true });

console.log('');
console.log(`  ${all.length - wrong} / ${all.length} correct`);
console.log(wrong === 0 ? '  the purity gate discriminates.' : '  THE PURITY GATE IS NOT SOUND — do not quote its pass rate.');
console.log('');
process.exit(wrong === 0 ? 0 : 1);
