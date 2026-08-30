/**
 * Coverage over the commanders THE APP ACTUALLY OFFERS.
 *
 * Owner, 2026-08-30: "3411 listed on the deck generator page".
 *
 * That number does not come from our database. `buildCommanderQuery` in
 * src/components/ai-builder/commander-query.ts asks SCRYFALL for
 * `is:commander`, live, so the picker's list is Scryfall's list. Measuring
 * coverage against our own `cards_unique` therefore answers a different
 * question from the one that matters, and answers it flatteringly: our census
 * counted 3,384, missed 61 of Scryfall's and wrongly counted 34 of its own.
 *
 * The 61 we missed are Backgrounds and legendary Vehicles. A Background never
 * says "can be your commander"; the PARTNER says "Choose a Background", so a
 * predicate that reads the card's own text can never find one. The 34 we added
 * are meld halves and flip cards, where the back face is legendary and the
 * front is not, so nobody can start a game with them.
 *
 * So this walks Scryfall's own list, computes the plan from SCRYFALL'S text
 * rather than ours, and reports two separate failures that a single percentage
 * would hide:
 *
 *   NO PLAN        we hold the card and have nothing to say about it.
 *   NOT IN OUR DB  the picker offers it and the generator cannot build it at
 *                  all, because the catalogue does not have the card. That is
 *                  a sync problem, not a knowledge problem, and it is worse.
 *
 *   node --experimental-strip-types scripts/commander-coverage-scryfall.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

import { planForCommander } from '../src/engine/knowledge/behaviour.ts';
import { facetsForCard } from '../src/lib/deck/recommend/behaviour.ts';

const SUPABASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

/* Exactly the picker's predicate, plus commander legality, plus the paper and
   non-digital filters the catalogue itself is built on. */
const QUERY = 'is:commander legal:commander -is:digital game:paper';
const OUT = process.env.OUT ?? '.shots/quality/coverage-against-scryfall.json';
const CACHE = '.shots/quality/scryfall-commanders.json';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Scryfall's whole list, cached so re-measuring does not re-hammer them. */
async function scryfallCommanders() {
  if (fs.existsSync(path.resolve(CACHE))) {
    const cached = JSON.parse(fs.readFileSync(path.resolve(CACHE), 'utf8'));
    console.error(`  using cached Scryfall list (${cached.length} cards)`);
    return cached;
  }
  const out = [];
  let url =
    'https://api.scryfall.com/cards/search?q=' +
    encodeURIComponent(QUERY) +
    '&unique=cards';
  while (url) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DeckMatrix/1.0', Accept: 'application/json' },
    });
    const page = await res.json();
    if (!page.data) throw new Error(`Scryfall: ${JSON.stringify(page).slice(0, 200)}`);
    out.push(...page.data);
    process.stderr.write(`\r  fetched ${out.length}`);
    url = page.has_more ? page.next_page : null;
    /* Scryfall asks for 50 to 100 ms between requests. Honour it. */
    await sleep(120);
  }
  process.stderr.write('\n');
  fs.mkdirSync(path.dirname(path.resolve(CACHE)), { recursive: true });
  fs.writeFileSync(path.resolve(CACHE), JSON.stringify(out));
  return out;
}

/**
 * Which of those names our catalogue holds, AND THE TAGS IT HOLDS FOR THEM.
 *
 * The tags matter and leaving them out made this measurement wrong. Every
 * production caller passes `tags`, and `planForCommander` falls back to them
 * when there is no ability record. Measured: Edric, Spymaster of Trest returns
 * ONE want with tags and ZERO without, so a run without them reported him as
 * silent when production reads him. Thin is not the same as silent and this
 * script was reporting one as the other.
 */
