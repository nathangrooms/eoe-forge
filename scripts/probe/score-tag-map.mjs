/**
 * The gate the Tagger mapping has to clear before it feeds anything.
 *
 *   node --experimental-strip-types scripts/probe/score-tag-map.mjs
 *
 * `scratch/tag-map.json` turns Scryfall Tagger tags into our vocabulary. This
 * scores it against the 374-word answer key from the three-way contest, built
 * by two independent readers who saw none of the contenders.
 *
 * THE BAR IS PRECISION 85%, and it is not arbitrary. This table puts cards into
 * deck-building ROLES: a wrong facet makes the builder spend a real slot on a
 * card that cannot do the job. Measured on the same key, the compiler scores
 * 86.7% and a paid per-card reading scores 95.6%. A mapping below about 85%
 * would be filling empty cards faster than it fills them WRONG, which is not a
 * trade worth making when the alternative is leaving them empty.
 *
 * Recall is reported and is not a gate. A missing word costs a card its place
 * in a list; an invented one makes the builder act. They are not symmetric and
 * must not be averaged into one number.
 */
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const map = JSON.parse(readFileSync(new URL('scratch/tag-map.json', root), 'utf8'));
const answers = JSON.parse(readFileSync(new URL('scratch/three-way-answers.json', root), 'utf8'));
const score = JSON.parse(readFileSync(new URL('scratch/three-way-score.json', root), 'utf8'));

/** slug -> facets. The map is keyed on tag_id but the sample stored labels. */
const bySlug = new Map();
const byLabel = new Map();
for (const m of map) {
  bySlug.set(m.slug, m);
  byLabel.set(m.slug.replace(/-/g, ' '), m);
}

/* The sample stored Tagger LABELS, so match on a normalised form of each. */
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const bySlugNorm = new Map();
for (const m of map) bySlugNorm.set(norm(m.slug), m);

const keyOf = new Map();
for (const c of score.cards) keyOf.set(c.name, new Set(c.key ?? []));

let tp = 0;
let fp = 0;
let fn = 0;
let cardsWithKey = 0;
let unmatchedTags = 0;
let matchedTags = 0;

const invented = new Map();
const missed = new Map();
const worst = [];

for (const card of answers) {
  const key = keyOf.get(card.name);
  if (!key || key.size === 0) continue;
  cardsWithKey++;

  const predicted = new Set();
  for (const label of card.tagger ?? []) {
    const m = bySlugNorm.get(norm(label));
    if (!m) {
      unmatchedTags++;
      continue;
    }
    matchedTags++;
    for (const f of m.facets) predicted.add(f);
  }

  const hit = [...predicted].filter(f => key.has(f));
  const bad = [...predicted].filter(f => !key.has(f));
  const gone = [...key].filter(f => !predicted.has(f));
  tp += hit.length;
  fp += bad.length;
  fn += gone.length;
  for (const f of bad) invented.set(f, (invented.get(f) ?? 0) + 1);
  for (const f of gone) missed.set(f, (missed.get(f) ?? 0) + 1);
  if (bad.length) worst.push({ name: card.name, bad, text: (card.oracle_text ?? '').replace(/\n/g, ' | ').slice(0, 110) });
}

const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '-');
const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
const recall = tp + fn > 0 ? tp / (tp + fn) : 0;

console.log(`\nTHE TAGGER MAPPING, SCORED AGAINST THE 374-WORD KEY\n`);
console.log(`  mappings in the table          ${map.length}`);
console.log(`  cards scored                   ${cardsWithKey}`);
console.log(`  tags matched to a mapping      ${matchedTags}`);
console.log(`  tags with no mapping (omitted) ${unmatchedTags}`);
console.log();
console.log(`  PRECISION   ${pct(precision, 1).padStart(7)}   ${tp} right of ${tp + fp} predicted`);
console.log(`  RECALL      ${pct(recall, 1).padStart(7)}   ${tp} found of ${tp + fn} real`);
console.log();
console.log(`  for comparison, on the same key:`);
console.log(`    compiler                     86.7% precision, 48.7% recall`);
console.log(`    paid per-card reading        95.6% precision, 98.4% recall`);

if (invented.size) {
  console.log(`\n  WORDS IT INVENTS MOST, which is what the gate is about:\n`);
  for (const [f, n] of [...invented].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`    ${String(n).padStart(4)}  ${f}`);
  }
}
if (worst.length) {
  console.log(`\n  CARDS IT GETS WRONG, so the failures can be read:\n`);
  for (const w of worst.slice(0, 8)) {
    console.log(`    ${w.name}`);
    console.log(`      ${w.text}`);
    console.log(`      invented: ${w.bad.join(' ')}`);
  }
}

console.log(`\n  VERDICT:`);
if (precision >= 0.85) {
  console.log(`    PASSES. ${pct(precision, 1)} precision clears the 85% bar, and ${pct(recall, 1)} recall`);
  console.log(`    is added on top of whatever the compiler already found.`);
} else {
  console.log(`    FAILS. ${pct(precision, 1)} precision is under 85%, so it would put cards in`);
  console.log(`    wrong roles faster than it fills empty ones. Read the invented list`);
  console.log(`    above and tighten the mapping before letting it near the funnel.`);
}
