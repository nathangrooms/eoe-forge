/**
 * The facets the compiler READS and no plan rule acts on.
 *
 * This is the other half of the coverage problem, and the more embarrassing
 * half. `commander-plan-quality.mjs` measured that 677 covered commanders
 * (21.2%) share ONE plan:
 *
 *   cares:sub:aura | cares:sub:equipment | eff:pump | sub:aura | sub:equipment
 *
 * which is the COMBAT KEYWORD FALLBACK. It fires when no rule produced a want
 * and the record carries combat keywords, and it concludes the deck is Voltron.
 * Its own comment argues the case well for Jareth, Leonine Titan.
 *
 * It is wrong for Vito, Thorn of the Dusk Rose. Vito has lifelink, so the
 * fallback sees a combat keyword and tells the builder to buy Equipment and
 * Auras. Vito is a lifedrain commander. The engine did not fail to read him,
 * it read `trig:gains-life` and then had no rule keyed on it, so `wants` was
 * empty and the fallback spoke over a card that had told us exactly what it
 * does. Ghalta and Avacyn are in the same 34, inside the 200 most-built
 * commanders.
 *
 * That is worse than silence, because a wrong plan actively misdirects the
 * ranker while a missing one merely fails to help.
 *
 * So: for every commander whose plan is ONLY the fallback, or who is silent,
 * what did the compiler actually find? Ranked by how many commanders carry it.
 * That list is the work queue for PLAN_RULES, in the order that buys the most.
 *
 *   node --experimental-strip-types scripts/commander-unused-facets.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

import { planForCommander } from '../src/engine/knowledge/behaviour.ts';
import { facetsForCard } from '../src/lib/deck/recommend/behaviour.ts';
import { isCommander, rulesTextOf } from './lib/commanders.mjs';

const URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const OUT = process.env.UNUSED_OUT ?? '.shots/quality/unused-facets.json';
const VOLTRON_KEY =
  'cares:sub:aura|cares:sub:equipment|eff:pump|sub:aura|sub:equipment';


/* Retry with backoff. A catalogue walk shares the database with whatever else is
   running, and a 57014 statement timeout on page 2 of 67 is a busy database
   rather than a broken query. Failing the whole walk over it means the
   measurement can only be taken when nothing else is happening, which is when
   nobody needs it. CLAUDE.md's rule still stands: do not START a heavy walk
   beside a heavy agent. This is for the load that arrives mid-walk. */
const getPage = async (url) => {
  let wait = 800;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    if (res.ok) return res.json();
    const body = await res.text();
    const busy = res.status >= 500 || /57014|statement timeout/.test(body);
    if (!busy || attempt >= 6) throw new Error(`${res.status} ${body.slice(0, 200)}`);
    process.stderr.write(`
  database busy, waiting ${wait}ms (attempt ${attempt})`);
    await new Promise(r => setTimeout(r, wait));
    wait = Math.min(wait * 2, 20000);
  }
};

const rows = [];
let cursor = '';
for (;;) {
  let url =
    `${URL}/rest/v1/cards_unique` +
    `?select=id,name,type_line,oracle_text,colors,color_identity,keywords,tags,faces,edhrec_rank,legalities` +
    `&order=id.asc&limit=500`;
  if (cursor) url += `&id=gt.${cursor}`;
  const page = await getPage(url);
  if (!page.length) break;
  cursor = page[page.length - 1].id;
  rows.push(...page);
  process.stderr.write(`\r  fetched ${rows.length}`);
  if (page.length < 500) break;
}
process.stderr.write('\n');

/* Shared rule. Both answers were wrong here in the same two ways as the
   census: non-legendary cards counted as commanders, and oracle_text read
   straight when it is NULL on every multi-face layout. */
const legal = rows.filter(isCommander);

/* Facets that describe WHAT A CARD IS rather than what it does. A rule keyed on
   one of these would fire on every creature, so they are not candidates and
   counting them would bury the signal. */
const STRUCTURAL = (f) =>
  f.startsWith('type:') ||
  f.startsWith('sub:') ||
  f.startsWith('mana:') ||
  f.startsWith('acost:') ||
  f.startsWith('scope:') ||
  f === 'rec:full' ||
  f === 'rec:partial';

const unheard = new Map();   // facet -> { commanders: [], ranks: [] }
const affected = [];

for (const row of legal) {
  const compiled = facetsForCard(row);
  const plan = planForCommander({
    name: row.name,
    typeLine: row.type_line,
    facets: compiled.facets,
    tags: row.tags,
    oracleText: rulesTextOf(row),
  });
  const key = plan.wants.map(w => w.facet).sort().join('|');
  const isFallback = key === VOLTRON_KEY;
  const isSilent = plan.wants.length === 0;
  if (!isFallback && !isSilent) continue;

  affected.push({ name: row.name, rank: row.edhrec_rank ?? null, why: isSilent ? 'silent' : 'voltron-fallback' });

  for (const f of compiled.facets) {
    if (STRUCTURAL(f)) continue;
    if (!unheard.has(f)) unheard.set(f, { commanders: [], bestRank: null });
    const e = unheard.get(f);
    e.commanders.push(row.name);
    if (row.edhrec_rank && (e.bestRank === null || row.edhrec_rank < e.bestRank)) e.bestRank = row.edhrec_rank;
  }
}

const ranked = [...unheard.entries()]
  .map(([facet, e]) => ({ facet, commanders: e.commanders.length, bestRank: e.bestRank, examples: e.commanders.slice(0, 4) }))
  .sort((a, b) => b.commanders - a.commanders);

const silentCount = affected.filter(a => a.why === 'silent').length;
const fallbackCount = affected.filter(a => a.why === 'voltron-fallback').length;

console.log(`commander-legal legends: ${legal.length}`);
console.log(`  silent                 ${silentCount}`);
console.log(`  only the Voltron fallback ${fallbackCount}`);
console.log(`  TOTAL not really read  ${affected.length} (${((affected.length / legal.length) * 100).toFixed(1)}%)`);
console.log('');
console.log('FACETS THE COMPILER FOUND AND NO RULE ACTS ON, most commanders first:');
console.log('(each line is a rule worth writing, and how many commanders it would reach)');
for (const r of ranked.slice(0, 45)) {
  console.log(
    `  ${String(r.commanders).padStart(4)}  ${r.facet.padEnd(26)} ` +
    `best rank ${String(r.bestRank ?? '-').padStart(6)}   ${r.examples.slice(0, 3).join(', ')}`
  );
}

fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
fs.writeFileSync(
  path.resolve(OUT),
  JSON.stringify({ legal: legal.length, silentCount, fallbackCount, ranked, affected }, null, 2)
);
console.log('');
console.log(`work queue: ${OUT}`);
