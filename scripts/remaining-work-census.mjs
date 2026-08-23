/**
 * WHAT IS GENUINELY LEFT, ranked by the REASON a card is refused.
 *
 * This script GRADES NOTHING. It reads the verdict file the real run wrote
 * (`scratch/verify-card-verdicts.json`, produced by
 * `verify-ability-coverage.mjs` under DM_CARD_DUMP=1) and re-reads the compiler
 * only to recover the TEXT behind a refusal, which the verdict row does not
 * carry. Every verdict printed here is the one that run printed. If this file
 * and that one ever disagree on a count, this file is wrong.
 *
 * WHY IT EXISTS
 * -------------
 * "AUTOMATED 4,628" is a number. It is not a plan. A plan needs to know which
 * WALL each of the other 26,434 cards hits, and the class ranking that already
 * exists answers a narrower question: which effect class is missing. Most cards
 * are not refused for a missing effect class. They are refused for a paragraph
 * nobody can read, or for a live ability with no caller, or for a decision
 * nothing offers, and those are four different months of work.
 *
 * THE TWO COLUMNS, AND WHY BOTH
 * -----------------------------
 * HOLDS  — the reason appears among this card's blockers. Overlapping, so the
 *          column sums to more than the corpus. It is the size of the topic.
 * SOLE   — the reason is the ONLY blocker on the card, so fixing it and nothing
 *          else clears the card's current refusal. Non-overlapping.
 *
 * SOLE is the column a plan is built from and HOLDS is the column that misleads
 * you. A reason with a large HOLDS and a small SOLE is a reason that is real,
 * common, and worth almost nothing on its own, because every card carrying it
 * carries something else too.
 *
 * WHAT SOLE DOES NOT CLAIM
 * ------------------------
 * SOLE says the card would clear the refusal it currently has. It does NOT say
 * the card would then be AUTOMATED. A card whose only blocker is an unparsed
 * paragraph still has to compile to a live consumer and still has to survive
 * the behaviour probe once it does, and neither can be known before the
 * grammar for that paragraph exists. So SOLE is an UPPER BOUND on what a fix
 * unlocks, it is labelled one on every line that prints it, and a plan that
 * treated it as a forecast would be the same mistake this file was written to
 * stop.
 *
 * Usage: node --experimental-strip-types scripts/remaining-work-census.mjs
 * Reads two local files. No network, no model, no grading.
 */

import { createReadStream, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../src/lib/cards/abilities/compiler.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERDICTS = join(ROOT, 'scratch', 'verify-card-verdicts.json');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT = join(ROOT, 'scratch', 'remaining-work-census.json');

if (!existsSync(VERDICTS)) {
  console.error(
    `Missing ${VERDICTS}.\n` +
      `Run:  DM_CARD_DUMP=1 node --experimental-strip-types scripts/verify-ability-coverage.mjs`
  );
  process.exit(1);
}

const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const pct = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));

const dump = JSON.parse(readFileSync(VERDICTS, 'utf8'));
const byOracle = new Map(dump.cards.map(c => [c.o, c]));
const POOL = dump.pool;

/* ------------------------------------------------------------------ *
 * 1. Recover the TEXT behind each refusal
 *
 * Only for cards the verdict file says are refused, and only to read
 * `result.unparsed[].reason` and the `{do:manual}` verbs. No verdict is
 * recomputed here and no verdict is compared: this loop cannot change a count.
 * ------------------------------------------------------------------ */

async function* rows(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield JSON.parse(line);
}

/** Every `do:` verb reachable from an effect tree, however deeply nested. */
function verbsIn(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const x of node) verbsIn(x, out); return out; }
  if (typeof node.do === 'string') out.push(node.do);
  for (const v of Object.values(node)) if (v && typeof v === 'object') verbsIn(v, out);
  return out;
}

/**
 * The manual marker's SUBJECT — the sentence the compiler read up to and gave
 * up inside. `{do:'manual'}` carries the source line, and the line is the only
 * thing that says what would have to be written.
 */
