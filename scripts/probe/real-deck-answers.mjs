/**
 * How many ways to ANSWER A PERMANENT does a real Commander deck hold, BY COLOUR?
 *
 *   node --experimental-strip-types scripts/probe/real-deck-answers.mjs
 *
 * `answerFloorFor` already carries one colour split - green decks sit at p10 5
 * and everything else at p10 8 - because green answers a creature by FIGHTING
 * it and a fight carries `eff:damage`, which the metric excludes on purpose.
 *
 * That split was derived over TWO buckets. This asks the same question of every
 * colour, because the colour pie has more than one hole in it: BLUE answers a
 * permanent by countering the spell or bouncing it, and neither `eff:counter`
 * nor a bounce is destroy / exile / neutralise / gain-control either.
 *
 * Same instrument on both sides, which is the whole point: OUR `ANSWER_FACETS`
 * over THEIR decklists, every card resolved in `cards_pool`.
 *
 * A deck is counted toward a colour when that colour is more than a QUARTER of
 * its nonland cards, the same "green-heavy" test the original split used, so a
 * five-colour deck contributes to none and a two-colour deck to both.
 */
import { readFileSync } from 'node:fs';

const ANSWER_FACETS = ['eff:destroy', 'eff:exile', 'eff:neutralise', 'eff:gain-control'];
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

const decks = await page('meta_decks?select=id&format=eq.commander');
const ids = new Set(decks.map(d => d.id));
const cards = (await page('meta_deck_cards?select=deck_id,oracle_id,quantity')).filter(c => ids.has(c.deck_id));
const wanted = [...new Set(cards.map(c => c.oracle_id))];
const byOracle = new Map();
for (let i = 0; i < wanted.length; i += 150) {
  const rows = await page(
    `cards_pool?select=oracle_id,name,type_line,color_identity,facets&oracle_id=in.(${wanted.slice(i, i + 150).join(',')})`
  );
  for (const r of rows) if (!byOracle.has(r.oracle_id)) byOracle.set(r.oracle_id, r);
}

/* One pass per deck: how many answers, and how much of each colour it plays. */
const perDeck = new Map();
let unresolved = 0;
for (const row of cards) {
  const card = byOracle.get(row.oracle_id);
  if (!card) { unresolved += 1; continue; }
  const qty = Math.max(1, Number(row.quantity) || 1);
  if (!perDeck.has(row.deck_id)) perDeck.set(row.deck_id, { answers: 0, nonland: 0, colour: {} });
  const d = perDeck.get(row.deck_id);
  if ((card.facets ?? []).some(f => ANSWER_FACETS.includes(f))) d.answers += qty;
  /* Lands are excluded from the colour share the same way the original split
     was taken: a deck's colour is what its SPELLS are, and a mana base is
     coloured by definition. Answers themselves are counted including lands,
     because a land that answers a permanent still answers one. */
  if (!/\bLand\b/.test(card.type_line ?? '')) {
    d.nonland += qty;
    for (const c of card.color_identity ?? []) d.colour[c] = (d.colour[c] ?? 0) + qty;
  }
}

const band = list => {
  const s = [...list].sort((a, b) => a - b);
  const at = q => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { n: s.length, p10: at(0.1), p50: at(0.5), p90: at(0.9) };
};

console.log(`${perDeck.size} real Commander decks, ${unresolved} card rows unresolved\n`);
console.log('colour        decks   p10   p50   p90   (a deck counts when the colour is >25% of its spells)');
for (const c of ['W', 'U', 'B', 'R', 'G']) {
  const inColour = [...perDeck.values()].filter(d => d.nonland > 0 && (d.colour[c] ?? 0) / d.nonland > 0.25);
  if (inColour.length < 3) { console.log(`${c.padEnd(14)}${String(inColour.length).padStart(5)}   too few to band`); continue; }
  const b = band(inColour.map(d => d.answers));
  console.log(`${c.padEnd(14)}${String(b.n).padStart(5)}${String(b.p10).padStart(6)}${String(b.p50).padStart(6)}${String(b.p90).padStart(6)}`);
}
const all = band([...perDeck.values()].map(d => d.answers));
console.log(`${'every deck'.padEnd(14)}${String(all.n).padStart(5)}${String(all.p10).padStart(6)}${String(all.p50).padStart(6)}${String(all.p90).padStart(6)}`);

/* The split the generator actually uses, so the run says whether it still holds. */
const green = [...perDeck.values()].filter(d => d.nonland > 0 && (d.colour.G ?? 0) / d.nonland > 0.25);
const other = [...perDeck.values()].filter(d => !(d.nonland > 0 && (d.colour.G ?? 0) / d.nonland > 0.25));
console.log('\nthe split answerFloorFor uses today:');
console.log('  green-heavy   ', JSON.stringify(band(green.map(d => d.answers))));
console.log('  everything else', JSON.stringify(band(other.map(d => d.answers))));
