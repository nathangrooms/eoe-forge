/**
 * scripts/coverage/llm/merge-build-order.ts — two build lists, and where they disagree.
 *
 *   node --experimental-strip-types scripts/coverage/llm/merge-build-order.ts [--top 40]
 *
 * ## The two lists, and why neither is the answer on its own
 *
 * **The XMage-derived order** (`scripts/coverage/rank.mjs`, 1,822 entries) is a
 * dependency-ordered ranking of engine primitives, weighted by how many of OUR
 * cards each would newly represent. Its authority is that it is a census: every
 * number comes from parsing 32,168 real card implementations. Its blind spot is
 * that it can only see what XMage's architecture happens to name. A capability
 * XMage expresses by composing three existing classes does not appear on it at
 * all, however often our cards need it.
 *
 * **The model-derived list** (`llm_needed_primitives`) is what a model reached
 * for and could not find while compiling OUR catalogue into OUR DSL. Its
 * authority is that it is measured against the thing we actually have to build
 * against. Its blind spot is that it is a language model's naming, on cards it
 * may also have got wrong, with no dependency information and no notion of cost.
 *
 * **So the interesting output is not the union. It is the disagreement.**
 *   - Present in BOTH: high confidence. Two independent methods, over different
 *     corpora, asking for the same capability.
 *   - Model only: a gap our DSL has that XMage's class structure hides. These
 *     are the entries the previous phase could not have produced.
 *   - XMage only: either a real gap the model never met in this sample, or a
 *     capability our compiler already covers — which is exactly why the XMage
 *     ranker carries a `new` column and is ranked by it.
 *
 * ## Matching two naming schemes without pretending to be sure
 *
 * `fightTargetCreature` and `FightTargetEffect` are the same idea; nothing
 * mechanical can be certain of that. Names are reduced to token bags — camel
 * case split, lowercased, with the structural suffixes XMage appends to
 * everything (`Effect`, `Ability`, `Cost`, `Predicate`, `Impl`…) removed — and
 * matched on Jaccard overlap above a stated threshold. Every match is PRINTED
 * WITH ITS SCORE so a reader can overrule it, and the threshold is reported
 * rather than tuned until the overlap looks impressive.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const DATA = join(here, '.data');
mkdirSync(DATA, { recursive: true });

const argv = process.argv.slice(2);
const numArg = (name: string, fallback: number): number => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
};
const TOP = numArg('--top', 40);
/** Stated, not tuned. Two of three meaningful tokens shared. */
const MATCH_THRESHOLD = numArg('--threshold', 0.5);

/* ------------------------------------------------------------------ *
 * Name reduction
 * ------------------------------------------------------------------ */

/**
 * Words XMage appends for structure rather than meaning. Removing them is what
 * lets `FightTargetEffect` and `fightTargetCreature` meet in the middle; keeping
 * them would make every XMage name share a token with every other one, which is
 * worse than useless — it would manufacture agreement.
 */
const STRUCTURAL = new Set([
  'effect', 'effects', 'ability', 'abilities', 'impl', 'cost', 'costs', 'predicate',
  'filter', 'value', 'condition', 'target', 'targets', 'source', 'controller',
  'one', 'shot', 'oneshot', 'simple', 'base', 'static', 'continuous', 'triggered',
  'activated', 'permanent', 'permanents', 'card', 'cards', 'the', 'a', 'to', 'of',
  'and', 'or', 'with', 'from', 'this', 'that', 'all', 'each', 'need', 'needs',
]);

function tokens(name: string): Set<string> {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set(words.filter((w) => w.length > 2 && !STRUCTURAL.has(w)));
  // A name made entirely of structural words still has to match something, so
  // fall back to the unfiltered words rather than to the empty set — an empty
  // set scores 0 against everything and would be silently unmatchable.
  return out.size ? out : new Set(words);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / (a.size + b.size - shared);
}

/* ------------------------------------------------------------------ *
 * Inputs
 * ------------------------------------------------------------------ */

interface XmageEntry {
  rank: number;
  name: string;
  family: string;
  marginalNew: number;
  difficulty: string;
  capability: string | null;
}

const ORDER_FILE = join(here, '..', '.data', 'primitive-order.commander.new.json');
if (!existsSync(ORDER_FILE)) {
  throw new Error(`no XMage build order at ${ORDER_FILE}; run scripts/coverage/rank.mjs first`);
}
const xmage: XmageEntry[] = (
  JSON.parse(readFileSync(ORDER_FILE, 'utf8')) as { order: XmageEntry[] }
).order;

/**
 * The model side comes from the local run report rather than from Postgres, so
 * this script runs without credentials and over exactly the run just measured.
 * `llm_needed_primitives` is the same aggregation in SQL, over every run.
 */
const REPORT = join(DATA, 'run-report.json');
if (!existsSync(REPORT)) throw new Error(`no run report at ${REPORT}; run compile.ts first`);
const report = JSON.parse(readFileSync(REPORT, 'utf8')) as {
  tally: { needs: Record<string, { cards: number; why: string }>; requested: number };
};

