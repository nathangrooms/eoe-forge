/**
 * THE BUILD ORDER, computed rather than guessed.
 *
 * `ability-layer-coverage.mjs` answers "what runs today". This script answers
 * "what do we build next, and exactly how many cards does each step finish".
 *
 * It runs the SAME real compiler over the SAME census pool, reuses the SAME
 * extracted normaliser, and then does one extra thing: for every SILENT card it
 * records the FULL SET of blocking work items, not just the count. With the
 * full set in hand, "how many cards does batch X finish" stops being an
 * estimate and becomes a set containment test.
 *
 * ## The unit of work
 *
 * A blocking line is turned into a work item by running the census normaliser
 * over that line and joining its clause patterns. So `{T}: Add {G}.` and
 * `{T}: Add {R}.` are ONE item (`cost| ~tap + effect| add ~mana`), because they
 * are one code path with an argument. That is the census's own unit, verified
 * against the census's own numbers by the self-check below.
 *
 * Some blockers are not clause patterns at all. A dead activated ability is not
 * blocked by its text, it is blocked by there being no call site. Those become
 * PLATFORM items, named separately and never disguised as parser work, because
 * a platform item costs engine work in files this workflow does not own.
 *
 * ## Derived blockers are not counted
 *
 * `abilityEngineOwns` is all-or-nothing per card: one unparsed clause kills
 * every trigger on the card. A trigger whose own `unrunnableReason` is null is
 * therefore only dead because a SIBLING clause is dead. Counting it as its own
 * blocker would double count the work. It is dropped, and the card is finished
 * when its real blockers are.
 *
 * ## Where a finished card lands
 *
 * Clearing the blockers does not make a card AUTOMATED if the card asks the
 * player something. A card is routed to PROMPTED when the compiler already
 * produced a decision effect, or when a blocking line carries a decision marker
 * in its text. PROMPTED additionally requires the prompt platform item, because
 * an understood choice with no control is PROMPTABLE, not PROMPTED. That rule
 * is what stops this script reporting the Aether Vial failure as a success.
 *
 * ## Greedy, and honest about it
 *
 * The ordering is greedy: at each step take the item that FINISHES the most
 * cards, breaking ties on the item that appears in the most unfinished cards.
 * Greedy is a lower bound. An optimal ordering of the same length finishes at
 * least as many cards, never fewer. No claim here is that this order is optimal.
 *
 * Local file only. No Supabase, no network at run time, no model.
 *
 * Usage:  node --experimental-strip-types scripts/coverage-batch-plan.mjs
 */

import { createReadStream, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace, assertClausesAccounted } from '../src/lib/cards/abilities/compiler.ts';
import { hasManualEffect, effectsOf } from '../src/lib/cards/abilities/dsl.ts';
import { unrunnableReason } from '../src/lib/game/abilities/trigger-bridge.ts';
import { keywordSupport } from '../src/lib/game/keywords.ts';

import {
  EXCLUDED_LAYOUTS,
  EXCLUDED_LAYOUTS_NON_GAME,
  EXCLUDED_SET_TYPES,
  creatureTypeSet,
  nameSet,
  dropReminders,
  clausesOf,
} from './census-normalise.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const CENSUS = join(ROOT, 'scratch', 'clause-census.json');
const COVERAGE = join(ROOT, 'scratch', 'ability-layer-coverage.json');
const OUT = join(ROOT, 'scratch', 'coverage-batch-plan.json');

const out = [];
const line = (s = '') => { out.push(s); console.log(s); };

async function* rows(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const l of rl) if (l.trim()) yield JSON.parse(l);
}

const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const pct = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));

/* ------------------------------------------------------------------ *
 * Ability status. Same switch as ability-layer-coverage.mjs, but it also
 * returns the ability kind and the trigger's OWN reason, which the batch
 * model needs in order to tell a real blocker from a derived one.
 * ------------------------------------------------------------------ */

function decisionReason(effects) {
  for (const e of effects ?? []) {
    if (e.do === 'may') return 'may';
    if (e.do === 'choose-mode') return 'choose-mode';
    if (e.do === 'unless-pays') return 'unless-pays';
    if (e.do === 'if') { const r = decisionReason(e.then) ?? decisionReason(e.else); if (r) return r; }
    if (e.do === 'for-each' || e.do === 'repeat') { const r = decisionReason(e.effects); if (r) return r; }
  }
  return null;
}

