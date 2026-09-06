/**
 * Re-batch the exported cards down to ONE COMMANDER'S POOL.
 *
 *   node --experimental-strip-types scripts/probe/scope-review.mjs W,B  .review-wb
 *
 * The owner's idea, and a better one than reviewing by play rate: scope the
 * card review to a colour identity, so every correction lands somewhere a
 * specific deck can be measured. Reviewing the 6,000 most played cards spends
 * 60% of the effort on cards a white-black deck can never play - and misses the
 * junk that actually reaches it, because Field-Tested Frying Pan sits at rank
 * 6,763, just outside.
 *
 * One thin read for colour identity (the export did not carry it), then the
 * batches are rebuilt from the text and facets already on disk. No second pass
 * over the fat columns.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';

const identity = (process.argv[2] ?? 'W,B').split(',').filter(Boolean);
const out = process.argv[3] ?? '.review-wb';
const allowed = new Set(identity);

const URL = 'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1';
const K = readFileSync('scratch/anon.txt', 'utf8').trim();
const H = { apikey: K, Authorization: `Bearer ${K}` };

async function get(path) {
  for (let a = 0; a < 4; a++) {
    const res = await fetch(`${URL}/${path}`, { headers: H });
    if (res.ok) return res.json();
    if (a === 3) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
    await new Promise(r => setTimeout(r, 800 * (a + 1)));
  }
}

const ci = new Map();
let from = 0;
for (;;) {
  /* SELECT THE RANK YOU PAGE ON. The first version asked for name and
     color_identity only and then issued a SEPARATE QUERY PER PAGE to find the
     last rank - 50-odd extra round trips that never finished inside ten
     minutes. The cursor column has to be in the projection. */
  const rows = await get(
    `cards_pool?select=name,color_identity,edhrec_rank&commander_legal=eq.legal` +
      `&edhrec_rank=gte.${from}&order=edhrec_rank.asc,name.asc&limit=1000`
  );
  if (!rows.length) break;
  for (const r of rows) if (!ci.has(r.name)) ci.set(r.name, r.color_identity ?? []);
  if (rows.length < 1000) break;
  const last = rows[rows.length - 1].edhrec_rank ?? from;
  from = last <= from ? from + 1 : last;
}
console.log(`${ci.size} cards with a colour identity`);

const cards = [];
for (const f of readdirSync('.review').sort()) {
  if (!f.endsWith('.json')) continue;
  for (const c of JSON.parse(readFileSync(`.review/${f}`, 'utf8'))) {
    const id = ci.get(c.name);
    if (!id) continue;
    /* Castable by this commander: every colour it needs is one we have.
       A colourless card has an empty identity and passes. */
    if (!id.every(col => allowed.has(col))) continue;
    cards.push(c);
  }
}
cards.sort((a, b) => (a.rank ?? 9e9) - (b.rank ?? 9e9));

mkdirSync(out, { recursive: true });
let n = 0;
for (let i = 0; i < cards.length; i += 50) {
  writeFileSync(`${out}/cards-${String(n).padStart(4, '0')}.json`, JSON.stringify(cards.slice(i, i + 50), null, 1));
  n += 1;
}
console.log(`${cards.length} cards in ${identity.join('/')} identity -> ${n} batches in ${out}/`);
