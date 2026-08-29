/**
 * Print one built deck the way a player reads a list: by type, with the
 * engine's own reason beside each card, so a bad pick and the sentence that
 * justified it sit on the same line.
 *
 *   node scripts/world-decklist.mjs yuriko-curly
 *   node scripts/world-decklist.mjs ghalta teysa feather yawgmoth
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('.shots/world');
const BASIC = /^(Plains|Island|Swamp|Mountain|Forest|Wastes)$/;

function bucket(t) {
  const head = (t ?? '').split('//')[0];
  if (/Land/.test(head)) return 'Land';
  if (/Creature/.test(head)) return 'Creature';
  if (/Planeswalker/.test(head)) return 'Planeswalker';
  if (/Instant/.test(head)) return 'Instant';
  if (/Sorcery/.test(head)) return 'Sorcery';
  if (/Enchantment/.test(head)) return 'Enchantment';
  if (/Artifact/.test(head)) return 'Artifact';
  return 'Other';
}
const ORDER = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Other', 'Land'];

for (const key of process.argv.slice(2)) {
  const body = JSON.parse(fs.readFileSync(path.join(DIR, `${key}.deck.json`), 'utf8'));
  const r = body.result;
  const a = r.analysis ?? {};
  console.log('='.repeat(100));
  console.log(`${r.commander.name}  [${(r.commander.color_identity ?? []).join('') || 'C'}]   ${key}`);
  console.log(
    `power ${a.power ?? '?'} ${a.band ?? ''} ${a.bracket ?? ''} | avgCmc ${a.avgCmc ?? '?'} | value $${a.totalValue ?? '?'} | ${body.engineVersion}`
  );
  if (a.strategy) console.log(`strategy: ${JSON.stringify(a.strategy).slice(0, 400)}`);
  if (a.roleFill) console.log(`roleFill: ${JSON.stringify(a.roleFill)}`);
  console.log('-'.repeat(100));

  const rows = [];
  for (const c of r.deck) rows.push(c);
  const groups = new Map();
  for (const c of rows) {
    const b = bucket(c.type_line);
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b).push(c);
  }
  for (const g of ORDER) {
    const list = groups.get(g);
    if (!list) continue;
    const n = list.reduce((s, c) => s + (c.quantity ?? 1), 0);
    console.log(`\n### ${g} (${n})`);
    list.sort((x, y) => (x.cmc ?? 0) - (y.cmc ?? 0) || x.name.localeCompare(y.name));
    for (const c of list) {
      const q = (c.quantity ?? 1) > 1 ? `${c.quantity}x ` : '';
      const usd = c.prices?.usd ?? null;
      const price = usd == null ? '     -' : ('$' + Number(usd).toFixed(2)).padStart(9);
      const rank = c.edhrec_rank == null ? '     -' : String(c.edhrec_rank).padStart(6);
      console.log(
        `${(q + c.name).padEnd(34)} ${String(c.mana_cost ?? '').padEnd(12)} ${price} r${rank}  [${c.role ?? '-'}]`
      );
      if (c.reason && !BASIC.test(c.name)) console.log(`      ${c.reason}`);
    }
  }
  console.log();
}
