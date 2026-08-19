/**
 * SCENARIOS over the blocker table produced by `coverage-batch-plan.mjs`.
 *
 * ## Why this exists
 *
 * The plain greedy in `coverage-batch-plan.mjs` has a known and visible defect,
 * and it is better to name it than to quote its curve. Greedy scores an item by
 * how many cards it FINISHES right now. Some blockers only pay out in pairs:
 * a card reading `{T}: Add {G}.` is blocked by BOTH "there is no call site for
 * activated abilities" AND "no effect produces mana". Neither finishes a single
 * card on its own, so greedy scores both at zero and defers them. In the real
 * run `PLATFORM | activated-ability call site` landed at rank 14,963 while
 * touching 3,943 cards. That is an artefact of the scoring rule, not a fact
 * about the work.
 *
 * So this script re-scores the same table with a named set of items treated as
 * already paid for, and reports what the rest of the order looks like
 * afterwards. The cost of the granted set is stated, never hidden: it is engine
 * work in files the ability layer does not own.
 *
 * Nothing is re-derived here. It reads `scratch/coverage-blockers.json` and
 * does arithmetic on it. Every number traces back to a compiler run.
 *
 * Local file only. No Supabase, no network, no model.
 *
 * Usage:  node scripts/coverage-batch-scenarios.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IN = join(ROOT, 'scratch', 'coverage-blockers.json');
const OUT = join(ROOT, 'scratch', 'coverage-batch-scenarios.json');

const out = [];
const line = (s = '') => { out.push(s); console.log(s); };
const pct = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));

const data = JSON.parse(readFileSync(IN, 'utf8'));
const POOL = data.pool;
const NOTEXT = data.start.noText;
/** AUTOMATED after the behaviour probe in ability-layer-coverage.mjs. */
const BASE_AUTOMATED = 1350;
const PROMPT = data.promptPlatform;

const cards = data.cards.map(c => ({ name: c.n, dest: c.d, items: c.i }));

/* ------------------------------------------------------------------ *
 * Greedy, with a granted set
 * ------------------------------------------------------------------ */

function run(grantedList) {
  const granted = new Set(grantedList);
  const rem = cards.map(c => new Set(c.items.filter(i => !granted.has(i))));
  const done = rem.map(s => s.size === 0);

  let grantedAuto = 0, grantedPrompt = 0;
  done.forEach((d, i) => { if (d) { if (cards[i].dest === 'AUTOMATED') grantedAuto++; else grantedPrompt++; } });

  const itemCards = new Map();
  rem.forEach((s, i) => { for (const it of s) { let a = itemCards.get(it); if (!a) { a = []; itemCards.set(it, a); } a.push(i); } });

  const finish = new Map(), touch = new Map();
  rem.forEach((s, i) => {
    if (done[i]) return;
    for (const it of s) touch.set(it, (touch.get(it) ?? 0) + 1);
    if (s.size === 1) { const k = [...s][0]; finish.set(k, (finish.get(k) ?? 0) + 1); }
  });

  const heap = [];
  const hLess = (a, b) => (a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1]);
  const hPush = (v) => { heap.push(v); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hLess(heap[i], heap[p])) { [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } else break; } };
  const hPop = () => {
    if (!heap.length) return null;
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && hLess(heap[l], heap[m])) m = l;
        if (r < heap.length && hLess(heap[r], heap[m])) m = r;
        if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; }
    }
    return top;
  };
  for (const it of itemCards.keys()) hPush([finish.get(it) ?? 0, touch.get(it) ?? 0, it]);

  const order = [];
  const taken = new Set();
  let cumAuto = 0, cumPrompt = 0;
  for (;;) {
    let best = null;
    for (;;) {
      const top = hPop();
      if (top == null) break;
      const [f, t, item] = top;
      if (taken.has(item)) continue;
      const cf = finish.get(item) ?? 0, ct = touch.get(item) ?? 0;
      if (f !== cf || t !== ct) { hPush([cf, ct, item]); continue; }
      if (ct === 0) continue;
      best = item; break;
    }
    if (best == null) break;
    taken.add(best);
    const bt = touch.get(best) ?? 0;
    let a = 0, p = 0;
    for (const i of itemCards.get(best)) {
      if (done[i] || !rem[i].has(best)) continue;
      rem[i].delete(best);
      touch.set(best, (touch.get(best) ?? 1) - 1);
      if (rem[i].size === 0) { done[i] = true; finish.set(best, (finish.get(best) ?? 1) - 1); if (cards[i].dest === 'AUTOMATED') a++; else p++; }
      else if (rem[i].size === 1) { const s = [...rem[i]][0]; finish.set(s, (finish.get(s) ?? 0) + 1); hPush([finish.get(s), touch.get(s) ?? 0, s]); }
    }
    cumAuto += a; cumPrompt += p;
    order.push({ item: best, finished: a + p, automated: a, prompted: p, touched: bt, cumAuto, cumPrompt, cumFinished: cumAuto + cumPrompt });
  }

  return { granted: [...granted], grantedAuto, grantedPrompt, order, items: itemCards.size };
}

