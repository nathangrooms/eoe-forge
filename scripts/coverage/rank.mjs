/**
 * scripts/coverage/rank.mjs — pass 3: the ranked, dependency-ordered build order.
 *
 *   node scripts/coverage/rank.mjs                    # defaults: --weight commander --rank-by new
 *   node scripts/coverage/rank.mjs --weight all       # every joined oracle_id, not just Commander-legal
 *   node scripts/coverage/rank.mjs --rank-by gross    # count every unlock, not only the new ones
 *   node scripts/coverage/rank.mjs --top 300
 *
 * THE OUTPUT OF THIS FILE IS A PLAN, NOT A COVERAGE CLAIM. Every number below is
 * "cards this primitive would unlock IF written correctly". Nothing here is
 * running.
 *
 * AUTOMATED — what the engine actually executes in a game — is a DIFFERENT number
 * and this file does not produce it. Note that `scripts/measure-ability-coverage.ts`
 * does not produce it either: that script measures the COMPILER (how much oracle
 * text turns into DSL with nothing dropped), which is REPRESENTABLE. Nobody has
 * yet measured what the engine runs end-to-end.
 *
 * ## What "unlocked" means, exactly
 * A card counts as unlocked when ALL THREE hold:
 *   1. it is CLEAN — no DSL capability gap (§CAPABILITIES in lib.mjs);
 *   2. it is PURELY DECLARATIVE — the card file declares no Java of its own;
 *   3. every behaviour primitive it names has been implemented.
 * (1) is an UPPER BOUND with ~5% optimistic bias (spike §4.1 hand-audit). (2) is
 * the gate that removes most of that bias, and it is why this ranker reports a
 * smaller unlockable set than the spike did — see §2 below. (3) is exact given
 * the import graph. No partial credit: half a card is a wrong card.
 *
 * ## Why the ranking is closure-greedy and not a frequency table
 * A pure greedy search stalls: cards name a median of 4 behaviour primitives
 * (p25 3, p75 6, p90 8, max 19 — measured over the 20,112 pure CLEAN cards), so
 * for the first few hundred picks almost every candidate completes nothing. A
 * pure frequency table (the spike's approach) never stalls but is blind: it will
 * rank a primitive highly that completes nothing until its three siblings arrive.
 * This ranker does both — it scores candidates by cards COMPLETED and breaks the
 * (very common) ties by frequency among still-incomplete cards. When a primitive
 * is picked, its unimplemented transitive dependencies are emitted immediately
 * ABOVE it, deepest first, so every entry's prerequisites precede it.
 *
 * ## Why gains are not additive, restated because it keeps being forgotten
 * `marginal` is the gain GIVEN EVERYTHING ABOVE IT. `solo` is the gain if that
 * primitive were the only one ever written. Summing either is meaningless:
 * measured here, 1,659 of 1,822 primitives unlock NOTHING alone, and the solo
 * column accounts for 6.5% of the real total. A card needs its whole primitive
 * set at once or it does not run.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { familyOf, FREE_SYMBOLS, isEngineSymbol, CAPABILITIES, pct } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '.data');

const argOf = (f, d) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] ?? d : d;
};
const WEIGHT = argOf('--weight', 'commander'); // 'commander' | 'all'
const TOP = Number(argOf('--top', '400'));
/**
 * What the greedy search maximises.
 *   'new'   — cards our own compiler does NOT already represent fully. THE
 *             DEFAULT, because it is the only objective that measures progress
 *             rather than restating where we already are.
 *   'gross' — every unlocked card. Kept because it is what the spike reported
 *             and the two orders must be comparable, but it is the wrong
 *             objective to plan from: its first thirty entries are keyword
 *             abilities our oracle-text compiler has parsed since day one.
 */
const OBJECTIVE = argOf('--rank-by', 'new');

const corpus = JSON.parse(readFileSync(join(DATA, 'corpus.json'), 'utf8'));
const joinData = JSON.parse(readFileSync(join(DATA, 'join.json'), 'utf8'));
const engineIdx = JSON.parse(readFileSync(join(DATA, 'engine.json'), 'utf8')).index;

/**
 * What our OWN oracle-text compiler already represents fully, per oracle_id.
 * Optional — the ranking runs without it, but every gross figure is then
 * uninterpretable, so the absence is shouted rather than defaulted away.
 */
