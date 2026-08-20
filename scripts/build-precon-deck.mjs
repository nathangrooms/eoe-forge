/**
 * Freeze one REAL published Commander precon into a `PlayDeck` fixture.
 *
 *   node scripts/build-precon-deck.mjs "Draconic Rage"
 *
 * ## Why this exists
 *
 * `commander.test.ts` had to be run against a real commander deck rather than
 * three cards named in a test file. A hand-written fixture proves the engine
 * agrees with the test author; a published precon proves it agrees with a deck
 * somebody owns, with its real mana base, its real curve and a commander whose
 * cost was set by Wizards rather than by whoever was writing the assertion.
 *
 * Nothing here runs at test time. The output is committed, so `npm test` still
 * needs no network and no database, which is the rule this project keeps after
 * two self-inflicted outages.
 *
 * ## Two real sources, joined
 *
 *   THE DECKLIST comes from the same GitHub repository `precon-api.ts` and
 *   `generate-precon-index.mjs` already treat as canonical for precons. It
 *   carries full card data including oracle text.
 *
 *   THE KEYWORDS AND THE ORACLE TEXT come from the local Scryfall bulk oracle
 *   export, joined by name. The precon JSON has no `keywords` array at all and
 *   `keywords.ts` reads exactly that field, so a deck built without the join is
 *   a deck where nothing flies.
 *
 * Where the two disagree about oracle text, Scryfall wins and the run says how
 * many times. Measured on Draconic Rage: 39 of 75 names differ, and every one
 * is Wizards' 2024 self-reference templating — the precon text says "Whenever
 * Vrondiss, Rage of Ancients is dealt damage" and current oracle says "Whenever
 * Vrondiss is dealt damage"; "Path of Ancestry enters tapped" against "This
 * land enters tapped". The compiler and `intrinsic.ts` were written against
 * current oracle text, which is also what this project's own `cards` table
 * holds, so taking the precon's older wording would test the engine against
 * text it will never see.
 *
 * ## The one rewrite, and it is not invented here
 *
 * A land's `colorIdentity` is what the engine reads as the mana it taps for
 * (`mana.ts`), while Scryfall's colour identity is a deck-legality concept —
 * Command Tower and half a real mana base carry an empty one. `deckSource.ts`
 * rewrites it for the app and `scripts/playtest/pool.ts` restates the same rule
 * for the harness. This imports the harness's version rather than writing a
 * third copy.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRYFALL = path.join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT_DIR = path.join(ROOT, 'scripts', 'data');
const LIST_URL = 'https://api.github.com/repos/Westly/CommanderPrecons/contents/precon_json';
const HEADERS = { 'User-Agent': 'DeckMatrix-App' };

const wanted = process.argv[2] ?? 'Draconic Rage';

const get = url =>
  new Promise((resolve, reject) => {
    https
      .get(url, { headers: HEADERS }, res => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`${res.statusCode} for ${url}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => (body += chunk));
        res.on('end', () => resolve(body));
      })
      .on('error', reject);
  });

/* --------------------------------------------------------------- decklist */

const index = JSON.parse(await get(LIST_URL));
const entry = index.find(item => item.name.toLowerCase().startsWith(`${wanted.toLowerCase()} (`));
if (!entry) throw new Error(`No precon starting "${wanted}". 184 are published.`);

const precon = JSON.parse(await get(entry.download_url));
console.log(`Precon: ${precon.name}`);
console.log(`  mainboard ${precon.mainboardCount}, commanders ${precon.commandersCount}`);

const entries = [];
for (const slot of Object.values(precon.commanders)) {
  entries.push({ card: slot.card, quantity: slot.quantity, isCommander: true });
}
for (const slot of Object.values(precon.mainboard)) {
  entries.push({ card: slot.card, quantity: slot.quantity, isCommander: false });
}

/* --------------------------------------------------------------- keywords */

const names = new Set(entries.map(e => e.card.name));
const scryfall = new Map();

if (!fs.existsSync(SCRYFALL)) {
  throw new Error(
    `Missing ${SCRYFALL}. This generator joins the precon against the Scryfall bulk ` +
      `oracle export for keywords; without it every creature would lose its evasion.`
  );
}

