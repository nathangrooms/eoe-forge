/**
 * Where the compiler and Scryfall Tagger disagree. One of them is wrong.
 *
 *   node --experimental-strip-types scripts/probe/compiler-vs-community.mjs
 *   SHOW=12 ... examples per row
 *
 * The owner, 1 Sep 2026: *"I don't have confidence in the compiler if I am
 * honest, we need to verify some of our compiler results vs the community
 * tagged."*
 *
 * Fair, and it had not been tested. Every accuracy claim in this repo rests on
 * the compiler being right where it speaks, and the only evidence for that was
 * that it works from a parsed record rather than a guess. That is an argument,
 * not a measurement.
 *
 * ## The test
 *
 * Restrict to cards the compiler says it read COMPLETELY (`coverage: 'full'`).
 * On those it is making its strongest possible claim: every paragraph consumed,
 * nothing refused, nothing handed to a human. Then ask whether Tagger says the
 * card does something the compiler never recorded.
 *
 *     Tagger says X, compiler has no word for X, on a card it claims to have
 *     read completely  ->  ONE OF THEM IS WRONG, and it is worth reading.
 *
 * There is no way to decide which from the data alone, which is the point: the
 * output is a LIST TO READ, not a verdict. Anything that scored this
 * automatically would be trusting one of the two instruments to judge the
 * other, which is the error this whole exercise exists to avoid.
 *
 * ## Why only unambiguous tags
 *
 * "spot removal" means the card removes a permanent, and our word for that is
 * `eff:destroy`, `eff:exile` or `eff:damage`. That is a claim worth checking.
 * "alliteration" is not about the card's function and neither is "unique type
 * line". Each pair below is written by hand for that reason: an automatic
 * mapping would generate hundreds of meaningless disagreements and bury the
 * real ones.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const SHOW = Number(process.env.SHOW || 8);

const cards = JSON.parse(
  readFileSync(new URL('../../scratch/catalogue-cache.json', import.meta.url), 'utf8')
);
const { compileWithTrace } = await import(
  new URL('../../src/lib/cards/abilities/compiler.ts', import.meta.url).href
);
const beh = await import(new URL('../../src/lib/deck/recommend/behaviour.ts', import.meta.url).href);

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
    let s = tagsOf.get(g.oracle_id);
    if (!s) {
      s = new Set();
      tagsOf.set(g.oracle_id, s);
    }
    s.add(t.slug);
  }
}

/**
 * Hand-written, and each one is a claim about MEANING rather than correlation.
 * `any` means the compiler satisfies the claim if it has ANY of these words.
 */
const CLAIMS = [
  { tag: 'spot removal', means: 'removes a permanent', any: ['eff:destroy', 'eff:exile', 'eff:damage', 'eff:move-zone', 'eff:gain-control'] },
  { tag: 'pure draw', means: 'draws cards', any: ['eff:draw'] },
  { tag: 'repeatable pure draw', means: 'draws cards repeatedly', any: ['eff:draw'] },
  { tag: 'burst draw', means: 'draws several cards at once', any: ['eff:draw'] },
  { tag: 'ramp', means: 'makes mana or extra lands', any: ['eff:add-mana', 'eff:extra-land-drop', 'cares:zone:library-land'] },
  { tag: 'mana rock', means: 'an artifact that makes mana', any: ['eff:add-mana'] },
  { tag: 'creature tokens', means: 'makes creature tokens', any: ['eff:create-token'] },
  { tag: 'repeatable creature tokens', means: 'makes creature tokens repeatedly', any: ['eff:create-token'] },
  { tag: 'repeatable lifegain', means: 'gains life repeatedly', any: ['eff:gain-life'] },
  { tag: 'sacrifice outlet', means: 'can sacrifice on demand', any: ['cost:sacrifice', 'eff:sacrifice'] },
  { tag: 'graveyard recursion', means: 'returns things from the graveyard', any: ['eff:return-from', 'cares:zone:graveyard'] },
  { tag: 'counterspell', means: 'counters a spell', any: ['eff:counter'] },
  { tag: 'sweeper', means: 'destroys many things at once', any: ['eff:destroy', 'eff:exile', 'eff:damage', 'eff:shrink'] },
  { tag: 'tutor', means: 'searches the library', any: ['eff:search-library', 'cares:zone:library'] },
  { tag: 'discard-opponent', means: 'makes an opponent discard', any: ['eff:discard'] },
  { tag: 'mill', means: 'puts cards from library to graveyard', any: ['eff:mill'] },
];

const rows = [];
let fullCards = 0;

for (const card of cards) {
  const text = (card.oracle_text ?? '').trim();
  if (!text) continue;
  let trace;
  let facets;
  try {
    trace = compileWithTrace(card);
    facets = beh.facetsForCard(card).facets;
  } catch {
    continue;
  }
  /* The compiler's STRONGEST claim only. On a partial card a missing word is
     expected and proves nothing. */
  if (trace.result.coverage !== 'full') continue;
  fullCards++;

  const tags = tagsOf.get(card.oracle_id);
  if (!tags) continue;

  for (const claim of CLAIMS) {
    if (!tags.has(claim.tag)) continue;
    if (claim.any.some(f => facets.includes(f))) continue;
    rows.push({
      tag: claim.tag,
      means: claim.means,
      name: card.name,
      text: text.replace(/\n/g, ' | ').slice(0, 150),
      facets: facets.filter(f => /^(eff|trig|cost|cares|scope|mana|acost):/.test(f)),
      source: beh.facetsForCard(card).source,
    });
  }
}

const byTag = new Map();
for (const r of rows) {
  let a = byTag.get(r.tag);
  if (!a) {
    a = [];
    byTag.set(r.tag, a);
  }
  a.push(r);
}

console.log(`\nWHERE THE COMPILER SAYS "I READ THE WHOLE CARD" AND TAGGER DISAGREES\n`);
console.log(`  cards the compiler read completely   ${fullCards}`);
console.log(`  disagreements found                  ${rows.length}\n`);

console.log(`  ${'tag'.padEnd(30)}${'cards'.padStart(7)}   what Tagger is claiming`);
for (const claim of CLAIMS) {
  const n = (byTag.get(claim.tag) ?? []).length;
  if (n === 0) continue;
  console.log(`  ${claim.tag.padEnd(30)}${String(n).padStart(7)}   ${claim.means}`);
}

console.log(`\n  READ THESE. The data cannot say which side is wrong.\n`);
for (const claim of CLAIMS) {
  const list = byTag.get(claim.tag);
  if (!list?.length) continue;
  console.log(`  == Tagger says "${claim.tag}" (${claim.means}), we have no word for it:`);
  for (const r of list.slice(0, SHOW)) {
    console.log(`     ${r.name}`);
    console.log(`        ${r.text}`);
    console.log(`        ours: ${r.facets.join(' ') || '(no behavioural words)'}   [${r.source}]`);
  }
  console.log();
}

writeFileSync(
  new URL('../../scratch/compiler-vs-community.json', import.meta.url),
  JSON.stringify({ fullCards, disagreements: rows.length, rows }, null, 1)
);
console.log(`  wrote scratch/compiler-vs-community.json`);
