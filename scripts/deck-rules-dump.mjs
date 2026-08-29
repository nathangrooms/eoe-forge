// Prints each generated deck as a readable list plus the extra legality facts
// the rules audit did not cover: digital-only printings, funny sets, silver
// borders, and lands that cannot produce a colour the commander can spend.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('C:/Users/natha/Desktop/Software/Deckmatrix/.shots/gen-ten');
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
const idList = [...ids];
const byId = new Map();
for (let i = 0; i < idList.length; i += 75) {
  const res = await fetch('https://api.scryfall.com/cards/collection', {
    method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'DeckMatrix-rules-audit/1.0' },
    body: JSON.stringify({ identifiers: idList.slice(i, i + 75).map((id) => ({ id })) }),
  });
  const j = await res.json();
  for (const c of j.data) byId.set(c.id, c);
  await new Promise((r) => setTimeout(r, 120));
}

const lines = [];
for (const d of decks) {
  const cmd = byId.get(d.commander.id);
  const id = new Set(cmd.color_identity);
  lines.push(`\n#### ${d.key} — ${cmd.name} [${cmd.color_identity.join('') || 'C'}]`);
  const flags = [];
  const deadLands = [];
  for (const c of d.deck) {
    const sf = byId.get(c.id);
    if (sf.digital) flags.push(`${sf.name}: digital-only printing`);
    if (sf.set_type === 'funny' || sf.border_color === 'silver') flags.push(`${sf.name}: ${sf.set_type}/${sf.border_color}`);
    if (sf.oversized) flags.push(`${sf.name}: oversized`);
    if (/Land/.test(sf.type_line)) {
      const pm = sf.produced_mana || [];
      const usable = pm.filter((m) => m === 'C' || id.has(m));
      const anyColour = /any color|any type/i.test(sf.oracle_text || '');
      if (!anyColour && pm.length && usable.length === 0) deadLands.push(`${sf.name} (produces ${pm.join('')})`);
      if (anyColour && id.size === 0 && /commander's color identity/i.test(sf.oracle_text || '')) deadLands.push(`${sf.name} (any colour in an empty identity)`);
    }
  }
  lines.push(`  flags: ${flags.length ? flags.join(' | ') : 'none'}`);
  lines.push(`  lands producing nothing spendable: ${deadLands.length ? deadLands.join(' | ') : 'none'}`);
  const sorted = [...d.deck].sort((a, b) => (a.role || '').localeCompare(b.role || '') || (b.edhrec_rank || 999999) - (a.edhrec_rank || 999999));
  for (const c of sorted) {
    const sf = byId.get(c.id);
    const usd = c.prices?.usd ?? sf.prices?.usd ?? null;
    lines.push(`  ${(c.role || '-').padEnd(12)} ${String(c.edhrec_rank ?? '').padStart(6)} ${usd === null ? '     -' : ('$' + usd).padStart(8)}  ${sf.name} :: ${sf.type_line} :: ${c.reason || ''}`);
  }
}
fs.writeFileSync(path.join(DIR, 'rules-dump.txt'), lines.join('\n'));
console.log(lines.join('\n'));