async function inOurCatalogue(names) {
  const held = new Map();
  const BATCH = 120;
  for (let i = 0; i < names.length; i += BATCH) {
    const slice = names.slice(i, i + BATCH);
    const list = slice.map((n) => '"' + n.replace(/"/g, '\\"') + '"').join(',');
    const url =
      `${SUPABASE}/rest/v1/cards_unique?select=name,tags&name=in.(${encodeURIComponent(list)})`;
    const res = await fetch(url, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    if (!res.ok) {
      console.error(`\n  catalogue lookup failed: ${res.status} ${(await res.text()).slice(0, 120)}`);
      continue;
    }
    for (const row of await res.json()) held.set(row.name, row.tags ?? null);
    process.stderr.write(`\r  checked ${Math.min(i + BATCH, names.length)} / ${names.length}`);
  }
  process.stderr.write('\n');
  return held;
}

console.error('reading the list the deck generator actually offers...');
const cards = await scryfallCommanders();
console.error('checking which of them our catalogue holds...');
const held = await inOurCatalogue(cards.map((c) => c.name));

const silent = [];
const covered = [];
const absent = [];

for (const card of cards) {
  /* Scryfall's own shape, mapped to what the compiler reads. `oracle_text` is
     absent on multi-face cards and the words are in `card_faces`, which is the
     bug that hid 31.7% of our silence. */
  const row = {
    name: card.name,
    type_line: card.type_line ?? '',
    oracle_text: card.oracle_text ?? null,
    faces: card.card_faces ?? null,
    mana_cost: card.mana_cost ?? null,
    cmc: card.cmc ?? null,
    keywords: card.keywords ?? [],
    colors: card.colors ?? [],
    color_identity: card.color_identity ?? [],
    power: card.power ?? null,
    toughness: card.toughness ?? null,
    layout: card.layout ?? null,
  };

  const compiled = facetsForCard(row);
  const plan = planForCommander({
    name: card.name,
    typeLine: row.type_line,
    facets: compiled.facets,
    tags: held.get(card.name) ?? null,
    oracleText: row.oracle_text,
    faces: row.faces,
  });

  const entry = {
    name: card.name,
    rank: card.edhrec_rank ?? null,
    typeLine: row.type_line,
    layout: row.layout,
    inCatalogue: held.has(card.name),
    wants: plan.wants.length,
    floorOnly: plan.floorOnly === true,
    facets: compiled.facets,
    text: (row.oracle_text ?? (row.faces ?? []).map((f) => f.oracle_text ?? '').join(' // ')).slice(0, 200),
  };

  if (!entry.inCatalogue) absent.push(entry);
  if (plan.wants.length) covered.push(entry);
  else silent.push(entry);
}

const n = cards.length;
const pct = (x) => `${((x / n) * 100).toFixed(1)}%`;

console.log('');
console.log(`commanders the deck generator offers: ${n}`);
console.log(`  a plan with wants        ${covered.length} (${pct(covered.length)})`);
console.log(`  NO PLAN                  ${silent.length} (${pct(silent.length)})`);
console.log('');
console.log(`  NOT IN OUR CATALOGUE     ${absent.length} (${pct(absent.length)})`);
console.log(`    of those, no plan      ${absent.filter((a) => !a.wants).length}`);
console.log('    the generator cannot build these at all, whatever the engine knows');
console.log('');

/* COVERAGE IS NOT QUALITY, and reporting the first as the second is the exact
   mistake this measurement has already made once. 84.5% "covered" hid the fact
   that 21% of it was one identical fallback plan meaning "we could not read
   this card". So the distribution goes next to the headline, always. */
const onFloor = covered.filter((c) => c.floorOnly);
const thin = covered.filter((c) => !c.floorOnly && c.wants <= 1);
const real = covered.filter((c) => !c.floorOnly && c.wants >= 2);
const plans = new Map();
for (const c of covered) {
  const key = c.facets.filter((f) => !f.startsWith('type:') && !f.startsWith('sub:')).sort().join('|');
  plans.set(key, (plans.get(key) ?? 0) + 1);
}

console.log('OF THOSE COVERED, how well:');
console.log(`  read from the card       ${real.length} (${pct(real.length)})  two or more wants`);
console.log(`  one want only            ${thin.length} (${pct(thin.length)})  thin, and thin is not read`);
console.log(`  the floor                ${onFloor.length} (${pct(onFloor.length)})  the card says nothing, so we say the least`);
if (onFloor.length) {
  console.log(`    ${onFloor.slice(0, 8).map((c) => c.name).join(', ')}${onFloor.length > 8 ? ', ...' : ''}`);
}
console.log('');

const noText = silent.filter((s) => !s.text.trim());
console.log(`of the ${silent.length} with no plan:`);
console.log(`  print no rules text at all   ${noText.length}`);
console.log(`  have text we cannot read     ${silent.length - noText.length}`);
console.log('');
console.log('the most-built commanders with no plan:');
for (const s of silent
  .filter((s) => s.rank)
  .sort((a, b) => a.rank - b.rank)
  .slice(0, 15)) {
  console.log(`  #${String(s.rank).padStart(6)}  ${s.name.padEnd(40)} ${s.typeLine.slice(0, 34)}`);
}
if (absent.length) {
  console.log('');
  console.log('offered by the picker, absent from our catalogue:');
  for (const a of absent.slice(0, 12)) console.log(`  ${a.name}`);
  if (absent.length > 12) console.log(`  ...and ${absent.length - 12} more`);
}

fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
fs.writeFileSync(
  path.resolve(OUT),
  JSON.stringify({ offered: n, covered: covered.length, silent, absent }, null, 2)
);
console.log('');
console.log(`full table: ${OUT}`);
