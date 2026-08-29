/**
 * How often does "the commander only told us how it fights" get it wrong?
 *
 * The fallback added in 1b9204b reads a record made only of combat keywords as
 * a Voltron commander. That is a fair reading of SILENCE. It is not a fair
 * reading of a card the compiler failed to parse, and the two are
 * indistinguishable from inside: Feather, the Redeemed has flying, a rebound
 * clause the compiler cannot read, and now gets an equipment deck.
 *
 * This lists every commander the fallback fires on, most played first, so the
 * inference can be judged against the cards people actually sleeve.
 *
 *   node --experimental-strip-types scripts/voltron-fallback-audit.mjs
 */
import { facetsForCard } from '../supabase/functions/ai-deck-builder-v2/_lib/deck/recommend/behaviour.ts';
import { planForCommander } from '../supabase/functions/ai-deck-builder-v2/_engine/knowledge/behaviour.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
/* The publishable (anon) key, client-visible by design. */
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

/* Keyset, not OFFSET. Section 10d of CLAUDE.md: a deep offset over this view
 * has to sort the whole set before it yields a row, and it times out. */
const PAGE = 500;
async function page(afterId) {
  const cursor = afterId ? `&id=gt.${afterId}` : '';
  const url =
    `${SUPABASE_URL}/rest/v1/cards_unique` +
    `?select=id,oracle_id,name,type_line,oracle_text,tags,keywords,cmc,color_identity,edhrec_rank` +
    `&legalities->>commander=eq.legal&type_line=ilike.Legendary Creature*${cursor}` +
    `&order=id.asc&limit=${PAGE}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    if (res.ok) return res.json();
    const body = await res.text();
    if (!body.includes('57014')) throw new Error(`${res.status} ${body}`);
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error('kept timing out');
}

const rows = [];
let cursor = null;
for (;;) {
  const got = await page(cursor);
  rows.push(...got);
  process.stderr.write(`fetched ${rows.length}\r`);
  if (got.length < PAGE) break;
  cursor = got[got.length - 1].id;
}
process.stderr.write('\n');

/* The fallback announces itself in the reason it writes, which is the only
 * honest way to detect it from outside without re-implementing it. */
const VOLTRON = /no other ability we can read|only tells us how it fights|blocks|combat/i;

const hits = [];
let withWants = 0;
let silent = 0;
for (const r of rows) {
  const f = facetsForCard(r);
  const plan = planForCommander({
    name: r.name,
    typeLine: r.type_line ?? null,
    facets: f.facets,
    tags: r.tags ?? null,
  });
  if (plan.wants.length) withWants++;
  else silent++;
  const why = plan.wants.map(w => w.why ?? '').join(' | ');
  if (VOLTRON.test(why)) {
    hits.push({
      name: r.name,
      rank: r.edhrec_rank,
      coverage: f.coverage ?? 'unknown',
      wants: plan.wants.map(w => w.facet).join(','),
      why: plan.wants[0]?.why ?? '',
      text: (r.oracle_text ?? '').replace(/\n/g, ' / ').slice(0, 220),
    });
  }
}

console.log(`commanders: ${rows.length}`);
console.log(`with wants: ${withWants}  silent: ${silent}`);
console.log(`voltron fallback fires on: ${hits.length} (${((100 * hits.length) / rows.length).toFixed(1)}%)`);
console.log(`  of those, ranked in the top 1000 most played: ${hits.filter(h => h.rank != null && h.rank <= 1000).length}`);

const ranked = hits.filter(h => h.rank != null).sort((a, b) => a.rank - b.rank);
console.log('\nMost played commanders receiving the voltron fallback:\n');
for (const h of ranked.slice(0, 45)) {
  console.log(`#${String(h.rank).padStart(5)}  ${h.name}`);
  console.log(`         wants: ${h.wants}`);
  console.log(`         text:  ${h.text}`);
}
