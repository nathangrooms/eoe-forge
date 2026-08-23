#!/usr/bin/env node
/**
 * What the precedence rule actually did, card by card, over the whole pool.
 *
 * `scripts/verify-ability-coverage.mjs` says how the AUTOMATED number moved. It
 * does not say WHY, and "coverage went up" with no account of which cards moved
 * and which were refused is the shape of every overstatement this project has
 * already made. So this counts the four things separately:
 *
 *   how many cards the shipped table can speak for at all
 *   how many the precedence rule let it speak for
 *   how many of those the engine then actually runs
 *   what stopped the rest, named
 *
 * It shares the pool filter with the verify script deliberately — the point is
 * to explain that script's denominator, not to invent a second one.
 *
 * Run: node --experimental-strip-types scripts/xmage/swap-census.mjs
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../../src/lib/cards/abilities/compiler.ts';
import { normalizeCard } from '../../src/lib/cards/abilities/normalize.ts';
import { hasXmageRecord, xmageSwapFor, xmageLoweredCardCount } from '../../src/lib/cards/xmage/lowered.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');

const NOT_A_CARD = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'front_card']);
const NOT_A_NORMAL_GAME = new Set(['planar', 'scheme', 'vanguard']);
const NOT_A_GAME_PRODUCT = new Set(['token', 'memorabilia']);

const pool = [];
{
  const rl = createInterface({ input: createReadStream(SRC), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = JSON.parse(line);
    if (NOT_A_CARD.has(c.layout)) continue;
    if (NOT_A_GAME_PRODUCT.has(c.set_type)) continue;
    if (NOT_A_NORMAL_GAME.has(c.layout)) continue;
    if (c.digital) continue;
    if (!(c.games ?? []).includes('paper')) continue;
    pool.push(c);
  }
}

const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);

let inPool = 0; // the table holds this card
let swapped = 0;
const refusals = new Map();
const swappedKinds = new Map();

for (const card of pool) {
  const normalized = normalizeCard(card);
  const trace = compileWithTrace(card);

  if (hasXmageRecord(trace.result.oracleId)) inPool++;

  if (trace.result.source === 'xmage') {
    swapped++;
    for (const a of trace.result.abilities) bump(swappedKinds, a.kind);
    continue;
  }

  // Re-ask, on the compiler's own answer, so the refusal is the real one.
  if (!hasXmageRecord(trace.result.oracleId)) continue;
  const decision = xmageSwapFor(trace.result, normalized);
  if ('refused' in decision) bump(refusals, decision.refused);
}

const pct = (n) => ((n / pool.length) * 100).toFixed(2) + '%';

console.log('pool (same filter as verify-ability-coverage.mjs)', pool.length);
console.log('cards in lowered.generated.ts                   ', xmageLoweredCardCount());
console.log('  of those, in the pool                         ', inPool, pct(inPool));
console.log('  SWAPPED by the precedence rule                ', swapped, pct(swapped));
console.log('');
console.log('why the rest of the in-pool records were not used:');
for (const [why, n] of [...refusals.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(String(n).padStart(7), why);
}
console.log('');
console.log('ability kinds on the swapped cards:');
for (const [kind, n] of [...swappedKinds.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(String(n).padStart(7), kind);
}
