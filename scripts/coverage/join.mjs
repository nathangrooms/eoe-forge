/**
 * scripts/coverage/join.mjs — pass 2: join XMage's corpus to OUR catalogue.
 *
 *   node scripts/coverage/join.mjs
 *
 * Reads the `cards` table through the publishable key (the same anon access the
 * browser has), folds names with the two fixes the spike verified, and writes
 * `.data/join.json`: one row per distinct `oracle_id` we hold, with the XMage
 * class it resolves to (or null).
 *
 * ## Why this pass exists at all
 * The ranked build order must be weighted by CARDS OUR USERS COULD PLAY, not by
 * XMage's corpus. XMage over-weights sets we do not care about (Un-sets, digital
 * Alchemy rebalances, draft-matters Conspiracy cards) and under-weights nothing.
 * Ranking on XMage's own counts would put primitives at the top that unlock
 * cards nobody here can put in a deck.
 *
 * ## What "our catalogue" means, precisely
 * Distinct `oracle_id`, not printings — 34,088 printings collapse to ~33,000
 * distinct cards, and a primitive that unlocks a card unlocks every printing of
 * it at once. Counting printings would silently weight heavily-reprinted staples
 * higher, which sounds desirable and is not: it would rank by print run rather
 * than by playability.
 *
 * `deck_cards` is NOT used as a weight. It holds 474 rows across 8 decks and is
 * alphabetically clustered — fixture data, not play data (CLAUDE.md §"Card
 * coverage"). Weighting by it would look like play-weighting and be noise.
 */

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  loadEnv,
  foldName,
  joinKeys,
  EXCLUDED_SET_CODES,
  isAlchemyRebalance,
  pct,
  counter,
} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const DATA = join(here, '.data');
mkdirSync(DATA, { recursive: true });

const env = loadEnv(repoRoot);
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing from .env');

const idmap = JSON.parse(readFileSync(join(DATA, 'idmap.json'), 'utf8'));
const corpus = JSON.parse(readFileSync(join(DATA, 'corpus.json'), 'utf8'));
const implementedClasses = new Set(corpus.rows.map((r) => r.cls));

/* Name → class. First writer wins; XMage names are 1:1 with classes in practice. */
const byExact = new Map();
const byFolded = new Map();
for (const r of idmap.rows) {
  if (!byExact.has(r.card_name)) byExact.set(r.card_name, r.cls);
  const f = foldName(r.card_name);
  if (!byFolded.has(f)) byFolded.set(f, r.cls);
}
console.log(`XMage idmap: ${idmap.rows.length} rows, ${byExact.size} distinct names @ ${idmap.meta.commit}`);

/* ------------------------------------------------------------------ *
 * Fetch our catalogue. Keyset pagination on `id` — stable under concurrent
 * writes, unlike OFFSET, and this table is being synced nightly.
 * ------------------------------------------------------------------ */

const COLUMNS = 'id,oracle_id,name,set_code,collector_number,layout,type_line,legalities';
const PAGE = 1000;

