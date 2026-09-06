/**
 * Export every commander-legal card ONCE, for offline review.
 *
 *   node --experimental-strip-types scripts/probe/export-cards.mjs
 *
 * Writes `.review/cards-NNN.json` batches of 50: name, type line, mana cost,
 * rank, the facets the engine currently holds, and THE ORACLE TEXT, which is
 * what a reviewer needs and which `cards_pool` does not carry.
 *
 * ONE PASS, CACHED TO DISK, because CLAUDE.md's hardest-won rule is that
 * nothing which reads `cards_pool` may be fanned out to agents - a parallel
 * workflow doing that took production down. Reviewers read these files with
 * the Read tool and issue no queries at all.
 *
 * Names come from `cards_pool` in rank bands (thin and indexed); the text comes
 * from `cards_unique` by name in chunks, because neither view carries both.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const URL = 'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1';
const K = readFileSync('scratch/anon.txt', 'utf8').trim();
const H = { apikey: K, Authorization: `Bearer ${K}` };
const BATCH = 50;

async function get(path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${URL}/${path}`, { headers: H });
    if (res.ok) return res.json();
    if (attempt === 3) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
    await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
  }
}

/* RANK BANDS, never offset. `offset=1000` makes Postgres walk and discard a
   thousand rows and returns 57014 on this table. */
const pool = [];
let from = 0;
for (;;) {
  const rows = await get(
    `cards_pool?select=name,type_line,mana_cost,edhrec_rank,facets,tags` +
      `&commander_legal=eq.legal&edhrec_rank=gte.${from}&order=edhrec_rank.asc,name.asc&limit=600`
  );
  if (!rows.length) break;
  pool.push(...rows);
  const last = rows[rows.length - 1].edhrec_rank;
  if (rows.length < 600) break;
  if (last === from) { from += 1; continue; }
  from = last;
  if (pool.length % 3000 < 600) console.log(`  ...${pool.length} cards`);
}
const seen = new Set();
const cards = pool.filter(c => (seen.has(c.name) ? false : (seen.add(c.name), true)));
console.log(`${cards.length} distinct commander-legal cards`);

const textOf = new Map();
for (let i = 0; i < cards.length; i += 100) {
  const chunk = cards.slice(i, i + 100);
  const list = chunk.map(c => `"${c.name.replace(/"/g, '\\"')}"`).join(',');
  const rows = await get(
    `cards_unique?select=name,oracle_text,faces&name=in.(${encodeURIComponent(list)})`
  );
  for (const r of rows) {
    if (textOf.has(r.name)) continue;
    const faces = Array.isArray(r.faces)
      ? r.faces.map(f => f?.oracle_text).filter(Boolean).join('\n//\n')
      : '';
    textOf.set(r.name, r.oracle_text || faces || '');
  }
  if (i % 2000 === 0) console.log(`  text ${i}/${cards.length}`);
}

mkdirSync('.review', { recursive: true });
let n = 0;
for (let i = 0; i < cards.length; i += BATCH) {
  const batch = cards.slice(i, i + BATCH).map(c => ({
    name: c.name,
    type: c.type_line ?? '',
    cost: c.mana_cost ?? '',
    rank: c.edhrec_rank ?? null,
    text: textOf.get(c.name) ?? '',
    facets: c.facets ?? [],
  }));
  writeFileSync(`.review/cards-${String(n).padStart(4, '0')}.json`, JSON.stringify(batch, null, 1));
  n += 1;
}
console.log(`wrote ${n} batches of ${BATCH} to .review/`);
console.log(`${[...textOf.values()].filter(t => t).length} cards have rules text`);
