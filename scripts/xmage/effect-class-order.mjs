#!/usr/bin/env node
/**
 * Rank XMage EFFECT CLASSES by the cards each would unlock.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place, nothing is vendored, and no display string is copied out of it. Forge
 * is GPL-3.0 and was not fetched, read or referenced.
 *
 * WHAT THIS MEASURES, AND WHAT IT REFUSES TO CLAIM
 *
 * `xmage-record-shape.json` and PORT-LOG's work order both count cards a
 * primitive BLOCKS. A card blocked by three classes is blocked by all three, so
 * writing any one of them buys nothing. This script never reports a blocked
 * count as an unlock.
 *
 * It runs the real `lowerCard` over every record with the real tables full, and
 * records for each card the SET of primitives still blocking it. A set of
 * classes S unlocks a card exactly when that card's blocking set is a subset of
 * S. That is a closure, it is exact, and it is not additive.
 *
 *   solo     — cards whose blocking set is exactly {C}. What C buys alone.
 *   marginal — what C buys given every class ranked above it is already done,
 *              computed greedily so each pick maximises the marginal.
 *
 * Run: node --experimental-strip-types scripts/xmage/effect-class-order.mjs
 * Writes: scripts/coverage/.data/xmage-effect-class-order.json
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRecords } from './build-records.mjs';
import { lowerCard } from '../../src/lib/cards/xmage/index.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const DATA = path.join(REPO, 'scripts', 'coverage', '.data');

const { records, meta } = await loadRecords();
console.log(`records ${records.length}  xmage commit ${meta.commit}`);

/* ---------------- 1. one lowering pass, per card blocking set -------------- */

const cards = [];
let lowered = 0;
let vacuous = 0;
for (const record of records) {
  const r = lowerCard(record);
  const missing = new Set();
  const refused = new Set();
  for (const b of r.blocked) {
    for (const p of b.result.missing) missing.add(p);
    for (const q of b.result.refused ?? []) refused.add(q.prim);
  }
  if (r.ok && r.vacuous) vacuous += 1;
  else if (r.ok) lowered += 1;
  cards.push({
    key: record.oracleId || record.provenance.xmageClass,
    oracleId: record.oracleId ?? null,
    cls: record.provenance.xmageClass,
    ok: r.ok,
    vacuous: r.vacuous,
    missing: [...missing],
    refused: [...refused],
    loweredAbilities: r.abilities.length,
    blockedAbilities: r.blocked.length,
  });
}
console.log(`already lowering (whole card) ${lowered}   vacuous ${vacuous}`);

/* Deduplicate by card identity. Two XMage classes for the same oracle id are
 * the same CARD, and counting both would inflate every column below. */
const byKey = new Map();
for (const c of cards) {
  const prev = byKey.get(c.key);
  // keep the variant that is closest to lowering: fewest blockers
  if (!prev || c.missing.length < prev.missing.length) byKey.set(c.key, c);
}
const uniq = [...byKey.values()];
const allBlocked = uniq.filter((c) => !c.ok);
/* A card blocked with an EMPTY missing set is not blocked by a missing class.
 * It is blocked by a structural refusal `lower.ts` names on purpose: an adjuster
 * rewrites the ability at cast time, a static helper added abilities the record
 * never saw, an additional cost has no field to land in. No effect class in this
 * ranking reaches those cards, so they are held out of the closure entirely
 * rather than being silently attributed to whichever class is picked first. */
const structural = allBlocked.filter((c) => c.missing.length === 0);
const blockedCards = allBlocked.filter((c) => c.missing.length > 0);
const withOracle = uniq.filter((c) => c.oracleId).length;
console.log(`distinct card identities ${uniq.length}   with a scryfall oracle id ${withOracle}`);
console.log(`still blocked ${allBlocked.length}  = ${blockedCards.length} blocked by a named class + ${structural.length} structural refusals no class reaches`);
{
  const hist = new Map();
  for (const c of blockedCards) hist.set(c.missing.length, (hist.get(c.missing.length) ?? 0) + 1);
  console.log('blockers per card: ' + [...hist.entries()].sort((a,b)=>a[0]-b[0]).slice(0,10).map(([k,v])=>`${k}:${v}`).join('  '));
}

