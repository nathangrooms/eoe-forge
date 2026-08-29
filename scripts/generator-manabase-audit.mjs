/**
 * Does the generator build a mana base a player would keep?
 *
 * Reads the decks the deployed function returned (`.shots/gen-ten/*.deck.json`)
 * and asks four questions a Commander player asks about a land while shuffling:
 *
 *   1. How many basics are in here? A fetchland is a blank once the basics run
 *      out, and every "search for a basic" land is a blank from turn one if
 *      there are none to find.
 *   2. How many fetchlands are there per basic they can find? Four fetches over
 *      two basics is three dead cards after the first crack.
 *   3. How many lands cost life to produce mana the deck does not need? City of
 *      Brass in a mono-coloured deck is a Plains that shocks you.
 *   4. What does the mana base cost against the rest of the deck?
 *
 * Colour identity is read from the card row the response carries, so a land
 * flagged here is flagged on its own text and not on a guess about what it is.
 * Two lands looked like identity violations by eye and were NOT: Cabaretti
 * Courtyard and Riveteers Overlook are the "sacrifice to fetch a basic" cycle
 * and carry an empty colour identity, so they are legal anywhere. The eye was
 * wrong and the row was right.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('.shots/gen-ten');
const { ROSTER, YURIKO_CURLY } = await import('./generator-roster.mjs');

const q = c => Number(c.quantity) || 1;
const isLand = c => /land/i.test(c.type_line ?? '');
const usd = c => {
  const v = c.prices?.usd;
  return v == null || v === '' ? null : Number(v);
};

/** A land that pays life for mana, from its own text rather than a name list. */
const PAIN_FOR_ANY = /Pay 1 life[^.]*Add one mana of any color|deals 1 damage to you/i;
/** A fetchland: sacrifices itself to search for a land type. */
const FETCH = /Sacrifice this land: Search your library for an? .*card/i;
const SAC_FOR_BASIC = /sacrifice it\.[\s\S]*search your library for a basic/i;

const BASIC_OF = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };

const rows = [];
for (const entry of [...ROSTER, YURIKO_CURLY]) {
  const f = path.join(DIR, `${entry.key}.deck.json`);
  if (!fs.existsSync(f)) continue;
  const body = JSON.parse(fs.readFileSync(f, 'utf8'));
  const deck = body.result.deck;
  const lands = deck.filter(isLand);
  const id = entry.color_identity;
  const wantedBasics = new Set(id.map(c => BASIC_OF[c]).filter(Boolean));

  const basics = lands.filter(c => c.isBasicLand).reduce((s, c) => s + q(c), 0);
  const fetches = lands.filter(c => FETCH.test(c.oracle_text ?? ''));
  const sacBasic = lands.filter(c => SAC_FOR_BASIC.test(c.oracle_text ?? ''));
  const pain = lands.filter(c => PAIN_FOR_ANY.test(c.oracle_text ?? ''));

  /* A fetch whose only findable basics are ones this deck barely runs. */
  const fetchTargets = fetches.filter(c =>
    [...wantedBasics].some(b => (c.oracle_text ?? '').includes(b))
  );

  const sum = arr => arr.reduce((s, c) => s + (usd(c) ?? 0) * q(c), 0);
  const deckUsd = sum(deck);
  const landUsd = sum(lands);
  const mostExpensive = [...deck].sort((a, b) => (usd(b) ?? 0) - (usd(a) ?? 0))[0];

  rows.push({
    name: entry.name,
    identity: id.join('') || 'colourless',
    lands: lands.reduce((s, c) => s + q(c), 0),
    basics,
    nonbasics: lands.reduce((s, c) => s + q(c), 0) - basics,
    fetchlands: fetches.length,
    fetchesForOurBasics: fetchTargets.length,
    sacForBasic: sacBasic.length,
    painForAnyColour: pain.length,
    painNames: pain.map(c => c.name),
    deckUsd: Math.round(deckUsd),
    landUsd: Math.round(landUsd),
    landShare: deckUsd ? Math.round((100 * landUsd) / deckUsd) : null,
    priciestCard: mostExpensive ? `${mostExpensive.name} $${(usd(mostExpensive) ?? 0).toFixed(2)}` : null,
    unpricedCards: deck.filter(c => usd(c) === null).length,
  });
}

const pad = (x, n) => String(x).padEnd(n);
const rp = (x, n) => String(x).padStart(n);
console.log(
  pad('commander', 30),
  rp('id', 10),
  rp('lands', 6),
  rp('basic', 6),
  rp('fetch', 6),
  rp('pain', 5),
  rp('deck$', 7),
  rp('land$', 7),
  rp('land%', 6)
);
for (const r of rows) {
  console.log(
    pad(r.name, 30),
    rp(r.identity, 10),
    rp(r.lands, 6),
    rp(r.basics, 6),
    rp(r.fetchlands, 6),
    rp(r.painForAnyColour, 5),
    rp('$' + r.deckUsd, 7),
    rp('$' + r.landUsd, 7),
    rp(r.landShare + '%', 6)
  );
}
console.log('\nPain lands that pay life for colours these decks do not need, and the priciest card:');
for (const r of rows) {
  console.log(
    `  ${pad(r.name, 30)} ${r.identity.length <= 1 ? 'MONO/COLOURLESS ' : '                '}` +
      `${r.painNames.join(', ') || 'none'}  |  priciest: ${r.priciestCard}`
  );
}
console.log('\nFetchlands against basics they can find:');
for (const r of rows) {
  console.log(
    `  ${pad(r.name, 30)} ${r.fetchlands} fetchlands, ${r.fetchesForOurBasics} of them naming a basic ` +
      `type this deck plays, and ${r.basics} basics in the whole deck`
  );
}
fs.writeFileSync(path.join(DIR, 'manabase-audit.json'), JSON.stringify(rows, null, 2));
