/**
 * Score a per-card word assignment against the compiler's own answers.
 *
 *   node --experimental-strip-types scripts/probe/score-assignment.mjs scratch/assignment-answers.json
 *
 * The gate for the owner's plan: *"analyse each card and match them into every
 * part of the dictionary they are relevant for"*. That plan is only worth
 * running over 8,367 cards if assignment can be shown to be ACCURATE, and the
 * cards needing it are precisely the ones the compiler cannot check.
 *
 * The 6,935 cards the compiler reads COMPLETELY are the way out. Their facets
 * come from a structured record rather than a guess, so they are a free answer
 * key, and `assignment-answer-key.mjs` writes a 120-card sample of them spread
 * evenly across answer size.
 *
 * ## Precision and recall are not the same failure and must not be averaged
 *
 *   RECALL     of the words the card really has, how many were found.
 *              Missing one means a card the deck builder cannot see.
 *   PRECISION  of the words claimed, how many are real.
 *              Inventing one is WORSE: `eff:exile` on a card that does not
 *              exile puts it in the removal role, and the builder will reach
 *              for it to fill a slot that then does nothing. This project has
 *              already shipped that exact failure twice, with graveyard hate
 *              and with Teferi's Protection.
 *
 * So a single F1 would hide the thing that matters. Both are reported, and the
 * verdict is stated against precision first.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

const answersPath = process.argv[2] ?? 'scratch/assignment-answers.json';
const root = new URL('../../', import.meta.url);

const key = JSON.parse(readFileSync(new URL('scratch/assignment-key.json', root), 'utf8'));
const answers = JSON.parse(readFileSync(new URL(answersPath, root), 'utf8'));

/** Accepts {name: [words]} or [{name, facets}]. */
const given = Array.isArray(answers)
  ? Object.fromEntries(answers.map(a => [a.name, a.facets ?? a.words ?? []]))
  : answers;

let tp = 0;
let fp = 0;
let fn = 0;
let exact = 0;
let scored = 0;

const missedWord = new Map();
const inventedWord = new Map();
const worstCards = [];

const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);

for (const [name, truth] of Object.entries(key)) {
  const mine = given[name];
  if (!mine) continue;
  scored++;
  const T = new Set(truth);
  const M = new Set(mine);
  const hit = [...M].filter(w => T.has(w));
  const invented = [...M].filter(w => !T.has(w));
  const missed = [...T].filter(w => !M.has(w));
  tp += hit.length;
  fp += invented.length;
  fn += missed.length;
  if (invented.length === 0 && missed.length === 0) exact++;
  for (const w of missed) bump(missedWord, w);
  for (const w of invented) bump(inventedWord, w);
  if (invented.length + missed.length > 0) {
    worstCards.push({ name, invented, missed, truth: truth.length });
  }
}

const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '-');
const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
const recall = tp + fn > 0 ? tp / (tp + fn) : 0;

console.log(`\nPER-CARD WORD ASSIGNMENT, SCORED AGAINST THE COMPILER\n`);
console.log(`  cards in the key            ${Object.keys(key).length}`);
console.log(`  cards answered              ${scored}`);
console.log(`  answered exactly right      ${exact}  ${pct(exact, scored)}`);
console.log();
console.log(`  PRECISION  ${pct(precision, 1).padStart(7)}   ${tp} right of ${tp + fp} claimed`);
console.log(`             ${' '.repeat(7)}   an invented word is the dangerous error: it puts`);
console.log(`             ${' '.repeat(7)}   a card in a role, and the builder acts on it`);
console.log(`  RECALL     ${pct(recall, 1).padStart(7)}   ${tp} found of ${tp + fn} real`);
console.log(`             ${' '.repeat(7)}   a missed word is a card nobody can see`);

if (inventedWord.size) {
  console.log(`\n  WORDS MOST OFTEN INVENTED:`);
  for (const [w, n] of [...inventedWord].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`    ${String(n).padStart(4)}  ${w}`);
  }
}
if (missedWord.size) {
  console.log(`\n  WORDS MOST OFTEN MISSED:`);
  for (const [w, n] of [...missedWord].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`    ${String(n).padStart(4)}  ${w}`);
  }
}

worstCards.sort((a, b) => b.invented.length + b.missed.length - (a.invented.length + a.missed.length));
console.log(`\n  WORST CARDS, so the failures can be read rather than summarised:`);
for (const c of worstCards.slice(0, 10)) {
  console.log(`    ${c.name}`);
  if (c.invented.length) console.log(`      invented: ${c.invented.join(' ')}`);
  if (c.missed.length) console.log(`      missed:   ${c.missed.join(' ')}`);
}

/*
 * THE GATE. Stated as a decision rather than a number, because the whole point
 * of the exercise is deciding whether to run this over 8,367 cards.
 *
 * Precision first and precision hardest. A missing word costs a card its place
 * in a list. An invented word puts a card in a role it cannot do, and the
 * builder then spends a real slot on it, which is the failure mode this project
 * has already shipped twice.
 */
console.log(`\n  VERDICT:`);
if (precision >= 0.9 && recall >= 0.75) {
  console.log(`    GOOD ENOUGH TO RUN. Precision ${pct(precision, 1)} means few invented words,`);
  console.log(`    and recall ${pct(recall, 1)} beats the 0 words those 8,367 cards have now.`);
} else if (precision >= 0.9) {
  console.log(`    SAFE BUT THIN. Precision ${pct(precision, 1)} is fine; recall ${pct(recall, 1)} means`);
  console.log(`    it would leave a lot unseen. Still better than nothing on cards with no words.`);
} else {
  console.log(`    NOT YET. Precision ${pct(precision, 1)} is below 90%, so it invents words, and an`);
  console.log(`    invented word makes the builder reach for a card that cannot do the job.`);
  console.log(`    Read the WORDS MOST OFTEN INVENTED list before running this over the catalogue.`);
}