/** Three metrics after `n` further items, on top of a granted set. */
function metricsAt(res, n) {
  const o = n === 0 ? { cumAuto: 0, cumPrompt: 0, cumFinished: 0 } : res.order[Math.min(n, res.order.length) - 1];
  const auto = BASE_AUTOMATED + res.grantedAuto + o.cumAuto;
  const prompted = res.grantedPrompt + o.cumPrompt;
  const silent = POOL - NOTEXT - auto - prompted;
  return { n, automated: auto, prompted, silent, autoPct: pct(auto, POOL), promptPct: pct(prompted, POOL), silentPct: pct(silent, POOL) };
}

function report(label, grantedList, marks) {
  const res = run(grantedList);
  line();
  line('='.repeat(78));
  line(` SCENARIO: ${label}`);
  line('='.repeat(78));
  line(` granted up front (${grantedList.length} items, engine work, cost stated separately):`);
  for (const g of grantedList) line(`   - ${g}`);
  line();
  line(` cards finished by the granted set ALONE: ${res.grantedAuto + res.grantedPrompt}  (AUTOMATED +${res.grantedAuto}, PROMPTED +${res.grantedPrompt})`);
  const m0 = metricsAt(res, 0);
  line(` three metrics with the granted set and NO patterns:`);
  line(`   AUTOMATED ${String(m0.automated).padStart(6)} ${m0.autoPct.padStart(6)}%   PROMPTED ${String(m0.prompted).padStart(6)} ${m0.promptPct.padStart(6)}%   SILENT ${String(m0.silent).padStart(6)} ${m0.silentPct.padStart(6)}%`);
  line();
  line(` remaining work items: ${res.items}`);
  line();
  line(' top 40 pattern items after the grant');
  line('   rank  finish   auto  prompt  touched   cum   item');
  res.order.slice(0, 40).forEach((o, i) => {
    line(`   ${String(i + 1).padStart(4)}  ${String(o.finished).padStart(6)}  ${String(o.automated).padStart(5)}  ${String(o.prompted).padStart(6)}  ${String(o.touched).padStart(7)}  ${String(o.cumFinished).padStart(5)}   ${o.item.slice(0, 100)}`);
  });
  line();
  line(' curve after the grant');
  line('   N        AUTOMATED          PROMPTED           SILENT');
  for (const n of marks) {
    if (n > res.order.length) continue;
    const m = metricsAt(res, n);
    line(`   ${String(n).padStart(6)}   ${String(m.automated).padStart(6)} ${m.autoPct.padStart(6)}%    ${String(m.prompted).padStart(6)} ${m.promptPct.padStart(6)}%    ${String(m.silent).padStart(6)} ${m.silentPct.padStart(6)}%`);
  }
  const mEnd = metricsAt(res, res.order.length);
  line(`   ${String(res.order.length).padStart(6)}   ${String(mEnd.automated).padStart(6)} ${mEnd.autoPct.padStart(6)}%    ${String(mEnd.prompted).padStart(6)} ${mEnd.promptPct.padStart(6)}%    ${String(mEnd.silent).padStart(6)} ${mEnd.silentPct.padStart(6)}%   (everything)`);
  line();
  line(' items required to drive SILENT below a threshold');
  for (const t of [0.90, 0.80, 0.70, 0.60, 0.50, 0.40, 0.30, 0.20, 0.10, 0.05]) {
    let hit = null;
    for (let i = 1; i <= res.order.length; i++) { if (metricsAt(res, i).silent / POOL <= t) { hit = i; break; } }
    line(`   SILENT <= ${String(Math.round(t * 100)).padStart(3)}%   ${hit == null ? 'not reachable' : `${hit} pattern items`}`);
  }
  return { label, granted: grantedList, grantedAuto: res.grantedAuto, grantedPrompt: res.grantedPrompt, remainingItems: res.items,
    top: res.order.slice(0, 200), curve: marks.filter(n => n <= res.order.length).map(n => metricsAt(res, n)), all: metricsAt(res, res.order.length) };
}

