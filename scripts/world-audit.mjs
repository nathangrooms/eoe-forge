/**
 * Judge every built deck the way a player at a table would have to.
 *
 * Legality is settled against Scryfall itself rather than our own `cards`
 * table, because "our catalogue agrees with our catalogue" is not a check. The
 * ban list is fetched the same day from the same place. Shape, colourless
 * count, basics and staples are read off the deck the function returned.
 *
 *   node scripts/world-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('.shots/world');
const OUT = path.join(DIR, 'audit.json');

const WUBRG = ['W', 'U', 'B', 'R', 'G'];

/** Cards a Commander player expects in almost any deck of that identity. */
const STAPLES = {
  'Sol Ring': [],
  'Arcane Signet': [],
  'Command Tower': [],
  'Swords to Plowshares': ['W'],
  'Path to Exile': ['W'],
  'Cultivate': ['G'],
  "Kodama's Reach": ['G'],
  'Lightning Greaves': [],
  'Swiftfoot Boots': [],
  'Counterspell': ['U'],
  'Rhystic Study': ['U'],
  'Cyclonic Rift': ['U'],
  'Beast Within': ['G'],
  'Chaos Warp': ['R'],
  'Anguished Unmaking': ['W', 'B'],
  'Skullclamp': [],
  'Mind Stone': [],
  'Fellwar Stone': [],
};

/* One printing is in several decks, so a disk cache keeps the run inside
 * Scryfall's rate limit and makes a re-run cost nothing. */
const CACHE = path.join(DIR, 'scryfall-cache.json');
const cache = fs.existsSync(CACHE) ? new Map(Object.entries(JSON.parse(fs.readFileSync(CACHE, 'utf8')))) : new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function scryfallCollection(ids) {
  const out = new Map();
  const need = [];
  for (const id of ids) {
    if (cache.has(id)) out.set(id, cache.get(id));
    else need.push(id);
  }
  for (let i = 0; i < need.length; i += 75) {
    const chunk = need.slice(i, i + 75);
    let j = null;
    for (let attempt = 0; attempt < 5 && !j; attempt++) {
      const res = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'DeckMatrix-audit/1.0' },
        body: JSON.stringify({ identifiers: chunk.map(id => ({ id })) }),
      });
      if (res.status === 429) {
        process.stderr.write('  rate limited, waiting 65s\n');
        await sleep(65000);
        continue;
      }
      if (!res.ok) throw new Error(`scryfall ${res.status} ${await res.text()}`);
      j = await res.json();
    }
    if (!j) throw new Error('scryfall kept refusing');
    for (const c of j.data ?? []) {
      out.set(c.id, c);
      cache.set(c.id, c);
    }
    for (const nf of j.not_found ?? []) {
      out.set(nf.id, null);
      cache.set(nf.id, null);
    }
    fs.writeFileSync(CACHE, JSON.stringify(Object.fromEntries(cache)));
    await sleep(250); // Scryfall asks for 50-100ms; a quarter second is polite
  }
  return out;
}

const BAN_CACHE = path.join(DIR, 'ban-list.json');

async function banList() {
  if (fs.existsSync(BAN_CACHE)) return new Set(JSON.parse(fs.readFileSync(BAN_CACHE, 'utf8')));
  const banned = new Set();
  let url = 'https://api.scryfall.com/cards/search?q=banned%3Acommander&unique=cards';
  while (url) {
    const res = await fetch(url, { headers: { 'User-Agent': 'DeckMatrix-audit/1.0' } });
    if (res.status === 429) {
      process.stderr.write('  ban list rate limited, waiting 65s\n');
      await sleep(65000);
      continue;
    }
    if (!res.ok) throw new Error(`ban list ${res.status}`);
    const j = await res.json();
    for (const c of j.data) banned.add(c.name);
    url = j.has_more ? j.next_page : null;
    await sleep(250);
  }
  fs.writeFileSync(BAN_CACHE, JSON.stringify([...banned], null, 2));
  return banned;
}

const BASIC = /^(Plains|Island|Swamp|Mountain|Forest|Wastes|Snow-Covered (Plains|Island|Swamp|Mountain|Forest))$/;

function typeBuckets(card) {
  const t = (card.type_line ?? '').split('//')[0];
  return {
    land: /Land/.test(t),
    creature: /Creature/.test(t),
    instant: /Instant/.test(t),
    sorcery: /Sorcery/.test(t),
    artifact: /Artifact/.test(t),
    enchantment: /Enchantment/.test(t),
    planeswalker: /Planeswalker/.test(t),
    battle: /Battle/.test(t),
  };
}

