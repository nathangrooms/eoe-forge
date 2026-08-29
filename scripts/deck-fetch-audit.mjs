// For each generated deck: how many cards can only find a BASIC land, how many
// basics are actually in the deck, and for every fetchland how many legal
// targets the 99 contains. Oracle text comes from Scryfall for the exact
// printing ids the generator chose.
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'C:/Users/natha/Desktop/Software/Deckmatrix/.shots/gen-ten';
const DECKS = [
  ['adeline', 'adeline.deck.json'], ['nivmizzet', 'nivmizzet.deck.json'], ['meren', 'meren.deck.json'],
  ['windgrace', 'windgrace.local.json'], ['uril', 'uril.local.json'], ['gaaiv', 'gaaiv.deck.json'],
  ['teysa', 'teysa.deck.json'], ['ghalta', 'ghalta.deck.json'], ['edgar', 'edgar.local.json'],
  ['kozilek', 'kozilek.deck.json'], ['yuriko', 'yuriko-curly.deck.json'],
];
const decks = DECKS.map(([key, file]) => {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  return { key, commander: j.result.commander, deck: j.result.deck };
});
const ids = new Set();
for (const d of decks) { ids.add(d.commander.id); for (const c of d.deck) ids.add(c.id); }
const byId = new Map();
const list = [...ids];
for (let i = 0; i < list.length; i += 75) {
  const res = await fetch('https://api.scryfall.com/cards/collection', {
    method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'DeckMatrix-audit/1.0' },
    body: JSON.stringify({ identifiers: list.slice(i, i + 75).map((id) => ({ id })) }),
  });
  const j = await res.json();
  for (const c of j.data) byId.set(c.id, c);
  await new Promise((r) => setTimeout(r, 120));
}
const text = (c) => [c.oracle_text || '', ...(c.card_faces || []).map((f) => f.oracle_text || '')].join('\n');
const TYPES = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];

const out = {};
for (const d of decks) {
  const cards = d.deck.map((c) => ({ q: c.quantity || 1, sf: byId.get(c.id) }));
  const basics = {};
  let basicTotal = 0;
  const typedLands = {};
  for (const t of TYPES) typedLands[t] = 0;
  for (const { q, sf } of cards) {
    if (!/Land/.test(sf.type_line)) continue;
    if (/Basic/.test(sf.type_line)) { basics[sf.name] = (basics[sf.name] || 0) + q; basicTotal += q; }
    for (const t of TYPES) if (new RegExp(`\\b${t}\\b`).test(sf.type_line)) typedLands[t] += q;
  }
  const basicOnly = [];
  const fetch = [];
  for (const { sf } of cards) {
    const tx = text(sf);
    if (/search[^.]*\bbasic land\b/i.test(tx) && !/basic land you control/i.test(tx)) basicOnly.push(sf.name);
    if (/Land/.test(sf.type_line)) {
      const named = TYPES.filter((t) => new RegExp(`search your library for an? [^.]*\\b${t}\\b[^.]*card`, 'i').test(tx));
      if (named.length) {
        const targets = named.reduce((a, t) => a + typedLands[t], 0) - (/Basic/.test(sf.type_line) ? 0 : 0);
        fetch.push({ name: sf.name, finds: named.join('/'), targetsInDeck: targets });
      }
    }
  }
  out[d.key] = { basics, basicTotal, typedLands, basicOnlyTutors: basicOnly, fetchlands: fetch };
  console.log(`\n### ${d.key} — ${d.commander.name}`);
  console.log(`  basics: ${basicTotal} ${JSON.stringify(basics)}`);
  console.log(`  lands carrying each basic type (basics included): ${JSON.stringify(typedLands)}`);
  console.log(`  cards that can ONLY find a basic land (${basicOnly.length}): ${basicOnly.join(', ') || 'none'}`);
  console.log(`  fetchlands (${fetch.length}):`);
  for (const f of fetch) console.log(`    ${f.name} finds ${f.finds}: ${f.targetsInDeck} legal targets in the 99`);
}
fs.writeFileSync(path.join(DIR, 'fetch-audit.json'), JSON.stringify(out, null, 2));