function manualLines(abilities) {
  const out = [];
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const x of node) walk(x); return; }
    if (node.do === 'manual') out.push(String(node.text ?? node.raw ?? node.note ?? '').trim());
    for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
  };
  walk(abilities);
  return out.filter(Boolean);
}

const textOf = new Map();      // oracle id -> { unparsedReasons, unparsedLines, manualLines, types }
let scanned = 0;

for await (const card of rows(SRC)) {
  const row = byOracle.get(card.oracle_id);
  if (!row) continue;
  if (row.v !== 'SILENT' && row.v !== 'PROMPTABLE') continue;
  if (textOf.has(card.oracle_id)) continue;
  if (row.u === 0 && row.m === 0) continue;   // nothing textual to recover
  const t = compileWithTrace(card);
  textOf.set(card.oracle_id, {
    unparsedReasons: [...new Set(t.result.unparsed.map(u => String(u.reason ?? 'unknown')))],
    unparsedLines: t.result.unparsed.map(u => String(u.text ?? '')),
    manual: manualLines(t.result.abilities),
    type: String(card.type_line ?? ''),
  });
  scanned++;
}

/* ------------------------------------------------------------------ *
 * 2. The reason families
 *
 * One function, so the grouping is in one place and can be argued with. A
 * family is a UNIT OF WORK: two blockers share a family when one engineer
 * fixing one of them fixes the other, and not otherwise. That is why
 * "advisory keyword" is one row across 150 keyword names (one predicate, one
 * consumer) while "no event derived" is split by EVENT (each event is its own
 * derivation in a different file).
 * ------------------------------------------------------------------ */

function deadFamily(why) {
  if (/^advisory keyword /.test(why)) return 'keyword compiled, but no consumer ever asks about it';
  if (/^grants ".*", which combat\.ts never asks about/.test(why)) return 'keyword compiled, but no consumer ever asks about it';
  if (/is not in card\.keywords/.test(why)) return 'keyword compiled, but no consumer ever asks about it';
  if (/^restriction ".*": collected, never read/.test(why)) return 'combat and untap restriction collected, never read';
  if (/^replacement:/.test(why)) return 'replacement effect the engine derives no result for';
  if (/^mana:/.test(why)) return 'mana ability, because mana.ts counts untapped sources instead';
  if (/^cost-modify:/.test(why)) return 'cost change that reads turn history';
  if (/is named by to-actions\.ts and never resolved/.test(why)) return 'effect verb named but never resolved';
  if (/^activated: activatedAbilitiesOf has no caller/.test(why)) return 'activated abilities have no caller';
  if (/^spell:.*no surface announces a target/.test(why)) return 'targeted spell, no surface announces the target';
  if (/^spell: nothing runs a compiled spell/.test(why)) return 'compiled spells do not run on resolution';
  if (/^trigger not owned: another clause on the card disqualified it/.test(why)) {
    return 'trigger ownership is all or nothing: one bad clause kills every trigger on the card';
  }
  const ev = /^trigger not owned: the engine derives no event for "(.+)"/.exec(why);
  if (ev) return `no event derived for "${ev[1]}"`;
  if (/^trigger not owned: optional \("you may"\)/.test(why)) return 'a "you may" trigger, and nothing offers the yes or the no';
  if (/^trigger not owned: "up to"/.test(why)) return 'an "up to" target, and nothing can answer "none"';
  if (/^trigger not owned: needs turn history/.test(why)) return 'trigger needs turn history nothing folds yet';
  if (/^trigger not owned: needs \d+ targets announced at once/.test(why)) return 'needs two targets announced at once';
  if (/^trigger not owned: "that player"/.test(why)) return 'event names no single player for "that player"';
  if (/^trigger not owned:/.test(why)) return 'trigger not owned, other';
  return `other: ${why}`;
}

