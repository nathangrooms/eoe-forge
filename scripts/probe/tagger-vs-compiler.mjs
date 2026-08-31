/**
 * Can Scryfall Tagger stand in for per-card assignment? Measured, not asserted.
 *
 *   node --experimental-strip-types scripts/probe/tagger-vs-compiler.mjs
 *   SHOW=40 ... more rows
 *
 * The owner, before committing real money: *"this scryfall thing could replace
 * the need to do any manual assignment. Don't be over confident, we need real
 * numbers as this is a lot of usage to commit before we do it."*
 *
 * ## The experiment
 *
 * 9,017 cards are read COMPLETELY by our compiler, from a parsed record rather
 * than a guess. On those cards we know the right answer. So for every Tagger
 * tag, ask: of the fully-read cards carrying that tag, what fraction carry a
 * given facet?
 *
 *     P(facet | tag)   high  ->  the tag PREDICTS the facet, and a blind card
 *                                carrying it can be given that facet
 *                      low   ->  the tag is about something our vocabulary does
 *                                not name, or nothing at all
 *
 * That is the whole question. If Tagger tags map onto our words reliably, the
 * 22,189 cards needing assignment can be filled MECHANICALLY, for nothing, and
 * the 26M tokens are not spent. If they do not, Tagger is a second opinion and
 * assignment is still required.
 *
 * ## Why it is measured on the full-read cards and not on a sample by hand
 *
 * Hand-checking cannot cover 4,524 tags, and a sample of the ones somebody
 * chose to check is a sample of the ones somebody found interesting. The
 * compiler's full-read set is 9,017 cards nobody selected, and its facets come
 * from structure rather than opinion, which is the only reason this number
 * means anything.
 *
 * ## What it deliberately does NOT claim
 *
 * A high P(facet | tag) says the mapping is sound ON CARDS THE COMPILER COULD
 * READ. Those are the easier cards by construction. The number is an upper
 * bound on how well the mapping transfers to hard cards, and this file says so
 * rather than letting the headline imply otherwise.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const SHOW = Number(process.env.SHOW || 30);
const MIN_CARDS = Number(process.env.MIN || 25);

const cards = JSON.parse(
  readFileSync(new URL('../../scratch/catalogue-cache.json', import.meta.url), 'utf8')
);

const { compileWithTrace } = await import(
  new URL('../../src/lib/cards/abilities/compiler.ts', import.meta.url).href
);
const beh = await import(new URL('../../src/lib/deck/recommend/behaviour.ts', import.meta.url).href);

/* --------------------------------------------------------- tagger index --- */

const tagsOf = new Map();
const tagLabel = new Map();
for (const line of readFileSync(
  new URL('../../scratch/scryfall/oracle-tags.jsonl', import.meta.url),
  'utf8'
).split('\n')) {
  if (!line) continue;
  let t;
  try {
    t = JSON.parse(line);
  } catch {
    continue;
  }
  tagLabel.set(t.slug, t.label ?? t.slug);
  for (const g of t.taggings ?? []) {
    if (!g.oracle_id) continue;
    let a = tagsOf.get(g.oracle_id);
    if (!a) {
      a = [];
      tagsOf.set(g.oracle_id, a);
    }
    a.push(t.slug);
  }
}

/* ------------------------------------------------------- the known cards --- */

/** Only the words that need a judgement. The rest are free from the type line. */
const JUDGEMENT = /^(eff|trig|cost|acost|cares:type|cares:zone|scope|mana):/;

const known = [];
let blindWithTags = 0;
let blind = 0;

for (const card of cards) {
  const text = (card.oracle_text ?? '').trim();
  if (!text) continue;
  let facets;
  let trace;
  try {
    facets = beh.facetsForCard(card).facets;
    trace = compileWithTrace(card);
  } catch {
    continue;
  }
  const tags = tagsOf.get(card.oracle_id) ?? [];

  if (!facets.some(f => JUDGEMENT.test(f))) {
    blind++;
    if (tags.length) blindWithTags++;
    continue;
  }
  if (trace.result.coverage !== 'full') continue;
  known.push({ name: card.name, facets: facets.filter(f => JUDGEMENT.test(f)), tags });
}