const modelNeeds = Object.entries(report.tally.needs)
  .map(([primitive, row]) => ({ primitive, cards: row.cards, why: row.why }))
  .sort((a, b) => b.cards - a.cards);

console.log(`model asked for ${modelNeeds.length} distinct primitives over ${report.tally.requested} cards`);
console.log(`XMage order has ${xmage.length} entries; match threshold ${MATCH_THRESHOLD} Jaccard\n`);

/* ------------------------------------------------------------------ *
 * Match
 * ------------------------------------------------------------------ */

const xmageTokens = xmage.map((entry) => ({ entry, tokens: tokens(entry.name) }));

interface Matched {
  primitive: string;
  cards: number;
  why: string;
  xmageName: string;
  xmageRank: number;
  xmageNew: number;
  difficulty: string;
  score: number;
}

const matched: Matched[] = [];
const modelOnly: Array<{ primitive: string; cards: number; why: string; best: string; score: number }> = [];

for (const need of modelNeeds) {
  const bag = tokens(need.primitive);
  let best = { name: '(none)', rank: 0, marginalNew: 0, difficulty: '?', score: 0 };
  for (const candidate of xmageTokens) {
    const score = jaccard(bag, candidate.tokens);
    if (score > best.score) {
      best = {
        name: candidate.entry.name,
        rank: candidate.entry.rank,
        marginalNew: candidate.entry.marginalNew,
        difficulty: candidate.entry.difficulty,
        score,
      };
    }
  }
  if (best.score >= MATCH_THRESHOLD) {
    matched.push({
      primitive: need.primitive,
      cards: need.cards,
      why: need.why,
      xmageName: best.name,
      xmageRank: best.rank,
      xmageNew: best.marginalNew,
      difficulty: best.difficulty,
      score: Number(best.score.toFixed(2)),
    });
  } else {
    modelOnly.push({
      primitive: need.primitive,
      cards: need.cards,
      why: need.why,
      best: best.name,
      score: Number(best.score.toFixed(2)),
    });
  }
}

const matchedXmage = new Set(matched.map((m) => m.xmageName));
const xmageOnly = xmage.filter((entry) => entry.rank <= 300 && !matchedXmage.has(entry.name));

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const pad = (s: string | number, n: number): string => String(s).padEnd(n);

console.log('=== BOTH LISTS AGREE — highest confidence ===');
console.log('Two independent methods over different corpora asking for the same capability.\n');
console.log(`${pad('cards', 6)}${pad('model asked for', 36)}${pad('XMage entry', 34)}${pad('rank', 6)}${pad('new', 6)}${pad('diff', 5)}score`);
for (const m of matched.slice(0, TOP)) {
  console.log(
    `${pad(m.cards, 6)}${pad(m.primitive, 36)}${pad(m.xmageName, 34)}${pad(m.xmageRank, 6)}${pad(m.xmageNew, 6)}${pad(m.difficulty, 5)}${m.score}`,
  );
}
console.log(`\n(${matched.length} matched of ${modelNeeds.length})\n`);

console.log('=== MODEL ONLY — gaps the XMage-derived order does not surface ===');
console.log('These are the entries the previous phase could not have produced: capabilities');
console.log('OUR DSL lacks, that XMage expresses by composing classes rather than naming one.\n');
console.log(`${pad('cards', 6)}${pad('primitive', 40)}${pad('nearest XMage entry', 30)}score`);
for (const m of modelOnly.slice(0, TOP)) {
  console.log(`${pad(m.cards, 6)}${pad(m.primitive, 40)}${pad(m.best, 30)}${m.score}`);
}
console.log(`\n(${modelOnly.length} unmatched of ${modelNeeds.length})\n`);

console.log('=== XMAGE TOP 300 THE MODEL NEVER ASKED FOR ===');
console.log('Either a real gap this sample did not reach, or a capability our own compiler');
console.log('already handles — which is why the XMage ranker is ranked by NEW cards, not gross.\n');
console.log(`${pad('rank', 6)}${pad('primitive', 38)}${pad('family', 16)}${pad('new', 6)}diff`);
for (const entry of xmageOnly.slice(0, TOP)) {
  console.log(`${pad(entry.rank, 6)}${pad(entry.name, 38)}${pad(entry.family, 16)}${pad(entry.marginalNew, 6)}${entry.difficulty}`);
}
console.log(`\n(${xmageOnly.length} of the XMage top 300 unmatched)\n`);

writeFileSync(
  join(DATA, 'merged-build-order.json'),
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      matchThreshold: MATCH_THRESHOLD,
      cardsSampled: report.tally.requested,
      modelPrimitives: modelNeeds.length,
      matched,
      modelOnly,
      xmageTop300Unmatched: xmageOnly.map((e) => ({
        rank: e.rank, name: e.name, family: e.family, marginalNew: e.marginalNew, difficulty: e.difficulty,
      })),
    },
    null,
    1,
  ),
);
console.log(`wrote ${join(DATA, 'merged-build-order.json')}`);