function decisionFamily(why) {
  if (/^activated: the target is asked for/.test(why)) return 'a targeted activated ability, and the target IS offered';
  if (/^trigger: the target is asked for/.test(why)) return 'a targeted trigger, and the target IS offered';
  if (/contains choose-mode/.test(why)) return 'a mode, and no shipped surface draws the options';
  if (/contains may/.test(why)) return 'a "you may", and nothing offers the yes or the no';
  if (/optional trigger/.test(why)) return 'a "you may", and nothing offers the yes or the no';
  if (/contains /.test(why)) return `a decision nothing offers: ${why.replace(/^\w+ contains /, '')}`;
  return `decision, other: ${why}`;
}

/**
 * The behaviour probe's refusal, grouped by WHOSE fault it is, which is the
 * whole point of this row and the thing the probe itself cannot say.
 *
 * The probe runs one fixed seven object board. A card that announces a target
 * of a type that board does not hold is refused, and that refusal is about the
 * BOARD and not about the card. That is a defect in the instrument and it is
 * separated here so nobody spends a month on cards that already work.
 */
function probeFamily(row) {
  const lines = [...(row.df ?? []), ...(row.ub ?? [])].map(s => s.replace(/^\w*\d*: /, ''));
  const has = re => lines.some(l => re.test(l));
  if (has(/announces \d+ target\(s\) and its effects read only/)) {
    return 'the card announces a target no compiled effect reads (a compiler defect)';
  }
  if (has(/needs 2 targets at once, which the engine cannot announce/)) {
    return 'needs two targets announced at once, which announce.ts cannot do';
  }
  if (has(/There is nothing this could target/)) {
    return 'PROBE BOARD DEFECT: the seven object board holds no legal target of that type';
  }
  if (has(/nothing to pump/)) return 'PROBE BOARD DEFECT: nothing on the board to pump';
  if (has(/had nothing left to attach to|nothing to gain control of/)) {
    return 'PROBE BOARD DEFECT: the board holds no object of the kind the effect needs';
  }
  if (has(/the object this card is about was never bound/)) {
    return 'the ability reads its own source and the probe never bound one';
  }
  if (has(/delayed trigger .* cannot be stored|cannot do mid-combat/)) {
    return 'a delayed or mid-combat effect the engine cannot represent yet';
  }
  if (has(/sacrifices \d+ of \d+ eligible/)) return 'a cost choice nothing offers';
  if (has(/asks a question the engine cannot answer here/)) return 'a cost choice nothing offers';
  if (has(/translated XMage body stopped on a decision/)) return 'the translated XMage body stopped on a decision';
  /*
   * The three refusals added on the adversarial review of 23 Aug 2026. Named
   * here rather than left in the unclassified bucket because a card refused for
   * one of them WORKS in every other respect: its effects ran and produced
   * actions. Lumping it in with a card the compiler cannot read would point a
   * month of effort at the wrong thing. All three are jobs for a SURFACE or for
   * the XMage translator, not for the grammar.
   */
  if (has(/a "you may", and nothing in the product offers/)) {
    return 'it runs, and its "you may" is a question nothing offers';
  }
  if (has(/a mode, and no shipped surface draws the options/)) {
    return 'it runs, and its mode is a question no surface draws';
  }
  if (has(/translated XMage body produced no action and gave no reason/)) {
    return 'it runs, and one clause is an XMage body that did nothing silently';
  }
  if (row.p === 'silent') return 'RAN AND PRODUCED NOTHING, with nothing said about why';
  if (row.p === 'threw') return 'the ability threw';
  return `probe refusal, unclassified (${row.p})`;
}

function unparsedFamily(reason) {
  const named = {
    'unrecognised': 'a paragraph the grammar has no rule for at all',
    'ambiguous': 'a paragraph the grammar reads two ways and refuses to guess',
    'alt-cast': 'an alternative or additional cost, which is a casting rule and not an effect',
  };
  return named[reason] ?? `unparsed: ${reason}`;
}

/* ------------------------------------------------------------------ *
 * 3. Every blocker on every refused card
 * ------------------------------------------------------------------ */

