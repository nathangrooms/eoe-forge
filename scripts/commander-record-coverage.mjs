/**
 * Can the engine read the commander?
 *
 * Three real precon decks went through the deployed optimiser and every single
 * suggestion that mentioned the commander said "(no ability record for this
 * card)". That string comes from `behaviour.ts`, and it is emitted when
 * `hasRecord(commander)` is false, so it is about the COMMANDER and not about
 * the card being suggested. The plan for those decks was built from tag words
 * rather than from the compiled ability record.
 *
 * That is one measurement on three commanders. This is the denominator: run the
 * SHIPPING compiler, the same `facetsForCard` the deployed generator imports,
 * over every commander-legal legendary creature in the catalogue and count how
 * many the compiler can actually read.
 *
 * The pool comes from the live database over PostgREST. It does NOT come from
 * `.shots/pool-snapshot.json`, whose rows carry no oracle_text, which is how a
 * commander was once misdiagnosed as a compiler bug.
 *
 *   node --experimental-strip-types scripts/commander-record-coverage.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

import { facetsForCard } from '../supabase/functions/ai-deck-builder-v2/_lib/deck/recommend/behaviour.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

async function page(offset, limit) {
  const url =
    `${SUPABASE_URL}/rest/v1/cards_unique` +
    `?select=id,oracle_id,name,type_line,oracle_text,tags,keywords,cmc,color_identity,edhrec_rank` +
    `&legalities->>commander=eq.legal` +
    `&type_line=ilike.Legendary Creature*` +
    `&order=id.asc&offset=${offset}&limit=${limit}`;
  const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

const rows = [];
for (let offset = 0; ; offset += 1000) {
  const got = await page(offset, 1000);
  rows.push(...got);
  process.stderr.write(`fetched ${rows.length}\r`);
  if (got.length < 1000) break;
}
process.stderr.write(`\nfetched ${rows.length} commander-legal legendary creatures\n`);

let full = 0;
let partial = 0;
let none = 0;
const noRecordTop = [];
for (const r of rows) {
  const out = facetsForCard(r);
  const cov = out.coverage ?? (out.facets?.length ? 'partial' : 'none');
  if (cov === 'full') full++;
  else if (cov === 'none' || !out.facets?.length) {
    none++;
    if (r.edhrec_rank != null) noRecordTop.push({ name: r.name, rank: r.edhrec_rank });
  } else partial++;
}
noRecordTop.sort((a, b) => a.rank - b.rank);

const pct = n => `${((100 * n) / rows.length).toFixed(1)}%`;
console.log(`commanders measured: ${rows.length}`);
console.log(`  full record    ${String(full).padStart(5)}  ${pct(full)}`);
console.log(`  partial record ${String(partial).padStart(5)}  ${pct(partial)}`);
console.log(`  NO record      ${String(none).padStart(5)}  ${pct(none)}`);
console.log('\nThe 25 most-played commanders the compiler cannot read at all:');
for (const c of noRecordTop.slice(0, 25)) console.log(`  EDHREC #${String(c.rank).padStart(6)}  ${c.name}`);

fs.mkdirSync(path.resolve('.shots/gen-ten'), { recursive: true });
fs.writeFileSync(
  path.resolve('.shots/gen-ten/commander-record-coverage.json'),
  JSON.stringify({ measured: rows.length, full, partial, none, noRecordTop: noRecordTop.slice(0, 100) }, null, 2)
);
