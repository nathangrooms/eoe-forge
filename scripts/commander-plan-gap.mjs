/**
 * How many real commanders does the engine have NOTHING to say about?
 *
 * `planForCommander` reads compiled facets. When the compiler cannot parse a
 * card's text the plan comes back with no wants, and the ranker's commanderFit
 * term contributes exactly zero to every candidate. The deck is then built on
 * roles and popularity alone, which is the owner's "random high edh cards" and
 * the friend's "barely synergises with the commander".
 *
 * Teysa Karlov is the case that found it. Her whole record is
 * `sub:advisor, sub:human, type:creature, type:legendary`, source `none`, so a
 * marquee aristocrats commander is built as a generic pile.
 *
 * This walks the real legendary creatures in `cards_unique` ordered by
 * edhrec_rank, so the gap is weighted by what people actually build.
 *
 *   node --experimental-strip-types scripts/commander-plan-gap.mjs
 *   LIMIT=500 node --experimental-strip-types scripts/commander-plan-gap.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

import { planForCommander } from '../src/engine/knowledge/behaviour.ts';
import { facetsForCard } from '../src/lib/deck/recommend/behaviour.ts';

const URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const LIMIT = Number(process.env.LIMIT ?? 400);
const PAGE = 200;

const rows = [];
for (let from = 0; rows.length < LIMIT; from += PAGE) {
  const url =
    `${URL}/rest/v1/cards_unique` +
    `?select=name,type_line,oracle_text,colors,color_identity,keywords,tags,faces,edhrec_rank` +
    `&type_line=ilike.*Legendary*Creature*` +
    `&edhrec_rank=not.is.null` +
    `&order=edhrec_rank.asc` +
    `&limit=${PAGE}&offset=${from}`;
  const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const page = await res.json();
  if (!page.length) break;
  rows.push(...page);
}

const silent = [];
const census = { compiler: 0, xmage: 0, none: 0 };
let withWants = 0;

for (const row of rows.slice(0, LIMIT)) {
  const compiled = facetsForCard(row);
  census[compiled.source] = (census[compiled.source] ?? 0) + 1;
  const plan = planForCommander({
    name: row.name, typeLine: row.type_line, facets: compiled.facets, tags: row.tags,
    oracleText: row.oracle_text ?? null,
  });
  if (plan.wants.length) withWants++;
  else silent.push({
    rank: row.edhrec_rank,
    name: row.name,
    source: compiled.source,
    facets: compiled.facets.join(' '),
    text: (row.oracle_text ?? '').replace(/\n/g, ' | ').slice(0, 160),
  });
}

const n = Math.min(LIMIT, rows.length);
console.log(`top ${n} commanders by edhrec_rank`);
console.log(`  a plan with wants      ${withWants} (${Math.round((withWants / n) * 100)}%)`);
console.log(`  NOTHING to say         ${silent.length} (${Math.round((silent.length / n) * 100)}%)`);
console.log(`  compiler read the text ${census.compiler ?? 0}, xmage ${census.xmage ?? 0}, neither ${census.none ?? 0}`);
console.log('');
console.log('the most-built commanders the engine cannot read:');
for (const s of silent.slice(0, 30)) {
  console.log(`  #${String(s.rank).padStart(5)}  ${s.name.padEnd(34)} [${s.source}]`);
  console.log(`         ${s.text}`);
}

const out = path.resolve('.shots/commander-plan-gap.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ n, withWants, silent }, null, 2));
console.log('');
console.log(`full list: ${out}`);