const stream = readline.createInterface({
  input: fs.createReadStream(SCRYFALL, { encoding: 'utf8' }),
  crlfDelay: Infinity,
});
for await (const line of stream) {
  if (!line) continue;
  // Cheap pre-filter: 30,000 JSON.parse calls are fine, 200 MB of them are not.
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    continue;
  }
  if (!names.has(row.name)) continue;
  if (row.lang && row.lang !== 'en') continue;
  if (!scryfall.has(row.name)) scryfall.set(row.name, row);
}
console.log(`  matched ${scryfall.size} of ${names.size} names in the Scryfall export`);

/* ------------------------------------------------------------ conversion */

const oracleOf = card => {
  if (Array.isArray(card.card_faces) && card.card_faces.length > 0) {
    const faces = card.card_faces.map(f => f.oracle_text ?? '').filter(Boolean);
    if (faces.length > 0) return faces.join('\n');
  }
  return card.oracle_text ?? '';
};

/* The land rewrite, imported rather than restated. See the header. */
const { playIdentityOf } = await import('./playtest/pool.ts');

const disagreements = [];

function toPlayCard(card) {
  const row = scryfall.get(card.name);
  const preconOracle = oracleOf(card);
  const scryOracle = row ? oracleOf(row) : '';
  if (row && scryOracle && scryOracle.replace(/\s+/g, ' ') !== preconOracle.replace(/\s+/g, ' ')) {
    disagreements.push(card.name);
  }
  // Current oracle text wins. See the header for what the differences are.
  const oracleText = scryOracle || preconOracle;

  const typeLine = card.type_line ?? row?.type_line ?? '';
  const keywords = Array.isArray(row?.keywords) ? row.keywords.map(k => k.toLowerCase()) : [];
  const colorIdentity = (card.color_identity ?? row?.color_identity ?? []).slice();

  const play = {
    cardId: card.scryfall_id ?? row?.id ?? card.name,
    name: card.name,
    manaCost: card.mana_cost ?? row?.mana_cost ?? '',
    cmc: typeof card.cmc === 'number' ? card.cmc : (row?.cmc ?? 0),
    typeLine,
    oracleText,
    colorIdentity,
    keywords,
  };
  if (card.power !== undefined && card.power !== null) play.power = String(card.power);
  if (card.toughness !== undefined && card.toughness !== null) play.toughness = String(card.toughness);

  // The engine reads a land's identity as the mana it taps for.
  play.colorIdentity = playIdentityOf({
    typeLine,
    oracleText,
    colorIdentity,
  });

  return play;
}

const commanders = [];
const cards = [];
for (const item of entries) {
  const play = toPlayCard(item.card);
  if (item.isCommander) {
    commanders.push(play);
    continue;
  }
  for (let copy = 0; copy < item.quantity; copy++) cards.push({ ...play });
}

if (disagreements.length > 0) {
  console.log(
    `  ${disagreements.length} of ${names.size} names carry different oracle text in the two ` +
      `sources; current Scryfall text was used for all of them. First five: ` +
      `${disagreements.slice(0, 5).join(', ')}`
  );
}

const deck = {
  id: `precon:${entry.name.replace(/\.json$/i, '')}`,
  name: precon.name.replace(/\s*\(.*$/, '').trim(),
  format: 'commander',
  source: 'user-deck',
  commanders,
  cards,
  provenance: {
    decklist: entry.download_url,
    keywords: 'Scryfall bulk oracle export, joined by card name',
    generatedBy: 'scripts/build-precon-deck.mjs',
  },
};

const slug = deck.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const out = path.join(OUT_DIR, `precon-${slug}.json`);
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(deck, null, 1)}\n`);

console.log(`  commander: ${commanders.map(c => `${c.name} ${c.manaCost}`).join(', ')}`);
console.log(`  ${cards.length} cards, ${cards.filter(c => /land/i.test(c.typeLine)).length} lands`);
console.log(`Written to ${path.relative(ROOT, out)}`);
