// Targeted checks behind the "five worst cards" calls: exact oracle text for
// every card named, plus a handful of per-deck counts a player would make by
// eye (creature power for Ghalta, sacrifice outlets for Teysa, Vampires and
// symmetrical sweepers for Edgar, the biggest mana rock for Kozilek).
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
for (const d of Object.values(decks)) { ids.add(d.commander.id); for (const c of d.deck) ids.add(c.id); }
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
const byName = new Map();
for (const c of byId.values()) byName.set(c.name, c);
const text = (c) => [c.oracle_text || '', ...(c.card_faces || []).map((f) => `${f.name}: ${f.oracle_text || ''}`)].join('\n');

const WANT = [
  'Uril, the Miststalker', 'Chrome Mox', 'Extraplanar Lens', 'Nykthos, Shrine to Nyx',
  'Forbidden Orchard', 'Gemstone Caverns', 'Talon Gates of Madara', 'Sarkhan, Fireblood',
  'Doctor Spectrum', 'Sandsteppe Outcast', 'Mycologist', 'Blue Elemental Blast', 'Null Elemental Blast',
  'Council of the Absolute', 'Weathered Wayfarer', 'Temple of the False God', 'Vexing Bauble',
  'Breath of Fury', 'Raze', 'Mental Note', 'Fleshmad Steed', 'Silt Crawler', 'Chimeric Idol',
  'Markov Retribution', 'Subterranean Tremors', 'Electrickery', 'Red Sun\u2019s Zenith', "Red Sun's Zenith",
  'Namazu Trader', 'Lead Pipe', 'Rank Officer', 'Vicious Hunger', 'Throwing Knife', 'Shuriken',
  'Boseiju, Who Endures', 'Demolition Field', 'Ghalta, Primal Hunger', 'Kozilek, the Great Distortion',
  'Yuriko, the Tiger\u2019s Shadow', "Yuriko, the Tiger's Shadow", 'Edgar Markov', 'Teysa Karlov',
  'Nuka-Cola Vending Machine', 'Sword of Wealth and Power', 'Okoye, Dora Milaje Leader',
  'Escape Tunnel', 'Angel of Jubilation', 'Twenty-Toed Toad', 'Abjure', 'Implode', 'Whoosh!',
  'Triskaidekaphile', 'Elfhame Sanctuary', 'Scrapwork Mutt', 'Renewal', 'Ominous Parcel',
  'Clockwork Servant', 'Well-Worn Spatula', 'Bone Saw', 'Cathar\u2019s Shield', "Cathar's Shield",
  'Kite Shield', 'Gold Pan', 'Omni-Cheese Pizza', 'Buzzard-Wasp Colony', 'Macabre Waltz',
  'Prophetic Ravings', 'Crackling Club', 'Gremlin Infestation', 'Fatal Attraction', 'Goblin Shrine',
  'Inferno Fist', 'Guttersnipe', 'Purphoros, God of the Forge', 'Firebrand Archer', 'Coruscation Mage',
  'Reckless Fireweaver', 'Agate Instigator', 'Codsworth, Handy Helper', 'Ardenn, Intrepid Archaeologist',
  'Bronzehide Lion', 'Teferi\u2019s Care', "Teferi's Care", "Arenson's Aura", 'Isolation Cell',
  'Charitable Levy', 'Hazoret\u2019s Monument', "Hazoret's Monument", 'Kefnet\u2019s Monument', "Kefnet's Monument",
  'Callous Inspector', 'Embalmed Ascendant', 'Hunted Bonebrute', 'Susurian Voidborn',
  'Redrock Sentinel', 'Slagdrill Scrapper', 'Akki Scrapchomper', 'Implode', 'Tweeze',
  'Chandra\u2019s Revolution', "Chandra's Revolution", 'Incinerating Blast', 'Seismic Spike',
  'Smashing Success', 'Fiery Encore', 'Path to the Festival', 'Tend the Sprigs', 'Exploding Borders',
  'Frenzied Tilling', 'Blood Speaker', 'Circle of the Land Druid', 'Clattering Augur',
  'Sparkhunter Masticore', 'Ichorplate Golem', 'Bumbleflower\u2019s Sharepot', "Bumbleflower's Sharepot",
  'Weather Maker', 'Jester\u2019s Scepter', "Jester's Scepter", 'Racers\u2019 Scoreboard', "Racers' Scoreboard",
  'Blazing Torch', 'Circle of Confinement', 'Feast of Blood', 'Wedding Invitation', 'Hell to Pay',
  'Falkenrath Perforator', 'Falkenrath Exterminator', 'Bear Trap', 'Heart-Piercer Bow', 'Midnight Charm',
  'Foot Chopper', 'Donatello, Turtle Techie', 'Barrels of Blasting Jelly', 'Exploding Barrel',
  'Glaring Fleshraker', 'Pawn of Ulamog', 'Spineseeker Centipede', 'Purestrain Genestealer',
  'Environmental Scientist', 'Yavimaya Granger', 'Borderland Ranger', 'Farfinder', 'Primal Druid',
  'Wild-Field Scarecrow', 'Skittering Surveyor', 'Vogar, Necropolis Tyrant',
];
const printed = new Set();
for (const n of WANT) {
  const c = byName.get(n);
  if (!c || printed.has(c.name)) continue;
  printed.add(c.name);
  console.log(`\n--- ${c.name} | ${c.type_line} | ${c.mana_cost || ''} | usd ${c.prices?.usd ?? 'none'} | edhrec ${c.edhrec_rank ?? 'none'}`);
  console.log(text(c).replace(/\n/g, ' / '));
}