function abilityStatus(ability, ownsTriggers) {
  const effects = effectsOf(ability);
  const decision = decisionReason(effects);
  const kind = ability.kind;

  switch (kind) {
    case 'triggered': {
      if (ability.optional) return { status: 'decision', kind, why: 'optional trigger ("you may")' };
      if (decision) return { status: 'decision', kind, why: `trigger contains ${decision}` };
      if (!ownsTriggers) {
        const own = unrunnableReason(ability);
        return { status: 'dead', kind, own, why: `trigger not owned: ${own ?? 'another clause on the card disqualified it'}` };
      }
      return { status: 'run', kind, why: 'triggers.ts runs it via ownedTriggersOf' };
    }
    case 'static':
      if (decision) return { status: 'decision', kind, why: `static contains ${decision}` };
      return { status: 'run', kind, why: 'statics.ts applies it via layeredState' };
    case 'replacement': {
      const r = ability.result ?? {};
      const selfEnters = ability.event?.on === 'enters' && ability.selfReplacement;
      if (selfEnters && r.do === 'enters-tapped') return { status: 'run', kind, why: 'intrinsic.ts derives enters-tapped' };
      if (selfEnters && r.do === 'enters-with-counters' && typeof r.count === 'number' && r.count > 0) {
        return { status: 'run', kind, why: 'intrinsic.ts derives enters-with-counters' };
      }
      return { status: 'dead', kind, result: String(r.do ?? 'unknown'), why: 'replacement: intrinsic.ts only derives enters-tapped and a plain-number enters-with-counters' };
    }
    case 'keyword': {
      const kw = (ability.keyword ?? '').toLowerCase();
      if (keywordSupport(ability.keyword ?? '') === 'engine') return { status: 'run', kind, why: 'ENGINE_KEYWORDS: combat.ts applies it' };
      return { status: 'dead', kind, keyword: kw, why: `advisory keyword "${kw}": a badge, applied by hand` };
    }
    case 'activated': return { status: 'dead', kind, why: 'activated ability: activatedAbilitiesOf has no call site' };
    case 'spell': return { status: 'dead', kind, why: 'spell ability: nothing runs a compiled spell on resolution' };
    case 'mana': return { status: 'dead', kind, why: 'mana ability: mana.ts approximates sources instead' };
    default: return { status: 'dead', kind, why: `unknown ability kind ${kind}` };
  }
}

function paragraphStatuses(trace, ownsTriggers) {
  const { result, normalized, consumedSpans } = trace;
  const consumed = new Set(consumedSpans.map(([a, b]) => `${a}:${b}`));
  const unparsedSpans = new Set(result.unparsed.map(u => `${u.span[0]}:${u.span[1]}`));
  const unparsedReasonBySpan = new Map(result.unparsed.map(u => [`${u.span[0]}:${u.span[1]}`, u.reason]));

  const byText = new Map();
  const rank = { run: 0, decision: 1, dead: 2, manual: 3 };
  for (const ability of result.abilities) {
    const manual = hasManualEffect(effectsOf(ability));
    const st = manual
      ? { status: 'manual', kind: ability.kind, why: 'compiled to a {do:manual} marker' }
      : abilityStatus(ability, ownsTriggers);
    for (const rawLine of String(ability.text ?? '').split('\n')) {
      const key = rawLine.trim();
      if (!key) continue;
      const prev = byText.get(key);
      if (!prev || rank[st.status] > rank[prev.status]) byText.set(key, st);
    }
  }

  const res = [];
  for (const para of normalized.paragraphs) {
    const spanKey = `${para.span[0]}:${para.span[1]}`;
    if (unparsedSpans.has(spanKey)) { res.push({ para, status: 'unparsed', why: unparsedReasonBySpan.get(spanKey) }); continue; }
    if (consumed.has(spanKey)) {
      const st = byText.get(para.raw.trim());
      res.push(st ? { para, ...st } : { para, status: 'unmapped', why: 'consumed but not traceable to an ability' });
      continue;
    }
    res.push({ para, status: 'unaccounted', why: 'neither consumed nor unparsed' });
  }
  return res;
}

/* ------------------------------------------------------------------ *
 * Load the pool
 * ------------------------------------------------------------------ */

if (!existsSync(SRC)) { console.error(`Missing ${SRC}. The bulk file is cached; this script never downloads.`); process.exit(1); }

const all = [];
for await (const card of rows(SRC)) all.push(card);