/* ------------------------------------------------------------------ *
 * The scenarios
 * ------------------------------------------------------------------ */

const allItems = new Set();
for (const c of cards) for (const i of c.items) allItems.add(i);
const platforms = [...allItems].filter(i => i.startsWith('PLATFORM'));
const triggerEvents = platforms.filter(i => i.includes('derives no event'));
const WIRE_ACTIVATED = 'PLATFORM | activated-ability call site';
const WIRE_SPELL = 'PLATFORM | spell resolution runs compiled effects';

line('==========================================================');
line(' COVERAGE BATCH SCENARIOS');
line('==========================================================');
line();
line(`source            ${IN}`);
line(`pool              ${POOL}`);
line(`self-check        ${JSON.stringify(data.selfCheck)}`);
line(`unfinished cards  ${cards.length}`);
line(`AUTOMATED base    ${BASE_AUTOMATED} (ability-layer-coverage.mjs, after the behaviour probe)`);
line();
line(`platform items found in the table: ${platforms.length}`);
for (const p of platforms) line(`   - ${p}`);

const MARKS = [1, 2, 3, 5, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 15000, 20000];

const scenarios = [];
scenarios.push(report('A. nothing granted (plain greedy, the deadlock is visible)', [], MARKS));
scenarios.push(report('B. the two dead wires only', [WIRE_ACTIVATED, WIRE_SPELL], MARKS));
scenarios.push(report('C. the two dead wires + the prompt platform', [WIRE_ACTIVATED, WIRE_SPELL, PROMPT], MARKS));
scenarios.push(report('D. every platform item', platforms, MARKS));

/* ------------------------------------------------------------------ *
 * What each platform item is worth, measured two ways
 * ------------------------------------------------------------------ */

line();
line('='.repeat(78));
line(' WHAT EACH PLATFORM ITEM IS WORTH');
line('='.repeat(78));
line(' "alone" = cards it finishes with nothing else built.');
line(' "with its co-blockers" = cards on which it is a blocker and every OTHER');
line(' blocker on that card is also a platform item, so the platform tier alone');
line(' finishes them. The gap between the two columns is pattern work.');
line();
const platformSet = new Set(platforms);
line('   alone   platform-tier   touches   item');
for (const p of platforms) {
  let alone = 0, tier = 0, touches = 0;
  for (const c of cards) {
    if (!c.items.includes(p)) continue;
    touches++;
    if (c.items.length === 1) alone++;
    if (c.items.every(i => platformSet.has(i))) tier++;
  }
  line(`   ${String(alone).padStart(5)}   ${String(tier).padStart(13)}   ${String(touches).padStart(7)}   ${p}`);
}

