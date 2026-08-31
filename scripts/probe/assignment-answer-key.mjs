/**
 * The answer key for per-card word assignment, and the gate it has to pass.
 *
 *   node --experimental-strip-types scripts/probe/assignment-answer-key.mjs
 *   N=120 ... sample size      OUT=scratch/key.json ... where to write it
 *
 * The owner: *"the whole plan was to analyse each card and match them into
 * every part of the dictionary they are relevant for"*.
 *
 * That is a different problem from parsing, and a much more tractable one.
 * Surge of Brilliance reads "Paradox - Draw a card for each spell you've cast
 * this turn", which the compiler REFUSES because it cannot track what you cast
 * this turn. But nobody needs a parse tree to say the card draws cards and
 * cares about spells being cast. Assignment does not require grammar; it
 * requires reading the card and picking words.
 *
 * ## Why this file exists before any assignment happens
 *
 * The whole objection to assigning words card by card is that it can be wrong
 * in unbounded ways and nothing would ever say so. The compiler cannot check
 * it, because the cards that need assignment are precisely the ones the
 * compiler could not read.
 *
 * EXCEPT ON THE CARDS IT READS COMPLETELY. 10,523 cards reach `coverage:
 * 'full'`, which means every paragraph was consumed and the facets are derived
 * from a structured record rather than from a guess. Those are a FREE ANSWER
 * KEY: run assignment on them, compare against what the compiler already
 * knows, and the disagreement is a measured error rate.
 *
 * So this writes a held-out sample of solved cards, WITHOUT their answers in
 * the same place, so an assignment pass can be scored honestly:
 *
 *   scratch/assignment-key.json      the answers   (never shown to an assigner)
 *   scratch/assignment-questions.json the cards    (name, type, cost, text, P/T)
 *
 * ## What counts as agreement, and why it is not exact match
 *
 * A card's facets include `type:` and `sub:` read straight off the type line,
 * which any assigner gets for free and which would inflate agreement to
 * meaninglessness. Only the BEHAVIOURAL words are scored: eff, trig, cost,
 * acost, cares, tok, ctr, scope, mana.
 *
 * `rec:full` and `rec:partial` are excluded too. They describe the COMPILER,
 * not the card, and an assigner has no way to know them and no business
 * guessing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const N = Number(process.env.N || 120);

const cards = JSON.parse(
  readFileSync(new URL('../../scratch/catalogue-cache.json', import.meta.url), 'utf8')
);

const { compileWithTrace } = await import(
  new URL('../../src/lib/cards/abilities/compiler.ts', import.meta.url).href
);
const beh = await import(new URL('../../src/lib/deck/recommend/behaviour.ts', import.meta.url).href);

/** The words that describe what a card DOES. The rest are free from the type line. */
export const BEHAVIOURAL = /^(eff|trig|cost|acost|cares|tok|ctr|scope|mana):/;

const solved = [];
for (const card of cards) {
  if (!card.oracle_text || card.oracle_text.trim().length < 20) continue;
  let trace;
  try {
    trace = compileWithTrace(card);
  } catch {
    continue;
  }
  if (trace.result.coverage !== 'full') continue;
  /*
   * A full card whose record is XMage's is excluded. The point of the key is to
   * score assignment against OUR reading of the printed text, and a ported
   * record can carry things the text does not obviously say.
   */
  let facets;
  try {
    const r = beh.facetsForCard(card);
    if (r.source !== 'compiler') continue;
    facets = r.facets.filter(f => BEHAVIOURAL.test(f));
  } catch {
    continue;
  }
  /* A full card with no behavioural words is a vanilla or a pure keyword, and
     scoring an assigner on an empty answer teaches nothing. */
  if (facets.length < 2) continue;
  solved.push({ card, facets });
}

/*
 * SPREAD THE SAMPLE ACROSS COMPLEXITY, not across the front of the file.
 * A key made of the simplest solved cards would report an agreement rate that
 * says nothing about the 8,367 cards that actually need assigning, which are by
 * definition the harder ones. Bucket by how many words the answer holds and
 * take evenly from each.
 */
const byWeight = new Map();
for (const s of solved) {
  const k = Math.min(s.facets.length, 8);
  const list = byWeight.get(k) ?? [];
  list.push(s);
  byWeight.set(k, list);
}
const weights = [...byWeight.keys()].sort((a, b) => a - b);
const perBucket = Math.max(1, Math.ceil(N / weights.length));

/* Deterministic pick, so a rerun scores the same cards. No Math.random: this is
   a fixture and a fixture that moves cannot be compared with itself. */
const sample = [];
for (const w of weights) {
  const list = byWeight.get(w);
  const step = Math.max(1, Math.floor(list.length / perBucket));
  for (let i = 0; i < list.length && sample.length < N; i += step) sample.push(list[i]);
}

const questions = sample.map(s => ({
  name: s.card.name,
  type_line: s.card.type_line,
  mana_cost: s.card.mana_cost,
  oracle_text: s.card.oracle_text,
  power: s.card.power,
  toughness: s.card.toughness,
}));
const key = Object.fromEntries(sample.map(s => [s.card.name, s.facets.sort()]));

writeFileSync(
  new URL('../../scratch/assignment-questions.json', import.meta.url),
  JSON.stringify(questions, null, 1)
);
writeFileSync(
  new URL('../../scratch/assignment-key.json', import.meta.url),
  JSON.stringify(key, null, 1)
);

const words = Object.values(key).flat();
const distinct = new Set(words);

console.log(`\nTHE ANSWER KEY FOR PER-CARD WORD ASSIGNMENT\n`);
console.log(`  cards the compiler reads completely, by its own record   ${solved.length}`);
console.log(`  sampled across complexity                                ${sample.length}`);
console.log(`  behavioural words in the key                             ${words.length}`);
console.log(`  distinct words                                           ${distinct.size}`);
console.log(`  mean words per card                                      ${(words.length / sample.length).toFixed(1)}`);

const spread = {};
for (const [, v] of Object.entries(key)) {
  const k = Math.min(v.length, 8);
  spread[k] = (spread[k] ?? 0) + 1;
}
console.log(`\n  spread by answer size (this is what stops the key being easy):`);
for (const k of Object.keys(spread).sort((a, b) => a - b)) {
  console.log(`    ${k === '8' ? '8+' : k} words   ${String(spread[k]).padStart(4)}`);
}

console.log(`\n  wrote scratch/assignment-questions.json and scratch/assignment-key.json`);
console.log(`  THE KEY IS NOT THE QUESTIONS. Never hand both to the same reader.`);