const pool = [];
for (const card of all) {
  if (EXCLUDED_LAYOUTS.has(card.layout)) continue;
  if (EXCLUDED_SET_TYPES.has(card.set_type)) continue;
  if (EXCLUDED_LAYOUTS_NON_GAME.has(card.layout)) continue;
  if (card.digital) continue;
  if (!(card.games ?? []).includes('paper')) continue;
  pool.push(card);
}

const ctx = { types: creatureTypeSet(pool), names: nameSet(pool), selfNames: [] };

/* Self-check: same pool and same normaliser the census used. */
process.stderr.write(`  pool built: ${pool.length}\n`);
const census = existsSync(CENSUS) ? JSON.parse(readFileSync(CENSUS, 'utf8')) : null;
const selfCheck = { pool: pool.length };
if (census) {
  process.stderr.write('  self-check: re-running the census normaliser over the pool\n');
  const patternUses = new Map();
  let totalClauses = 0;
  for (const card of pool) {
    const cs = clausesOf(card, ctx, 'full', 'clause');
    totalClauses += cs.length;
    for (const c of cs) bump(patternUses, c);
  }
  selfCheck.recomputedClauses = totalClauses;
  selfCheck.recomputedPatterns = patternUses.size;
  selfCheck.censusClauses = census.runs.clauseFull.totalClauses;
  selfCheck.censusPatterns = census.runs.clauseFull.distinctPatterns;
  selfCheck.matches = totalClauses === census.runs.clauseFull.totalClauses
    && patternUses.size === census.runs.clauseFull.distinctPatterns;
}

/* ------------------------------------------------------------------ *
 * Work item ids
 * ------------------------------------------------------------------ */

const PROMPT_PLATFORM = 'PLATFORM | pending-decision state: the game can stop and wait for an answer';

/** The census clause patterns of one line, joined. This is the unit of work. */
const lineKeyCache = new Map();
function lineKey(card, raw) {
  const k = `${(card.keywords ?? []).join(',')} ${raw}`;
  const hit = lineKeyCache.get(k);
  if (hit !== undefined) return hit;
  const cs = clausesOf({ name: card.name, keywords: card.keywords, oracle_text: raw, card_faces: null }, ctx, 'full', 'clause');
  const v = cs.length ? cs.join(' + ') : dropReminders(raw).trim().toLowerCase();
  lineKeyCache.set(k, v);
  return v;
}

const DECISION_MARKER = /\byou may\b|\bchoose\b|\bup to\b|\bmay pay\b|\bof your choice\b|\byou could\b|\bmay have\b|\bdivided as you choose\b/i;

/**
 * Blocking paragraph -> work items. Returns [] for a DERIVED blocker, which is
 * satisfied for free once the card's real blockers are.
 */
