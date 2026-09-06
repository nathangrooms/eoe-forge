/**
 * How often does a REAL Commander deck run each card we call a staple?
 *
 *   node --experimental-strip-types scripts/probe/real-deck-staples.mjs
 *
 * `deployed-deck-sweep.mjs` grades every build against a list of nine cards
 * whose comment calls them "deliberately short and uncontroversial: a Commander
 * player notices the ABSENCE of every one of these". That is an opinion, and
 * this repo's standard is that a deck is good when it measures well against
 * REAL decks and never against an opinion.
 *
 * So this asks the 192 MTGJSON Commander decks. A deck counts toward a card
 * only when its OWN COMMANDER'S colour identity allows the card, read from
 * `cards_pool` rather than guessed from basic lands - a Boros deck runs Plains
 * and cannot play Cultivate.
 *
 * Precons are a biased sample and it cuts both ways: they are budget products,
 * so an expensive card is under-represented for a reason that is not deck
 * construction. Absence at 0 of 17 is still evidence; absence at 40% is not.
 */
import { readFileSync } from 'node:fs';

const URL = 'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1';
const K = readFileSync('scratch/anon.txt', 'utf8').trim();
const H = { apikey: K, Authorization: `Bearer ${K}` };

const STAPLES = [
  ['Sol Ring', ''], ['Arcane Signet', ''], ['Command Tower', ''],
  ['Swiftfoot Boots', ''], ['Lightning Greaves', ''],
  ['Swords to Plowshares', 'W'], ['Counterspell', 'U'],
  ['Demonic Tutor', 'B'], ['Cultivate', 'G'],
];

async function page(path, from = 0, size = 1000, acc = []) {
  const res = await fetch(`${URL}/${path}&limit=${size}&offset=${from}`, { headers: H });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  acc.push(...rows);
  return rows.length < size ? acc : page(path, from + size, size, acc);
}

const decks = await page('meta_decks?select=id,commander_oracle_ids&format=eq.commander');
const oracleIds = [...new Set(decks.flatMap(d => d.commander_oracle_ids ?? []))];
const identityOf = new Map();
for (let i = 0; i < oracleIds.length; i += 100) {
  const rows = await page(
    `cards_pool?select=oracle_id,color_identity&oracle_id=in.(${oracleIds.slice(i, i + 100).join(',')})`
  );
  for (const r of rows) identityOf.set(r.oracle_id, r.color_identity ?? []);
}
/* BY DECK ID, NEVER BY OFFSET. `offset=1000` makes Postgres walk and discard a
   thousand rows, and on this table that is a 57014 before the second page. The
   deck_id filter rides the index. */
const held = new Map();
const deckIds = decks.map(d => d.id);
for (let i = 0; i < deckIds.length; i += 20) {
  const chunk = deckIds.slice(i, i + 20);
  const rows = await page(`meta_deck_cards?select=deck_id,card_name&deck_id=in.(${chunk.join(',')})`);
  for (const c of rows) {
    if (!held.has(c.deck_id)) held.set(c.deck_id, new Set());
    held.get(c.deck_id).add(c.card_name);
  }
}

console.log(`${decks.length} real Commander decks\n`);
console.log('card                      runs it   of decks that COULD   verdict');
for (const [name, cols] of STAPLES) {
  const eligible = decks.filter(d => {
    const id = new Set((d.commander_oracle_ids ?? []).flatMap(o => identityOf.get(o) ?? []));
    return [...cols].every(c => id.has(c));
  });
  const runs = eligible.filter(d => held.get(d.id)?.has(name)).length;
  const pct = eligible.length ? Math.round((100 * runs) / eligible.length) : 0;
  /* A card most decks that CAN play it do play is a staple by measurement.
     Below a third, calling its absence a fault is an opinion wearing a number. */
  const verdict = pct >= 60 ? 'MEASURED staple' : pct >= 33 ? 'common, not universal' : 'OUR OPINION';
  console.log(
    `${name.padEnd(24)} ${String(runs).padStart(4)}/${String(eligible.length).padEnd(4)} ${String(pct).padStart(6)}%   ${verdict}`
  );
}
