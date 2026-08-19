/**
 * scripts/coverage/dsl-coverage.ts — REPRESENTABLE coverage of our own catalogue.
 *
 *   node --experimental-strip-types scripts/coverage/dsl-coverage.ts            # measure
 *   node --experimental-strip-types scripts/coverage/dsl-coverage.ts --baseline # measure and freeze
 *   node --experimental-strip-types scripts/coverage/dsl-coverage.ts --diff     # measure and diff vs frozen
 *
 * ## The one number this file produces, and the one it does NOT
 *
 * It reports REPRESENTABLE coverage: what fraction of our `cards` table the
 * ability DSL and its oracle-text compiler can express. It says nothing at all
 * about AUTOMATED coverage — what the engine actually runs — because a card can
 * compile to `coverage: 'full'` and still do nothing on a battlefield, if the
 * effects it compiled to are ones `to-actions.ts` defers rather than performs.
 *
 * Quoting a number from this file as an automation figure is the exact
 * dishonesty the whole design exists to prevent.
 *
 * ## Why it caches the catalogue
 *
 * A before/after comparison is only meaningful over IDENTICAL input. The
 * catalogue is fetched once into `.data/catalogue.json` (gitignored) and every
 * later run reads that file, so a coverage delta is a change in the compiler
 * and never a change in the data underneath it. `--refetch` forces a new pull.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compileWithTrace, assertClausesAccounted } from '../../src/lib/cards/abilities/compiler.ts';
import type { AbilityCard } from '../../src/lib/cards/abilities/normalize.ts';
import type { Ability, Effect } from '../../src/lib/cards/abilities/dsl.ts';
import { effectsOf, playerSelectorsIn, watchQueriesInAbility } from '../../src/lib/cards/abilities/dsl.ts';
import { hasAutomatedAbility } from '../../src/lib/cards/abilities/coverage.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const DATA = join(here, '.data');
mkdirSync(DATA, { recursive: true });

const CATALOGUE = join(DATA, 'catalogue.json');
const BASELINE = join(DATA, 'dsl-coverage.baseline.json');
const LATEST = join(DATA, 'dsl-coverage.latest.json');

const argv = new Set(process.argv.slice(2));

/* ------------------------------------------------------------------ *
 * The catalogue, fetched once
 * ------------------------------------------------------------------ */

const COLUMNS =
  'id,oracle_id,name,type_line,oracle_text,keywords,mana_cost,cmc,power,toughness,layout,faces';
const PAGE = 400;

