/**
 * How many commanders does the engine actually have an opinion about?
 *
 * Not the same question as "can the compiler read the card", and confusing the
 * two is how this looked healthy. Four commanders, probed against real rows:
 *
 *   Adeline    coverage partial, rec:partial present, 3 wants   -> a plan
 *   Zada       coverage manual,  no rec: facet,       1 want    -> tag fallback
 *   Zimone     coverage manual,  no rec: facet,       1 want    -> tag fallback
 *   T'Challa   coverage partial, rec:partial present, 0 WANTS   -> nothing
 *   Kozilek    coverage partial, rec:partial present, 0 WANTS   -> nothing
 *
 * The last two are the case worth counting. `planForCommander` sets
 * `fromTagsOnly = !hasRecord(commander)`, so a commander the compiler DID read
 * never reaches the tag fallback, and if the record it read produces no wants
 * the deck is built with no commander signal at all and nothing says so. That
 * is not the tag fallback failing, it is the fallback being switched off by the
 * presence of a record that turned out to be empty of anything the plan can use.
 *
 * Rows come from the live database. Never from `.shots/pool-snapshot.json`.
 *
 *   node --experimental-strip-types scripts/commander-plan-coverage.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

import { facetsForCard } from '../supabase/functions/ai-deck-builder-v2/_lib/deck/recommend/behaviour.ts';
import { planForCommander } from '../supabase/functions/ai-deck-builder-v2/_engine/knowledge/behaviour.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

async function page(offset) {
  const url =
    `${SUPABASE_URL}/rest/v1/cards_unique` +
    `?select=id,oracle_id,name,type_line,oracle_text,tags,keywords,cmc,color_identity,edhrec_rank` +
    `&legalities->>commander=eq.legal&type_line=ilike.Legendary Creature*` +
    `&order=id.asc&offset=${offset}&limit=1000`;
  const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

const rows = [];
for (let offset = 0; ; offset += 1000) {
  const got = await page(offset);
  rows.push(...got);
  process.stderr.write(`fetched ${rows.length}\r`);
  if (got.length < 1000) break;
}
process.stderr.write(`\n`);

const byCoverage = new Map();
let noWants = 0;
let noWantsWithRecord = 0;
let tagFallback = 0;
const silentTop = [];
const wantCounts = [];
for (const r of rows) {
  const f = facetsForCard(r);
  const cov = f.coverage ?? 'unknown';
  byCoverage.set(cov, (byCoverage.get(cov) ?? 0) + 1);
  const plan = planForCommander({
    name: r.name,
    typeLine: r.type_line ?? null,
    facets: f.facets,
    tags: r.tags ?? null,
  });
  wantCounts.push(plan.wants.length);
  if (plan.fromTagsOnly) tagFallback++;
  if (plan.wants.length === 0) {
    noWants++;
    if (!plan.fromTagsOnly) {
      noWantsWithRecord++;
      if (r.edhrec_rank != null) silentTop.push({ name: r.name, rank: r.edhrec_rank, coverage: cov });
    }
  }
}
silentTop.sort((a, b) => a.rank - b.rank);
const pct = n => `${((100 * n) / rows.length).toFixed(1)}%`;

console.log(`commander-legal legendary creatures measured: ${rows.length}`);
console.log('\ncompiler coverage:');
for (const [k, v] of [...byCoverage].sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(k).padEnd(10)} ${String(v).padStart(5)}  ${pct(v)}`);
console.log('\nthe plan the ranker actually gets:');
console.log(`  no wants at all              ${String(noWants).padStart(5)}  ${pct(noWants)}`);
console.log(`    of those, WITH a record    ${String(noWantsWithRecord).padStart(5)}  ${pct(noWantsWithRecord)}   <- tag fallback suppressed, nothing put in its place`);
console.log(`  built from tags only         ${String(tagFallback).padStart(5)}  ${pct(tagFallback)}`);
const sorted = [...wantCounts].sort((a, b) => a - b);
console.log(
  `  wants per commander: median ${sorted[Math.floor(sorted.length / 2)]}, ` +
    `mean ${(wantCounts.reduce((s, x) => s + x, 0) / wantCounts.length).toFixed(2)}, max ${sorted.at(-1)}`
);
console.log('\nThe 30 most-played commanders the engine has NO opinion about, despite reading them:');
for (const c of silentTop.slice(0, 30))
  console.log(`  EDHREC #${String(c.rank).padStart(6)}  ${c.name.padEnd(38)} coverage=${c.coverage}`);

fs.mkdirSync(path.resolve('.shots/gen-ten'), { recursive: true });
fs.writeFileSync(
  path.resolve('.shots/gen-ten/commander-plan-coverage.json'),
  JSON.stringify(
    { measured: rows.length, byCoverage: [...byCoverage], noWants, noWantsWithRecord, tagFallback, silentTop: silentTop.slice(0, 200) },
    null,
    2
  )
);
