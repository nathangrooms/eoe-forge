/**
 * What per-card assignment would actually cost, and how much of it is avoidable.
 *
 *   node --experimental-strip-types scripts/probe/assignment-cost.mjs
 *
 * The owner, before committing to it: *"We need to optimise for minimum usage
 * ... there are thousands of dictionary options, are we confident we will take
 * the time to check every single one ... must be a way to avoid certain ones
 * from needing to be read."*
 *
 * There is, and it is most of them. This measures the three levers.
 *
 * LEVER ONE, THE VOCABULARY. 1,409 facets exist and only a fraction are a
 * judgement. `type:` and `sub:` come off the type line, `kw:` off Scryfall's
 * own keywords array, `cares:sub:` off a word scan for subtype names, `rec:` is
 * the compiler describing itself. None of those needs reading.
 *
 * LEVER TWO, NAMES ARE NOT JUDGEMENTS. `tok:treasure` and `ctr:+1/+1` are the
 * NAME of a token or counter, and the name is printed in the sentence that
 * makes it. If a regex can pull them out reliably then 105 more words leave the
 * list, and what remains is the small set of verbs, triggers and costs that
 * genuinely require someone to understand the card.
 *
 * LEVER THREE, CARDS REPEAT. Two cards whose rules text is identical once the
 * card's own name is folded out are ONE reading, not two. "Counter target
 * spell" is printed on more than one card. This measures how much of the work
 * that removes.
 */
import { readFileSync } from 'node:fs';

const cards = JSON.parse(
  readFileSync(new URL('../../scratch/catalogue-cache.json', import.meta.url), 'utf8')
);
const beh = await import(new URL('../../src/lib/deck/recommend/behaviour.ts', import.meta.url).href);

/** Words that require someone to read the card and decide. */
const JUDGEMENT = /^(eff|trig|cost|acost|cares:type|cares:zone|scope|mana):/;
/** Words that are the NAME of a thing the sentence already prints. */
const NAMED = /^(tok|ctr):/;

const esc = t => t.replace(/[-/\\^$*+?.()|[\]{}]/g, m => `\\${m}`);

let tokOK = 0;
let tokTot = 0;
let ctrOK = 0;
let ctrTot = 0;

const need = [];
const shapes = new Map();
const shapeExample = new Map();

for (const card of cards) {
  const text = (card.oracle_text ?? '').trim();
  if (!text) continue;

  let facets;
  try {
    facets = beh.facetsForCard(card).facets;
  } catch {
    continue;
  }

  /* Is the NAME in the text that produced it? */
  for (const f of facets) {
    if (!NAMED.test(f)) continue;
    const name = f.slice(f.indexOf(':') + 1);
    const hit = new RegExp(esc(name), 'i').test(text);
    if (f.startsWith('tok:')) {
      tokTot++;
      if (hit) tokOK++;
    } else {
      ctrTot++;
      if (hit) ctrOK++;
    }
  }

  if (facets.some(f => JUDGEMENT.test(f))) continue;
  need.push(card);

  /*
   * The card's own name folded to `~` and every number to N, so two cards that
   * say the same thing collapse. This is deliberately CRUDER than the
   * compiler's normaliser: it is measuring how many READINGS are needed, and a
   * reading transfers between two cards whose text differs only by a number.
   */
  const key = text
    .toLowerCase()
    .split(card.name.toLowerCase())
    .join('~')
    .replace(/\d+/g, 'N')
    .replace(/\s+/g, ' ')
    .trim();
  shapes.set(key, (shapes.get(key) ?? 0) + 1);
  if (!shapeExample.has(key)) shapeExample.set(key, card.name);
}

const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '-');

console.log(`\nLEVER TWO: ARE TOKEN AND COUNTER NAMES IN THE TEXT?\n`);
console.log(`  tok:  ${tokOK} of ${tokTot}   ${pct(tokOK, tokTot)}`);
console.log(`  ctr:  ${ctrOK} of ${ctrTot}   ${pct(ctrOK, ctrTot)}`);
console.log(`  If high, 105 words leave the reading list and become extraction.`);

console.log(`\nLEVER THREE: HOW MANY READINGS, NOT HOW MANY CARDS\n`);
console.log(`  cards with no judgement word today      ${need.length}`);
console.log(`  distinct texts among them               ${shapes.size}`);

const dupes = [...shapes.entries()].filter(([, n]) => n > 1);
const dupeCards = dupes.reduce((n, [, v]) => n + v, 0);
console.log(`  texts printed on 2 or more cards        ${dupes.length}, covering ${dupeCards} cards`);
console.log(`  READINGS ACTUALLY REQUIRED              ${shapes.size}   ${pct(shapes.size, need.length)} of the cards`);
console.log(`  saved by not reading the same text twice ${need.length - shapes.size}`);

console.log(`\n  the most repeated texts, which are one reading each:`);
for (const [key, n] of dupes.sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`    ${String(n).padStart(4)} cards  ${shapeExample.get(key)}  ::  ${key.slice(0, 70)}`);
}

/*
 * THE COST, from a measured rate rather than a guess. A single agent assigned
 * 120 cards for 139,981 tokens on 1 Sep 2026, which is 1,167 per card, and that
 * included reading the vocabulary once for the whole batch.
 */
const PER_READING = 1167;
console.log(`\nCOST, at the measured 1,167 tokens per reading:\n`);
const row = (label, n) =>
  console.log(`  ${label.padEnd(42)} ${String(n).padStart(6)} readings   ${((n * PER_READING) / 1e6).toFixed(1)}M tokens`);
row('every card with rules text', cards.filter(c => (c.oracle_text ?? '').trim()).length);
row('only cards with no judgement word', need.length);
row('...and not reading the same text twice', shapes.size);
row('...twice, for an independent second opinion', shapes.size * 2);
