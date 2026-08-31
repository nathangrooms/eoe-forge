/**
 * Pick 100 cards and lay out what each source says, for a three-way contest.
 *
 *   node --experimental-strip-types scripts/probe/three-way-sample.mjs
 *   N=100 SEED=7 ...
 *
 * The owner: *"could we pick 100 random cards and then verify assignment vs
 * compiler vs tagger, which one gives the best and most comprehensive results"*.
 *
 * ## The design, and why the judge cannot be one of the contenders
 *
 * Three sources answer "what does this card do":
 *
 *     COMPILER   our parser, from a structured record
 *     TAGGER     Scryfall's community, from a person reading the card
 *     ASSIGNMENT an independent reading against our 95-word vocabulary
 *
 * Scoring any of them against another only measures agreement, not accuracy,
 * which is the trap this whole exercise keeps falling into. So the ground truth
 * is a FOURTH reading, produced by someone who has not seen the other three,
 * and only cards where two independent ground-truth readers AGREE are scored.
 * A card they disagree on is thrown out rather than resolved, because a tie
 * broken by one of the contenders is not a tie broken.
 *
 * ## Truly random, and stated
 *
 * A seeded shuffle over every card with rules text. NOT stratified by how well
 * the compiler does, because that is precisely the variable under test: taking
 * an even spread of easy and hard cards would decide the answer in advance.
 * The sample will therefore be roughly two thirds cards the compiler does not
 * fully read, which is the real catalogue.
 *
 * `SEED` is fixed so the same 100 cards come back on a rerun. A sample that
 * moves cannot be compared with itself.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const N = Number(process.env.N || 100);
const SEED = Number(process.env.SEED || 7);

const cards = JSON.parse(
  readFileSync(new URL('../../scratch/catalogue-cache.json', import.meta.url), 'utf8')
);
const { compileWithTrace } = await import(
  new URL('../../src/lib/cards/abilities/compiler.ts', import.meta.url).href
);
const beh = await import(new URL('../../src/lib/deck/recommend/behaviour.ts', import.meta.url).href);

/* Tagger, and its labels, so the sheet reads in English rather than in slugs. */
const tagsOf = new Map();
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
  for (const g of t.taggings ?? []) {
    if (!g.oracle_id) continue;
    let a = tagsOf.get(g.oracle_id);
    if (!a) {
      a = [];
      tagsOf.set(g.oracle_id, a);
    }
    a.push(t.label ?? t.slug);
  }
}

/** mulberry32. Deterministic, and the seed is printed so a run is repeatable. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pool = cards.filter(c => (c.oracle_text ?? '').trim().length > 0);
const rand = rng(SEED);
const shuffled = pool.slice();
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
const sample = shuffled.slice(0, N);

const JUDGEMENT = /^(eff|trig|cost|acost|cares:type|cares:zone|scope|mana):/;

const rows = [];
const counts = { full: 0, partial: 0, manual: 0, none: 0 };
let taggerCovered = 0;
let compilerWords = 0;
let taggerWords = 0;

for (const card of sample) {
  let trace;
  let r;
  try {
    trace = compileWithTrace(card);
    r = beh.facetsForCard(card);
  } catch {
    continue;
  }
  const compiler = r.facets.filter(f => JUDGEMENT.test(f));
  const tagger = tagsOf.get(card.oracle_id) ?? [];
  counts[trace.result.coverage] = (counts[trace.result.coverage] ?? 0) + 1;
  if (tagger.length) taggerCovered++;
  compilerWords += compiler.length;
  taggerWords += tagger.length;

  rows.push({
    name: card.name,
    type_line: card.type_line,
    mana_cost: card.mana_cost,
    oracle_text: card.oracle_text,
    power: card.power,
    toughness: card.toughness,
    compiler,
    compilerCoverage: trace.result.coverage,
    compilerSource: r.source,
    tagger,
  });
}

/* The QUESTIONS sheet carries no answers from any contender, so a ground-truth
   reader cannot be anchored by one of the things it is judging. */
writeFileSync(
  new URL('../../scratch/three-way-questions.json', import.meta.url),
  JSON.stringify(
    rows.map(r => ({
      name: r.name,
      type_line: r.type_line,
      mana_cost: r.mana_cost,
      oracle_text: r.oracle_text,
      power: r.power,
      toughness: r.toughness,
    })),
    null,
    1
  )
);
writeFileSync(
  new URL('../../scratch/three-way-answers.json', import.meta.url),
  JSON.stringify(rows, null, 1)
);

const pct = (n, d) => `${((n / d) * 100).toFixed(0)}%`;

console.log(`\n${rows.length} RANDOM CARDS, seed ${SEED}. What each source already says.\n`);
console.log(`  compiler coverage on the sample:`);
for (const [k, v] of Object.entries(counts)) {
  if (v) console.log(`    ${k.padEnd(9)} ${String(v).padStart(4)}  ${pct(v, rows.length)}`);
}
console.log(`\n  mean words per card`);
console.log(`    compiler (judgement facets)  ${(compilerWords / rows.length).toFixed(1)}`);
console.log(`    tagger                       ${(taggerWords / rows.length).toFixed(1)}`);
console.log(`    tagger has any tag for       ${taggerCovered} of ${rows.length}  ${pct(taggerCovered, rows.length)}`);

const silent = rows.filter(r => r.compiler.length === 0).length;
console.log(`\n  cards the compiler says NOTHING behavioural about   ${silent}  ${pct(silent, rows.length)}`);

console.log(`\n  wrote scratch/three-way-questions.json  (no answers, for the judges)`);
console.log(`  wrote scratch/three-way-answers.json    (compiler + tagger, for scoring)`);
