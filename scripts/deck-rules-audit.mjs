// Checks the ten (eleven) generated decks against the Commander rules, using
// Scryfall itself as the authority rather than our own catalogue copy.
//
// Everything it asserts comes from api.scryfall.com/cards/collection for the
// exact printing ids the generator chose: color_identity, legalities.commander,
// type_line, name. Our own rows are compared against those and any disagreement
// is reported rather than silently preferred.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('C:/Users/natha/Desktop/Software/Deckmatrix/.shots/gen-ten');
const OUT = path.resolve('C:/Users/natha/Desktop/Software/Deckmatrix/.shots/gen-ten/rules-audit.json');

const DECKS = [
  ['adeline', 'adeline.deck.json'],
  ['nivmizzet', 'nivmizzet.deck.json'],
  ['meren', 'meren.deck.json'],
  ['windgrace', 'windgrace.local.json'],
  ['uril', 'uril.local.json'],
  ['gaaiv', 'gaaiv.deck.json'],
  ['teysa', 'teysa.deck.json'],
  ['ghalta', 'ghalta.deck.json'],
  ['edgar', 'edgar.local.json'],
  ['kozilek', 'kozilek.deck.json'],
  ['yuriko', 'yuriko-curly.deck.json'],
];

const decks = DECKS.map(([key, file]) => {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  return { key, file, commander: j.result.commander, deck: j.result.deck, totals: j.result.totals, validation: j.result.validation };
});

const ids = new Set();
for (const d of decks) {
  ids.add(d.commander.id);
  for (const c of d.deck) ids.add(c.id);
}
const idList = [...ids];
console.error(`distinct printing ids: ${idList.length}`);

async function collection(batch) {
  const res = await fetch('https://api.scryfall.com/cards/collection', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'DeckMatrix-rules-audit/1.0', accept: 'application/json' },
    body: JSON.stringify({ identifiers: batch.map((id) => ({ id })) }),
  });
  if (!res.ok) throw new Error(`scryfall ${res.status} ${await res.text()}`);
  return res.json();
}

const byId = new Map();
const notFound = [];
for (let i = 0; i < idList.length; i += 75) {
  const batch = idList.slice(i, i + 75);
  const j = await collection(batch);
  for (const c of j.data) byId.set(c.id, c);
  for (const nf of j.not_found || []) notFound.push(nf.id);
  await new Promise((r) => setTimeout(r, 120));
  console.error(`fetched ${byId.size}/${idList.length}`);
}

const BASIC = /^(Plains|Island|Swamp|Mountain|Forest|Wastes|Snow-Covered (Plains|Island|Swamp|Mountain|Forest))$/;
const ANY_NUMBER = /A deck can have any number of cards named/i;

const report = [];
for (const d of decks) {
  const cmd = byId.get(d.commander.id);
  const rows = d.deck.map((c) => ({ ours: c, sf: byId.get(c.id) }));
  const qty = d.deck.reduce((a, c) => a + (c.quantity || 1), 0);

  const cmdIdentity = new Set(cmd ? cmd.color_identity : []);

  const identityBreaks = [];
  const banned = [];
  const notLegal = [];
  const dupes = new Map();
  const mismatches = [];

  for (const { ours, sf } of rows) {
    if (!sf) { mismatches.push({ name: ours.name, why: 'not found on Scryfall by id' }); continue; }
    const outside = (sf.color_identity || []).filter((c) => !cmdIdentity.has(c));
    if (outside.length) identityBreaks.push({ name: sf.name, identity: sf.color_identity, outside });
    const leg = sf.legalities?.commander;
    if (leg === 'banned') banned.push(sf.name);
    else if (leg !== 'legal') notLegal.push({ name: sf.name, legality: leg });
    const key = sf.name;
    dupes.set(key, (dupes.get(key) || 0) + (ours.quantity || 1));
    // our row vs Scryfall
    const oursCi = [...(ours.color_identity || [])].sort().join('');
    const sfCi = [...(sf.color_identity || [])].sort().join('');
    if (oursCi !== sfCi) mismatches.push({ name: sf.name, why: `color_identity ours=${oursCi || '(none)'} scryfall=${sfCi || '(none)'}` });
    if ((ours.type_line || '') !== (sf.type_line || '')) mismatches.push({ name: sf.name, why: `type_line ours="${ours.type_line}" scryfall="${sf.type_line}"` });
    if ((ours.name || '') !== sf.name) mismatches.push({ name: sf.name, why: `name ours="${ours.name}"` });
  }

  const singletonBreaks = [];
  for (const [name, n] of dupes) {
    if (n <= 1) continue;
    const sf = rows.find((r) => r.sf && r.sf.name === name).sf;
    const exempt = BASIC.test(name) || ANY_NUMBER.test(sf.oracle_text || '') ||
      (sf.card_faces || []).some((f) => ANY_NUMBER.test(f.oracle_text || ''));
    singletonBreaks.push({ name, count: n, exempt });
  }

  // commander eligibility
  const cmdType = cmd?.type_line || '';
  const canBeCommander = /Legendary/.test(cmdType) && /Creature/.test(cmdType) ||
    /can be your commander/i.test(cmd?.oracle_text || '');
  const commanderInDeck = d.deck.some((c) => c.id === d.commander.id || c.name === d.commander.name);

  report.push({
    key: d.key,
    commander: cmd?.name,
    commanderTypeLine: cmdType,
    commanderIdentity: cmd?.color_identity,
    commanderLegality: cmd?.legalities?.commander,
    canBeCommander,
    commanderAlsoInThe99: commanderInDeck,
    deckEntries: d.deck.length,
    deckQuantity: qty,
    totalWithCommander: qty + 1,
    identityBreaks,
    banned,
    notLegal,
    singletonBreaks: singletonBreaks.filter((s) => !s.exempt),
    repeatedBasics: singletonBreaks.filter((s) => s.exempt),
    ourDataMismatches: mismatches,
  });
}

fs.writeFileSync(OUT, JSON.stringify({ notFound, report }, null, 2));
for (const r of report) {
  console.log(`\n=== ${r.key} — ${r.commander} [${(r.commanderIdentity || []).join('') || 'C'}] ${r.commanderLegality}`);
  console.log(`  cards ${r.totalWithCommander} (99 wanted: ${r.deckQuantity}) | entries ${r.deckEntries} | commander eligible ${r.canBeCommander} | commander duplicated in 99 ${r.commanderAlsoInThe99}`);
  console.log(`  identity breaks: ${r.identityBreaks.length}${r.identityBreaks.length ? ' -> ' + r.identityBreaks.map((x) => `${x.name}(${x.identity.join('')})`).join(', ') : ''}`);
  console.log(`  banned: ${r.banned.length ? r.banned.join(', ') : 'none'}`);
  console.log(`  not commander-legal: ${r.notLegal.length ? r.notLegal.map((x) => `${x.name}=${x.legality}`).join(', ') : 'none'}`);
  console.log(`  singleton breaks: ${r.singletonBreaks.length ? r.singletonBreaks.map((x) => `${x.name} x${x.count}`).join(', ') : 'none'}`);
  console.log(`  repeated basics/any-number: ${r.repeatedBasics.map((x) => `${x.name} x${x.count}`).join(', ') || 'none'}`);
  console.log(`  our rows disagreeing with Scryfall: ${r.ourDataMismatches.length}${r.ourDataMismatches.length ? ' -> ' + r.ourDataMismatches.slice(0, 8).map((m) => `${m.name}: ${m.why}`).join(' | ') : ''}`);
}
console.log(`\nnot found on Scryfall: ${notFound.length ? notFound.join(', ') : 'none'}`);
