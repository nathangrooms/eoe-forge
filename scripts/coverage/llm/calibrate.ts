/**
 * scripts/coverage/llm/calibrate.ts — the round-trip gate's own error bar.
 *
 *   node --experimental-strip-types scripts/coverage/llm/calibrate.ts [--limit N] [--show N]
 *
 * ## Why a validation gate needs measuring before it is used
 *
 * `roundtrip.ts` rejects a card when the words its DSL renders to disagree with
 * the words on the card. Some of those disagreements are the model's fault and
 * some are OUR renderer's — a synonym, a wording Wizards changed, a field
 * `render.ts` spells differently from oracle text. Quoting a model's pass rate
 * without knowing which is which would attribute our own vocabulary gaps to the
 * model, and the number would be worthless in the honest direction as well as
 * the flattering one.
 *
 * So the gate is run first over text we already know is correctly represented:
 * every card the hand-written compiler rates `coverage:'full'`. Those cards were
 * produced by rules that refuse rather than guess, under the 121 tests in
 * `src/lib/cards/abilities/*.test.ts` (48 compiler, 37 extensions, 36 acceptance
 * — counted 19 Aug 2026 by `node --test src/lib/cards/abilities/*.test.ts`).
 * Whatever share of them this gate rejects is FALSE REJECTION, and it is the
 * error bar every later pass rate is quoted against.
 *
 * It reads the same cached catalogue `dsl-coverage.ts` uses, so calibration and
 * measurement are over identical input.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compileWithTrace } from '../../../src/lib/cards/abilities/compiler.ts';
import type { AbilityCard } from '../../../src/lib/cards/abilities/normalize.ts';
import { roundTrip, describeRoundTrip } from '../../../src/lib/cards/abilities/roundtrip.ts';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '.data');
mkdirSync(DATA, { recursive: true });
const CATALOGUE = join(here, '..', '.data', 'catalogue.json');

if (!existsSync(CATALOGUE)) {
  throw new Error(`no cached catalogue at ${CATALOGUE}; run scripts/coverage/dsl-coverage.ts first`);
}

const argv = process.argv.slice(2);
const numArg = (flag: string, fallback: number): number => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
};
const LIMIT = numArg('--limit', Infinity);
const SHOW = numArg('--show', 15);

const cached = JSON.parse(readFileSync(CATALOGUE, 'utf8')) as {
  fetchedAt: string;
  rows: Array<AbilityCard & { id: string }>;
};
console.log(`catalogue: ${cached.rows.length} printings (fetched ${cached.fetchedAt})`);

const seen = new Set<string>();
let full = 0;
let passed = 0;
const droppedHist: Record<string, number> = {};
const inventedHist: Record<string, number> = {};
const failures: Array<{ name: string; why: string }> = [];

const bump = (m: Record<string, number>, k: string): void => { m[k] = (m[k] ?? 0) + 1; };

for (const row of cached.rows) {
  const oid = row.oracle_id;
  if (!oid || seen.has(oid)) continue;
  seen.add(oid);
  if (full >= LIMIT) break;

  const result = compileWithTrace(row).result;
  if (result.coverage !== 'full') continue;
  // A card with no text has nothing to round-trip; counting it as a pass would
  // inflate the figure with the easiest possible case.
  if (!String(row.oracle_text ?? '').trim()) continue;
  full++;

  const verdict = roundTrip(result.abilities, result.unparsed, String(row.oracle_text ?? ''), row);
  if (verdict.ok) { passed++; continue; }

  for (const t of verdict.dropped.words) bump(droppedHist, `word:${t}`);
  for (const t of verdict.dropped.numbers) bump(droppedHist, `num:${t}`);
  for (const t of verdict.dropped.mana) bump(droppedHist, `mana:{${t}}`);
  for (const t of verdict.invented.words) bump(inventedHist, `word:${t}`);
  for (const t of verdict.invented.numbers) bump(inventedHist, `num:${t}`);
  for (const t of verdict.invented.mana) bump(inventedHist, `mana:{${t}}`);
  if (failures.length < 400) failures.push({ name: result.name, why: describeRoundTrip(verdict) });
}

const pct = (n: number, d: number): string => (d === 0 ? '—' : `${((100 * n) / d).toFixed(2)}%`);

console.log('');
console.log(`compiler cards at coverage='full' with text   ${full}`);
console.log(`  round-trip PASSED                           ${passed}  ${pct(passed, full)}`);
console.log(`  round-trip REJECTED (false rejection rate)  ${full - passed}  ${pct(full - passed, full)}`);
console.log('');
console.log('most common DROPPED tokens (oracle says it, our rendering does not):');
for (const [k, v] of Object.entries(droppedHist).sort((a, b) => b[1] - a[1]).slice(0, SHOW)) {
  console.log(`  ${k.padEnd(22)} ${String(v).padStart(6)}`);
}
console.log('');
console.log('most common INVENTED tokens (our rendering says it, oracle does not):');
for (const [k, v] of Object.entries(inventedHist).sort((a, b) => b[1] - a[1]).slice(0, SHOW)) {
  console.log(`  ${k.padEnd(22)} ${String(v).padStart(6)}`);
}
console.log('');
console.log('sample failures:');
for (const f of failures.slice(0, SHOW)) console.log(`  ${f.name} — ${f.why}`);

writeFileSync(
  join(DATA, 'calibration.json'),
  JSON.stringify({ measuredAt: new Date().toISOString(), full, passed, droppedHist, inventedHist, failures }, null, 0),
);