console.log('\n\n===== per-deck counts =====');
// Ghalta: creature power
{
  const d = decks.ghalta;
  let n = 0, pw = 0; const big = [];
  for (const c of d.deck) {
    const sf = byId.get(c.id);
    if (!/Creature/.test(sf.type_line)) continue;
    const p = parseInt(sf.power, 10);
    if (!Number.isNaN(p)) { n += 1; pw += p; if (p >= 4) big.push(`${sf.name} ${sf.power}/${sf.toughness}`); }
  }
  console.log(`ghalta: ${n} creatures with a number for power, total power ${pw}, mean ${(pw / n).toFixed(2)}; power 4 or more: ${big.length ? big.join(', ') : 'none'}`);
}
// Teysa: free sacrifice outlets
{
  const d = decks.teysa;
  const outlets = d.deck.filter((c) => /Sacrifice (a|another|two) creature/i.test(text(byId.get(c.id)))).map((c) => c.name);
  console.log(`teysa: cards whose text sacrifices a creature: ${outlets.join(', ') || 'none'}`);
}
// Edgar: vampires and symmetrical damage
{
  const d = decks.edgar;
  const vamps = d.deck.filter((c) => /Vampire/.test(byId.get(c.id).type_line)).length;
  const sweeps = d.deck.filter((c) => /deals? X damage to each creature|damage to each creature|each creature gets -/i.test(text(byId.get(c.id)))).map((c) => c.name);
  console.log(`edgar: ${vamps} Vampires in the 99; cards that damage or shrink EVERY creature: ${sweeps.join(', ') || 'none'}`);
}
// Kozilek: biggest mana producer
{
  const d = decks.kozilek;
  const rocks = d.deck.filter((c) => { const t = text(byId.get(c.id)); return /Add \{/.test(t) && !/Land/.test(byId.get(c.id).type_line); })
    .map((c) => { const sf = byId.get(c.id); return `${sf.name} (${sf.mana_cost}) ${(/Add [^.]*/.exec(text(sf)) || [''])[0]}`; });
  console.log(`kozilek: nonland cards that add mana:\n    ${rocks.join('\n    ')}`);
}
// Adeline: how many creatures are Humans (her trigger is on attack, not on humans)
{
  const d = decks.adeline;
  const humans = d.deck.filter((c) => /Human/.test(byId.get(c.id).type_line)).length;
  const creatures = d.deck.filter((c) => /Creature/.test(byId.get(c.id).type_line)).length;
  console.log(`adeline: ${humans} of ${creatures} creatures are Humans`);
}
// Uril: how many auras say "enchant creature" vs enchant something else
{
  const d = decks.uril;
  const auras = d.deck.filter((c) => /Aura/.test(byId.get(c.id).type_line));
  const kinds = {};
  for (const c of auras) {
    const m = /Enchant ([a-z ,]+)/i.exec(text(byId.get(c.id)));
    const k = m ? m[1].trim() : 'unknown';
    kinds[k] = (kinds[k] || 0) + 1;
  }
  console.log(`uril: ${auras.length} Auras — ${JSON.stringify(kinds)}`);
}
// Yuriko: one-mana evasive creatures that enable ninjutsu
{
  const d = decks.yuriko;
  const enablers = d.deck.filter((c) => {
    const sf = byId.get(c.id);
    return /Creature/.test(sf.type_line) && (sf.cmc || 0) <= 1 &&
      /can't be blocked|Flying|Fear|Shadow|Menace|Skulk|Intimidate|Unblockable/i.test(text(sf) + (sf.keywords || []).join(' '));
  }).map((c) => c.name);
  console.log(`yuriko: one-mana evasive creatures to ninjutsu off: ${enablers.join(', ') || 'none'}`);
  const top = d.deck.map((c) => byId.get(c.id)).filter((s) => !/Land/.test(s.type_line));
  const mv = top.reduce((a, s) => a + (s.cmc || 0), 0) / top.length;
  console.log(`yuriko: mean mana value of the nonland cards Yuriko would flip: ${mv.toFixed(2)}`);
}
