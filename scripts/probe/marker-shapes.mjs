/**
 * The work list nothing else can see: what the compiler READ and handed back.
 *
 *   node --experimental-strip-types scripts/probe/marker-shapes.mjs
 *   SHOW=60 ... more rows      CARDS=1 ... name the cards in each shape
 *
 * `scripts/unparsed-shapes.mjs` ranks clauses the compiler could not parse.
 * This ranks the ones it DID parse and then gave up inside, which is a
 * different and larger problem that no instrument in this repo has ever
 * measured.
 *
 * WHY IT MATTERS MORE THAN THE UNPARSED LIST. An adversarial pass over all
 * 3,542 commanders found:
 *
 *     1,489 commanders cannot reach `full` no matter how much parsing is done,
 *             because a `manual()` marker sits inside an ability that parsed
 *       847 of those have NOTHING unparsed at all, so every work list in this
 *             repo reports them as finished work
 *     2,332 markers hold 158,505 characters of oracle text
 *
 * Etali, Primal Storm has nothing unread and his entire effect is one marker.
 * Ragavan actively misdirects: his unread list names only "Dash {1}{R}", which
 * is irrelevant to a commander, while both of his real effects are markers.
 * Syr Konrad reports nothing unread while two of his three trigger conditions
 * and the whole payoff sit inside one.
 *
 * A marker is HONEST — it says out loud that a human is needed, which is the
 * property that makes this engine trustworthy. It is not a bug. But an honest
 * refusal that nothing counts is a refusal nobody will ever get round to
 * fixing, and that is what this file is for.
 *
 * The `hint` is the useful part. `effect-rules.ts` writes markers as
 * "<rule id>: <why it refused>", so the ranking is by RULE rather than by
 * English, which makes each row a piece of work with a known home.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const CATALOGUE = new URL('../../scratch/catalogue-cache.json', import.meta.url);
const OUT = new URL('../../scratch/marker-shapes.json', import.meta.url);
const SHOW = Number(process.env.SHOW || 30);
const NAME_CARDS = Boolean(process.env.CARDS);

const cards = JSON.parse(readFileSync(CATALOGUE, 'utf8'));

const { compileWithTrace } = await import(
  new URL('../../src/lib/cards/abilities/compiler.ts', import.meta.url).href
);

/**
 * Every `manual` effect anywhere in an ability, however deeply nested.
 *
 * Markers hide inside `if`, `may`, `for-each`, `repeat` and `choose-mode`, and
 * a walk that only looked at the top level of `effects` would miss the ones
 * that matter most: a modal card's whole body is inside `choose-mode`.
 */
function walkForMarkers(node, out, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return;
  if (Array.isArray(node)) {
    for (const item of node) walkForMarkers(item, out, depth + 1);
    return;
  }
  if (node.do === 'manual') out.push(node);
  for (const key of Object.keys(node)) {
    const v = node[key];
    if (v && typeof v === 'object') walkForMarkers(v, out, depth + 1);
  }
}

/**
 * A marker's text reduced to the shape a rule would be anchored on.
 *
 * Same treatment `coverage-census.mjs` uses, and for the same reason: the first
 * version of that one ranked "{mana}" as the biggest cluster at 1,129 cards,
 * which was the shape function failing rather than a finding. Lowercase before
 * stripping, because an uppercase placeholder became "{ }".
 */
