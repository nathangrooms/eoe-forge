/**
 * What stands between the engine and reading EVERY card. The whole route, costed.
 *
 *   node --experimental-strip-types scripts/probe/route-to-full.mjs
 *   SHOW=40 ... longer work lists
 *
 * The owner: *"the next step is working out how we can read fully 100% of
 * cards"*.
 *
 * Every previous answer to this has been a slice, a shape list, or a ceiling
 * asserted without a denominator. This decomposes the whole catalogue into the
 * groups that need DIFFERENT WORK, because the single most misleading thing
 * about "68% of cards are not fully read" is that it sounds like one problem.
 *
 * THE FOUR GROUPS, and each needs a different kind of hand:
 *
 *   FULL           nothing to do.
 *   UNREAD ONLY    every gap is a clause no rule parsed. Fixing one means
 *                  writing a RULE, and rules are cheap when a shape recurs.
 *   MARKER ONLY    every gap is a clause that parsed into an ability and then
 *                  gave up inside it. Fixing one usually means extending the
 *                  DSL, which is dearer than a rule and often blocked on a
 *                  runtime primitive nobody has written.
 *   BOTH           needs both hands before it moves at all.
 *
 * And crucially it asks, for every non-full card, WHETHER XMAGE ALREADY KNOWS
 * IT. XMage holds behaviour records for 32,168 cards and is MIT licensed, so a
 * card XMage covers is a card whose route to full is a LOWERING rather than an
 * English rule. That is the difference between reading Magic and translating a
 * record somebody already wrote, and it decides the whole strategy.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const SHOW = Number(process.env.SHOW || 22);

const cards = JSON.parse(
  readFileSync(new URL('../../scratch/catalogue-cache.json', import.meta.url), 'utf8')
);

const { compileWithTrace } = await import(
  new URL('../../src/lib/cards/abilities/compiler.ts', import.meta.url).href
);
const { gapsOf, clauseShape, markerRule } = await import(
  new URL('../../src/lib/cards/abilities/shapes.ts', import.meta.url).href
);
const { XMAGE_LOWERED } = await import(
  new URL('../../src/lib/cards/xmage/lowered.generated.ts', import.meta.url).href
);

const xmageHas = oracleId => Boolean(oracleId && XMAGE_LOWERED[oracleId]);

const group = {
  full: { n: 0, xmage: 0 },
  unreadOnly: { n: 0, xmage: 0 },
  markerOnly: { n: 0, xmage: 0 },
  both: { n: 0, xmage: 0 },
  nothing: { n: 0, xmage: 0 },
};

/** Shape -> {cards, xmageCards}, so a work list can say what a rule would buy. */
const unreadShapes = new Map();
const markerShapes = new Map();
const markerRules = new Map();

const bump = (map, key, isXmage, example) => {
  let e = map.get(key);
  if (!e) e = { key, cards: 0, xmage: 0, example };
  e.cards += 1;
  if (isXmage) e.xmage += 1;
  map.set(key, e);
};

let withText = 0;
let threw = 0;

for (const card of cards) {
  const hasText = Boolean(card.oracle_text) || (card.faces ?? []).some(f => f?.oracle_text);
  if (!hasText) continue;
  withText++;

  let trace;
  try {
    trace = compileWithTrace(card);
  } catch {
    threw++;
    continue;
  }
  const r = trace.result;
  const hasX = xmageHas(card.oracle_id);
  const gaps = gapsOf(r.abilities, r.unparsed);

  if (r.coverage === 'full') {
    group.full.n++;
    if (hasX) group.full.xmage++;
    continue;
  }

  /* A card with no abilities AND nothing unparsed is a card the compiler could
     not even find a clause on. Rare, and it is its own kind of problem. */
  if ((r.abilities ?? []).length === 0 && gaps.unread.length === 0) {
    group.nothing.n++;
    if (hasX) group.nothing.xmage++;
    continue;
  }

  const hasUnread = gaps.unread.length > 0;
  const hasMarker = gaps.markers.length > 0;
  const key = hasUnread && hasMarker ? 'both' : hasUnread ? 'unreadOnly' : 'markerOnly';
  group[key].n++;
  if (hasX) group[key].xmage++;

  for (const sh of gaps.unread) bump(unreadShapes, sh, hasX, card.name);
  for (const sh of gaps.markers) bump(markerShapes, sh, hasX, card.name);
  for (const ru of gaps.markerRules) bump(markerRules, ru, hasX, card.name);
}

