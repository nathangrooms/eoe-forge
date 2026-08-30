/**
 * What actually changes between us and Scryfall, column by column.
 *
 * Owner, 2026-08-30: "we only sync NEW cards daily - no need to replace and
 * rinse our database every single day - we should only be posting changes and
 * new, not writing every card."
 *
 * The change filter now skips rows that are already current, and measured on
 * one run it skipped about half the cards it scanned. Half is a real saving and
 * not the answer: the question is what the OTHER half is. If it is prices, the
 * catalogue walk and the price refresh are two different jobs on two different
 * clocks and should stop being one job. If it is oracle text, something else is
 * wrong.
 *
 * So this fetches real Scryfall pages, reads our stored rows for the same ids,
 * and reports which COLUMNS differ and how often. No writes.
 *
 *   node scripts/sync-what-changes.mjs
 *   PAGES=5 node scripts/sync-what-changes.mjs
 */
import { canonical, SYNCED_COLUMNS } from '../supabase/functions/scryfall-sync/changed.ts';

const SUPABASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const PAGES = Number(process.env.PAGES ?? 3);
const START = Number(process.env.START ?? 1);
const QUERY = '-is%3Adigital+game%3Apaper';

/* The same shape `transformCard` writes, so the comparison is the one the sync
   actually makes. Kept deliberately close to that function; if it drifts, this
   measurement stops describing the sync. */
const getImageUris = (c) =>
  c.image_uris ?? c.card_faces?.[0]?.image_uris ?? {};
const transformFaces = (c) =>
  Array.isArray(c.card_faces) && c.card_faces.length
    ? c.card_faces.map(f => ({
        name: f.name ?? null, mana_cost: f.mana_cost ?? null,
        type_line: f.type_line ?? null, oracle_text: f.oracle_text ?? null,
        colors: f.colors ?? null, color_indicator: f.color_indicator ?? null,
        power: f.power ?? null, toughness: f.toughness ?? null,
        loyalty: f.loyalty ?? null, defense: f.defense ?? null,
        flavor_text: f.flavor_text ?? null, artist: f.artist ?? null,
        image_uris: f.image_uris ?? null,
      }))
    : null;

const transform = (c) => ({
  id: c.id,
  oracle_id: c.oracle_id || c.id,
  name: c.name,
  set_code: c.set,
  collector_number: c.collector_number,
  layout: c.layout || 'normal',
  type_line: c.type_line || 'Unknown',
  cmc: c.cmc || 0,
  colors: c.colors || [],
  color_identity: c.color_identity || [],
  oracle_text: c.oracle_text,
  mana_cost: c.mana_cost,
  power: c.power,
  toughness: c.toughness,
  loyalty: c.loyalty,
  keywords: c.keywords || [],
  legalities: c.legalities || {},
  image_uris: getImageUris(c),
  faces: transformFaces(c),
  prices: c.prices || {},
  is_legendary: (c.type_line || '').toLowerCase().includes('legendary'),
  is_reserved: c.reserved || false,
  rarity: c.rarity || 'common',
  artist: c.artist ?? null,
  illustration_id: c.illustration_id ?? null,
  released_at: c.released_at ?? null,
  set_name: c.set_name ?? null,
  finishes: c.finishes ?? null,
  border_color: c.border_color ?? null,
  frame_effects: c.frame_effects ?? null,
  full_art: c.full_art ?? null,
  variation: c.variation ?? null,
  promo: c.promo ?? null,
  edhrec_rank: c.edhrec_rank ?? null,
  game_changer: c.game_changer ?? null,
});

const differing = new Map();
let compared = 0;
let identical = 0;
let missing = 0;

for (let page = START; page < START + PAGES; page++) {
  const url =
    `https://api.scryfall.com/cards/search?q=${QUERY}&unique=prints&page=${page}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'DeckMatrix/1.0' } });
  const body = await res.json();
  if (!body.data) { console.log(`page ${page}: ${JSON.stringify(body).slice(0, 140)}`); break; }

  const cards = body.data
    .filter(c => c.type_line && !c.type_line.includes('Token'))
    .map(transform);
  const ids = cards.map(c => c.id);

  const stored = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const slice = ids.slice(i, i + 100);
    const q =
      `${SUPABASE}/rest/v1/cards?select=${['id', ...SYNCED_COLUMNS].join(',')}` +
      `&id=in.(${slice.join(',')})`;
    const r = await fetch(q, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    const rows = await r.json();
    if (Array.isArray(rows)) for (const row of rows) stored.set(row.id, row);
  }

  for (const card of cards) {
    const have = stored.get(card.id);
    if (!have) { missing += 1; continue; }
    compared += 1;
    let same = true;
    for (const col of SYNCED_COLUMNS) {
      if (canonical(card[col]) === canonical(have[col])) continue;
      same = false;
      differing.set(col, (differing.get(col) ?? 0) + 1);
    }
    if (same) identical += 1;
  }

  process.stderr.write(`\r  page ${page} of ${PAGES}, compared ${compared}   `);
  await new Promise(r => setTimeout(r, 130));
}
process.stderr.write('\n');

console.log('');
console.log(`cards compared against Scryfall : ${compared}`);
console.log(`  byte-identical, no write needed: ${identical} (${((identical / Math.max(1, compared)) * 100).toFixed(1)}%)`);
console.log(`  differ in at least one column  : ${compared - identical}`);
console.log(`  not in our catalogue at all    : ${missing}`);
console.log('');
console.log('WHICH COLUMNS DIFFER, most often first:');
const ranked = [...differing.entries()].sort((a, b) => b[1] - a[1]);
if (!ranked.length) console.log('  (none)');
for (const [col, n] of ranked) {
  console.log(`  ${String(n).padStart(5)}  ${col}  (${((n / Math.max(1, compared)) * 100).toFixed(1)}% of cards)`);
}