let ourFull = null;
try {
  const oc = JSON.parse(readFileSync(join(DATA, 'our-coverage.json'), 'utf8'));
  // 'full'  — every clause modelled, no manual marker anywhere.
  // 'none'  — `deriveCoverage` returns this only when the card produced NO
  //           abilities AND NO unparsed clauses, i.e. it has no rules text:
  //           vanilla creatures, basic lands. There is nothing to automate, so
  //           counting them as a gap would invent 339 cards of work that does
  //           not exist and flatter every `new` figure below.
  const settled = new Set(
    Object.entries(oc.cards).filter(([, v]) => v.coverage === 'full' || v.coverage === 'none').map(([k]) => k),
  );
  ourFull = settled;
  const full = Object.values(oc.cards).filter((v) => v.coverage === 'full').length;
  console.log(`our compiler already settles ${settled.size} oracle_ids (${full} 'full' + ${settled.size - full} with no rules text)`);
} catch {
  console.log('!! no our-coverage.json — run `node --experimental-strip-types scripts/coverage/our-coverage.ts`');
  console.log('!! without it the `new` column is absent and gross unlock counts OVERSTATE the value of this work.');
}

const byCls = new Map(corpus.rows.map((r) => [r.cls, r]));

/* ------------------------------------------------------------------ *
 * 1. FRAMEWORK vs BEHAVIOUR — see the header of engine-index.mjs.
 *
 * Three mechanical rules, no hand-written name list:
 *   (a) abstract classes and interfaces are XMage's Java plumbing;
 *   (b) enums are parameter data, which our DSL carries as string literals;
 *   (c) `FooImpl` where `Foo` is an engine interface, and classes extending a
 *       `java.util` container, are container plumbing.
 * Anything else in the engine is a concrete class that DOES something, and doing
 * that thing is work somebody has to write.
 * ------------------------------------------------------------------ */

const JAVA_CONTAINERS = new Set(['ArrayList', 'HashMap', 'HashSet', 'LinkedHashMap', 'LinkedHashSet', 'EnumSet', 'ArrayDeque', 'TreeMap', 'TreeSet']);

function isFramework(fqn) {
  const e = engineIdx[fqn];
  if (!e) return false; // not in the engine tree at all — judged elsewhere
  if (e.abstract || e.interface || e.enum) return true;
  if (fqn.endsWith('Impl') && engineIdx[fqn.slice(0, -4)]?.interface) return true;
  if (e.superclass && JAVA_CONTAINERS.has(e.superclass)) return true;
  return false;
}

const isBehaviour = (fqn) => !FREE_SYMBOLS.has(fqn) && !isFramework(fqn);

/* ------------------------------------------------------------------ *
 * 2. The universe: OUR cards, joined, CLEAN, and PURE.
 *
 * `bespoke === 0` is the second gate and it is the one that buys precision. A
 * card can pass the capability detector and still declare its own
 * `class FooEffect extends OneShotEffect` — that is hand-written Java, it is not
 * composed of primitives, and implementing every primitive it imports would NOT
 * make it run. Those cards are exactly the ~5% false-CLEAN population the spike
 * found by hand-audit (Permeating Mass, Phyrexian Vindicator, Oreskos Explorer,
 * Plaguecrafter). Excluding them costs recall and is the correct trade: a card
 * that silently does the wrong thing is worse than a card on the manual list.
 * ------------------------------------------------------------------ */

const joined = joinData.rows.filter((r) => r.cls && byCls.has(r.cls));
const weighted = WEIGHT === 'commander' ? joined.filter((r) => r.commanderLegal) : joined;

const cards = [];
let notClean = 0;
let cleanButBespoke = 0;
for (const r of weighted) {
  const c = byCls.get(r.cls);
  if (c.caps.length) {
    notClean++;
    continue;
  }
  if (c.bespoke > 0) {
    cleanButBespoke++;
    continue;
  }
  cards.push({ oracle_id: r.oracle_id, name: r.name, prims: c.prims.filter(isBehaviour) });
}

console.log(`weighting: ${WEIGHT}   objective: ${OBJECTIVE}`);
console.log(`  our distinct oracle_id in scope         ${weighted.length}`);
console.log(`  needs >=1 DSL capability first          ${notClean}`);
console.log(`  CLEAN but carries hand-written Java     ${cleanButBespoke}  (excluded: precision over recall)`);
console.log(`  CLEAN and purely declarative            ${cards.length} (${pct(cards.length, weighted.length)}%)  <- the unlockable set`);

const universe = new Set();
for (const c of cards) for (const p of c.prims) universe.add(p);
console.log(`  distinct BEHAVIOUR primitives they name ${universe.size}`);

