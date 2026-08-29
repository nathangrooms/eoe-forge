/**
 * Mechanical scan of every answer captured by this review.
 *
 *   node scripts/tutor-refute-scan.mjs
 *
 * Three things the project law says must never reach a player: a rendered zero
 * price, one of the nine banned words, and an em dash in words we wrote. The
 * third has one exemption and it is not a loophole: a card's printed type line
 * carries an em dash and altering a card's own text to satisfy a house style
 * would break the fabrication rule to satisfy the copy rule.
 */

import { readFileSync } from 'node:fs';

const blocks = [];
for (const row of JSON.parse(readFileSync('scratch/refute-fifty.json', 'utf8'))) {
  if (row.message) blocks.push({ src: `fifty:${row.id}`, text: row.message });
}
for (const file of [
  'scratch/refute-probe2.txt',
  'scratch/refute-probe3.txt',
  'scratch/refute-anynumber.txt',
]) {
  blocks.push({ src: file, text: readFileSync(file, 'utf8') });
}

const BANNED = [
  'AI', 'assistant', 'smart', 'intelligent', 'powered by', 'neural', 'GPT', 'model', 'bot',
];

let issues = 0;
const say = (kind, src, ctx) => {
  console.log(`${kind}  ${src}  ::  ${ctx.replace(/\s+/g, ' ')}`);
  issues++;
};

/* A zero amount in any currency we print. `$0` with no decimals counts: the
   smallest real price in the database is 0.01, so any rendered zero is made up. */
const ZERO = /(\$|€|£)0(\.0{1,2})?(?![.\d])/g;
for (const { src, text } of blocks) {
  ZERO.lastIndex = 0;
  let m;
  while ((m = ZERO.exec(text)))
    say('ZERO PRICE ', src, text.slice(Math.max(0, m.index - 70), m.index + 40));
}

for (const { src, text } of blocks) {
  for (const word of BANNED) {
    const cased = word === 'AI' || word === 'GPT';
    const re = new RegExp(`(^|[^A-Za-z])(${word.replace(/ /g, '\\s+')})([^A-Za-z]|$)`, cased ? 'g' : 'gi');
    let m;
    while ((m = re.exec(text)))
      say(`BANNED[${word}]`, src, text.slice(Math.max(0, m.index - 60), m.index + 60));
  }
}

/* Em dashes, minus the ones inside a printed type line. */
let emTotal = 0;
let emInTypeLine = 0;
for (const { src, text } of blocks) {
  for (const line of text.split('\n')) {
    const n = (line.match(/—/g) ?? []).length;
    if (!n) continue;
    emTotal += n;
    if (/^(\*\*)?[A-Z][^*]*?(\*\*)?\s*(\{|$)|Creature —|Land —|Artifact|Enchantment|Sorcery|Instant|Planeswalker|Battle|Basic/.test(line.trim())
        && /—/.test(line)) {
      emInTypeLine += n;
    } else {
      say('EM DASH   ', src, line);
    }
  }
}

console.log(
  `\nscanned ${blocks.length} blocks. em dashes ${emTotal} total, ${emInTypeLine} inside a printed type line.`
);
console.log(`issues that are not a printed type line: ${issues}`);