async function main() {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.deck.json'));
  const banned = await banList();
  process.stderr.write(`ban list: ${banned.size} cards\n`);

  const report = [];
  for (const f of files) {
    const key = f.replace('.deck.json', '');
    const body = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const result = body.result;
    if (!result) {
      report.push({ key, error: 'no result' });
      continue;
    }
    const cmdr = result.commander;
    const deck = result.deck ?? [];

    /* Expand quantities so a deck of 99 is 99 rows, not 96 entries. */
    const rows = [];
    for (const c of deck) for (let i = 0; i < (c.quantity ?? 1); i++) rows.push(c);

    const ids = [...new Set([cmdr.id, ...rows.map(r => r.id)])];
    const sf = await scryfallCollection(ids);

    const identity = new Set(cmdr.color_identity ?? []);
    const problems = { notFound: [], identity: [], singleton: [], banned: [], drift: [] };
    const nameCount = new Map();

    for (const r of rows) {
      const s = sf.get(r.id);
      if (!s) {
        problems.notFound.push(r.name);
        continue;
      }
      /* our row against Scryfall's, so a catalogue drift shows up */
      if (s.name !== r.name) problems.drift.push(`${r.name} -> ${s.name}`);
      const ci = s.color_identity ?? [];
      if (ci.some(c => !identity.has(c))) problems.identity.push(`${s.name} [${ci.join('')}]`);
      if (banned.has(s.name)) problems.banned.push(s.name);
      nameCount.set(s.name, (nameCount.get(s.name) ?? 0) + 1);
    }
    for (const [n, k] of nameCount) if (k > 1 && !BASIC.test(n)) problems.singleton.push(`${n} x${k}`);

    const sCmdr = sf.get(cmdr.id);
    const cmdrBanned = sCmdr ? banned.has(sCmdr.name) : null;
    const cmdrLegal = sCmdr?.legalities?.commander ?? null;

    /* shape */
    const shape = { creature: 0, instant: 0, sorcery: 0, artifact: 0, enchantment: 0, planeswalker: 0, battle: 0, land: 0 };
    let colourless = 0,
      artifactNonLand = 0,
      basics = 0,
      mvSum = 0,
      mvN = 0,
      priced = 0,
      price = 0,
      unpriced = 0;
    const pips = Object.fromEntries(WUBRG.map(c => [c, 0]));

    for (const r of rows) {
      const s = sf.get(r.id);
      if (!s) continue;
      const b = typeBuckets(s);
      for (const k of Object.keys(shape)) if (b[k]) shape[k]++;
      const cols = s.color_identity ?? [];
      if (cols.length === 0) colourless++;
      if (b.artifact && !b.land) artifactNonLand++;
      if (BASIC.test(s.name)) basics++;
      if (!b.land) {
        mvSum += s.cmc ?? 0;
        mvN++;
      }
      const cost = s.mana_cost ?? s.card_faces?.[0]?.mana_cost ?? '';
      for (const c of WUBRG) pips[c] += (cost.match(new RegExp(`\\{${c}\\}`, 'g')) ?? []).length;
      const usd = s.prices?.usd ?? s.prices?.usd_foil ?? null;
      if (usd == null) unpriced++;
      else {
        price += Number(usd);
        priced++;
      }
    }

    const names = new Set([...nameCount.keys()]);
    const stapleMiss = [];
    const stapleHit = [];
    for (const [n, need] of Object.entries(STAPLES)) {
      if (need.length && !need.every(c => identity.has(c))) continue;
      (names.has(n) ? stapleHit : stapleMiss).push(n);
    }

    report.push({
      key,
      commander: cmdr.name,
      identity: [...identity].join('') || 'C',
      colours: identity.size,
      cards: rows.length,
      withCommander: rows.length + 1,
      legal:
        problems.notFound.length === 0 &&
        problems.identity.length === 0 &&
        problems.singleton.length === 0 &&
        problems.banned.length === 0 &&
        cmdrBanned === false &&
        cmdrLegal === 'legal' &&
        rows.length === 99,
      cmdrLegal,
      cmdrBanned,
      problems,
      shape,
      colourless,
      artifactNonLand,
      basics,
      avgMV: mvN ? Number((mvSum / mvN).toFixed(2)) : null,
      pips,
      priceUSD: priced ? Number(price.toFixed(2)) : null,
      unpricedCards: unpriced,
      stapleHit,
      stapleMiss,
      edhPowerLevel: body.edhPowerLevel ?? null,
      engineVersion: body.engineVersion ?? null,
    });
    process.stderr.write(`${key.padEnd(12)} done\n`);
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

  const pad = (s, n) => String(s).padEnd(n);
  console.log(
    pad('deck', 13) + pad('id', 6) + pad('cards', 6) + pad('legal', 7) + pad('colourless', 11) + pad('artifacts', 10) + pad('basics', 7) + pad('lands', 6) + pad('avgMV', 7) + 'price'
  );
  for (const r of report.sort((a, b) => a.colours - b.colours)) {
    console.log(
      pad(r.key, 13) +
        pad(r.identity, 6) +
        pad(r.withCommander, 6) +
        pad(r.legal ? 'yes' : 'NO', 7) +
        pad(r.colourless, 11) +
        pad(r.artifactNonLand, 10) +
        pad(r.basics, 7) +
        pad(r.shape.land, 6) +
        pad(r.avgMV, 7) +
        (r.priceUSD == null ? '' : '$' + r.priceUSD.toFixed(0))
    );
  }
  console.log('\nfailures:');
  for (const r of report) {
    const p = r.problems ?? {};
    const bits = [];
    if (r.cards !== 99) bits.push(`${r.cards} cards`);
    if (p.notFound?.length) bits.push(`not found: ${p.notFound.join(', ')}`);
    if (p.identity?.length) bits.push(`identity: ${p.identity.join(', ')}`);
    if (p.singleton?.length) bits.push(`singleton: ${p.singleton.join(', ')}`);
    if (p.banned?.length) bits.push(`banned: ${p.banned.join(', ')}`);
    if (p.drift?.length) bits.push(`drift: ${p.drift.join(', ')}`);
    if (r.cmdrBanned) bits.push('COMMANDER IS BANNED');
    if (bits.length) console.log('  ' + r.key + ': ' + bits.join(' | '));
  }
}

main();