async function fetchCatalogue() {
  const out = [];
  let after = '';
  for (;;) {
    const q =
      `${url}/rest/v1/cards?select=${COLUMNS}&order=id.asc&limit=${PAGE}` +
      (after ? `&id=gt.${after}` : '');
    const res = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`cards fetch ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    if (!batch.length) break;
    out.push(...batch);
    after = batch[batch.length - 1].id;
    process.stdout.write(`\r  fetched ${out.length} printings`);
    if (batch.length < PAGE) break;
  }
  process.stdout.write('\n');
  return out;
}

const printings = await fetchCatalogue();
console.log(`our catalogue: ${printings.length} printings`);

/* Collapse to distinct oracle_id. Keep the first printing seen for set context. */
const byOracle = new Map();
for (const p of printings) {
  if (!p.oracle_id) continue;
  const cur = byOracle.get(p.oracle_id);
  if (!cur) {
    byOracle.set(p.oracle_id, {
      oracle_id: p.oracle_id,
      name: p.name,
      layout: p.layout,
      type_line: p.type_line,
      sets: [p.set_code],
      commanderLegal: p.legalities?.commander === 'legal',
    });
  } else {
    cur.sets.push(p.set_code);
    if (p.legalities?.commander === 'legal') cur.commanderLegal = true;
  }
}
console.log(`               ${byOracle.size} distinct oracle_id`);

/* ------------------------------------------------------------------ *
 * The join, and the exclusions that must be applied BEFORE quoting a rate.
 * ------------------------------------------------------------------ */

const rows = [];
const missReasons = counter();
let exact = 0;
let folded = 0;
let frontFace = 0;

for (const c of byOracle.values()) {
  const allSetsExcluded = c.sets.every((s) => EXCLUDED_SET_CODES.has((s ?? '').toLowerCase()));
  const excluded = allSetsExcluded || isAlchemyRebalance(c.name);

  let cls = null;
  let how = null;
  if (byExact.has(c.name)) {
    cls = byExact.get(c.name);
    how = 'exact';
  } else {
    const keys = joinKeys(c.name);
    if (byFolded.has(keys[0])) {
      cls = byFolded.get(keys[0]);
      how = 'diacritic-fold';
    } else if (keys[1] && byFolded.has(keys[1])) {
      cls = byFolded.get(keys[1]);
      how = 'dfc-front-face';
    }
  }
  if (cls && !implementedClasses.has(cls)) {
    // Named in a set file but no card class on disk. Treated as a miss: there is
    // no structure to extract, so counting it as a hit would inflate the rate.
    missReasons.bump('named-but-not-implemented');
    cls = null;
    how = null;
  }

  if (how === 'exact') exact++;
  else if (how === 'diacritic-fold') folded++;
  else if (how === 'dfc-front-face') frontFace++;
  else if (!excluded) missReasons.bump(`miss:${(c.sets[0] ?? '?').toLowerCase()}`);

  rows.push({
    oracle_id: c.oracle_id,
    name: c.name,
    layout: c.layout,
    sets: c.sets,
    commanderLegal: c.commanderLegal,
    excluded,
    cls,
    how,
  });
}

const total = rows.length;
const matched = rows.filter((r) => r.cls).length;
const eligible = rows.filter((r) => !r.excluded);
const eligibleMatched = eligible.filter((r) => r.cls).length;
const cmdr = rows.filter((r) => r.commanderLegal && !r.excluded);
const cmdrMatched = cmdr.filter((r) => r.cls).length;

console.log('\n=== JOIN RATE ===');
console.log(`  all distinct oracle_id            ${matched} / ${total} = ${pct(matched, total)}%`);
console.log(`    exact name                      ${exact}`);
console.log(`    + NFD diacritic fold            ${folded}`);
console.log(`    + DFC front-face                ${frontFace}`);
console.log(`  excluding Un-sets and A- Alchemy  ${eligibleMatched} / ${eligible.length} = ${pct(eligibleMatched, eligible.length)}%`);
console.log(`  Commander-legal only              ${cmdrMatched} / ${cmdr.length} = ${pct(cmdrMatched, cmdr.length)}%`);
console.log(`  excluded up front                 ${total - eligible.length}`);

console.log('\n  top miss buckets (by first set seen):');
for (const [k, v] of missReasons.top(12)) console.log(`    ${k.padEnd(34)} ${v}`);

writeFileSync(
  join(DATA, 'join.json'),
  JSON.stringify({
    meta: {
      xmageCommit: idmap.meta.commit,
      joinedAt: new Date().toISOString(),
      printings: printings.length,
      distinctOracleIds: total,
      matched,
      matchRateAll: Number(pct(matched, total)),
      matchRateEligible: Number(pct(eligibleMatched, eligible.length)),
      matchRateCommander: Number(pct(cmdrMatched, cmdr.length)),
      breakdown: { exact, diacriticFold: folded, dfcFrontFace: frontFace },
    },
    rows,
  }),
);
console.log(`\nwrote ${join(DATA, 'join.json')}`);