async function fetchCatalogue(): Promise<Array<AbilityCard & { id: string }>> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(join(repoRoot, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing from .env');

  const rows: Array<AbilityCard & { id: string }> = [];
  let after = '';
  for (;;) {
    const qs = new URLSearchParams({ select: COLUMNS, order: 'id.asc', limit: String(PAGE) });
    if (after) qs.set('id', `gt.${after}`);
    // Postgres cancels the odd page on statement timeout. Retrying the SAME
    // page is safe — the query is keyset-paginated and idempotent — and a
    // dropped page would silently shrink the denominator of every figure below.
    let batch: Array<AbilityCard & { id: string }> | null = null;
    for (let attempt = 0; attempt < 6 && !batch; attempt++) {
      const res = await fetch(`${url}/rest/v1/cards?${qs}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (res.ok) { batch = (await res.json()) as Array<AbilityCard & { id: string }>; break; }
      const body = await res.text();
      if (attempt === 5) throw new Error(`${res.status} ${body}`);
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    if (!batch) throw new Error('unreachable');
    if (!batch.length) break;
    rows.push(...batch);
    after = batch[batch.length - 1].id;
    if (batch.length < PAGE) break;
  }
  return rows;
}

let rows: Array<AbilityCard & { id: string }>;
if (!argv.has('--refetch') && existsSync(CATALOGUE)) {
  const cached = JSON.parse(readFileSync(CATALOGUE, 'utf8')) as {
    fetchedAt: string;
    rows: Array<AbilityCard & { id: string }>;
  };
  rows = cached.rows;
  console.log(`catalogue: ${rows.length} printings from cache (fetched ${cached.fetchedAt})`);
} else {
  rows = await fetchCatalogue();
  writeFileSync(CATALOGUE, JSON.stringify({ fetchedAt: new Date().toISOString(), rows }));
  console.log(`catalogue: ${rows.length} printings fetched and cached`);
}

/* ------------------------------------------------------------------ *
 * Measure, collapsed to oracle_id
 * ------------------------------------------------------------------ */

interface Row {
  coverage: string;
  automated: boolean;
  name: string;
}

/* ------------------------------------------------------------------ *
 * Representable, and then the part of it that cannot possibly run
 *
 * A card at `coverage: 'full'` has been fully EXPRESSED. Some of those cards
 * can never be executed as things stand, because they lean on a construct the
 * resolution context cannot bind — a watch query nothing folds, a "that player"
 * no trigger names, an opponent-facing cost nothing can offer. `trigger-bridge`
 * refuses to own them for exactly that reason.
 *
 * Counting them here is what stops the headline `full` figure being read as an
 * automation number. It is the same two-numbers discipline one level down.
 * ------------------------------------------------------------------ */

function hasUnlessPays(effect: Effect): boolean {
  if (effect.do === 'unless-pays') return true;
  if (effect.do === 'if') return effect.then.some(hasUnlessPays) || (effect.else ?? []).some(hasUnlessPays);
  if (effect.do === 'for-each' || effect.do === 'repeat' || effect.do === 'may') return effect.effects.some(hasUnlessPays);
  if (effect.do === 'choose-mode') return effect.modes.some((mode) => mode.effects.some(hasUnlessPays));
  return false;
}

function unbindableKinds(abilities: readonly Ability[]): string[] {
  const kinds = new Set<string>();
  for (const ability of abilities) {
    const effects = effectsOf(ability);
    // `watchQueriesInAbility`, not `watchQueriesIn`: a static ability has no
    // effect tree, and "costs {1} less for each creature that attacked this
    // turn" hides its query in `modifications`. Walking only the effects would
    // under-report this very count.
    if (watchQueriesInAbility(ability).length > 0) kinds.add('needs-turn-history');
    if (playerSelectorsIn(effects).some((selector) => selector.who === 'trigger-player')) kinds.add('trigger-player');
    if (effects.some(hasUnlessPays)) kinds.add('opponent-facing-cost');
  }
  return [...kinds];
}

const perCard: Record<string, Row> = {};
const tally: Record<string, number> = {};
const ruleHits: Record<string, number> = {};
const gapReasons: Record<string, number> = {};
const manualHints: Record<string, number> = {};
const accountingFailures: string[] = [];
let fullButUnbindable = 0;
const unbindableBy: Record<string, number> = {};

const bump = (m: Record<string, number>, k: string): void => {
  m[k] = (m[k] ?? 0) + 1;
};

for (const row of rows) {
  const oid = row.oracle_id;
  if (!oid || perCard[oid]) continue;
  const trace = compileWithTrace(row);
  try {
    assertClausesAccounted(trace);
  } catch (err) {
    if (accountingFailures.length < 40) accountingFailures.push(`${trace.result.name}: ${(err as Error).message}`);
  }
  const result = trace.result;
  perCard[oid] = { coverage: result.coverage, automated: hasAutomatedAbility(result), name: result.name };
  bump(tally, result.coverage);
  if (result.coverage === 'full') {
    const kinds = unbindableKinds(result.abilities);
    if (kinds.length) {
      fullButUnbindable++;
      for (const kind of kinds) bump(unbindableBy, kind);
    }
  }
  for (const rule of trace.ruleHits) bump(ruleHits, rule);
  for (const clause of result.unparsed) bump(gapReasons, clause.reason);
  for (const ability of result.abilities) {
    for (const effect of JSON.stringify(ability).matchAll(/"hint":"([^"]*)"/g)) bump(manualHints, effect[1]);
  }
}

const distinct = Object.keys(perCard).length;
const automated = Object.values(perCard).filter((r) => r.automated).length;

const report = {
  measuredAt: new Date().toISOString(),
  distinctOracleIds: distinct,
  byCoverage: tally,
  full: tally.full ?? 0,
  fullPct: Number(((100 * (tally.full ?? 0)) / distinct).toFixed(2)),
  atLeastOneAutomatedAbility: automated,
  atLeastOneAutomatedAbilityPct: Number(((100 * automated) / distinct).toFixed(2)),
  // REPRESENTABLE minus the part that provably cannot execute. Still not an
  // automation figure — a card counted here may call an effect `to-actions.ts`
  // defers rather than performs — but it is a strictly tighter ceiling.
  fullButStructurallyUnrunnable: fullButUnbindable,
  fullButStructurallyUnrunnableBy: unbindableBy,
  accountingFailures: accountingFailures.length,
  accountingFailureSamples: accountingFailures.slice(0, 10),
  topRules: Object.entries(ruleHits).sort((a, b) => b[1] - a[1]).slice(0, 30),
  gapReasons: Object.entries(gapReasons).sort((a, b) => b[1] - a[1]),
  topManualHints: Object.entries(manualHints).sort((a, b) => b[1] - a[1]).slice(0, 20),
};

console.log('');
console.log(`distinct oracle_id      ${distinct}`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(10)} ${String(v).padStart(6)}  ${((100 * v) / distinct).toFixed(2)}%`);
}
console.log(`  >=1 automated ability ${String(automated).padStart(6)}  ${((100 * automated) / distinct).toFixed(2)}%`);
console.log(`  accounting failures   ${accountingFailures.length}`);
console.log('');
console.log(`of the ${tally.full ?? 0} REPRESENTABLE ('full') cards, ${fullButUnbindable} provably cannot execute today:`);
for (const [k, v] of Object.entries(unbindableBy).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(24)} ${String(v).padStart(5)}`);
}
console.log('This is a ceiling on a ceiling. Neither figure is an AUTOMATED number.');

writeFileSync(LATEST, JSON.stringify({ report, cards: perCard }, null, 0));

if (argv.has('--baseline')) {
  writeFileSync(BASELINE, JSON.stringify({ report, cards: perCard }, null, 0));
  console.log(`\nfroze baseline -> ${BASELINE}`);
}

if (argv.has('--diff')) {
  if (!existsSync(BASELINE)) throw new Error('no baseline; run with --baseline first');
  const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as { report: typeof report; cards: Record<string, Row> };
  const gained: string[] = [];
  const lost: string[] = [];
  const moved: Record<string, number> = {};
  for (const [oid, now] of Object.entries(perCard)) {
    const before = base.cards[oid];
    if (!before) continue;
    if (before.coverage === now.coverage) continue;
    bump(moved, `${before.coverage} -> ${now.coverage}`);
    if (now.coverage === 'full') gained.push(now.name);
    if (before.coverage === 'full') lost.push(now.name);
  }
  console.log('\n--- diff vs baseline ---');
  console.log(`full: ${base.report.full} (${base.report.fullPct}%) -> ${report.full} (${report.fullPct}%)  delta ${report.full - base.report.full}`);
  console.log(
    `>=1 automated ability: ${base.report.atLeastOneAutomatedAbility} -> ${report.atLeastOneAutomatedAbility}  delta ${
      report.atLeastOneAutomatedAbility - base.report.atLeastOneAutomatedAbility
    }`,
  );
  for (const [k, v] of Object.entries(moved).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(24)} ${v}`);
  console.log(`\nnewly 'full' (${gained.length}), sample:`);
  for (const name of gained.slice(0, 25)) console.log(`  + ${name}`);
  console.log(`\nREGRESSED out of 'full' (${lost.length}), sample:`);
  for (const name of lost.slice(0, 25)) console.log(`  - ${name}`);
}