/* ------------------------------------------------------------------ *
 * THE BATCH PLAN
 *
 * A batch is a named set of work items selected by a RULE over the item id, so
 * the membership can be re-derived and argued with rather than taken on trust.
 * Batches are evaluated CUMULATIVELY: batch k is scored with batches 1..k-1
 * already granted, which is the only way the numbers add up to something a
 * person can plan against.
 *
 * "unlocks" is an exact set containment count, not a projection: a card is
 * unlocked when every one of its blockers is in the granted set.
 * ------------------------------------------------------------------ */

const itemList = [...allItems];
const pick = (re) => itemList.filter(i => re.test(i));

/** item -> how many unfinished cards carry it as a blocker. */
const itemCardCountAll = new Map();
for (const c of cards) for (const i of c.items) itemCardCountAll.set(i, (itemCardCountAll.get(i) ?? 0) + 1);

/** Only items that carry their weight go into a named batch; the rest is tail. */
const big = (i) => (itemCardCountAll.get(i) ?? 0) >= 5;

const CANDIDATES = [
  { key: 'trigger-events', name: 'Derive the missing trigger events',
    rule: 'every PLATFORM item of the form "the engine derives no event for X", plus the announced-targets carrier and turn history',
    items: [...triggerEvents, ...pick(/^PLATFORM \| trigger: needs /)] },

  { key: 'keywords', name: 'Make the advisory keywords do something',
    rule: 'every KEYWORD item: a keyword the compiler recognises and the engine renders as a badge',
    items: pick(/^KEYWORD \| /) },

  { key: 'activated', name: 'Wire the activated-ability path, with the mana and pump vocabulary it needs',
    rule: 'the two dead call sites, plus every cost-led add-mana or pump item on 5 or more cards',
    items: [WIRE_ACTIVATED, WIRE_SPELL,
      ...pick(/^EFFECT \| cost\|.*\+ effect\| add /).filter(big),
      ...pick(/^EFFECT \| cost\|.*\+ effect\| ~ gets [+-]~n\/[+-]~n until end of turn$/).filter(big)] },

  { key: 'prompt', name: 'The pending-decision state, and the controls that sit on it',
    rule: 'the single PLATFORM item every prompt kind depends on',
    items: [PROMPT] },

  { key: 'trigger-effects', name: 'The common trigger-effect verbs',
    rule: 'trigger-plus-effect items on 5 or more cards',
    items: pick(/^(EFFECT|PARSE) \| trigger\|.*\+ effect\| /).filter(big) },

  { key: 'effects', name: 'The standalone effect verbs, no trigger in front',
    rule: 'single-effect-clause items on 5 or more cards',
    items: pick(/^(EFFECT|PARSE) \| effect\| /).filter(big) },

  { key: 'replacement', name: 'The remaining replacement results',
    rule: 'every PLATFORM item naming a replacement result',
    items: pick(/^PLATFORM \| replacement result/) },

  { key: 'rest-big', name: 'Everything else that is shared by 5 or more cards',
    rule: 'every remaining work item on 5 or more cards',
    items: itemList.filter(big) },

  { key: 'rest-mid', name: 'Items shared by 2 to 4 cards',
    rule: 'every remaining work item on 2, 3 or 4 cards',
    items: itemList.filter(i => { const n = itemCardCountAll.get(i) ?? 0; return n >= 2 && n <= 4; }) },

  { key: 'tail', name: 'The bespoke tail: one item, one card',
    rule: 'every remaining work item that appears on exactly one card',
    items: itemList.filter(i => (itemCardCountAll.get(i) ?? 0) === 1) },
];

/**
 * Standalone value, so the ORDER is measured rather than asserted. Each batch
 * is scored alone, on top of nothing, and the ladder is sorted by cards per
 * work item. The last three are held back to the end by construction, because
 * they are defined as the remainder and scoring them standalone would be
 * meaningless.
 */
const HELD = new Set(['rest-big', 'rest-mid', 'tail']);
function standalone(items) {
  const g = new Set(items);
  let n = 0;
  for (const c of cards) if (c.items.every(i => g.has(i))) n++;
  return n;
}
for (const b of CANDIDATES) { b.standaloneCards = standalone(b.items); b.perItem = b.items.length ? b.standaloneCards / b.items.length : 0; }

