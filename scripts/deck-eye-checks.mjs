// The checks a player makes by eye: how much mana each deck's rocks actually
// make, what every Uril Aura can legally be attached to, how much removal and
// how many board wipes each deck holds, and whether Sol Ring is in it.
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'C:/Users/natha/Desktop/Software/Deckmatrix/.shots/gen-ten';
const DECKS = {
  adeline: 'adeline.deck.json', nivmizzet: 'nivmizzet.deck.json', meren: 'meren.deck.json',
  windgrace: 'windgrace.local.json', uril: 'uril.local.json', gaaiv: 'gaaiv.deck.json',
  teysa: 'teysa.deck.json', ghalta: 'ghalta.deck.json', edgar: 'edgar.local.json',
  kozilek: 'kozilek.deck.json', yuriko: 'yuriko-curly.deck.json',
};
const decks = {};
for (const [k, f] of Object.entries(DECKS)) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  decks[k] = { commander: j.result.commander, deck: j.result.deck };
}
const ids = new Set();
for (const d of Object.values(decks)) for (const c of d.deck) ids.add(c.id);
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

console.log('== nonland mana sources, by deck ==');
for (const [k, d] of Object.entries(decks)) {
  const rocks = d.deck.map((c) => byId.get(c.id))
    .filter((s) => !/Land/.test(s.type_line) && /\badd\b/i.test(text(s)))
    .map((s) => `${s.name} ${s.mana_cost} [${(text(s).match(/Add [^.\n]*/i) || [''])[0].trim()}]`);
  console.log(`${k} (${rocks.length}): ${rocks.join(' | ') || 'none'}`);
}

console.log('\n== Uril: what each Aura can be attached to ==');
for (const c of decks.uril.deck) {
  const s = byId.get(c.id);
  if (!/Aura/.test(s.type_line)) continue;
  const m = /Enchant ([^\n]+)/i.exec(text(s));
  console.log(`  ${s.name} — Enchant ${m ? m[1] : '?'}`);
}

console.log('\n== removal, sweepers, Sol Ring ==');
const REMOVAL = /(destroy target|exile target (creature|permanent|artifact|enchantment|nonland)|target creature.{0,40}(gets -|-\d\/-\d)|counter target)/i;
const SWEEP = /(destroy all|exile all|each creature|all creatures|each player sacrifices)/i;
for (const [k, d] of Object.entries(decks)) {
  const cards = d.deck.map((c) => byId.get(c.id)).filter((s) => !/Land/.test(s.type_line));
  const removal = cards.filter((s) => REMOVAL.test(text(s))).map((s) => s.name);
  const sweeps = cards.filter((s) => SWEEP.test(text(s))).map((s) => s.name);
  const solRing = d.deck.some((c) => c.name === 'Sol Ring');
  const signet = d.deck.some((c) => /Arcane Signet|Talisman|Signet|Mind Stone|Fellwar Stone/.test(c.name));
  console.log(`${k}: removal-ish ${removal.length} [${removal.slice(0, 14).join(', ')}] | mass effects ${sweeps.length} [${sweeps.join(', ')}] | Sol Ring ${solRing} | a two-mana rock ${signet}`);
}