const LAYER = {
  unparsed: 'THE COMPILER CANNOT READ THE CARD',
  manual: 'THE COMPILER READ IT AND HAS NO EFFECT FOR IT',
  dead: 'IT COMPILED, AND NOTHING RUNS IT',
  probe: 'IT COMPILED AND RAN, AND THE BEHAVIOUR WAS REFUSED',
  decision: 'IT WORKS, AND A DECISION ON IT IS ONE NOTHING OFFERS',
};

const failing = dump.cards.filter(c => c.v === 'SILENT' || c.v === 'PROMPTABLE');
const blockersOf = new Map();   // oracle id -> [{ layer, family }]

for (const row of failing) {
  const t = textOf.get(row.o);
  const b = [];

  if (row.u > 0) {
    const reasons = t ? t.unparsedReasons : ['unknown'];
    for (const r of new Set(reasons)) b.push({ layer: 'unparsed', family: unparsedFamily(r) });
  }
  if (row.m > 0) {
    b.push({ layer: 'manual', family: 'a sentence the compiler read up to and gave up inside' });
  }
  for (const why of new Set(row.d ?? [])) b.push({ layer: 'dead', family: deadFamily(why) });

  // The probe refusal is a blocker only when the verdict file says the card
  // was downgraded: SILENT, with nothing above to explain it.
  const wasDowngraded =
    row.v === 'SILENT' && row.u === 0 && row.m === 0 && (row.d ?? []).length === 0;
  if (wasDowngraded) b.push({ layer: 'probe', family: probeFamily(row) });

  // A decision is a blocker only on a card that is still PROMPTABLE. On a card
  // the probe downgraded, the decision is not what refused it.
  if (row.v === 'PROMPTABLE') {
    for (const why of new Set(row.dec ?? [])) b.push({ layer: 'decision', family: decisionFamily(why) });
  }

  if (b.length === 0) b.push({ layer: 'probe', family: `unexplained refusal (${row.v})` });
  blockersOf.set(row.o, b);
}

/* ------------------------------------------------------------------ *
 * 4. HOLDS and SOLE
 * ------------------------------------------------------------------ */

const holds = new Map();
const sole = new Map();
const layerHolds = new Map();
const layerSole = new Map();
const soleExamples = new Map();
let multi = 0;

for (const row of failing) {
  const b = blockersOf.get(row.o);
  const fams = [...new Set(b.map(x => x.family))];
  const layers = [...new Set(b.map(x => x.layer))];
  for (const f of fams) bump(holds, f);
  for (const l of layers) bump(layerHolds, l);
  if (fams.length === 1) {
    bump(sole, fams[0]);
    bump(layerSole, layers[0]);
    if (!soleExamples.has(fams[0])) soleExamples.set(fams[0], []);
    const ex = soleExamples.get(fams[0]);
    if (ex.length < 4) ex.push(row.n);
  } else {
    multi++;
  }
}

/* ------------------------------------------------------------------ *
 * 5. Report
 * ------------------------------------------------------------------ */

const L = [];
const say = s => { L.push(s); console.log(s); };
const N = failing.length;

say('='.repeat(92));
say('WHAT IS GENUINELY LEFT, ranked by the reason a card is refused');
say('='.repeat(92));
say('');
say(`verdicts read from   ${VERDICTS}`);
say(`generated by that run at  ${dump.generatedAt}`);
say(`pool ${POOL}   refused (SILENT or PROMPTABLE) ${N}   text recovered for ${scanned} of them`);
say(`this file grades nothing; every verdict above is the one that run printed`);
say('');
say(`tally from the verdict file: ${JSON.stringify(dump.tally)}`);
say('');

say('--- THE FIVE WALLS, by how many refused cards touch each ---');
say('(a card can touch more than one, so HOLDS does not sum to the corpus)');
say('');
say(`  ${'WALL'.padEnd(56)} ${'HOLDS'.padStart(7)} ${'SOLE'.padStart(7)}   ${'of refused'.padStart(10)}`);
for (const [k, v] of [...layerHolds.entries()].sort((a, b) => b[1] - a[1])) {
  say(`  ${LAYER[k].padEnd(56)} ${String(v).padStart(7)} ${String(layerSole.get(k) ?? 0).padStart(7)}   ${pct(v, N).padStart(9)}%`);
}
say(`  ${'cards blocked by two or more DIFFERENT things'.padEnd(56)} ${String(multi).padStart(7)} ${'-'.padStart(7)}   ${pct(multi, N).padStart(9)}%`);
say('');

