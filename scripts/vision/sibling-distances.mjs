/**
 * Measure how far apart the printings of the SAME card are in hash space.
 *
 * This is the number that decides `THRESHOLDS.ambiguityMargin` — the margin
 * within which two printings are treated as indistinguishable and the user is
 * asked rather than guessed at.
 *
 * The assumption worth testing: "shared art produces identical hashes, so a
 * tiny margin is enough". It is wrong. Two printings can reuse the same
 * illustration and still hash a few bits apart, because the catalogue renders
 * differ in set symbol, frame, holo stamp and border treatment even when the
 * artwork is identical. A margin tuned for "identical" therefore commits to
 * whichever near-tie happened to land closer — which is precisely how a
 * collection silently acquires the wrong printing.
 *
 * Usage: node --experimental-strip-types scripts/vision/sibling-distances.mjs <index.bin>
 */

import fs from 'node:fs';
import { CardHashIndex } from '../../src/lib/vision/hashIndex.ts';
import { hamming64 } from '../../src/lib/vision/hash.ts';

const indexPath = process.argv[2];
if (!indexPath) {
  console.error('usage: sibling-distances.mjs <index.bin>');
  process.exit(2);
}

const index = CardHashIndex.fromBytes(new Uint8Array(fs.readFileSync(indexPath)));

// group rows by oracle group
const groups = new Map();
for (let i = 0; i < index.size; i++) {
  const row = index.rowAt(i);
  const arr = groups.get(row.oracleGroup);
  if (arr) arr.push(row);
  else groups.set(row.oracleGroup, [row]);
}

const multi = [...groups.values()].filter((g) => g.length > 1);

const pairDistances = [];
/** For each printing, how far is its NEAREST sibling? That is what the engine sees. */
const nearestSibling = [];

for (const g of multi) {
  for (let a = 0; a < g.length; a++) {
    let best = Infinity;
    for (let b = 0; b < g.length; b++) {
      if (a === b) continue;
      const d = hamming64(g[a].artPHash, g[b].artPHash);
      if (b > a) pairDistances.push(d);
      best = Math.min(best, d);
    }
    if (Number.isFinite(best)) nearestSibling.push(best);
  }
}

function histogram(values, edges) {
  const counts = edges.map(() => 0);
  for (const v of values) {
    for (let i = edges.length - 1; i >= 0; i--) {
      if (v >= edges[i]) {
        counts[i]++;
        break;
      }
    }
  }
  return edges.map((e, i) => ({
    at_least: e,
    count: counts[i],
    pct: +((100 * counts[i]) / values.length).toFixed(1),
  }));
}

function cumulativeAtMost(values, thresholds) {
  const sorted = values.slice().sort((a, b) => a - b);
  return thresholds.map((t) => {
    let n = 0;
    for (const v of sorted) {
      if (v <= t) n++;
      else break;
    }
    return { at_most: t, count: n, pct: +((100 * n) / sorted.length).toFixed(1) };
  });
}

const edges = [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32];

console.log(
  JSON.stringify(
    {
      index_entries: index.size,
      distinct_cards: groups.size,
      cards_with_multiple_printings: multi.length,
      printings_in_those_cards: multi.reduce((a, g) => a + g.length, 0),
      sibling_pairs: pairDistances.length,

      /**
       * The decisive table. Each row: printings whose nearest sibling is within
       * N bits. Those are the ones a margin of N would (correctly) defer on.
       */
      nearest_sibling_distance_at_most: cumulativeAtMost(
        nearestSibling,
        [0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 20],
      ),
      nearest_sibling_histogram: histogram(nearestSibling, edges),
      all_pair_histogram: histogram(pairDistances, edges),
    },
    null,
    2,
  ),
);
