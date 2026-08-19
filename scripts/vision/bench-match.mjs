/**
 * Measure the hash scan in JavaScript, over the real index.
 *
 * The whole design rests on a claim that has to be true in a browser, not in
 * NumPy: that a linear scan over every printing we hold is fast enough to need
 * no index structure at all. This measures it, and measures the storage
 * decision that makes it fast.
 *
 * Usage:
 *   node --experimental-strip-types scripts/vision/bench-match.mjs [index.bin]
 *
 * With no argument it benchmarks a synthetic index of the same size, which is
 * fine for timing — the scan is data-independent.
 */

import fs from 'node:fs';
import { CardHashIndex } from '../../src/lib/vision/hashIndex.ts';

const indexPath = process.argv[2];

let index;
let N;
if (indexPath && fs.existsSync(indexPath)) {
  index = CardHashIndex.fromBytes(new Uint8Array(fs.readFileSync(indexPath)));
  N = index.size;
} else {
  N = 50000;
  let s = 123456789 >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0);
  const rows = [];
  for (let i = 0; i < N; i++) {
    rows.push({
      cardId: `${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`,
      oracleGroup: i,
      artPHash: { hi: rnd(), lo: rnd() },
      artDHash: { hi: rnd(), lo: rnd() },
    });
  }
  index = CardHashIndex.fromRows(rows);
}

function bench(fn, iters = 400) {
  for (let i = 0; i < 60; i++) fn(i); // warm the JIT
  const t = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) fn(i);
  return Number(process.hrtime.bigint() - t) / 1e6 / iters;
}

// Query hashes drawn from the index itself, so the top-k insertion path is
// exercised realistically rather than never firing.
const queries = [];
for (let i = 0; i < 400; i++) {
  const row = index.rowAt((i * 977) % index.size);
  queries.push(row);
}

const top1 = bench((i) => {
  const q = queries[i % queries.length];
  index.search(q.artPHash, q.artDHash, 1);
});
const top5 = bench((i) => {
  const q = queries[i % queries.length];
  index.search(q.artPHash, q.artDHash, 5);
});
const top10 = bench((i) => {
  const q = queries[i % queries.length];
  index.search(q.artPHash, q.artDHash, 10);
});

// ---- the storage decision, measured ------------------------------------
// Two Uint32Arrays vs one BigUint64Array. BigInt operations allocate, which is
// what makes the "obvious" representation for a 64-bit value the wrong one.
const big = new BigUint64Array(N);
const hiArr = new Uint32Array(N);
const loArr = new Uint32Array(N);
for (let i = 0; i < N; i++) {
  const r = index.rowAt(i);
  hiArr[i] = r.artPHash.hi;
  loArr[i] = r.artPHash.lo;
  big[i] = (BigInt(r.artPHash.hi) << 32n) | BigInt(r.artPHash.lo);
}

function popcnt(x) {
  let v = x >>> 0;
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return (Math.imul(v, 0x01010101) >>> 24) & 0xff;
}

const scanU32 = (qh, ql) => {
  let best = 65;
  let bi = -1;
  for (let i = 0; i < N; i++) {
    const d = popcnt(hiArr[i] ^ qh) + popcnt(loArr[i] ^ ql);
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  return bi;
};

const scanBig = (q) => {
  let best = 65n;
  let bi = -1;
  for (let i = 0; i < N; i++) {
    let x = big[i] ^ q;
    let c = 0n;
    while (x) {
      x &= x - 1n;
      c++;
    }
    if (c < best) {
      best = c;
      bi = i;
    }
  }
  return bi;
};

const u32Ms = bench((i) => scanU32(hiArr[i % N], loArr[i % N]), 200);
let bigMs;
{
  for (let i = 0; i < 3; i++) scanBig(big[i]);
  const t = process.hrtime.bigint();
  const IT = 10;
  for (let i = 0; i < IT; i++) scanBig(big[(i * 101) % N]);
  bigMs = Number(process.hrtime.bigint() - t) / 1e6 / IT;
}

const bytes = index.toBytes().byteLength;

console.log(
  JSON.stringify(
    {
      source: indexPath ?? 'synthetic',
      entries: N,
      packed_index_bytes: bytes,
      packed_index_kb: +(bytes / 1024).toFixed(1),
      bytes_per_entry: +(bytes / N).toFixed(1),
      node_version: process.version,

      search_ms: {
        top1: +top1.toFixed(3),
        top5: +top5.toFixed(3),
        top10: +top10.toFixed(3),
        scans_per_second_top5: Math.round(1000 / top5),
      },

      representation_ms: {
        two_uint32_arrays: +u32Ms.toFixed(3),
        biguint64array: +bigMs.toFixed(3),
        biguint64_slower_by: +(bigMs / u32Ms).toFixed(1),
      },
    },
    null,
    2,
  ),
);