say('--- THE RANKING, by REASON, ordered by SOLE ---');
say('');
say('HOLDS = the reason is one of this card\'s blockers (overlapping).');
say('SOLE  = it is the ONLY blocker, so fixing it alone clears this card\'s refusal.');
say('SOLE is an UPPER BOUND: a card that clears its refusal still has to compile to a');
say('live consumer and still has to survive the behaviour probe, and neither is known');
say('before the fix exists.');
say('');
say(`  ${'#'.padStart(3)}  ${'REASON'.padEnd(66)} ${'SOLE'.padStart(7)} ${'HOLDS'.padStart(7)}`);
let rank = 0;
for (const [k, v] of [...sole.entries()].sort((a, b) => b[1] - a[1])) {
  rank++;
  say(`  ${String(rank).padStart(3)}  ${k.slice(0, 66).padEnd(66)} ${String(v).padStart(7)} ${String(holds.get(k) ?? 0).padStart(7)}`);
  const ex = soleExamples.get(k) ?? [];
  if (ex.length) say(`       e.g. ${ex.join(', ').slice(0, 84)}`);
}
say('');

say('--- REASONS THAT NEVER STAND ALONE (HOLDS but no SOLE) ---');
say('(real, common, and worth nothing on their own: every card carrying one carries something else)');
const never = [...holds.entries()].filter(([k]) => !sole.has(k)).sort((a, b) => b[1] - a[1]);
for (const [k, v] of never.slice(0, 25)) say(`  ${String(v).padStart(6)}  ${k}`);
if (never.length === 0) say('  none');
say('');

/* The manual and unparsed rows are the two biggest and the two least specific,
   so each gets the line that says what the work actually is. */
say('--- INSIDE "THE COMPILER READ IT AND HAS NO EFFECT FOR IT", by the sentence ---');
const manualHist = new Map();
for (const row of failing) {
  if (row.m === 0) continue;
  const t = textOf.get(row.o);
  if (!t) continue;
  for (const line of new Set(t.manual.map(s => s.replace(/\b\d+\b/g, 'N').toLowerCase().slice(0, 72)))) bump(manualHist, line);
}
for (const [k, v] of top(manualHist, 25)) say(`  ${String(v).padStart(6)}  ${k}`);
say('');

say('--- INSIDE "THE COMPILER CANNOT READ THE CARD", by the first words of the line ---');
const unparsedHead = new Map();
for (const row of failing) {
  if (row.u === 0) continue;
  const t = textOf.get(row.o);
  if (!t) continue;
  for (const line of new Set(t.unparsedLines.map(s => s.split(/\s+/).slice(0, 4).join(' ').toLowerCase()))) {
    bump(unparsedHead, line);
  }
}
for (const [k, v] of top(unparsedHead, 25)) say(`  ${String(v).padStart(6)}  ${k}`);
say('');

writeFileSync(OUT, JSON.stringify({
  source: VERDICTS,
  sourceGeneratedAt: dump.generatedAt,
  pool: POOL,
  refused: N,
  tally: dump.tally,
  layerHolds: Object.fromEntries(layerHolds),
  layerSole: Object.fromEntries(layerSole),
  multiBlocked: multi,
  holds: Object.fromEntries([...holds.entries()].sort((a, b) => b[1] - a[1])),
  sole: Object.fromEntries([...sole.entries()].sort((a, b) => b[1] - a[1])),
  soleExamples: Object.fromEntries(soleExamples),
  manualHist: Object.fromEntries(top(manualHist, 80)),
  unparsedHead: Object.fromEntries(top(unparsedHead, 80)),
}, null, 2));
say(`wrote ${OUT}`);
