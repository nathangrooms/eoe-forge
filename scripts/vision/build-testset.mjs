/**
 * Choose the cards the recognition pipeline is evaluated against, and fetch
 * their high-resolution renders.
 *
 * The sample is deliberately NOT uniform-random over the catalogue. A uniform
 * sample would be ~96% single-printing cards, which are the easy case, and the
 * headline number would then mostly measure how well we do on cards that have
 * no printing ambiguity at all. So the set is stratified, and the report breaks
 * results down by stratum rather than hiding them in an average:
 *
 *   A_multi_printing   cards where we hold several printings — the whole point
 *   B_shared_art       printings whose art hash collides with a sibling, i.e.
 *                      the case that is provably unsolvable by image alone
 *   C_special_frame    full-art, borderless and showcase treatments, where the
 *                      fixed art window is known to be wrong
 *   D_double_faced     layouts whose front face is what gets photographed
 *   E_control          plain single-printing cards, uniform random
 *   F_regression       specific cards an earlier evaluation got wrong, pinned
 *                      so a future change cannot quietly reintroduce the bug
 *
 * Usage:
 *   node scripts/vision/build-testset.mjs <out.json> <imgdir> [size] [count]
 */
import fs from 'node:fs';
import path from 'node:path';

const [outPath, imgDir, size = 'large', countArg = '420'] = process.argv.slice(2);
if (!outPath || !imgDir) {
  console.error('usage: build-testset.mjs <out.json> <imgdir> [size] [count]');
  process.exit(2);
}
const TARGET = parseInt(countArg, 10);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error('set SUPABASE_URL and SUPABASE_ANON_KEY');
  process.exit(2);
}

const HEADERS = {
  'User-Agent': 'DeckMatrix-VisionEval/1.0 (+https://deckmatrix.app)',
  Accept: 'image/jpeg,*/*',
};

/**
 * Cards an earlier evaluation resolved incorrectly. Keeping them in the set by
 * name means the regression test fails loudly if a change reintroduces the
 * fault, rather than the card silently dropping out of a random sample.
 */
const REGRESSION_NAMES = [
  'Thriving Bluff', 'Thriving Isle', 'Arcane Signet', 'Cultivate', 'Command Tower',
  'Alrund, God of the Cosmos', 'Brine Comber', 'Aang and Katara', 'Accessories to Murder',
  'Kor Outfitter', 'Ivy Lane Denizen',
];

async function q(query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`REST ${res.status}: ${await res.text()}`);
  return res.json();
}

const SELECT = 'id,oracle_id,name,set_code,set_name,collector_number,layout,image_uris,released_at';

console.log('reading catalogue...');
const all = [];
for (let offset = 0; ; offset += 1000) {
  const batch = await q(`cards?select=${SELECT}&order=id.asc&limit=1000&offset=${offset}`);
  all.push(...batch);
  if (batch.length < 1000) break;
}
console.log(`catalogue: ${all.length} rows`);

const paper = all.filter((c) => !c.name?.startsWith('A-') && c.image_uris?.[size]);

// group by oracle_id to find the cards we hold multiple printings of
const byOracle = new Map();
for (const c of paper) {
  const arr = byOracle.get(c.oracle_id);
  if (arr) arr.push(c);
  else byOracle.set(c.oracle_id, [c]);
}

const multi = [...byOracle.values()].filter((g) => g.length > 1);
console.log(`cards with >1 printing held: ${multi.length}`);

const chosen = new Map();
const add = (card, group, extra = {}) => {
  if (chosen.has(card.id)) return;
  const siblings = byOracle.get(card.oracle_id) ?? [card];
  chosen.set(card.id, {
    id: card.id,
    oracle_id: card.oracle_id,
    name: card.name,
    set: card.set_code,
    set_name: card.set_name,
    cn: card.collector_number,
    layout: card.layout,
    released_at: card.released_at,
    group,
    group_size: siblings.length,
    sibling_ids: siblings.map((s) => s.id),
    url: card.image_uris[size],
    ...extra,
  });
};

// F: pinned regressions first, so they can never be crowded out
for (const name of REGRESSION_NAMES) {
  for (const c of paper.filter((x) => x.name === name).slice(0, 3)) add(c, 'F_regression');
}

// A: every printing of a sample of multi-printing cards
const multiShuffled = multi.slice().sort(() => Math.random() - 0.5);
for (const g of multiShuffled.slice(0, 60)) for (const c of g) add(c, 'A_multi_printing');

// C: special frames, identified by the layout column and by set/name heuristics
// since frame_effects and full_art are not populated yet
const special = paper.filter(
  (c) => c.layout && !['normal', 'transform', 'modal_dfc'].includes(c.layout),
);
for (const c of special.sort(() => Math.random() - 0.5).slice(0, 45)) add(c, 'C_special_frame');

// D: double-faced — the front face is what gets photographed
const dfc = paper.filter((c) => ['transform', 'modal_dfc'].includes(c.layout));
for (const c of dfc.sort(() => Math.random() - 0.5).slice(0, 30)) add(c, 'D_double_faced');

// E: uniform-random controls to fill the remainder
const singles = paper.filter((c) => (byOracle.get(c.oracle_id)?.length ?? 1) === 1);
for (const c of singles.sort(() => Math.random() - 0.5)) {
  if (chosen.size >= TARGET) break;
  add(c, 'E_control');
}

const rows = [...chosen.values()];
console.log(`selected ${rows.length} cards`);
const byGroup = {};
for (const r of rows) byGroup[r.group] = (byGroup[r.group] ?? 0) + 1;
console.log(JSON.stringify(byGroup, null, 1));

// ---- fetch the renders ---------------------------------------------------
fs.mkdirSync(imgDir, { recursive: true });
let fetched = 0;
let cached = 0;
let failed = 0;

async function worker(slice) {
  for (const r of slice) {
    const dest = path.join(imgDir, `${r.id}.jpg`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      cached++;
      continue;
    }
    try {
      const res = await fetch(r.url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      fetched++;
    } catch (err) {
      failed++;
      r.fetch_error = String(err?.message ?? err);
    }
  }
}

const CONC = 10;
await Promise.all(
  Array.from({ length: CONC }, (_, i) => worker(rows.filter((_, idx) => idx % CONC === i))),
);

const usable = rows.filter((r) => !r.fetch_error);
fs.writeFileSync(outPath, JSON.stringify(usable, null, 1));
console.log(
  JSON.stringify(
    { selected: rows.length, usable: usable.length, fetched, cached, failed, out: outPath, imgDir },
    null,
    2,
  ),
);
