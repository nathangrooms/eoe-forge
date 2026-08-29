/**
 * Five optimiser suggestions, checked against the two authorities separately.
 *
 * Scryfall says what the card DOES. EDHREC says what people PLAY with this
 * commander. They answer different questions and a suggestion has to survive
 * both: a card can be popular and wrong here, and it can be unpopular and
 * right. Where they disagree the rules text wins, because a card whose only
 * ability cannot fire is not a matter of taste.
 *
 *   node scripts/world-edhrec-check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('.shots/world');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const COMMANDERS = {
  'feather-the-redeemed': 'Feather, the Redeemed',
  'yawgmoth-thran-physician': 'Yawgmoth, Thran Physician',
  'ghalta-primal-hunger': 'Ghalta, Primal Hunger',
  'yuriko-the-tigers-shadow': "Yuriko, the Tiger's Shadow",
  'teysa-karlov': 'Teysa Karlov',
};

/** The cards under the microscope, and which commander they were offered for. */
const UNDER_TEST = {
  'feather-the-redeemed': [
    "Cathar's Shield",
    'Bone Saw',
    'Kite Shield',
    "Accorder's Shield",
    'Spidersilk Net',
    'Purphoros, God of the Forge',
    'Sram, Senior Edificer',
    'The Aetherspark',
  ],
  'yawgmoth-thran-physician': [
    "Avacyn's Collar",
    'Hangarback Walker',
    'Walking Ballista',
    'The One Ring',
    'Sigil of Distinction',
    'Morbid Opportunist',
    'Solemn Simulacrum',
  ],
  'ghalta-primal-hunger': ['Bone Saw', "Accorder's Shield", 'Sigil of Distinction', 'Skyclave Pick-Axe', 'Prying Blade'],
};

async function edhrec(slug) {
  const res = await fetch(`https://json.edhrec.com/pages/commanders/${slug}.json`, {
    headers: { 'User-Agent': 'DeckMatrix-audit/1.0' },
  });
  if (!res.ok) throw new Error(`edhrec ${slug} ${res.status}`);
  return res.json();
}

/** Walk the page's card lists into one name -> inclusion map. */
function inclusion(page) {
  const out = new Map();
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.name && (node.num_decks != null || node.inclusion != null)) {
      const decks = node.num_decks ?? node.inclusion ?? null;
      const potential = node.potential_decks ?? null;
      if (!out.has(node.name)) out.set(node.name, { decks, potential, label: node.label ?? null });
    }
    for (const v of Object.values(node)) walk(v);
  };
  walk(page);
  return out;
}

const report = {};
for (const [slug, name] of Object.entries(COMMANDERS)) {
  const page = await edhrec(slug);
  await sleep(400);
  const inc = inclusion(page);
  const total = page.container?.json_dict?.card?.num_decks ?? page.num_decks ?? null;
  const ranked = [...inc.entries()]
    .filter(([, v]) => v.decks != null && v.potential != null)
    .map(([n, v]) => ({ name: n, decks: v.decks, potential: v.potential, pct: Math.round((100 * v.decks) / v.potential) }))
    .sort((a, b) => b.pct - a.pct);

  report[slug] = {
    commander: name,
    decksOnEdhrec: total,
    top25: ranked.slice(0, 25),
    underTest: (UNDER_TEST[slug] ?? []).map(cardName => {
      const hit = ranked.find(r => r.name === cardName);
      return { name: cardName, pct: hit?.pct ?? 0, decks: hit?.decks ?? 0, onPage: !!hit };
    }),
  };

  console.log(`\n=== ${name}  (${total ?? '?'} decks on EDHREC)`);
  console.log('  top 15 by inclusion:');
  for (const r of ranked.slice(0, 15)) console.log(`    ${String(r.pct).padStart(3)}%  ${r.name}`);
  if (UNDER_TEST[slug]) {
    console.log('  cards under test:');
    for (const t of report[slug].underTest) {
      console.log(`    ${t.onPage ? String(t.pct).padStart(3) + '%' : ' not on page'}  ${t.name}`);
    }
  }
}

fs.writeFileSync(path.join(OUT, 'edhrec-check.json'), JSON.stringify(report, null, 2));