/**
 * Which DSL capability gates the most of OUR cards — the spike's §5 table, but
 * weighted by our catalogue instead of XMage's, and split the way that actually
 * decides an extension: cards this capability BLOCKS ALONE (nothing else in the
 * way) versus cards that merely touch it. Only the first column is what building
 * that one capability would buy.
 */
const capSole = new Map();
const capAny = new Map();
for (const r of weighted) {
  const c = byCls.get(r.cls);
  if (!c.caps.length) continue;
  for (const cap of c.caps) capAny.set(cap, (capAny.get(cap) ?? 0) + 1);
  if (c.caps.length === 1 && c.bespoke === 0) capSole.set(c.caps[0], (capSole.get(c.caps[0]) ?? 0) + 1);
}
console.log('\n=== DSL CAPABILITY GATES, weighted by OUR catalogue ===');
console.log('  cap   blocks-alone   touches   (blocks-alone also requires the card be purely declarative)');
for (const [cap] of [...capAny.entries()].sort((a, b) => (capSole.get(b[0]) ?? 0) - (capSole.get(a[0]) ?? 0))) {
  console.log(`  ${cap.padEnd(5)} ${String(capSole.get(cap) ?? 0).padStart(9)}   ${String(capAny.get(cap)).padStart(7)}   ${CAPABILITIES[cap]}`);
}

const rawUniverse = new Set();
for (const r of weighted) {
  const c = byCls.get(r.cls);
  if (c.caps.length || c.bespoke > 0) continue;
  for (const p of c.prims) rawUniverse.add(p);
}
console.log(`  (before the framework filter:           ${rawUniverse.size})`);

/* ------------------------------------------------------------------ *
 * 3. Per-primitive metadata: dependencies, capability tier, difficulty.
 * ------------------------------------------------------------------ */

const meta = new Map();
let unresolved = 0;
for (const fqn of universe) {
  const e = engineIdx[fqn];
  if (!e) {
    // Lives in Mage.Sets (a shared token class) rather than the engine tree.
    unresolved++;
    meta.set(fqn, { fqn, loc: null, deps: [], bespoke: 0, capability: null, resolved: false });
    continue;
  }
  const deps = [...new Set(e.imports.filter((i) => i !== fqn && universe.has(i)))];
  meta.set(fqn, {
    fqn,
    loc: e.loc,
    deps,
    bespoke: e.bespoke,
    superclass: e.superclass,
    capability: capabilityRequiredBy(fqn, e),
    resolved: true,
  });
}
console.log(`  primitives with no engine source        ${unresolved} (shared token classes in Mage.Sets)`);

/**
 * Which DSL capability implementing THIS primitive requires. Derived from the
 * primitive's own package and superclass, not from the cards that use it.
 */
function capabilityRequiredBy(fqn, e) {
  const sup = e.superclass ?? '';
  if (fqn.startsWith('mage.watchers') || sup === 'Watcher') return 'E6';
  if (sup === 'ReplacementEffectImpl' || sup === 'PreventionEffectImpl' || sup === 'RedirectionEffect') return 'E1';
  if (sup === 'ContinuousEffectImpl' || fqn.startsWith('mage.abilities.effects.common.continuous')) {
    return /\.(Boost|GainAbility)/.test(fqn) ? null : 'E2';
  }
  if (sup === 'ContinuousRuleModifyingEffectImpl' || sup === 'RestrictionEffect') return 'E3';
  if (sup === 'CostModificationEffectImpl' || sup === 'CostAdjuster') return 'E4';
  if (sup === 'AsThoughEffectImpl') return 'E5';
  if (fqn.startsWith('mage.abilities.dynamicvalue') || sup === 'DynamicValue') return 'E9';
  if (fqn.startsWith('mage.abilities.mana.conditional')) return 'E8';
  return null;
}

/* ------------------------------------------------------------------ *
 * 3. Difficulty — a measured heuristic, and labelled as one.
 *
 * Nobody has estimated 2,500 primitives by hand and this file will not pretend
 * they have. The band below is computed from three facts about the primitive's
 * own source: how long it is, whether it declares its own helper types, and how
 * many other primitives it pulls in. That correlates with effort; it is not a
 * substitute for looking at the file before you write it.
 * ------------------------------------------------------------------ */

