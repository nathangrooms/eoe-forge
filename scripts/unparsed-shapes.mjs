/**
 * The compiler's work list, ranked by how many played cards each shape unlocks.
 *
 * `compiler-gap-probe.ts` answers "how blind are we" and names eight clusters
 * it already knows about. This answers the next question: of the clauses that
 * match NO named cluster, which SENTENCE SHAPES recur, and how many cards would
 * a rule for each one reach.
 *
 * It works on the UNPARSED CLAUSE rather than the card, because a card can be
 * blind for one clause out of four and the clause is what a rule is written
 * against. Two cards refused for the same sentence are one piece of work.
 *
 *   node --experimental-strip-types scripts/unparsed-shapes.mjs
 *   node --experimental-strip-types scripts/unparsed-shapes.mjs --top 4000
 *   SHOW=draw node --experimental-strip-types scripts/unparsed-shapes.mjs
 *
 * The working tree's compiler, never the stored memo, so a rule written five
 * minutes ago is measured before anything is refilled or deployed.
 *
 * Nothing is written. Read-only against the anon key.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

const KEY = readFileSync(new URL('../scratch/anon.txt', import.meta.url), 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1';

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const TOP = Number(argOf('top', '2000'));
const SHOW = process.env.SHOW ?? '';

const { compileWithTrace } = await import(
  new URL('../src/lib/cards/abilities/compiler.ts', import.meta.url).href
);

async function fetchTop(n) {
  const rows = [];
  let after = null;
  while (rows.length < n) {
    const cursor = after
      ? `&or=(edhrec_rank.gt.${after.rank},and(edhrec_rank.eq.${after.rank},id.gt.${after.id}))`
      : '';
    const url =
      `${BASE}/cards_unique?select=id,name,type_line,oracle_text,mana_cost,cmc,keywords,faces,edhrec_rank` +
      `&edhrec_rank=not.is.null` +
      `&order=edhrec_rank.asc,id.asc&limit=250${cursor}`;
    const res = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const page = await res.json();
    if (!page.length) break;
    rows.push(...page);
    const last = page[page.length - 1];
    after = { rank: last.edhrec_rank, id: last.id };
    process.stderr.write(`\r  fetched ${rows.length}`);
  }
  process.stderr.write('\n');
  return rows.slice(0, n);
}

/**
 * A clause reduced to the SHAPE a rule would be written against.
 *
 * Card names, numbers, mana symbols, colours and creature types are what make
 * two instances of one missing rule look like two problems. What is left is the
 * verb and the frame, which is what a rule matches on.
 *
 * The first eight words, because a rule's regex is anchored at the start of the
 * clause and the tail is usually the part that varies.
 */
const shapeOf = line =>
  line
    .toLowerCase()
    .replace(/\{[^}]*\}/g, '{M}')
    .replace(/\b\d+\b/g, 'N')
    .replace(/[^a-z0-9{} ,.\-/]/g, '')
    .split(/[,.]/)[0]
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(' ');

const cards = await fetchTop(TOP);

const shapes = new Map();
let withText = 0;
let blindCards = 0;
let clauses = 0;

for (const card of cards) {
  if (!card.oracle_text && !(card.faces ?? []).some(f => f?.oracle_text)) continue;
  withText++;
  let trace;
  try {
    trace = compileWithTrace(card);
  } catch {
    continue;
  }
  const unparsed = trace.result.unparsed ?? [];
  if (unparsed.length) blindCards++;
  for (const u of unparsed) {
    clauses++;
    const key = shapeOf(u.text);
    if (!key) continue;
    let entry = shapes.get(key);
    if (!entry) {
      entry = { key, n: 0, best: Infinity, cards: [] };
      shapes.set(key, entry);
    }
    entry.n++;
    entry.best = Math.min(entry.best, card.edhrec_rank ?? 1e9);
    if (entry.cards.length < 6) entry.cards.push({ name: card.name, rank: card.edhrec_rank, text: u.text });
  }
}

console.log(`\ntop ${TOP} commander-legal; ${withText} carry rules text`);
console.log(`${blindCards} have at least one clause the compiler could not read`);
console.log(`${clauses} unread clauses across ${shapes.size} distinct shapes\n`);

/*
 * Ranked by CARD COUNT, and the best rank is printed beside it because those
 * two disagree usefully: a shape on 40 obscure cards and a shape on 4 cards one
 * of which is ranked 12 are different pieces of work, and only a person looking
 * at both can say which to do first.
 */
const ranked = [...shapes.values()].sort((a, b) => b.n - a.n || a.best - b.best);
console.log('shape                                                          cards   best rank');
for (const s of ranked.slice(0, 45)) {
  if (s.n < 2) continue;
  console.log(`  ${s.key.slice(0, 58).padEnd(60)} ${String(s.n).padStart(4)}   ${s.best}`);
}

const singles = ranked.filter(s => s.n === 1);
console.log(`\n${singles.length} shapes appear on exactly one card. The 25 most played:`);
for (const s of singles.sort((a, b) => a.best - b.best).slice(0, 25)) {
  console.log(`  ${String(s.best).padStart(5)}  ${s.cards[0].name.padEnd(28)} ${s.cards[0].text.slice(0, 90)}`);
}

if (SHOW) {
  console.log(`\n--- every unread clause whose shape contains "${SHOW}" ---`);
  for (const s of ranked) {
    if (!s.key.includes(SHOW)) continue;
    console.log(`\n  ${s.n}x  ${s.key}`);
    for (const c of s.cards) console.log(`      ${String(c.rank).padStart(6)}  ${c.name}: ${c.text.slice(0, 120)}`);
  }
}
