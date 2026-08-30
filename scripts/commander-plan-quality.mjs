/**
 * Coverage is not quality, and quoting one as the other is how a number stops
 * meaning anything.
 *
 * "84.5% of commanders have a plan" counts a commander with ONE want at weight
 * 0.4 exactly the same as Krenko, whose plan names goblins, goblin payoffs and
 * goblin tokens. Both are "covered". Only one of them will actually shape a
 * deck, because `commanderFit` is a weighted sum and a single low want moves
 * almost nothing against `roleGap 3.0` and `playability 2.5`.
 *
 * So this reports the distribution, not the headline:
 *
 *   WANTS PER COMMANDER  how many facets the plan names. One is thin.
 *   TOP WEIGHT           the strongest thing it asks for. Under 0.5 means the
 *                        plan will lose every contested slot.
 *   TOTAL WEIGHT         the sum, which is roughly what the ranker feels.
 *   DISTINCT PLANS       how many genuinely different plans exist across all
 *                        commanders. If 3,000 commanders share 40 plans the
 *                        generator builds 40 decks, and "every commander is
 *                        covered" would be true and useless.
 *   TRIBE                how many get a tribe, which is the strongest single
 *                        signal the plan can carry.
 *
 * Writes to its own paths so it can run beside other work.
 *
 *   node --experimental-strip-types scripts/commander-plan-quality.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

import { planForCommander } from '../src/engine/knowledge/behaviour.ts';
import { facetsForCard } from '../src/lib/deck/recommend/behaviour.ts';

const URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const OUT = process.env.QUALITY_OUT ?? '.shots/quality/commander-plan-quality.json';

/* Unfiltered keyset walk by id. Every ILIKE form on type_line dies on the
   statement timeout; see CLAUDE.md section 10d. */

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

const canLead = (r) =>
  (/legendary/i.test(r.type_line ?? '') && /creature/i.test(r.type_line ?? '')) ||
  /can be your commander/i.test(r.oracle_text ?? '') ||
  (Array.isArray(r.faces) && r.faces.some(f => /creature/i.test(f?.type_line ?? '')));

const legal = rows
  .filter(canLead)
  .filter(r => (r.legalities?.commander ?? 'legal') === 'legal');

const plans = [];
for (const row of legal) {
  const compiled = facetsForCard(row);
  const plan = planForCommander({
    name: row.name,
    typeLine: row.type_line,
    facets: compiled.facets,
    tags: row.tags,
    oracleText: row.oracle_text ?? null,
  });
  const weights = plan.wants.map(w => w.weight);
  plans.push({
    name: row.name,
    rank: row.edhrec_rank ?? null,
    count: plan.wants.length,
    top: weights.length ? Math.max(...weights) : 0,
    total: weights.reduce((a, b) => a + b, 0),
    tribe: plan.tribe ?? null,
    /* The plan's IDENTITY: which facets it asks for, ignoring weight. Two
       commanders with the same set build the same deck, so this is what
       "different plans" has to be counted over. */
    key: plan.wants.map(w => w.facet).sort().join('|'),
  });
}

const n = plans.length;
const covered = plans.filter(p => p.count > 0);
const pct = x => `${((x / n) * 100).toFixed(1)}%`;

const bucket = (arr, edges, of) => {
  const out = new Map(edges.map(e => [e.label, 0]));
  for (const p of arr) {
    const v = of(p);
    const hit = edges.find(e => v >= e.min && v < e.max);
    if (hit) out.set(hit.label, out.get(hit.label) + 1);
  }
  return out;
};

console.log(`commander-legal legends: ${n}`);
console.log(`  a plan with wants   ${covered.length} (${pct(covered.length)})`);
console.log(`  silent              ${n - covered.length} (${pct(n - covered.length)})`);
console.log('');