function workItemsFor(s, card) {
  const P = lineKey(card, s.para.raw);
  switch (s.status) {
    case 'unparsed': return [`PARSE | ${P}`];
    case 'manual': return [`EFFECT | ${P}`];
    case 'unmapped': return [`PARSE | ${P}`];
    case 'unaccounted': return [`PARSE | ${P}`];
    case 'dead':
      switch (s.kind) {
        case 'keyword': return [`KEYWORD | ${s.keyword}`];
        case 'activated': return ['PLATFORM | activated-ability call site', `EFFECT | ${P}`];
        case 'spell': return ['PLATFORM | spell resolution runs compiled effects', `EFFECT | ${P}`];
        case 'mana': return ['PLATFORM | mana-ability call site', `EFFECT | ${P}`];
        case 'replacement': return [`PLATFORM | replacement result: ${s.result}`];
        case 'triggered':
          // own === null means the trigger itself is fine and only a sibling
          // clause killed it. Derived, not its own work.
          if (s.own == null) return [];
          return [`PLATFORM | trigger: ${s.own}`];
        default: return [`EFFECT | ${P}`];
      }
    default: return [];
  }
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

const verdicts = new Map();
const cards = [];           // every card that is not already done
let automatedNow = 0, promptableNow = 0, noText = 0, silentNow = 0;
let accountingFailures = 0;
let derivedOnly = 0;        // SILENT cards whose only blockers were derived

let scanned = 0;
for (const card of pool) {
  if (++scanned % 4000 === 0) process.stderr.write(`  compiled ${scanned}/${pool.length}\n`);
  const trace = compileWithTrace(card);
  const result = trace.result;
  try { assertClausesAccounted(trace); } catch { accountingFailures++; }

  const triggered = result.abilities.filter(a => a.kind === 'triggered');
  const owns = result.coverage === 'full' && triggered.length > 0 && triggered.every(a => unrunnableReason(a) === null);

  const statuses = paragraphStatuses(trace, owns);
  if (statuses.length === 0) { bump(verdicts, 'NO-TEXT'); noText++; continue; }

  const abilityVerdicts = result.abilities.map(a => hasManualEffect(effectsOf(a)) ? { status: 'manual' } : abilityStatus(a, owns));
  const anyManual = abilityVerdicts.some(v => v.status === 'manual');
  const anyDead = abilityVerdicts.some(v => v.status === 'dead');
  const anyDecision = abilityVerdicts.some(v => v.status === 'decision');

  let verdict;
  if (result.unparsed.length || anyManual || anyDead) verdict = 'SILENT';
  else if (anyDecision) verdict = 'PROMPTABLE';
  else if (result.abilities.length === 0) verdict = 'SILENT';
  else verdict = 'AUTOMATED';
  bump(verdicts, verdict);

  if (verdict === 'AUTOMATED') { automatedNow++; continue; }

  const blocking = statuses.filter(s => ['unparsed', 'manual', 'dead', 'unmapped', 'unaccounted'].includes(s.status));

  // Does finishing this card land it in PROMPTED rather than AUTOMATED?
  const needsPrompt = anyDecision
    || blocking.some(s => DECISION_MARKER.test(dropReminders(String(s.para.raw))));

  const items = new Set();
  for (const s of blocking) for (const w of workItemsFor(s, card)) items.add(w);
  if (needsPrompt) items.add(PROMPT_PLATFORM);

  if (verdict === 'PROMPTABLE') {
    promptableNow++;
    // Understood already; the only thing missing is the control.
    cards.push({ name: card.name, items: new Set([PROMPT_PLATFORM]), dest: 'PROMPTED' });
    continue;
  }

  silentNow++;
  if (items.size === 0) { derivedOnly++; }
  cards.push({ name: card.name, items, dest: needsPrompt ? 'PROMPTED' : 'AUTOMATED' });
}

/* ------------------------------------------------------------------ *
 * Dump the raw blocker sets.
 *
 * Everything below is analysis over this one table. Writing it out means a
 * scenario can be re-scored in seconds instead of re-compiling 32,469 cards,
 * and it means the numbers in the plan can be checked without trusting this
 * script's own arithmetic.
 * ------------------------------------------------------------------ */

writeFileSync(join(ROOT, 'scratch', 'coverage-blockers.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  script: 'scripts/coverage-batch-plan.mjs',
  pool: pool.length,
  selfCheck,
  start: { automatedNow, promptableNow, silentNow, noText },
  promptPlatform: PROMPT_PLATFORM,
  cards: cards.map(c => ({ n: c.name, d: c.dest, i: [...c.items] })),
}));
process.stderr.write(`  blocker table written: ${cards.length} unfinished cards\n`);

/* ------------------------------------------------------------------ *
 * Greedy ordering
 * ------------------------------------------------------------------ */

// index: item -> list of card indexes
const itemCards = new Map();
cards.forEach((c, i) => { for (const it of c.items) { let a = itemCards.get(it); if (!a) { a = []; itemCards.set(it, a); } a.push(i); } });

const remaining = cards.map(c => new Set(c.items));
const done = new Array(cards.length).fill(false);

// Cards blocked only by derived items finish immediately, at zero cost.
let freeAutomated = 0, freePrompted = 0;
cards.forEach((c, i) => {
  if (remaining[i].size === 0) { done[i] = true; if (c.dest === 'AUTOMATED') freeAutomated++; else freePrompted++; }
});

const order = [];
let cumAuto = 0, cumPrompt = 0;

/*
 * Incremental greedy with a lazy max-heap.
 *
 * `finish[item]` is the number of unfinished cards whose ONLY remaining blocker
 * is that item, so it is exactly the cards the item would finish right now.
 * `touch[item]` is the number of unfinished cards that still carry it, used to
 * break ties so a step with no immediate completions still makes progress.
 * Both are maintained incrementally, so the whole ordering costs one pass over
 * the blocker sets rather than one pass per step. The heap holds stale entries
 * and discards them on pop, which is cheaper than deleting them in place.
 *
 * This produces the identical order the naive scan produces; only the cost
 * differs. The naive version is O(items x cards) per step and does not finish.
 */
const finish = new Map();
const touch = new Map();
for (let i = 0; i < cards.length; i++) {
  if (done[i]) continue;
  for (const it of remaining[i]) bump(touch, it);
  if (remaining[i].size === 1) bump(finish, [...remaining[i]][0]);
}

