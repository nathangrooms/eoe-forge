/**
 * How many cards of each ROLE does a real Commander deck hold?
 *
 *   node --experimental-strip-types scripts/probe/real-deck-roles.mjs
 *
 * The tag counts in `meta_deck_shape_counts` are close to this and are not it:
 * the generator fills ROLES, decided by `cardRole` over facets, and a tag is a
 * different vocabulary that happens to share some words. Comparing our role
 * fill against their tag counts would be measuring two things and calling the
 * difference a fault.
 *
 * So this runs OUR `cardRole` over THEIR decklists. 192 real Commander decks
 * (MTGJSON, MIT, already ingested), every card resolved to its row in
 * `cards_pool` with the facets the generator itself reads, classified by the
 * function the generator itself calls. Same question, same instrument, both
 * sides.
 *
 * Prints p10/p50/p90 per role. That is the shape a real deck has, and it is
 * the only external evidence in this repo about what the floors should be.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { cardRole, ROLES } from '../../src/engine/index.ts';

const URL = 'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1';
const K = readFileSync('scratch/anon.txt', 'utf8').trim();
const H = { apikey: K, Authorization: `Bearer ${K}` };

async function page(path, from = 0, size = 1000, acc = []) {
  const res = await fetch(`${URL}/${path}&limit=${size}&offset=${from}`, { headers: H });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  acc.push(...rows);
  return rows.length < size ? acc : page(path, from + size, size, acc);
}

console.log('reading the real decks ...');
const decks = await page('meta_decks?select=id,commander_oracle_ids&format=eq.commander');
/* ONLY the Commander decks. `meta_deck_cards` holds all 873 ingested decks and
   681 of them are 60-card lists, so an unfiltered read reported a median of 3
   ramp and a tenth percentile of 18 lands - the shape of a Standard deck, used
   as the yardstick for a Commander one. */
const commanderDeckIds = new Set(decks.map(d => d.id));
const allCards = await page('meta_deck_cards?select=deck_id,oracle_id,quantity');
const cards = allCards.filter(c => commanderDeckIds.has(c.deck_id));
console.log(`${decks.length} commander decks, ${cards.length} deck-card rows (of ${allCards.length} across every format)`);

/* The facets and type line for every oracle_id the decks mention, from the
   pool the generator reads. A card the pool does not hold is counted as
   unresolved rather than as a card with no roles: a silent zero would drag
   every median down. */
const wanted = [...new Set(cards.map(c => c.oracle_id))];
console.log(`${wanted.length} distinct cards to resolve`);
const byOracle = new Map();
for (let i = 0; i < wanted.length; i += 150) {
  const chunk = wanted.slice(i, i + 150);
  const rows = await page(
    `cards_pool?select=oracle_id,name,type_line,cmc,facets,tags&oracle_id=in.(${chunk.join(',')})`
  );
  for (const r of rows) if (!byOracle.has(r.oracle_id)) byOracle.set(r.oracle_id, r);
}
console.log(`${byOracle.size} resolved in cards_pool\n`);

const perDeck = new Map();
let unresolved = 0;
for (const row of cards) {
  const card = byOracle.get(row.oracle_id);
  if (!card) { unresolved += 1; continue; }
  const qty = Math.max(1, Number(row.quantity) || 1);
  const shaped = {
    name: card.name,
    typeLine: card.type_line,
    type_line: card.type_line,
    cmc: card.cmc,
    facets: card.facets ?? [],
    tags: card.tags ?? [],
  };
  if (!perDeck.has(row.deck_id)) perDeck.set(row.deck_id, {});
  const counts = perDeck.get(row.deck_id);
  for (const role of ROLES) {
    if (cardRole(shaped, role)) counts[role] = (counts[role] ?? 0) + qty;
  }
}
console.log(`${unresolved} deck-card rows had no row in cards_pool (${((100 * unresolved) / cards.length).toFixed(1)}%)\n`);

const out = {};
console.log('role'.padEnd(14) + 'p10   p50   p90   max   (across ' + perDeck.size + ' real decks)');
for (const role of ROLES) {
  const list = [...perDeck.values()].map(c => c[role] ?? 0).sort((a, b) => a - b);
  const at = q => list[Math.min(list.length - 1, Math.floor(q * list.length))];
  out[role] = { p10: at(0.1), p50: at(0.5), p90: at(0.9), max: list[list.length - 1] };
  console.log(
    role.padEnd(14) +
      String(out[role].p10).padStart(3) +
      String(out[role].p50).padStart(6) +
      String(out[role].p90).padStart(6) +
      String(out[role].max).padStart(6)
  );
}
writeFileSync('scripts/probe/real-deck-roles.json', JSON.stringify({ decks: perDeck.size, roles: out }, null, 2));
console.log('\nwrote scripts/probe/real-deck-roles.json');