/* ------------------------------------------------------- the association --- */

/** tag -> facet -> how many cards carry both. */
const pair = new Map();
const tagTotal = new Map();

for (const k of known) {
  for (const tag of k.tags) {
    tagTotal.set(tag, (tagTotal.get(tag) ?? 0) + 1);
    let m = pair.get(tag);
    if (!m) {
      m = new Map();
      pair.set(tag, m);
    }
    for (const f of new Set(k.facets)) m.set(f, (m.get(f) ?? 0) + 1);
  }
}

const rows = [];
for (const [tag, total] of tagTotal) {
  if (total < MIN_CARDS) continue;
  const m = pair.get(tag);
  let bestFacet = null;
  let bestP = 0;
  for (const [f, n] of m) {
    const p = n / total;
    if (p > bestP) {
      bestP = p;
      bestFacet = f;
    }
  }
  rows.push({ tag, label: tagLabel.get(tag) ?? tag, cards: total, facet: bestFacet, p: bestP });
}
rows.sort((a, b) => b.p - a.p || b.cards - a.cards);

const strong = rows.filter(r => r.p >= 0.9);
const usable = rows.filter(r => r.p >= 0.75 && r.p < 0.9);
const weak = rows.filter(r => r.p < 0.75);

const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '-');

console.log(`\nCAN A TAGGER TAG BE TURNED INTO ONE OF OUR WORDS?\n`);
console.log(`  cards the compiler reads completely      ${known.length}`);
console.log(`  tags on at least ${MIN_CARDS} of them${' '.repeat(Math.max(0, 12 - String(MIN_CARDS).length))}        ${rows.length}`);
console.log();
console.log(`  predicts a facet 90%+ of the time        ${strong.length}   ${pct(strong.length, rows.length)}`);
console.log(`  75 to 90%                                ${usable.length}   ${pct(usable.length, rows.length)}`);
console.log(`  under 75%, so not a mapping              ${weak.length}   ${pct(weak.length, rows.length)}`);

console.log(`\n  STRONGEST MAPPINGS, tag -> our word:\n`);
for (const r of strong.slice(0, SHOW)) {
  console.log(
    `    ${pct(r.p, 1).padStart(6)}  ${String(r.cards).padStart(5)} cards   ` +
      `${r.label.slice(0, 34).padEnd(36)} -> ${r.facet}`
  );
}

console.log(`\n  BIGGEST TAGS THAT MAP TO NOTHING (the ones a reading would still be needed for):\n`);
for (const r of weak.sort((a, b) => b.cards - a.cards).slice(0, 15)) {
  console.log(
    `    ${pct(r.p, 1).padStart(6)}  ${String(r.cards).padStart(5)} cards   ` +
      `${r.label.slice(0, 34).padEnd(36)} best guess ${r.facet}`
  );
}

console.log(`\n  AND THE COVERAGE QUESTION:\n`);
console.log(`    cards with no judgement word            ${blind}`);
console.log(`    ...that Tagger has any tag for          ${blindWithTags}   ${pct(blindWithTags, blind)}`);

writeFileSync(
  new URL('../../scratch/tagger-mapping.json', import.meta.url),
  JSON.stringify({ known: known.length, rows }, null, 1)
);
console.log(`\n  wrote scratch/tagger-mapping.json`);
console.log(`\n  CAVEAT, stated because the headline invites the wrong reading:`);
console.log(`  this is measured on cards the compiler COULD read, which are the`);
console.log(`  easier ones. It is an upper bound on how well the mapping carries`);
console.log(`  to the hard cards, not a guarantee about them.`);
