/**
 * How much of EVERY card the engine reads. No slice, no top-N, no sampling.
 *
 *   node --experimental-strip-types scripts/coverage-census.mjs
 *   FRESH=1 node --experimental-strip-types scripts/coverage-census.mjs   refetch
 *   SHAPES=40 node --experimental-strip-types scripts/coverage-census.mjs
 *
 * The owner, 31 Aug 2026: *"i dont care about top 400, or top 15k cards,
 * everything should be covered, always, automatically"*.
 *
 * Every coverage figure this project has quoted has been over a slice — the top
 * 100, the top 2,000, the 400 most-built commanders — and a slice is how a
 * number stays comfortable. `compiler-gap-probe` measures the most played,
 * `commander-read-audit` measures commanders. Neither answers "how much of the
 * catalogue do we read", and that is the question.
 *
 * WHAT IT REPORTS, over all 33,032 rows of `cards_unique`:
 *
 *   a record at all       the compiler or the XMage port produced an ability
 *   THE WHOLE CARD        `coverage === 'full'`, the compiler's own verdict that
 *                         every paragraph was consumed. It does NOT mean the
 *                         reading was correct; those two must never be quoted
 *                         as one number.
 *   characters read       the share of non-blank normalised characters that fall
 *                         inside a consumed span. A continuous measure, because
 *                         a card that reads 95% of its text and one that reads
 *                         5% are both "partial" and are not the same problem.
 *   the work list         unread clause shapes ranked by how many CARDS each one
 *                         would unlock, over the whole catalogue rather than
 *                         over whichever cards happen to be popular.
 *
 * IT WRITES A JSON RECORD every run, to `.coverage/census-latest.json`, so the
 * next run can say which way the number moved. A coverage figure with nothing to
 * compare against is a number nobody can act on.
 *
 * The catalogue is cached to `scratch/catalogue-cache.json` because it is 33,032
 * rows and this gets run repeatedly while a rule is being written. The cache
 * holds the CARDS, never a verdict: every number is recomputed from the working
 * tree's compiler on every run.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const KEY = readFileSync(new URL('../scratch/anon.txt', import.meta.url), 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1';
const CACHE = new URL('../scratch/catalogue-cache.json', import.meta.url);
const OUT_DIR = new URL('../.coverage/', import.meta.url);
const OUT = new URL('census-latest.json', OUT_DIR);
const SHAPES = Number(process.env.SHAPES || 30);

const { compileWithTrace } = await import(
  new URL('../src/lib/cards/abilities/compiler.ts', import.meta.url).href
);

/*
 * Keyset by id, 500 a page. `cards_unique` rows are fat — oracle text, faces,
 * legalities, prices — so a bigger page is a slower page: 1000 measured at 3.4 s
 * against 0.44 s for 200. This is the whole catalogue, so it is 67 requests
 * either way and the only thing that matters is that none of them times out.
 */
async function fetchCatalogue() {
  const cols =
    'id,oracle_id,name,type_line,oracle_text,mana_cost,cmc,keywords,faces,layout,power,toughness';
  const rows = [];
  let after = '';
  for (;;) {
    const url =
      `${BASE}/cards_unique?select=${cols}&order=id.asc&limit=500` +
      (after ? `&id=gt.${after}` : '');
    const res = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    const page = await res.json();
    if (!page.length) break;
    rows.push(...page);
    after = page[page.length - 1].id;
    process.stderr.write(`\r  fetched ${rows.length}`);
  }
  process.stderr.write('\n');
  return rows;
}

let cards;
if (!process.env.FRESH && existsSync(CACHE)) {
  cards = JSON.parse(readFileSync(CACHE, 'utf8'));
  process.stderr.write(`  ${cards.length} cards from the cache (FRESH=1 to refetch)\n`);
} else {
  cards = await fetchCatalogue();
  writeFileSync(CACHE, JSON.stringify(cards));
  process.stderr.write(`  cached ${cards.length} cards\n`);
}

