/**
 * scripts/coverage/our-coverage.ts — pass 2b: what OUR compiler already does.
 *
 *   node --experimental-strip-types scripts/coverage/our-coverage.ts
 *
 * Emits `.data/our-coverage.json`: `oracle_id -> coverage` for every distinct
 * card in the catalogue, from `src/lib/cards/abilities/compiler.ts`.
 *
 * ## Why the build order is worthless without this
 *
 * The ranked primitive list answers "how many cards would this primitive
 * unlock". That is the wrong question on its own. The right question is **how
 * many cards would it unlock THAT WE DO NOT ALREADY HANDLE** — because
 * DeckMatrix has its own oracle-text compiler that never went through XMage, and
 * it is already well past zero. Ranking on gross unlocks would put effort into
 * primitives whose cards our own front end compiles cleanly today, which is
 * spending months to arrive where we already are.
 *
 * This is the same discipline as the two-numbers rule one level down: an XMage
 * primitive's value is a DELTA, and quoting its gross figure is quoting the
 * wrong number.
 *
 * `coverage` here is the compiler's own derived verdict — 'full' means no clause
 * was dropped and no `{do:'manual'}` marker survives anywhere on the card. It is
 * a statement about REPRESENTATION, not about the engine executing it, and this
 * file must never be quoted as an automation figure.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compileWithTrace } from '../../src/lib/cards/abilities/compiler.ts';
import type { AbilityCard } from '../../src/lib/cards/abilities/normalize.ts';
import { hasAutomatedAbility } from '../../src/lib/cards/abilities/coverage.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const DATA = join(here, '.data');
mkdirSync(DATA, { recursive: true });

const env: Record<string, string> = {};
for (const line of readFileSync(join(repoRoot, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing from .env');

const COLUMNS = 'id,oracle_id,name,type_line,oracle_text,keywords,mana_cost,cmc,power,toughness,layout,faces';
const PAGE = 1000;

const rows: Array<AbilityCard & { id: string }> = [];
let after = '';
for (;;) {
  const qs = new URLSearchParams({ select: COLUMNS, order: 'id.asc', limit: String(PAGE) });
  if (after) qs.set('id', `gt.${after}`);
  const res = await fetch(`${url}/rest/v1/cards?${qs}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const batch = (await res.json()) as Array<AbilityCard & { id: string }>;
  if (!batch.length) break;
  rows.push(...batch);
  after = batch[batch.length - 1].id;
  if (batch.length < PAGE) break;
}
console.log(`fetched ${rows.length} printings`);

/**
 * Collapse to oracle_id. Printings of one card share oracle text, so the verdict
 * is identical; the first printing wins and a disagreement would be a data bug.
 */
const out: Record<string, { coverage: string; automated: boolean }> = {};
const tally: Record<string, number> = {};
for (const row of rows) {
  const oid = row.oracle_id;
  if (!oid || out[oid]) continue;
  const result = compileWithTrace(row).result;
  out[oid] = { coverage: result.coverage, automated: hasAutomatedAbility(result) };
  tally[result.coverage] = (tally[result.coverage] ?? 0) + 1;
}

const n = Object.keys(out).length;
console.log(`distinct oracle_id: ${n}`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(10)} ${String(v).padStart(6)}  ${((100 * v) / n).toFixed(1)}%`);
const auto = Object.values(out).filter((v) => v.automated).length;
console.log(`  >=1 automated ability   ${auto}  ${((100 * auto) / n).toFixed(1)}%`);

writeFileSync(join(DATA, 'our-coverage.json'), JSON.stringify({ meta: { measuredAt: new Date().toISOString(), distinctOracleIds: n }, cards: out }));
console.log(`\nwrote ${join(DATA, 'our-coverage.json')}`);