const ordered = [
  ...CANDIDATES.filter(b => !HELD.has(b.key)).sort((a, b) => b.perItem - a.perItem),
  ...CANDIDATES.filter(b => HELD.has(b.key)),
];

line();
line('='.repeat(78));
line(' THE BATCH PLAN, ordered by measured value, cumulative, exact');
line('='.repeat(78));
line(' Order is not asserted. Each batch was scored ALONE first, and the ladder is');
line(' sorted by cards unlocked per work item. The last three batches are the');
line(' remainder by definition and are held to the end.');
line();
line(' A work item is NOT a unit of effort. A PLATFORM item is engine work in');
line(' files the ability layer does not own, and counts as one item here while');
line(' costing far more than one pattern. The per-item column understates them.');
line();
line(' standalone scores (each batch alone, on top of nothing):');
line('   items    cards   per item   batch');
for (const b of CANDIDATES) {
  line(`   ${String(b.items.length).padStart(5)}   ${String(b.standaloneCards).padStart(6)}   ${b.perItem.toFixed(2).padStart(8)}   ${b.name}`);
}
line();

const granted = new Set();
const batchRows = [];
let prevAuto = BASE_AUTOMATED, prevPrompt = 0;
let bn = 0;
for (const b of ordered) {
  bn++;
  const fresh = b.items.filter(i => !granted.has(i));
  for (const i of fresh) granted.add(i);
  let auto = 0, prompt = 0;
  for (const c of cards) {
    if (c.items.every(i => granted.has(i))) { if (c.dest === 'AUTOMATED') auto++; else prompt++; }
  }
  const A = BASE_AUTOMATED + auto, P = prompt, S = POOL - NOTEXT - A - P;
  const unlocked = (A - prevAuto) + (P - prevPrompt);
  const row = { batch: bn, key: b.key, name: b.name, rule: b.rule, newItems: fresh.length, cumItems: granted.size,
    unlockedThisBatch: unlocked, cardsPerItem: fresh.length ? unlocked / fresh.length : 0,
    automated: A, prompted: P, silent: S, autoPct: pct(A, POOL), promptPct: pct(P, POOL), silentPct: pct(S, POOL),
    // Only items this batch actually brings in, so a later batch does not
    // advertise something an earlier one already paid for.
    biggest: fresh.map(i => [i, itemCardCountAll.get(i) ?? 0]).sort((x, y) => y[1] - x[1]).slice(0, 8) };
  batchRows.push(row);
  prevAuto = A; prevPrompt = P;

  line(` BATCH ${bn}: ${b.name}`);
  line(`   rule            ${b.rule}`);
  line(`   work items      ${fresh.length} new  (${granted.size} cumulative)`);
  line(`   cards unlocked  ${unlocked}   (${(fresh.length ? unlocked / fresh.length : 0).toFixed(2)} per work item)`);
  line(`   AFTER IT LANDS  AUTOMATED ${String(A).padStart(6)} ${row.autoPct.padStart(6)}%   PROMPTED ${String(P).padStart(6)} ${row.promptPct.padStart(6)}%   SILENT ${String(S).padStart(6)} ${row.silentPct.padStart(6)}%`);
  line('   biggest items in the batch, by cards they block:');
  for (const [i, n] of row.biggest) line(`     ${String(n).padStart(5)}  ${i.slice(0, 100)}`);
  line();
}

/* ------------------------------------------------------------------ *
 * The tail, stated plainly
 * ------------------------------------------------------------------ */

