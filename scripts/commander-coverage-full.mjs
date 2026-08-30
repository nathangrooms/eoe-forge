/**
 * EVERY commander-legal legendary creature, and whether the engine has anything
 * to say about it. Not the top 400, not the ranked ones: all of them.
 *
 * Owner, 2026-08-30: "every single commander should be covered".
 *
 * `commander-plan-gap.mjs` walks the most-built commanders, which is the right
 * lens for "does this matter to players" and the wrong one for "are we done".
 * It also filters `edhrec_rank is not null`, which silently drops every
 * commander nobody has built yet, and a new legend with no rank is exactly the
 * case where the engine having an opinion is most valuable.
 *
 * Output is the WORK LIST: every silent commander with its text, clustered by
 * the opening words of its abilities, so rules can be written against real
 * cards rather than invented cases.
 *
 *   node --experimental-strip-types scripts/commander-coverage-full.mjs
 *   OUT=.shots/coverage.json node --experimental-strip-types scripts/commander-coverage-full.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

import { planForCommander } from '../src/engine/knowledge/behaviour.ts';
import { facetsForCard } from '../src/lib/deck/recommend/behaviour.ts';
import { isCommander, rulesTextOf, isVanilla } from './lib/commanders.mjs';

const URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const PAGE = 500;
const OUT = process.env.OUT ?? '.shots/commander-coverage.json';

/* Commander-legal, so a legend that cannot lead a deck is not counted against
   us. Planeswalkers that say "can be your commander" are included; a legendary
   creature that is banned is not. */

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
    /* NO PREDICATE AT ALL, and that is deliberate. Both a leading-wildcard
       `ilike.*Legendary*Creature*` and a `ilike.Legendary*` prefix died on the
       statement timeout: ILIKE is case-insensitive so a plain btree on
       type_line cannot serve either, and the GIN trigram index has to be
       bitmap-ANDed against the id ordering. Same shape as the pool-query
       failure in CLAUDE.md section 10d.
       An unfiltered keyset walk ordered by id IS index-ordered and returns in
       milliseconds per page, so the whole catalogue is cheaper to read than a
       filtered slice of it. 33k rows, filtered in JS below. */
    `&order=id.asc&limit=${PAGE}`;
  if (cursor) url += `&id=gt.${cursor}`;
  const page = await getPage(url);
  if (!page.length) break;
  cursor = page[page.length - 1].id;
  rows.push(...page);
  process.stderr.write(`\r  fetched ${rows.length}`);
  if (page.length < PAGE) break;
}
process.stderr.write('\n');

/* Both answers live in scripts/lib/commanders.mjs now, because this script had
   its own copy and it was wrong twice: it accepted non-legendary cards (132 of
   the 207 reported "vanilla commanders" cannot lead any deck) and it read
   `oracle_text` straight, which is NULL on every multi-face layout. */
const legal = rows.filter(isCommander);

const silent = [];
const spoke = [];
const census = { compiler: 0, xmage: 0, none: 0 };

/** The first clause of each ability, which is what a rule would key on. */
const clausesOf = (text) =>
  String(text ?? '')
    .split('\n')
    .map(l => l.replace(/\([^)]*\)/g, ' ').trim())
    .filter(Boolean);

for (const row of legal) {
  const compiled = facetsForCard(row);
  census[compiled.source] = (census[compiled.source] ?? 0) + 1;
  const plan = planForCommander({
    name: row.name,
    typeLine: row.type_line,
    facets: compiled.facets,
    tags: row.tags,
    oracleText: rulesTextOf(row),
  });
  const entry = {
    id: row.id,
    name: row.name,
    rank: row.edhrec_rank ?? null,
    source: compiled.source,
    facets: compiled.facets,
    wants: plan.wants.map(w => w.facet),
    text: rulesTextOf(row),
    typeLine: row.type_line,
    identity: row.color_identity ?? [],
  };
  if (plan.wants.length) spoke.push(entry);
  else silent.push(entry);
}

const n = legal.length;
const pct = (x) => `${((x / n) * 100).toFixed(1)}%`;

console.log(`commander-legal legends: ${n} (of ${rows.length} matched rows)`);
console.log(`  a plan with wants   ${spoke.length} (${pct(spoke.length)})`);
console.log(`  SILENT              ${silent.length} (${pct(silent.length)})`);
console.log(`  compiler read text  ${census.compiler ?? 0}, xmage ${census.xmage ?? 0}, neither ${census.none ?? 0}`);
console.log('');

/* Why each silent one is silent, which decides what kind of fix it needs. */
const noText = silent.filter(s => !s.text.trim());
const withText = silent.filter(s => s.text.trim());
console.log(`of the silent:`);
console.log(`  no rules text at all (vanilla)   ${noText.length}`);
console.log(`  has text we did not read         ${withText.length}`);
console.log('');

/* Cluster by the leading words of each clause, so the work list is "these 40
   cards all say the same thing" rather than 800 unique problems. */
const bucket = new Map();
for (const s of withText) {
  for (const clause of clausesOf(s.text)) {
    const key = clause.toLowerCase().split(/[,.:]/)[0].split(/\s+/).slice(0, 5).join(' ');
    if (!key) continue;
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push(s.name);
  }
}
const clusters = [...bucket.entries()]
  .map(([k, v]) => ({ opening: k, cards: [...new Set(v)] }))
  .filter(c => c.cards.length >= 3)
  .sort((a, b) => b.cards.length - a.cards.length);

console.log(`the 40 largest shapes among the silent (>=3 cards each):`);
for (const c of clusters.slice(0, 40)) {
  console.log(`  ${String(c.cards.length).padStart(4)}  "${c.opening}"`);
}

fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
fs.writeFileSync(
  path.resolve(OUT),
  JSON.stringify({ total: n, spoke: spoke.length, silent: silent.length, census, clusters, silentCards: silent }, null, 2)
);
/* The commanders that already read fine, written separately so a proposed rule
   can be checked for OVERREACH: a pattern that also matches these is loose, and
   although intent rules only fire on silence today, a loose pattern is a trap
   set for whoever relaxes that guard. */
fs.writeFileSync(
  path.resolve('.shots/commander-coverage-spoke.json'),
  JSON.stringify(spoke.map(s => ({ name: s.name, text: s.text })), null, 2)
);

console.log('');
console.log(`work list: ${OUT}  (${silent.length} silent commanders with their text)`);
console.log(`already covered: .shots/commander-coverage-spoke.json (${spoke.length})`);
