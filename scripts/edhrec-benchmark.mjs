// Pulls EDHREC's own per-commander page data so the generated decks can be
// compared with what people actually play, rather than with a guess.
// Source URL for each commander is printed with its numbers so every figure
// quoted can be traced back.
import fs from 'node:fs';

const COMMANDERS = [
  ['adeline', 'adeline-resplendent-cathar'],
  ['nivmizzet', 'niv-mizzet-parun'],
  ['meren', 'meren-of-clan-nel-toth'],
  ['windgrace', 'lord-windgrace'],
  ['uril', 'uril-the-miststalker'],
  ['gaaiv', 'grand-arbiter-augustin-iv'],
  ['teysa', 'teysa-karlov'],
  ['ghalta', 'ghalta-primal-hunger'],
  ['edgar', 'edgar-markov'],
  ['kozilek', 'kozilek-the-great-distortion'],
  ['yuriko', 'yuriko-the-tigers-shadow'],
];

const out = {};
for (const [key, slug] of COMMANDERS) {
  const url = `https://json.edhrec.com/pages/commanders/${slug}.json`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 DeckMatrix-benchmark' } });
  if (!res.ok) { out[key] = { url, error: res.status }; console.error(key, res.status); continue; }
  const j = await res.json();
  const shape = {
    creature: j.creature, instant: j.instant, sorcery: j.sorcery, artifact: j.artifact,
    enchantment: j.enchantment, planeswalker: j.planeswalker, battle: j.battle,
    land: j.land, basic: j.basic, nonbasic: j.nonbasic,
  };
  const lists = (j.container?.json_dict?.cardlists) || [];
  const top = [];
  for (const l of lists) {
    for (const c of (l.cardviews || [])) {
      top.push({ name: c.name, list: l.header, inclusion: c.inclusion, potential: c.potential_decks, synergy: c.synergy });
    }
  }
  top.sort((a, b) => (b.inclusion || 0) - (a.inclusion || 0));
  out[key] = { url, slug, shape, numDecks: j.container?.json_dict?.card?.num_decks ?? j.num_decks ?? null, top: top.slice(0, 40) };
  console.error(`${key}: ${top.length} cards listed`);
  await new Promise((r) => setTimeout(r, 400));
}
fs.writeFileSync('C:/Users/natha/Desktop/Software/Deckmatrix/.shots/gen-ten/edhrec-benchmark.json', JSON.stringify(out, null, 2));
for (const [k, v] of Object.entries(out)) {
  if (v.error) { console.log(k, 'ERROR', v.error, v.url); continue; }
  console.log(`\n### ${k} ${v.url}`);
  console.log('  shape:', JSON.stringify(v.shape));
  console.log('  top20:', v.top.slice(0, 20).map((c) => `${c.name}${c.inclusion ? ` ${Math.round((c.inclusion / (c.potential || 1)) * 100)}%` : ''}`).join(', '));
}