/**
 * A clause reduced to the shape a rule would be anchored on.
 *
 * Never returns an empty string. An earlier version of this in
 * `commander-read-audit` did, and "" came out as the single most common shape
 * in the report — 228 commanders — which is not a shape, it is the function
 * failing. Anything that reduces to nothing is grouped by what it actually is
 * so it stays countable.
 */
function shapeOf(line) {
  /*
   * AN ACTIVATED ABILITY IS SHAPED BY ITS EFFECT, not by its cost.
   *
   * The first run of this ranked "{mana}" as the single biggest cluster at
   * 1,129 cards, and it was the function failing again: a cost like
   * "{1}, {T}:" or "{B}, Sacrifice this creature:" contains a comma, the shape
   * splits on commas, so every multi-part cost collapsed to its first atom and
   * a thousand unrelated abilities landed in one bucket. Reading them shows
   * Ragged Playmate beside Feldon's Cane beside Martyr of Sands.
   *
   * A rule for these is anchored on what the ability DOES, so that is what the
   * shape has to be. The cost is kept as a prefix so the two halves stay
   * distinguishable in the report rather than being silently dropped.
   */
  const colon = line.indexOf(':');
  const head = colon > 0 ? line.slice(0, colon) : '';
  const isCost = colon > 0 && (head.includes('{') || /^(sacrifice|discard|exile|pay|tap|remove|reveal)/i.test(head.trim()));
  const body = isCost ? line.slice(colon + 1) : line;
  const costWords = isCost ? 'ACTIVATED: ' : '';

  const norm = body
    .toLowerCase()
    /* Lowercase, because the strip below removes anything outside [a-z0-9...]
       and an uppercase placeholder became "{ }" — which came out as the single
       most common shape in the first run, 1,129 cards, and is not a shape. */
    .replace(/\{[^}]*\}/g, '{mana}')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d+\b/g, 'N')
    .replace(/[^a-z0-9{} ,.'\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = norm.split(/[,.]/)[0].split(' ').filter(Boolean).slice(0, 8).join(' ');
  if (words) return costWords + words;
  if (!norm) return '(no words left after normalising: symbols or reminder text only)';
  return `${costWords}(short) ${norm.slice(0, 40)}`;
}

const total = cards.length;
let withText = 0;
let anyRecord = 0;
let fullCards = 0;
const coverage = new Map();
let charsTotal = 0;
let charsRead = 0;
const charBuckets = { '100%': 0, '75-99%': 0, '50-74%': 0, '25-49%': 0, '1-24%': 0, '0%': 0 };
const shapes = new Map();
let unreadClauses = 0;
let threw = 0;

const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

for (const card of cards) {
  const hasText =
    Boolean(card.oracle_text) || (card.faces ?? []).some(f => f?.oracle_text);
  if (!hasText) continue;
  withText++;

  let trace;
  try {
    trace = compileWithTrace(card);
  } catch {
    threw++;
    continue;
  }

  const result = trace.result;
  bump(coverage, result.coverage);
  if (result.abilities.length > 0) anyRecord++;
  if (result.coverage === 'full') fullCards++;

  /*
   * CHARACTERS, from the compiler's own span accounting. Its design contract is
   * that consumed spans plus unparsed spans cover every non-blank character of
   * the normalised text, so the share inside a consumed span is a real
   * measurement rather than an inference.
   */
  const text = trace.normalized?.text ?? '';
  const blank = new Set([' ', '\n', '\t']);
  let nonBlank = 0;
  for (const ch of text) if (!blank.has(ch)) nonBlank++;

  const covered = new Uint8Array(text.length);
  for (const [from, to] of trace.consumedSpans ?? []) {
    for (let i = from; i < to && i < text.length; i++) covered[i] = 1;
  }
  let read = 0;
  for (let i = 0; i < text.length; i++) if (covered[i] && !blank.has(text[i])) read++;

  if (nonBlank > 0) {
    charsTotal += nonBlank;
    charsRead += read;
    const pct = (read / nonBlank) * 100;
    if (pct >= 99.999) charBuckets['100%']++;
    else if (pct >= 75) charBuckets['75-99%']++;
    else if (pct >= 50) charBuckets['50-74%']++;
    else if (pct >= 25) charBuckets['25-49%']++;
    else if (pct > 0) charBuckets['1-24%']++;
    else charBuckets['0%']++;
  }

  for (const clause of result.unparsed ?? []) {
    unreadClauses++;
    const key = shapeOf(clause.text);
    let entry = shapes.get(key);
    if (!entry) {
      entry = { key, cards: 0, example: '' };
      shapes.set(key, entry);
    }
    entry.cards++;
    if (!entry.example) entry.example = card.name;
  }
}

const pct = (n, d) => `${((n / d) * 100).toFixed(1)}%`;

console.log(`\nEVERY CARD IN THE CATALOGUE. No slice.\n`);
console.log(`  rows                       ${total}`);
console.log(`  carry rules text           ${withText}  ${pct(withText, total)}`);
console.log(`  the compiler threw         ${threw}`);
console.log(`\nDID IT READ THE CARD (the compiler's own verdict):`);
for (const [k, v] of [...coverage].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(k).padEnd(10)} ${String(v).padStart(6)}  ${pct(v, withText)}`);
}
console.log(`  produced any record at all ${anyRecord}  ${pct(anyRecord, withText)}`);
console.log(`  THE WHOLE CARD             ${fullCards}  ${pct(fullCards, withText)}`);

console.log(`\nHOW MUCH OF THE TEXT, by character:`);
console.log(`  characters read            ${charsRead} of ${charsTotal}  ${pct(charsRead, charsTotal)}`);
for (const [k, v] of Object.entries(charBuckets)) {
  console.log(`  ${k.padEnd(10)} ${String(v).padStart(6)}  ${pct(v, withText)}`);
}

console.log(`\nUNREAD CLAUSES: ${unreadClauses}, across ${shapes.size} distinct shapes.`);
console.log(`THE WORK LIST, by how many CARDS each shape would unlock:\n`);
const ranked = [...shapes.values()].sort((a, b) => b.cards - a.cards);
for (const s of ranked.slice(0, SHAPES)) {
  console.log(`  ${String(s.cards).padStart(5)}  ${s.key.slice(0, 62).padEnd(64)} e.g. ${s.example}`);
}

/*
 * THE RECORD, so the next run can say which way it moved. A coverage figure
 * with nothing to compare against is a number nobody can act on, and the whole
 * reason this file exists is that every previous figure was a one-off over a
 * different slice.
 */
mkdirSync(OUT_DIR, { recursive: true });
const record = {
  cards: total,
  withText,
  anyRecord,
  full: fullCards,
  coverage: Object.fromEntries(coverage),
  charsRead,
  charsTotal,
  charBuckets,
  unreadClauses,
  distinctShapes: shapes.size,
  topShapes: ranked.slice(0, 60).map(s => ({ shape: s.key, cards: s.cards, example: s.example })),
};

if (existsSync(OUT)) {
  const before = JSON.parse(readFileSync(OUT, 'utf8'));
  const move = (label, now, then) => {
    const delta = now - then;
    const sign = delta > 0 ? '+' : '';
    console.log(`  ${label.padEnd(26)} ${then} -> ${now}  (${sign}${delta})`);
  };
  console.log(`\nSINCE THE LAST RUN:`);
  move('read the whole card', fullCards, before.full ?? 0);
  move('produced any record', anyRecord, before.anyRecord ?? 0);
  move('unread clauses', unreadClauses, before.unreadClauses ?? 0);
  move('cards in the catalogue', total, before.cards ?? 0);
}

writeFileSync(OUT, JSON.stringify(record, null, 2));
console.log(`\nwrote ${OUT.pathname.replace(/^\//, '')}`);