const heap = [];
const hLess = (a, b) => (a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1]); // max on finish, then touch
function hPush(v) {
  heap.push(v);
  let i = heap.length - 1;
  while (i > 0) { const p = (i - 1) >> 1; if (hLess(heap[i], heap[p])) { [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } else break; }
}
function hPop() {
  if (!heap.length) return null;
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < heap.length && hLess(heap[l], heap[m])) m = l;
      if (r < heap.length && hLess(heap[r], heap[m])) m = r;
      if (m === i) break;
      [heap[i], heap[m]] = [heap[m], heap[i]];
      i = m;
    }
  }
  return top;
}

for (const it of itemCards.keys()) hPush([finish.get(it) ?? 0, touch.get(it) ?? 0, it]);

const taken = new Set();
for (;;) {
  let best = null;
  for (;;) {
    const top = hPop();
    if (top == null) break;
    const [f, t, item] = top;
    if (taken.has(item)) continue;
    const curF = finish.get(item) ?? 0, curT = touch.get(item) ?? 0;
    if (f !== curF || t !== curT) { hPush([curF, curT, item]); continue; }   // stale, refresh
    if (curT === 0) continue;                                                // nothing left to gain
    best = item;
    break;
  }
  if (best == null) break;
  taken.add(best);

  const bestTouch = touch.get(best) ?? 0;
  let a = 0, p = 0;
  for (const i of itemCards.get(best)) {
    if (done[i] || !remaining[i].has(best)) continue;
    remaining[i].delete(best);
    touch.set(best, (touch.get(best) ?? 1) - 1);
    if (remaining[i].size === 0) {
      done[i] = true;
      finish.set(best, (finish.get(best) ?? 1) - 1);
      if (cards[i].dest === 'AUTOMATED') a++; else p++;
    } else if (remaining[i].size === 1) {
      const sole = [...remaining[i]][0];
      bump(finish, sole);
      hPush([finish.get(sole) ?? 0, touch.get(sole) ?? 0, sole]);
    }
  }
  cumAuto += a; cumPrompt += p;
  order.push({ item: best, finished: a + p, automated: a, prompted: p, touched: bestTouch, cumAuto, cumPrompt, cumFinished: cumAuto + cumPrompt });
  if (order.length % 2000 === 0) process.stderr.write(`  greedy step ${order.length}, cards finished ${cumAuto + cumPrompt}\n`);
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const POOL = pool.length;
const baseAutomated = 1350; // ability-layer-coverage.mjs, after the behaviour probe
const coverageJson = existsSync(COVERAGE) ? JSON.parse(readFileSync(COVERAGE, 'utf8')) : null;

line('==========================================================');
line(' COVERAGE BATCH PLAN — greedy build order, exact counts');
line('==========================================================');
line();
line(`census pool                 ${POOL}`);
line(`self-check vs clause-census ${JSON.stringify(selfCheck)}`);
line(`assertClausesAccounted fails ${accountingFailures}`);
line();
line('-- starting position (this script, recomputed) --');
line(`  AUTOMATED (pre-probe)     ${automatedNow}`);
line(`  PROMPTABLE                ${promptableNow}`);
line(`  SILENT                    ${silentNow}`);
line(`  NO-TEXT                   ${noText}`);
if (coverageJson) line(`  cross-check vs ability-layer-coverage.json verdicts: ${JSON.stringify(coverageJson.verdicts)}`);
line();
line(`  SILENT cards whose only blockers were DERIVED (finish free): ${derivedOnly}`);
line();
line(`-- distinct work items across all unfinished cards: ${itemCards.size} --`);
const byClass = new Map();
for (const it of itemCards.keys()) bump(byClass, it.split(' | ')[0]);
for (const [k, v] of [...byClass].sort((a, b) => b[1] - a[1])) line(`  ${String(v).padStart(6)}  ${k}`);
line();

line('-- THE GREEDY ORDER: top 120 items by cards finished --');
line('   rank  finish   auto  prompt  touched   cumulative  item');
order.slice(0, 120).forEach((o, i) => {
  line(`   ${String(i + 1).padStart(4)}  ${String(o.finished).padStart(6)}  ${String(o.automated).padStart(5)}  ${String(o.prompted).padStart(6)}  ${String(o.touched).padStart(7)}   ${String(o.cumFinished).padStart(6)}      ${o.item.slice(0, 110)}`);
});
line();

line('-- THE CURVE: cards finished after N work items --');
line('   N      finished   ofPool   AUTOMATED_total  PROMPTED_total   SILENT_after');
const marks = [1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 15000, 20000, order.length];
const curve = [];
for (const n of marks) {
  if (n > order.length) continue;
  const o = order[n - 1];
  const fin = o.cumFinished + freeAutomated + freePrompted;
  const autoTot = baseAutomated + freeAutomated + o.cumAuto;
  const prTot = freePrompted + o.cumPrompt;
  const silentAfter = POOL - noText - autoTot - prTot;
  curve.push({ n, finished: fin, automatedTotal: autoTot, promptedTotal: prTot, silentAfter });
  line(`   ${String(n).padStart(6)} ${String(fin).padStart(9)}  ${pct(fin, POOL).padStart(6)}%  ${String(autoTot).padStart(15)}  ${String(prTot).padStart(14)}  ${String(silentAfter).padStart(12)} (${pct(silentAfter, POOL)}%)`);
}
line();
line(`   total work items in the order: ${order.length}`);
line(`   cards finished by the whole order: ${(order.length ? order[order.length - 1].cumFinished : 0) + freeAutomated + freePrompted}`);
line(`   cards never finished (blocked by an item with no path): ${done.filter(d => !d).length}`);
line();

// How many items to reach each pool-coverage target.
line('-- items required to reach a target (AUTOMATED + PROMPTED as share of pool) --');
for (const target of [0.10, 0.20, 0.25, 0.30, 0.40, 0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95]) {
  let hit = null;
  for (let i = 0; i < order.length; i++) {
    const tot = baseAutomated + freeAutomated + freePrompted + order[i].cumFinished;
    if (tot / POOL >= target) { hit = i + 1; break; }
  }
  line(`   ${String(Math.round(target * 100)).padStart(3)}%  ${hit == null ? 'not reachable by this order' : `${hit} work items`}`);
}
line();

// Marginal efficiency: cards finished per item, in windows.
line('-- MARGINAL EFFICIENCY: cards finished per work item, by window --');
const windows = [[1, 10], [11, 25], [26, 50], [51, 100], [101, 250], [251, 500], [501, 1000], [1001, 2000], [2001, 5000], [5001, 10000], [10001, order.length]];
for (const [a, b] of windows) {
  if (a > order.length) continue;
  const hi = Math.min(b, order.length);
  const gained = order[hi - 1].cumFinished - (a > 1 ? order[a - 2].cumFinished : 0);
  line(`   items ${String(a).padStart(6)}..${String(hi).padStart(6)}   cards ${String(gained).padStart(6)}   per item ${(gained / (hi - a + 1)).toFixed(2)}`);
}
line();

// Platform items called out on their own, wherever they landed.
line('-- PLATFORM items, in greedy rank order (these are engine work, not patterns) --');
order.forEach((o, i) => { if (o.item.startsWith('PLATFORM')) line(`   rank ${String(i + 1).padStart(5)}   finishes ${String(o.finished).padStart(5)}   touches ${String(o.touched).padStart(6)}   ${o.item}`); });
line();

line('-- KEYWORD items, in greedy rank order --');
order.forEach((o, i) => { if (o.item.startsWith('KEYWORD')) line(`   rank ${String(i + 1).padStart(5)}   finishes ${String(o.finished).padStart(5)}   touches ${String(o.touched).padStart(6)}   ${o.item}`); });
line();

// Items by how many unfinished cards they touch, regardless of finishing power.
line('-- top 60 items by CARDS TOUCHED (breadth, not completion) --');
const touchRank = [...itemCards.entries()].map(([it, idxs]) => [it, idxs.length]).sort((a, b) => b[1] - a[1]).slice(0, 60);
for (const [it, n] of touchRank) line(`   ${String(n).padStart(6)}  ${it.slice(0, 120)}`);
line();

writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  script: 'scripts/coverage-batch-plan.mjs',
  pool: POOL,
  selfCheck,
  start: { automatedNow, promptableNow, silentNow, noText, baseAutomatedAfterProbe: baseAutomated },
  free: { freeAutomated, freePrompted, derivedOnly },
  itemClasses: Object.fromEntries(byClass),
  order,
  curve,
  touchRank,
}, null, 2));
line(`written: ${OUT}`);
writeFileSync(join(ROOT, 'scratch', 'coverage-batch-plan.txt'), out.join('\n'));