function difficultyOf(m) {
  if (!m.resolved) return { band: '?', why: 'no engine source resolved' };
  const heavy = ['E1', 'E2', 'E3', 'E5'].includes(m.capability);
  if (heavy) return { band: 'L', why: `requires ${m.capability} (${CAPABILITIES[m.capability]})` };
  if (m.loc > 120 || m.bespoke >= 2 || m.deps.length >= 8)
    return { band: 'L', why: `${m.loc} LOC, ${m.bespoke} helper types, ${m.deps.length} deps` };
  if (m.loc > 55 || m.bespoke >= 1 || m.deps.length >= 4)
    return { band: 'M', why: `${m.loc} LOC, ${m.bespoke} helper types, ${m.deps.length} deps` };
  return { band: 'S', why: `${m.loc} LOC, ${m.deps.length} deps` };
}

/* ------------------------------------------------------------------ *
 * 4. Solo unlock — cards a primitive would complete if it were the only one.
 * ------------------------------------------------------------------ */

const soloCount = new Map();
for (const c of cards) {
  if (c.prims.length === 1) soloCount.set(c.prims[0], (soloCount.get(c.prims[0]) ?? 0) + 1);
}
const zeroPrimCards = cards.filter((c) => c.prims.length === 0).length;

/* ------------------------------------------------------------------ *
 * 5. Closure-greedy ranking.
 * ------------------------------------------------------------------ */

const done = new Set();
const remaining = cards.map((c) => c.prims.length);
/** Does our own compiler already represent this card fully? */
const alreadyOurs = cards.map((c) => (ourFull ? ourFull.has(c.oracle_id) : false));
const cardsByPrim = new Map(); // primitive -> card indices still incomplete
for (let i = 0; i < cards.length; i++) {
  for (const p of cards[i].prims) {
    if (!cardsByPrim.has(p)) cardsByPrim.set(p, []);
    cardsByPrim.get(p).push(i);
  }
}

/** Transitive in-universe deps of p that are not yet implemented. */
function closureOf(p) {
  const out = [];
  const seen = new Set([p]);
  const stack = [p];
  while (stack.length) {
    const cur = stack.pop();
    for (const d of meta.get(cur)?.deps ?? []) {
      if (done.has(d) || seen.has(d)) continue;
      seen.add(d);
      out.push(d);
      stack.push(d);
    }
  }
  // Deepest-first so a prerequisite is always listed above its dependant.
  return [...out].reverse().concat([p]);
}

const order = [];
let cumulative = 0;
let cumulativeNew = 0;
for (let i = 0; i < cards.length; i++) {
  if (remaining[i] === 0) {
    cumulative++;
    if (!alreadyOurs[i]) cumulativeNew++;
  }
}
const zeroPrimNew = cumulativeNew;
const candidates = [...universe];