line();
line('='.repeat(78));
line(' THE TAIL');
line('='.repeat(78));
const itemCardCount = itemCardCountAll;
const counts = [...itemCardCount.values()];
const onOne = counts.filter(v => v === 1).length;
line(` distinct work items                    ${itemCardCount.size}`);
line(` items that appear on exactly ONE card   ${onOne}  (${pct(onOne, itemCardCount.size)}%)`);
line(` items on 2 to 4 cards                   ${counts.filter(v => v >= 2 && v <= 4).length}`);
line(` items on 5 or more cards                ${counts.filter(v => v >= 5).length}`);
line();
const soleTail = cards.filter(c => c.items.length === 1 && itemCardCount.get(c.items[0]) === 1).length;
line(` cards whose ONLY blocker is an item no other card shares: ${soleTail}`);
line(' that is the bespoke floor: one unit of work each, no reuse available.');

/* ------------------------------------------------------------------ *
 * COMPOSITION: is the unit a component or a whole line?
 *
 * This is the measurement that settles the census-versus-XMage argument.
 *
 * A work item above is a whole LINE, so `when ~ enters + scry ~n` and
 * `when ~ dies + scry ~n` are two separate items even though a composing engine
 * would build one trigger, one effect, and reuse both. XMage counts the second
 * way: `ScryEffect` is one class no matter what triggers it.
 *
 * So the same blocker table is re-scored at ATOMIC granularity: every line item
 * is split back into the census clause patterns it was joined from, and a card
 * counts as finished when every ATOM it needs exists. Platform items are not
 * split, because they are not clauses.
 *
 * If the atomic curve is much kinder than the line curve, then composition is
 * worth building and the census measured the wrong unit. If the two curves are
 * close, the tail is genuinely bespoke and no amount of factoring helps.
 * ------------------------------------------------------------------ */

line();
line('='.repeat(78));
line(' COMPOSITION: whole-line items versus atomic clause patterns');
line('='.repeat(78));

const atomCards = cards.map(c => {
  const atoms = new Set();
  for (const it of c.items) {
    if (it.startsWith('PLATFORM')) { atoms.add(it); continue; }
    const [kindTag, body] = [it.slice(0, it.indexOf(' | ')), it.slice(it.indexOf(' | ') + 3)];
    if (kindTag === 'KEYWORD') { atoms.add(it); continue; }
    for (const part of body.split(' + ')) atoms.add(`ATOM | ${part}`);
  }
  return { name: c.name, dest: c.dest, items: [...atoms] };
});

function curveOf(list) {
  const idx = new Map();
  list.forEach((c, i) => { for (const it of c.items) { let a = idx.get(it); if (!a) { a = []; idx.set(it, a); } a.push(i); } });
  const rem = list.map(c => new Set(c.items));
  const doneL = rem.map(s => s.size === 0);
  const fin = new Map(), tch = new Map();
  rem.forEach((s, i) => { if (doneL[i]) return; for (const it of s) tch.set(it, (tch.get(it) ?? 0) + 1); if (s.size === 1) { const k = [...s][0]; fin.set(k, (fin.get(k) ?? 0) + 1); } });
  const h = [];
  const less = (a, b) => (a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1]);
  const push = (v) => { h.push(v); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (less(h[i], h[p])) { [h[i], h[p]] = [h[p], h[i]]; i = p; } else break; } };
  const pop = () => { if (!h.length) return null; const t = h[0], l = h.pop(); if (h.length) { h[0] = l; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < h.length && less(h[a], h[m])) m = a; if (b < h.length && less(h[b], h[m])) m = b; if (m === i) break; [h[i], h[m]] = [h[m], h[i]]; i = m; } } return t; };
  for (const it of idx.keys()) push([fin.get(it) ?? 0, tch.get(it) ?? 0, it]);
  const ord = []; const tk = new Set(); let ca = 0, cp = 0;
  for (;;) {
    let best = null;
    for (;;) { const t = pop(); if (t == null) break; const [f, tt, item] = t; if (tk.has(item)) continue;
      const cf = fin.get(item) ?? 0, ct = tch.get(item) ?? 0;
      if (f !== cf || tt !== ct) { push([cf, ct, item]); continue; } if (ct === 0) continue; best = item; break; }
    if (best == null) break;
    tk.add(best); let a = 0, p = 0;
    for (const i of idx.get(best)) { if (doneL[i] || !rem[i].has(best)) continue; rem[i].delete(best); tch.set(best, (tch.get(best) ?? 1) - 1);
      if (rem[i].size === 0) { doneL[i] = true; fin.set(best, (fin.get(best) ?? 1) - 1); if (list[i].dest === 'AUTOMATED') a++; else p++; }
      else if (rem[i].size === 1) { const s = [...rem[i]][0]; fin.set(s, (fin.get(s) ?? 0) + 1); push([fin.get(s), tch.get(s) ?? 0, s]); } }
    ca += a; cp += p; ord.push({ item: best, cumFinished: ca + cp });
  }
  return { items: idx.size, order: ord };
}

