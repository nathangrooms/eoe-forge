// Compares each generated deck with EDHREC's page for the same commander:
// deck shape, how many of the most played cards we picked, and which of our
// picks EDHREC has never seen in a deck for this commander.
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'C:/Users/natha/Desktop/Software/Deckmatrix/.shots/gen-ten';
const DECKS = [
  ['adeline', 'adeline.deck.json', 'adeline-resplendent-cathar'],
  ['nivmizzet', 'nivmizzet.deck.json', 'niv-mizzet-parun'],
  ['meren', 'meren.deck.json', 'meren-of-clan-nel-toth'],
  ['windgrace', 'windgrace.local.json', 'lord-windgrace'],
  ['uril', 'uril.local.json', 'uril-the-miststalker'],
  ['gaaiv', 'gaaiv.deck.json', 'grand-arbiter-augustin-iv'],
  ['teysa', 'teysa.deck.json', 'teysa-karlov'],
  ['ghalta', 'ghalta.deck.json', 'ghalta-primal-hunger'],
  ['edgar', 'edgar.local.json', 'edgar-markov'],
  ['kozilek', 'kozilek.deck.json', 'kozilek-the-great-distortion'],
  ['yuriko', 'yuriko-curly.deck.json', 'yuriko-the-tigers-shadow'],
];

const out = {};
for (const [key, file, slug] of DECKS) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  const deck = j.result.deck;
  const names = new Set(deck.map((c) => c.name));

  const url = `https://json.edhrec.com/pages/commanders/${slug}.json`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 DeckMatrix-benchmark' } });
  const e = await res.json();
  const lists = e.container.json_dict.cardlists;
  const seen = new Map();
  for (const l of lists) {
    for (const c of l.cardviews) {
      const pct = c.potential_decks ? c.num_decks / c.potential_decks : 0;
      const prev = seen.get(c.name);
      if (!prev || pct > prev.pct) seen.set(c.name, { pct, list: l.header, n: c.num_decks, of: c.potential_decks });
    }
  }
  // most played, excluding the New Cards list (small denominators) and basics
  const BASIC = /^(Plains|Island|Swamp|Mountain|Forest|Wastes)$/;
  const ranked = [...seen.entries()]
    .filter(([n, v]) => v.list !== 'New Cards' && !BASIC.test(n))
    .sort((a, b) => b[1].pct - a[1].pct);
  const top25 = ranked.slice(0, 25);
  const have25 = top25.filter(([n]) => names.has(n));

  // our nonbasic, nonland picks EDHREC's page never lists for this commander
  const unseen = deck.filter((c) => !/Land/.test(c.type_line) && !seen.has(c.name)).map((c) => c.name);
  const seenPicks = deck.filter((c) => seen.has(c.name)).map((c) => ({ name: c.name, pct: seen.get(c.name).pct }));

  const shapeOurs = { creature: 0, instant: 0, sorcery: 0, artifact: 0, enchantment: 0, planeswalker: 0, land: 0, basic: 0 };
  for (const c of deck) {
    const q = c.quantity || 1;
    const t = c.type_line || '';
    if (/Land/.test(t)) { shapeOurs.land += q; if (/Basic/.test(t)) shapeOurs.basic += q; continue; }
    if (/Creature/.test(t)) shapeOurs.creature += q;
    else if (/Planeswalker/.test(t)) shapeOurs.planeswalker += q;
    else if (/Instant/.test(t)) shapeOurs.instant += q;
    else if (/Sorcery/.test(t)) shapeOurs.sorcery += q;
    else if (/Enchantment/.test(t)) shapeOurs.enchantment += q;
    else if (/Artifact/.test(t)) shapeOurs.artifact += q;
  }

  out[key] = {
    url,
    edhrecShape: { creature: e.creature, instant: e.instant, sorcery: e.sorcery, artifact: e.artifact, enchantment: e.enchantment, planeswalker: e.planeswalker, land: e.land, basic: e.basic, nonbasic: e.nonbasic },
    ourShape: shapeOurs,
    top25: top25.map(([n, v]) => ({ name: n, pct: +(v.pct * 100).toFixed(0), have: names.has(n) })),
    top25Have: have25.length,
    unseenCount: unseen.length,
    unseen,
    seenPicksCount: seenPicks.length,
    seenPicks: seenPicks.sort((a, b) => b.pct - a.pct).map((s) => `${s.name} ${(s.pct * 100).toFixed(0)}%`),
  };
  console.log(`\n### ${key} ${url}`);
  console.log('  EDHREC avg shape:', JSON.stringify(out[key].edhrecShape));
  console.log('  ours            :', JSON.stringify(shapeOurs));
  console.log(`  of EDHREC's 25 most played (that page's own lists): we have ${have25.length}`);
  console.log('    have:', have25.map(([n, v]) => `${n} ${(v.pct * 100).toFixed(0)}%`).join(', ') || 'none');
  console.log('    missing:', top25.filter(([n]) => !names.has(n)).map(([n, v]) => `${n} ${(v.pct * 100).toFixed(0)}%`).join(', '));
  console.log(`  our nonland picks EDHREC's page does not list at all: ${unseen.length}`);
  await new Promise((r) => setTimeout(r, 400));
}
fs.writeFileSync(path.join(DIR, 'edhrec-compare.json'), JSON.stringify(out, null, 2));