console.log('WANTS PER COVERED COMMANDER');
for (const [label, count] of bucket(covered, [
  { label: '  exactly 1  (thin)', min: 1, max: 2 },
  { label: '  2 to 3',           min: 2, max: 4 },
  { label: '  4 to 6',           min: 4, max: 7 },
  { label: '  7 or more',        min: 7, max: Infinity },
], p => p.count)) console.log(`${label.padEnd(22)} ${count} (${pct(count)})`);
console.log('');

console.log('STRONGEST WANT');
for (const [label, count] of bucket(covered, [
  { label: '  under 0.5  (weak)', min: 0, max: 0.5 },
  { label: '  0.5 to 0.7',        min: 0.5, max: 0.7 },
  { label: '  0.7 to 0.9',        min: 0.7, max: 0.9 },
  { label: '  0.9 and up',        min: 0.9, max: Infinity },
], p => p.top)) console.log(`${label.padEnd(22)} ${count} (${pct(count)})`);
console.log('');

const distinct = new Set(covered.map(p => p.key));
const shares = new Map();
for (const p of covered) shares.set(p.key, (shares.get(p.key) ?? 0) + 1);
const commonest = [...shares.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

console.log(`DISTINCT PLANS: ${distinct.size} across ${covered.length} covered commanders`);
console.log(`  a commander shares its plan with, on average, ${(covered.length / distinct.size).toFixed(1)} others`);
console.log('  the plans the most commanders share:');
for (const [key, count] of commonest) {
  console.log(`    ${String(count).padStart(4)}  ${key || '(empty)'}`);
}
console.log('');
console.log(`WITH A TRIBE: ${covered.filter(p => p.tribe).length} (${pct(covered.filter(p => p.tribe).length)})`);

/* The commanders people actually build, judged separately, because a thin plan
   on a card nobody plays costs nothing and a thin plan on a top-100 commander
   is what the owner's friend was complaining about. */
/* Ranked AMONG COMMANDERS, not among all cards. `edhrec_rank` is a rank over
   the whole catalogue, where the first two hundred places are staples like Sol
   Ring and Command Tower and not one of them is a legendary creature, so
   `rank <= 200` matched nothing and printed "0 of them in the catalogue",
   which is a nonsense line rather than a finding. The best-ranked commander in
   the catalogue is 258. */
const top200 = plans
  .filter(p => p.rank)
  .sort((a, b) => a.rank - b.rank)
  .slice(0, 200);
const thinTop = top200.filter(p => p.count > 0 && p.count <= 1);
const silentTop = top200.filter(p => p.count === 0);
console.log('');
console.log(`THE 200 MOST-BUILT COMMANDERS (best catalogue rank ${top200[0]?.rank ?? '-'})`);
console.log(`  silent            ${silentTop.length}${silentTop.length ? ': ' + silentTop.map(p => p.name).slice(0, 8).join(', ') : ''}`);
console.log(`  one want only     ${thinTop.length}${thinTop.length ? ': ' + thinTop.map(p => p.name).slice(0, 8).join(', ') : ''}`);
/* The fallback counted separately, because it is the difference between "we
   could not read this" and "we read it and said something wrong". */
const VOLTRON_KEY = 'cares:sub:aura|cares:sub:equipment|eff:pump|sub:aura|sub:equipment';
const fbTop = top200.filter(p => p.key === VOLTRON_KEY);
console.log(`  Voltron fallback  ${fbTop.length}${fbTop.length ? ': ' + fbTop.map(p => p.name).slice(0, 8).join(', ') : ''}`);
const fbAll = covered.filter(p => p.key === VOLTRON_KEY);
console.log('');
console.log(`THE VOLTRON FALLBACK ACCOUNTS FOR ${fbAll.length} of the ${covered.length} covered (${((fbAll.length / covered.length) * 100).toFixed(1)}%).`);
console.log('That is not coverage, it is the engine saying it could not read the card.');

fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
fs.writeFileSync(path.resolve(OUT), JSON.stringify({ total: n, covered: covered.length, distinctPlans: distinct.size, plans }, null, 2));
console.log('');
console.log(`full table: ${OUT}`);