/* ---------------- 2. blocked / solo per primitive -------------------------- */

const blockedBy = new Map();  // prim -> Set(key)
const soloBy = new Map();     // prim -> Set(key)
for (const c of blockedCards) {
  for (const p of c.missing) {
    if (!blockedBy.has(p)) blockedBy.set(p, new Set());
    blockedBy.get(p).add(c.key);
  }
  if (c.missing.length === 1) {
    const p = c.missing[0];
    if (!soloBy.has(p)) soloBy.set(p, new Set());
    soloBy.get(p).add(c.key);
  }
}

/* ---------------- 3. greedy closure order ---------------------------------- */

const remaining = blockedCards.map((c) => ({ key: c.key, need: new Set(c.missing) }));
const done = new Set();
const order = [];
const LIMIT = Number(process.argv.includes('--top') ? process.argv[process.argv.indexOf('--top') + 1] : 120);

let live = remaining;
for (let step = 0; step < LIMIT; step++) {
  // candidate -> cards it would COMPLETE right now
  const completes = new Map();
  const freq = new Map();
  for (const c of live) {
    const need = [...c.need].filter((p) => !done.has(p));
    for (const p of need) freq.set(p, (freq.get(p) ?? 0) + 1);
    if (need.length === 1) {
      const p = need[0];
      if (!completes.has(p)) completes.set(p, 0);
      completes.set(p, completes.get(p) + 1);
    }
  }
  if (freq.size === 0) break;
  let best = null;
  for (const p of freq.keys()) {
    const gain = completes.get(p) ?? 0;
    const f = freq.get(p) ?? 0;
    if (!best || gain > best.gain || (gain === best.gain && f > best.freq)) best = { prim: p, gain, freq: f };
  }
  done.add(best.prim);
  const before = live.length;
  live = live.filter((c) => c.need.size > 0 && [...c.need].some((p) => !done.has(p)));
  order.push({
    rank: order.length + 1,
    prim: best.prim,
    marginal: before - live.length,
    solo: soloBy.get(best.prim)?.size ?? 0,
    blocked: blockedBy.get(best.prim)?.size ?? 0,
    cumulative: blockedCards.length - live.length,
  });
  if (best.gain === 0 && order.length > 40 && order.slice(-15).every((r) => r.marginal === 0)) break;
}

console.log('');
console.log(' rank  marginal  solo  blocked  cumul  class');
for (const r of order.slice(0, 60)) {
  console.log(
    `${String(r.rank).padStart(5)}  ${String(r.marginal).padStart(8)}  ${String(r.solo).padStart(4)}  ${String(r.blocked).padStart(7)}  ${String(r.cumulative).padStart(5)}  ${r.prim}`,
  );
}

writeFileSync(
  path.join(DATA, 'xmage-effect-class-order.json'),
  JSON.stringify(
    {
      meta: {
        script: 'scripts/xmage/effect-class-order.mjs',
        measuredAt: new Date().toISOString(),
        xmageCommit: meta.commit,
        records: records.length,
        distinctCards: uniq.length,
        alreadyLowering: lowered,
        vacuous,
        stillBlocked: allBlocked.length,
        blockedByANamedClass: blockedCards.length,
        structuralRefusalsNoClassReaches: structural.length,
      },
      order,
      soloAll: [...soloBy.entries()].map(([prim, s]) => ({ prim, solo: s.size })).sort((a, b) => b.solo - a.solo),
      blockedAll: [...blockedBy.entries()].map(([prim, s]) => ({ prim, blocked: s.size })).sort((a, b) => b.blocked - a.blocked),
      cards: uniq.map((c) => ({ key: c.key, oracleId: c.oracleId, ok: c.ok, vacuous: c.vacuous, missing: c.missing })),
    },
    null,
    1,
  ),
);
console.log('');
console.log('wrote scripts/coverage/.data/xmage-effect-class-order.json');