function shapeOf(text) {
  const norm = String(text || '')
    .toLowerCase()
    .replace(/\{[^}]*\}/g, '{mana}')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d+\b/g, 'N')
    .replace(/[^a-z0-9{} ,.'\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = norm.split(/[,.]/)[0].split(' ').filter(Boolean).slice(0, 9).join(' ');
  return words || `(symbols only) ${norm.slice(0, 40)}`;
}

/** The rule that gave up, from the hint `effect-rules.ts` writes. */
function ruleOf(marker) {
  const hint = String(marker.hint ?? '');
  const colon = hint.indexOf(':');
  return colon > 0 ? hint.slice(0, colon).trim() : hint ? hint.slice(0, 40) : '(no hint)';
}

let withText = 0;
let cardsWithMarker = 0;
let cardsBlockedOnlyByMarkers = 0;
let markerTotal = 0;
let markerChars = 0;
let charsOnCatalogue = 0;

const byRule = new Map();
const byShape = new Map();

const bump = (map, key, card, chars) => {
  let e = map.get(key);
  if (!e) {
    e = { key, markers: 0, cards: new Set(), chars: 0, example: '' };
    map.set(key, e);
  }
  e.markers += 1;
  e.cards.add(card.name);
  e.chars += chars;
  if (!e.example) e.example = card.name;
};

for (const card of cards) {
  const hasText = Boolean(card.oracle_text) || (card.faces ?? []).some(f => f?.oracle_text);
  if (!hasText) continue;
  withText++;

  let trace;
  try {
    trace = compileWithTrace(card);
  } catch {
    continue;
  }
  const result = trace.result;
  charsOnCatalogue += String(card.oracle_text ?? '').length;

  const markers = [];
  walkForMarkers(result.abilities ?? [], markers);
  if (markers.length === 0) continue;

  cardsWithMarker++;
  const unread = (result.unparsed ?? []).length;
  /*
   * THE POPULATION THAT IS INVISIBLE. Not full, nothing unparsed, and a marker
   * inside. Every work list in this repo reports these as done.
   */
  if (result.coverage !== 'full' && unread === 0) cardsBlockedOnlyByMarkers++;

  for (const m of markers) {
    const chars = String(m.text ?? '').length;
    markerTotal += 1;
    markerChars += chars;
    bump(byRule, ruleOf(m), card, chars);
    bump(byShape, shapeOf(m.text), card, chars);
  }
}

const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '-');
const rank = map =>
  [...map.values()]
    .map(e => ({ ...e, cardCount: e.cards.size, cardNames: [...e.cards] }))
    .sort((a, b) => b.cardCount - a.cardCount);

const rules = rank(byRule);
const shapes = rank(byShape);

console.log(`\nWHAT THE COMPILER READ AND THEN HANDED TO A HUMAN\n`);
console.log(`  cards with rules text                ${withText}`);
console.log(`  carry at least one marker            ${cardsWithMarker}  ${pct(cardsWithMarker, withText)}`);
console.log(`  ...and have NOTHING unparsed         ${cardsBlockedOnlyByMarkers}  ${pct(cardsBlockedOnlyByMarkers, withText)}`);
console.log(`     ^ invisible to every other work list in this repo`);
console.log(`  markers in total                     ${markerTotal}`);
console.log(`  characters inside them               ${markerChars}  ${pct(markerChars, charsOnCatalogue)} of all oracle text`);

console.log(`\nBY THE RULE THAT GAVE UP, which is where the work would go:\n`);
for (const r of rules.slice(0, SHOW)) {
  console.log(
    `  ${String(r.cardCount).padStart(5)} cards  ${String(r.chars).padStart(7)} chars  ` +
      `${r.key.slice(0, 40).padEnd(42)} e.g. ${r.example}`
  );
}

console.log(`\nBY WHAT THE TEXT SAYS, which is where a NEW rule would go:\n`);
for (const s of shapes.slice(0, SHOW)) {
  console.log(`  ${String(s.cardCount).padStart(5)} cards  ${s.key.slice(0, 58).padEnd(60)} e.g. ${s.example}`);
  if (NAME_CARDS) console.log(`         ${s.cardNames.slice(0, 8).join(', ')}`);
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      withText,
      cardsWithMarker,
      cardsBlockedOnlyByMarkers,
      markerTotal,
      markerChars,
      rules: rules.slice(0, 200).map(r => ({ rule: r.key, cards: r.cardCount, markers: r.markers, chars: r.chars, example: r.example })),
      shapes: shapes.slice(0, 300).map(s => ({ shape: s.key, cards: s.cardCount, chars: s.chars, example: s.example, cardNames: s.cardNames.slice(0, 25) })),
    },
    null,
    1
  )
);
console.log(`\nwrote scratch/marker-shapes.json`);