const lineCurve = curveOf(cards);
const atomCurve = curveOf(atomCards);
line();
line(` distinct WHOLE-LINE items : ${lineCurve.items}`);
line(` distinct ATOMIC patterns  : ${atomCurve.items}`);
line(` collapse factor           : ${(lineCurve.items / atomCurve.items).toFixed(2)}x fewer things to build if the engine composes`);
line();
line('   N        cards done, WHOLE-LINE      cards done, ATOMIC     atomic advantage');
for (const n of [50, 100, 250, 500, 1000, 2000, 5000, 10000]) {
  const a = n <= lineCurve.order.length ? lineCurve.order[n - 1].cumFinished : null;
  const b = n <= atomCurve.order.length ? atomCurve.order[n - 1].cumFinished : null;
  if (a == null && b == null) continue;
  const av = a == null ? '—' : `${a} (${pct(a, POOL)}%)`;
  const bv = b == null ? '—' : `${b} (${pct(b, POOL)}%)`;
  line(`   ${String(n).padStart(6)}   ${av.padStart(22)}   ${bv.padStart(22)}   ${a != null && b != null ? `${(b / a).toFixed(2)}x` : ''}`);
}
line();
line(' Read this against the two prior reports, same "every unit present" metric:');
line('   census, 250 text patterns   12.12% of cards');
line('   XMage,  250 engine classes  47.17% of cards');

/*
 * Third granularity: VERB HEAD.
 *
 * XMage's `DamageTargetEffect` covers every "deals N damage to <thing>" because
 * the thing is a filter object passed in, not part of the class. So the atom is
 * cut down to its leading verb phrase, which is a deliberately CRUDE stand-in
 * for "one effect class with a parameterised selector".
 *
 * This is an UPPER BOUND and must be labelled as one wherever it is quoted. It
 * assumes every selector behind a verb is expressible by one filter type, which
 * is false in general: "target creature" and "target creature an opponent
 * controls that attacked this turn" are not the same amount of work. It says
 * what perfect parameterisation would be worth, not what is achievable.
 */
const verbCards = cards.map(c => {
  const heads = new Set();
  for (const it of c.items) {
    if (it.startsWith('PLATFORM') || it.startsWith('KEYWORD')) { heads.add(it); continue; }
    const body = it.slice(it.indexOf(' | ') + 3);
    for (const part of body.split(' + ')) {
      const bar = part.indexOf('| ');
      const kind = bar >= 0 ? part.slice(0, bar) : '?';
      const rest = bar >= 0 ? part.slice(bar + 2) : part;
      heads.add(`VERB | ${kind}| ${rest.split(/\s+/).slice(0, 3).join(' ')}`);
    }
  }
  return { name: c.name, dest: c.dest, items: [...heads] };
});
const verbCurve = curveOf(verbCards);
line();
line(` distinct VERB-HEAD units  : ${verbCurve.items}   (UPPER BOUND: assumes one filter type serves every selector behind a verb)`);
line('   N        cards done, ATOMIC        cards done, VERB HEAD');
for (const n of [50, 100, 250, 500, 1000, 2000, 5000]) {
  const b = n <= atomCurve.order.length ? atomCurve.order[n - 1].cumFinished : null;
  const v = n <= verbCurve.order.length ? verbCurve.order[n - 1].cumFinished : null;
  if (b == null && v == null) continue;
  line(`   ${String(n).padStart(6)}   ${(b == null ? '—' : `${b} (${pct(b, POOL)}%)`).padStart(22)}   ${(v == null ? '—' : `${v} (${pct(v, POOL)}%)`).padStart(22)}`);
}
line(`   ${String(verbCurve.order.length).padStart(6)}   ${'—'.padStart(22)}   ${`${verbCurve.order[verbCurve.order.length - 1].cumFinished} (${pct(verbCurve.order[verbCurve.order.length - 1].cumFinished, POOL)}%)`.padStart(22)}  (all of them)`);

