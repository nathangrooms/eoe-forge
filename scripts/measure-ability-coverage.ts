/**
 * Measures the ability compiler against the whole `cards` catalogue and prints
 * the numbers. Nothing is written back.
 *
 *   node --experimental-strip-types scripts/measure-ability-coverage.ts
 *   node --experimental-strip-types scripts/measure-ability-coverage.ts --card "Sol Ring"
 *   node --experimental-strip-types scripts/measure-ability-coverage.ts --gaps unrecognised
 *
 * The point of having this as a script rather than a paragraph in a document is
 * that "how much of the catalogue works" is a claim with an expiry date. Every
 * rule added to `src/lib/cards/abilities/effect-rules.ts` moves it, and every
 * Scryfall sync moves it too. Re-run it instead of trusting a number someone
 * wrote down once.
 *
 * Three counts are printed and they mean different things:
 *
 *   - "at least one ability"           generous. A triggered ability whose body
 *                                      is entirely `{do:'manual'}` counts,
 *                                      because the engine does know when to fire
 *                                      it and puts a marked item on the stack.
 *   - "at least one automated ability"  the honest headline. No `{do:'manual'}`
 *                                      anywhere in at least one ability.
 *   - "coverage === 'full'"             nothing dropped and nothing manual
 *                                      anywhere on the card.
 *
 * Reads through the publishable key — the same anon access the browser has.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { measureCoverage, topOf } from '../src/lib/cards/abilities/coverage.ts';
import { compileWithTrace } from '../src/lib/cards/abilities/compiler.ts';
import type { AbilityCard } from '../src/lib/cards/abilities/normalize.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const env: Record<string, string> = {};
for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing from .env');

const COLUMNS = 'id,oracle_id,name,type_line,oracle_text,keywords,mana_cost,cmc,power,toughness,layout,faces';
const PAGE = 1000;

const argOf = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] ?? null : null;
};

async function fetchAll(): Promise<AbilityCard[]> {
  const out: AbilityCard[] = [];
  let after = '';
  for (;;) {
    const qs = new URLSearchParams({ select: COLUMNS, order: 'id.asc', limit: String(PAGE) });
    if (after) qs.set('id', `gt.${after}`);
    const res = await fetch(`${url}/rest/v1/cards?${qs}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const rows = (await res.json()) as Array<AbilityCard & { id: string }>;
    if (!rows.length) break;
    out.push(...rows);
    after = rows[rows.length - 1].id;
    if (out.length % 10000 === 0) process.stderr.write(`  fetched ${out.length}\n`);
  }
  return out;
}

const pct = (n: number, total: number): string => `${((100 * n) / total).toFixed(1)}%`;

const cards = await fetchAll();

/* --- single-card mode: print one card's compiled abilities --- */
const one = argOf('--card');
if (one) {
  const card = cards.find((c) => String(c.name).toLowerCase() === one.toLowerCase());
  if (!card) throw new Error(`no card named ${one}`);
  const trace = compileWithTrace(card);
  console.log(`${card.name} [${card.type_line}] coverage=${trace.result.coverage}`);
  console.log(JSON.stringify(trace.result, null, 2));
  process.exit(0);
}

/* --- gap-drilldown mode: which templates are costing us the most --- */
const gapReason = argOf('--gaps');
if (gapReason) {
  const hist = new Map<string, number>();
  for (const card of cards) {
    const trace = compileWithTrace(card);
    const norms = new Map(trace.normalized.paragraphs.map((p) => [p.raw, p]));
    for (const clause of trace.result.unparsed) {
      if (clause.reason !== gapReason) continue;
      const para = norms.get(clause.text);
      if (!para || para.face > 0) continue;
      const keyText = para.norm.split(' ').slice(0, 8).join(' ');
      hist.set(keyText, (hist.get(keyText) ?? 0) + 1);
    }
  }
  console.log(`\nmost common '${gapReason}' clause openings:\n`);
  for (const [k, v] of [...hist].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
    console.log(String(v).padStart(6), k);
  }
  process.exit(0);
}

/* --- the report --- */
const started = Date.now();
const r = measureCoverage(cards, true);
const elapsed = Date.now() - started;

console.log(`\ncards ${r.cards}   compiled in ${elapsed} ms (${((elapsed / r.cards) * 1000).toFixed(0)} us/card)\n`);
console.log(`  no oracle text at all          ${String(r.blank).padStart(6)}  ${pct(r.blank, r.cards)}`);
console.log(`  at least one ability           ${String(r.cardsWithAnyAbility).padStart(6)}  ${pct(r.cardsWithAnyAbility, r.cards)}`);
console.log(`  at least one AUTOMATED ability ${String(r.cardsWithAutomatedAbility).padStart(6)}  ${pct(r.cardsWithAutomatedAbility, r.cards)}`);
console.log(`  coverage === 'full'            ${String(r.fullyCovered).padStart(6)}  ${pct(r.fullyCovered, r.cards)}`);
console.log(`\n  abilities emitted ${r.totalAbilities}   clauses reported as gaps ${r.totalUnparsed}`);

console.log(`\n  ACCOUNTING FAILURES: ${r.accountingFailures.length}  (must be 0 — every clause consumed or reported)`);
for (const failure of r.accountingFailures.slice(0, 10)) console.log(`    ${failure}`);

const section = (title: string, hist: Record<string, number>, n = 25): void => {
  console.log(`\n-- ${title} --`);
  for (const [k, v] of topOf(hist, n)) console.log(String(v).padStart(7), k);
};

section('coverage', r.byCoverage);
section('ability kinds', r.byAbilityKind);
section('rules that fired', r.byRule, 30);
section('gap reasons', r.byGapReason, 20);
section('manual markers, by hint (the vocabulary to-do list)', r.byManualHint, 15);