while (order.length < universe.size) {
  // Cards one primitive away, bucketed by which primitive that is.
  const completes = new Map();
  const freq = new Map();
  for (let i = 0; i < cards.length; i++) {
    if (remaining[i] === 0) continue;
    // Under the 'new' objective a card our compiler already represents fully
    // scores nothing: unlocking it a second way is not progress.
    const worth = OBJECTIVE === 'gross' || !alreadyOurs[i] ? 1 : 0;
    let missing = null;
    for (const p of cards[i].prims) {
      if (done.has(p)) continue;
      freq.set(p, (freq.get(p) ?? 0) + worth);
      missing = p;
    }
    if (remaining[i] === 1 && missing) completes.set(missing, (completes.get(missing) ?? 0) + worth);
  }
  if (freq.size === 0) break;

  let best = null;
  let bestScore = -1;
  for (const p of candidates) {
    if (done.has(p)) continue;
    const score = (completes.get(p) ?? 0) * 1e6 + (freq.get(p) ?? 0);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (best === null) break;

  for (const p of closureOf(best)) {
    if (done.has(p)) continue;
    const before = cumulative;
    const beforeNew = cumulativeNew;
    done.add(p);
    for (const i of cardsByPrim.get(p) ?? []) {
      remaining[i]--;
      if (remaining[i] === 0) {
        cumulative++;
        if (!alreadyOurs[i]) cumulativeNew++;
      }
    }
    const m = meta.get(p);
    const d = difficultyOf(m);
    order.push({
      rank: order.length + 1,
      fqn: p,
      name: p.split('.').pop(),
      family: familyOf(p),
      solo: soloCount.get(p) ?? 0,
      marginal: cumulative - before,
      /** Newly unlocked cards our own compiler does NOT already represent fully. */
      marginalNew: cumulativeNew - beforeNew,
      cumulative,
      cumulativeNew,
      cumulativePct: Number(pct(cumulative, weighted.length)),
      cardsNaming: (cardsByPrim.get(p) ?? []).length,
      deps: m.deps,
      capability: m.capability,
      loc: m.loc,
      difficulty: d.band,
      difficultyWhy: d.why,
    });
  }
}

/* ------------------------------------------------------------------ *
 * 6. Report
 * ------------------------------------------------------------------ */

console.log(`\ncards unlocked with zero primitives (frame-only, e.g. vanilla creatures): ${zeroPrimCards}`);

/* Non-additivity, demonstrated rather than asserted. */
const soloSum = [...soloCount.values()].reduce((a, b) => a + b, 0);
console.log('\n=== WHY THE COLUMNS DO NOT ADD UP ===');
console.log(`  sum of every primitive's SOLO unlock:  ${soloSum + zeroPrimCards}`);
console.log(`  cards actually unlocked by ALL ${universe.size}:  ${order.length ? order[order.length - 1].cumulative : zeroPrimCards}`);
console.log(`  ratio: solo accounts for ${pct(soloSum + zeroPrimCards, order.length ? order[order.length - 1].cumulative : 1)}% of the real total.`);
console.log('  A card needs its whole primitive set at once. Summing either column is meaningless.');

console.log('\n=== COVERAGE CURVE, weighted by OUR catalogue ===');
console.log('  top N     cards unlocked    % in-scope     of which NEW (our compiler does not already cover)');
for (const N of [25, 50, 100, 150, 200, 300, 400, 600, 800, 1000, 1500, order.length]) {
  if (N > order.length || N < 1) continue;
  const row = order[N - 1];
  console.log(
    `  ${String(N).padStart(5)}    ${String(row.cumulative).padStart(8)}        ${String(row.cumulativePct).padStart(6)}%        ${ourFull ? String(row.cumulativeNew).padStart(7) : '      -'}`,
  );
}

console.log(`\n=== TOP ${TOP} — RANKED, DEPENDENCY-ORDERED ===`);
console.log('  solo = unlocks if it were the ONLY primitive ever written');
console.log('  marg = unlocks GIVEN everything ranked above it');
console.log('  new  = of `marg`, how many our own compiler does not already represent fully');
console.log('  dep  = how many already-ranked primitives it needs first\n');
console.log('rank  primitive                                  family          solo  marg   new    cum  dep  diff  needs');
for (const r of order.slice(0, Math.min(TOP, order.length))) {
  console.log(
    `${String(r.rank).padStart(4)}  ${r.name.slice(0, 40).padEnd(40)}  ${r.family.padEnd(14)}  ${String(r.solo).padStart(4)}  ${String(r.marginal).padStart(4)}  ${String(r.marginalNew).padStart(4)}  ${String(r.cumulative).padStart(5)}  ${String(r.deps.length).padStart(3)}  ${r.difficulty.padEnd(4)}  ${r.capability ?? ''}`,
  );
}

const famAgg = new Map();
for (const r of order.slice(0, 300)) {
  const a = famAgg.get(r.family) ?? { n: 0, marginal: 0 };
  a.n++;
  a.marginal += r.marginal;
  famAgg.set(r.family, a);
}
console.log('\n=== TOP 300 BY FAMILY ===');
for (const [f, a] of [...famAgg.entries()].sort((x, y) => y[1].marginal - x[1].marginal))
  console.log(`  ${f.padEnd(18)} ${String(a.n).padStart(4)} primitives   ${String(a.marginal).padStart(6)} cards`);

const diffAgg = new Map();
for (const r of order.slice(0, 300)) diffAgg.set(r.difficulty, (diffAgg.get(r.difficulty) ?? 0) + 1);
console.log('\n=== TOP 300 BY DIFFICULTY BAND ===');
for (const b of ['S', 'M', 'L', '?']) if (diffAgg.get(b)) console.log(`  ${b}: ${diffAgg.get(b)}`);

writeFileSync(
  join(DATA, `primitive-order.${WEIGHT}.${OBJECTIVE}.json`),
  JSON.stringify(
    {
      meta: {
        xmageCommit: corpus.meta.commit,
        weighting: WEIGHT,
        objective: OBJECTIVE,
        rankedAt: new Date().toISOString(),
        inScopeOracleIds: weighted.length,
        cleanCards: cards.length,
        distinctPrimitives: universe.size,
        zeroPrimCards,
      },
      order,
    },
    null,
    1,
  ),
);
console.log(`\nwrote ${join(DATA, `primitive-order.${WEIGHT}.${OBJECTIVE}.json`)}`);
