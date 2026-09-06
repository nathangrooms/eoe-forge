/**
 * Validate what the card reviewers returned, and refuse anything unsafe.
 *
 *   node --experimental-strip-types scripts/probe/apply-card-review.mjs <workflow-dir>
 *
 * Reads the workflow journal, pulls every proposed change, and checks each one
 * against the exported batches and the engine's real vocabulary. Nothing is
 * written to the database here: this prints what WOULD land, so the numbers can
 * be read before anything touches a live product.
 *
 * THE FOUR REFUSALS, each of which has a reason:
 *
 *   1. an ADD naming a word the engine does not have. A reviewer that invents
 *      `eff:blink` instead of using `eff:exile-own` would otherwise write a
 *      word nothing reads - this repo has shipped five facets with no consumer
 *      and calls them decoration.
 *   2. a REMOVE of a facet the card does not carry. Usually a misremembered
 *      name, and applying it would be a silent no-op that looks like a change.
 *   3. anything touching a PRINTED fact - sub:, kw:, type:, mana:, acost:,
 *      rec:, ctr:, tok:, cares:type:, cares:sub:. Those come off the type line
 *      and the keyword list, not from judgement.
 *   4. a card name that is not in the batch the reviewer was given.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const dir = process.argv[2];
if (!dir) throw new Error('usage: apply-card-review.mjs <workflow transcript dir>');

const PROTECTED = /^(sub:|kw:|type:|mana:|acost:|rec:|ctr:|tok:|cares:type:|cares:sub:)/;
const vocab = new Set(JSON.parse(readFileSync('scratch/judge-vocab.json', 'utf8')).map(v => v.f));

/* Every exported card, so a remove can be checked against what it really has. */
const cardFacets = new Map();
for (const f of readdirSync('.review')) {
  if (!f.endsWith('.json')) continue;
  for (const c of JSON.parse(readFileSync(`.review/${f}`, 'utf8'))) {
    cardFacets.set(c.name, new Set(c.facets ?? []));
  }
}

function* walk(o) {
  if (Array.isArray(o)) { for (const v of o) yield* walk(v); return; }
  if (o && typeof o === 'object') {
    if (Array.isArray(o.changes)) yield o;
    for (const v of Object.values(o)) yield* walk(v);
    return;
  }
  if (typeof o === 'string' && o.includes('"changes"')) {
    try { yield* walk(JSON.parse(o)); } catch { /* not json */ }
  }
}

const seen = new Set();
const results = [];
for (const line of readFileSync(`${dir}/journal.jsonl`, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let entry;
  try { entry = JSON.parse(line); } catch { continue; }
  for (const r of walk(entry)) {
    const key = JSON.stringify(r).slice(0, 400);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(r);
  }
}

const refused = { unknownWord: [], notPresent: [], printed: [], unknownCard: [] };
const kept = [];
const proposals = new Map();

for (const r of results) {
  for (const ch of r.changes ?? []) {
    const have = cardFacets.get(ch.name);
    if (!have) { refused.unknownCard.push(ch.name); continue; }
    const add = [], remove = [];
    for (const f of ch.add ?? []) {
      if (PROTECTED.test(f)) { refused.printed.push(`${ch.name} +${f}`); continue; }
      if (!vocab.has(f)) { refused.unknownWord.push(`${ch.name} +${f}`); continue; }
      if (!have.has(f)) add.push(f);
    }
    for (const f of ch.remove ?? []) {
      if (PROTECTED.test(f)) { refused.printed.push(`${ch.name} -${f}`); continue; }
      if (!have.has(f)) { refused.notPresent.push(`${ch.name} -${f}`); continue; }
      remove.push(f);
    }
    for (const p of ch.propose ?? []) {
      const k = p.word;
      if (!proposals.has(k)) proposals.set(k, { word: k, means: p.means, cards: [], why: p.why });
      proposals.get(k).cards.push(ch.name);
    }
    if (add.length || remove.length) kept.push({ name: ch.name, add, remove, why: ch.why ?? '' });
  }
}

const reviewed = results.reduce((n, r) => n + (Number(r.reviewed) || 0), 0);
console.log(`${results.length} reviewer results, ${reviewed} cards read\n`);
console.log(`KEPT           ${kept.length} cards change`);
console.log(`  additions    ${kept.reduce((n, k) => n + k.add.length, 0)}`);
console.log(`  removals     ${kept.reduce((n, k) => n + k.remove.length, 0)}`);
console.log(`\nREFUSED`);
console.log(`  word the engine does not have   ${refused.unknownWord.length}`);
console.log(`  facet the card does not carry   ${refused.notPresent.length}`);
console.log(`  printed fact, not a judgement   ${refused.printed.length}`);
console.log(`  card not in any batch           ${refused.unknownCard.length}`);

const top = [...proposals.values()].sort((a, b) => b.cards.length - a.cards.length);
console.log(`\n${top.length} NEW WORDS PROPOSED, most asked-for first:`);
for (const p of top.slice(0, 20)) {
  console.log(`  ${String(p.cards.length).padStart(4)}  ${p.word.padEnd(28)} ${String(p.means).slice(0, 60)}`);
}

writeFileSync('scratch/card-review.json', JSON.stringify({ kept, refused, proposals: top }, null, 1));
console.log('\nwrote scratch/card-review.json');