const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '-');

console.log(`\nTHE ROUTE TO READING EVERY CARD\n`);
console.log(`  cards with rules text      ${withText}`);
console.log(`  the compiler threw         ${threw}\n`);
console.log(`  ${'group'.padEnd(28)}${'cards'.padStart(8)}${'share'.padStart(9)}${'XMage has it'.padStart(14)}`);
for (const [k, v] of Object.entries(group)) {
  const label = {
    full: 'Read completely',
    unreadOnly: 'Blocked by unread clauses',
    markerOnly: 'Blocked by markers only',
    both: 'Blocked by both',
    nothing: 'No clause found at all',
  }[k];
  console.log(
    `  ${label.padEnd(28)}${String(v.n).padStart(8)}${pct(v.n, withText).padStart(9)}` +
      `${`${v.xmage} (${pct(v.xmage, v.n)})`.padStart(14)}`
  );
}

/*
 * THE CEILING, three ways, because "what would it take" has three answers and
 * quoting one of them alone is how this question keeps getting a wrong answer.
 */
const rulesOnly = group.full.n + group.unreadOnly.n;
const dslOnly = group.full.n + group.markerOnly.n;
const both = group.full.n + group.unreadOnly.n + group.markerOnly.n + group.both.n;

console.log(`\n  IF EVERY UNREAD CLAUSE GOT A RULE  ${rulesOnly}  ${pct(rulesOnly, withText)}`);
console.log(`  IF EVERY MARKER GOT A DSL MEMBER   ${dslOnly}  ${pct(dslOnly, withText)}`);
console.log(`  IF BOTH                            ${both}  ${pct(both, withText)}`);
console.log(`  ...the remainder is the ${group.nothing.n} cards no clause was found on.`);

const rank = map =>
  [...map.values()].sort((a, b) => b.cards - a.cards);

const table = (title, rows, note) => {
  console.log(`\n${title}\n`);
  if (note) console.log(`  ${note}\n`);
  console.log(`  ${'cards'.padStart(6)}${'XMage'.padStart(7)}   shape`);
  let covered = 0;
  for (const r of rows.slice(0, SHOW)) {
    covered += r.cards;
    console.log(`  ${String(r.cards).padStart(6)}${String(r.xmage).padStart(7)}   ${r.key.slice(0, 62).padEnd(64)}e.g. ${r.example}`);
  }
  const total = rows.reduce((n, r) => n + r.cards, 0);
  console.log(`\n  top ${Math.min(SHOW, rows.length)} of ${rows.length} shapes cover ${covered} of ${total} gap instances (${pct(covered, total)})`);
};

table(
  'UNREAD CLAUSES: write a RULE. Ranked by cards.',
  rank(unreadShapes),
  'The XMage column is how many of those cards XMage already has a record for, so a lowering would do instead.'
);

table('MARKERS: extend the DSL. Ranked by cards.', rank(markerShapes));
table('MARKERS BY THE RULE THAT GAVE UP, which is where the work goes.', rank(markerRules));

writeFileSync(
  new URL('../../scratch/route-to-full.json', import.meta.url),
  JSON.stringify(
    {
      withText,
      group,
      ceilings: { rulesOnly, dslOnly, both },
      unreadShapes: rank(unreadShapes).slice(0, 400),
      markerShapes: rank(markerShapes).slice(0, 400),
      markerRules: rank(markerRules).slice(0, 200),
    },
    null,
    1
  )
);
console.log(`\nwrote scratch/route-to-full.json`);
