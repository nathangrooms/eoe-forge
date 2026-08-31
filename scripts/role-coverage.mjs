/**
 * What fraction of the cards people actually play can the deck builder PLACE?
 *
 * `generateDeck` puts each card into its neediest role and skips it outright
 * when it serves none. So a card with no role is not outranked, it is
 * unreachable — and this counts how many of those there are, over the slice
 * that matters: the most played cards in the format, which is the pool the
 * generator draws from.
 *
 *   node --experimental-strip-types scripts/role-coverage.mjs
 *   TOP=3000 node --experimental-strip-types scripts/role-coverage.mjs
 */
import { cardRole } from '../src/engine/advise/roles.ts';
import { ROLES } from '../src/engine/core/types.ts';
import { facetsForCard } from '../src/lib/deck/recommend/behaviour.ts';
import fs from 'node:fs';

const ANON = fs.readFileSync('scratch/anon.txt', 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1';
const TOP = Number(process.env.TOP || 2000);
const cols = 'name,oracle_text,type_line,mana_cost,cmc,colors,color_identity,keywords,tags,edhrec_rank,oracle_id';

/*
 * A RANK RANGE PLUS A SEEN-SET, which is the only one of the three shapes that
 * is both fast and complete. Measured against this database:
 *
 *   offset=1000                                 walks and discards 1,000 rows
 *   or=(rank.gt.N,and(rank.eq.N,id.gt.X))       2.29 s, the disjunction cannot
 *                                               use the index
 *   edhrec_rank=gte.N                           0.34 s, a clean index range
 *
 * Both of the first two started returning 57014 statement timeouts on page two
 * once the database had other work on, and the probe printed "read 1000 cards"
 * and carried on, which is worse than failing.
 *
 * `gte` rather than `gt` because `edhrec_rank` is NOT unique, and a `gt` cursor
 * after a page that ended on a shared rank steps straight over the other card.
 * The overlap `gte` creates is removed by id, which costs a Set.
 */
const rows = [];
const seen = new Set();
let fromRank = 0;
while (rows.length < TOP) {
  const r = await fetch(
    `${BASE}/cards_unique?select=id,${cols}&edhrec_rank=gte.${fromRank}` +
      `&order=edhrec_rank.asc,id.asc&limit=250`,
    { headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Prefer: 'count=none' } });
  if (!r.ok) { console.error(r.status, (await r.text()).slice(0, 140)); break; }
  const page = await r.json();
  if (!page.length) break;
  let added = 0;
  for (const row of page) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
    added++;
  }
  const last = page[page.length - 1];
  // No progress and no advance means the end of the catalogue. Stop, do not spin.
  if (!added && last.edhrec_rank <= fromRank) break;
  fromRank = last.edhrec_rank;
}
if (rows.length < TOP) {
  console.error(`!! only ${rows.length} of ${TOP} rows were read. The figures below are over that slice, not the one asked for.`);
}

console.log(`read ${rows.length} cards, most played first\n`);

const tally = {}; for (const r of ROLES) tally[r] = 0;
let roleless = 0;
const examples = [];
const bands = { '1-250': [0,0], '251-1000': [0,0], '1001-2000': [0,0] };
for (const c of rows.slice(0, TOP)) {
  const fc = facetsForCard(c);
  const facets = Array.isArray(fc) ? fc : (fc?.facets ?? []);
  const subject = { facets, typeLine: c.type_line, tags: c.tags };
  const served = ROLES.filter(r => cardRole(subject, r));
  for (const r of served) tally[r] += 1;
  const band = c.edhrec_rank <= 250 ? '1-250' : c.edhrec_rank <= 1000 ? '251-1000' : '1001-2000';
  if (bands[band]) { bands[band][1] += 1; if (!served.length) bands[band][0] += 1; }
  if (!served.length) { roleless += 1; if (examples.length < 25) examples.push(`#${c.edhrec_rank} ${c.name}`); }
}
const n = Math.min(TOP, rows.length);
console.log(`NO ROLE AT ALL: ${roleless} of ${n}  (${((roleless / n) * 100).toFixed(1)}%)`);
console.log('by how played:');
for (const [band, [bad, all]] of Object.entries(bands)) {
  if (!all) continue;
  console.log(`  ${band.padEnd(10)} ${String(bad).padStart(4)} of ${String(all).padStart(4)}  ${((bad/all)*100).toFixed(1)}%`);
}
console.log('\nroles claimed (a card may serve several):');
for (const [r, k] of Object.entries(tally).sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${r.padEnd(11)} ${String(k).padStart(5)}  ${((k/n)*100).toFixed(1)}%`);
}
console.log('\nmost played cards the builder cannot place:');
for (const e of examples) console.log(`  ${e}`);