/* ------------------------------------------------------------------ *
 * WHERE THE CURVE FLATTENS
 *
 * Marginal cards per work item, in windows, under the realistic scenario
 * (the two dead wires paid for). The knee is the point where the next item
 * stops buying more than one card, because from there on the work is one card
 * at a time and no ordering can change that.
 * ------------------------------------------------------------------ */

line();
line('='.repeat(78));
line(' WHERE THE CURVE FLATTENS (scenario B: the two dead wires paid for)');
line('='.repeat(78));
const resB = run([WIRE_ACTIVATED, WIRE_SPELL]);
const win = [[1, 10], [11, 25], [26, 50], [51, 100], [101, 200], [201, 400], [401, 800], [801, 1600], [1601, 3200], [3201, 6400], [6401, 12800], [12801, resB.order.length]];
line('   items                cards   per item');
for (const [a, b] of win) {
  if (a > resB.order.length) continue;
  const hi = Math.min(b, resB.order.length);
  const gained = resB.order[hi - 1].cumFinished - (a > 1 ? resB.order[a - 2].cumFinished : 0);
  line(`   ${String(a).padStart(6)}..${String(hi).padStart(6)}   ${String(gained).padStart(10)}   ${(gained / (hi - a + 1)).toFixed(2)}`);
}
let knee = null, knee2 = null;
for (let i = 0; i < resB.order.length; i++) {
  if (knee == null && resB.order[i].finished <= 2) knee = i + 1;
  if (knee2 == null && resB.order[i].finished <= 1) knee2 = i + 1;
}
line();
line(` first item that finishes 2 cards or fewer: rank ${knee}`);
line(` first item that finishes exactly 1 card:   rank ${knee2}`);
const atKnee = metricsAt(resB, knee2 - 1);
line(` at that point:  AUTOMATED ${atKnee.automated} (${atKnee.autoPct}%)  PROMPTED ${atKnee.prompted} (${atKnee.promptPct}%)  SILENT ${atKnee.silent} (${atKnee.silentPct}%)`);
line(` cards still SILENT past the knee: ${atKnee.silent}, and past it every work item buys ONE card.`);
line();
line(' cost of the last stretch, at one item per card:');
for (const t of [0.80, 0.90, 0.95, 0.99]) {
  let hit = null;
  for (let i = 1; i <= resB.order.length; i++) { const m = metricsAt(resB, i); if ((m.automated + m.prompted) / POOL >= t) { hit = i; break; } }
  line(`   ${String(Math.round(t * 100)).padStart(3)}% of the pool AUTOMATED or PROMPTED   ${hit == null ? 'not reachable' : `${hit} work items`}`);
}

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), script: 'scripts/coverage-batch-scenarios.mjs', pool: POOL,
  scenarios, batches: batchRows,
  tail: { distinctItems: itemCardCount.size, itemsOnOneCard: onOne, itemsOn2to4: counts.filter(v => v >= 2 && v <= 4).length, itemsOn5plus: counts.filter(v => v >= 5).length, bespokeFloor: soleTail },
  knee: { firstItemFinishingTwoOrFewer: knee, firstItemFinishingOne: knee2, atKnee } }, null, 2));
line();
line(`written: ${OUT}`);
writeFileSync(join(ROOT, 'scratch', 'coverage-batch-scenarios.txt'), out.join('\n'));
