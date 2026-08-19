/**
 * The index: search ranking, printing grouping, and the binary format.
 *
 *   node --test --experimental-strip-types src/lib/vision/hashIndex.test.ts
 *
 * The binary format is what gets cached in a browser and read back on later
 * visits, so a round-trip bug would not surface until the second session — and
 * would look like a recognition failure, not a serialisation one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CardHashIndex, combinedDistance, type IndexRow } from './hashIndex.ts';
import { hexToHash, hashToHex } from './hash.ts';

function row(cardId: string, oracleGroup: number, p: string, d: string): IndexRow {
  return { cardId, oracleGroup, artPHash: hexToHash(p), artDHash: hexToHash(d) };
}

const A = 'aaaaaaaaaaaaaaaa';
const ZERO = '0000000000000000';
const ONE_BIT = '0000000000000001';
const FULL = 'ffffffffffffffff';

const rows: IndexRow[] = [
  row('11111111-1111-4111-8111-111111111111', 0, ZERO, ZERO),
  row('22222222-2222-4222-8222-222222222222', 0, ONE_BIT, ONE_BIT),
  row('33333333-3333-4333-8333-333333333333', 1, A, A),
  row('44444444-4444-4444-8444-444444444444', 2, FULL, FULL),
  // a non-UUID id, exercising the string-table fallback in the binary format
  row('lightning-bolt-lea', 3, '00000000000000ff', ZERO),
];

test('search returns the nearest entry first', () => {
  const idx = CardHashIndex.fromRows(rows);
  const hits = idx.search(hexToHash(ZERO), hexToHash(ZERO), 3);
  assert.equal(hits[0].cardId, rows[0].cardId);
  assert.equal(hits[0].pDistance, 0);
  assert.equal(hits[1].pDistance, 1);
});

test('search never returns more entries than the index holds', () => {
  const idx = CardHashIndex.fromRows(rows);
  assert.equal(idx.search(hexToHash(ZERO), hexToHash(ZERO), 50).length, rows.length);
});

test('search on an empty index returns nothing rather than throwing', () => {
  const idx = CardHashIndex.fromRows([]);
  assert.deepEqual(idx.search(hexToHash(ZERO), hexToHash(ZERO), 5), []);
});

test('the early-exit gate does not change results', () => {
  // The scan skips the dHash popcounts when pHash alone is already worse than
  // the current worst survivor. That is only sound because dHash contributes at
  // most 1.0 to the score, so this checks the ranking is identical to a full
  // scan computed naively.
  const idx = CardHashIndex.fromRows(rows);
  const q = hexToHash('00000000000000f0');
  const hits = idx.search(q, hexToHash(ZERO), rows.length);
  const naive = rows
    .map((r) => ({
      cardId: r.cardId,
      score: combinedDistance(
        popcount(r.artPHash.hi ^ q.hi) + popcount(r.artPHash.lo ^ q.lo),
        popcount(r.artDHash.hi ^ 0) + popcount(r.artDHash.lo ^ 0),
      ),
    }))
    .sort((a, b) => a.score - b.score);
  assert.deepEqual(
    hits.map((h) => h.cardId),
    naive.map((n) => n.cardId),
  );
});

function popcount(x: number): number {
  let v = x >>> 0;
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return (Math.imul(v, 0x01010101) >>> 24) & 0xff;
}

test('dHash acts as a tie-break and cannot outrank a pHash difference', () => {
  // Two entries whose pHash distances differ by 1. Even a maximally bad dHash
  // on the closer one must not push it below the farther one, or the weaker
  // signal would be overriding the stronger.
  const tie: IndexRow[] = [
    row('aaaaaaaa-0000-4000-8000-000000000001', 0, ZERO, FULL),
    row('bbbbbbbb-0000-4000-8000-000000000002', 1, ONE_BIT, ZERO),
  ];
  const idx = CardHashIndex.fromRows(tie);
  const hits = idx.search(hexToHash(ZERO), hexToHash(ZERO), 2);
  assert.equal(hits[0].cardId, tie[0].cardId, 'closer pHash must win regardless of dHash');
});

test('dHash breaks a genuine pHash tie', () => {
  const tie: IndexRow[] = [
    row('aaaaaaaa-0000-4000-8000-000000000001', 0, ZERO, FULL),
    row('bbbbbbbb-0000-4000-8000-000000000002', 1, ZERO, ZERO),
  ];
  const idx = CardHashIndex.fromRows(tie);
  const hits = idx.search(hexToHash(ZERO), hexToHash(ZERO), 2);
  assert.equal(hits[0].cardId, tie[1].cardId);
  assert.equal(hits[0].pDistance, hits[1].pDistance);
});

test('printingsInGroup finds every sibling printing', () => {
  const idx = CardHashIndex.fromRows(rows);
  assert.deepEqual(idx.printingsInGroup(0).sort(), [rows[0].cardId, rows[1].cardId].sort());
  assert.deepEqual(idx.printingsInGroup(1), [rows[2].cardId]);
  assert.deepEqual(idx.printingsInGroup(999), []);
});

test('distanceTo reports the distance to a named printing', () => {
  const idx = CardHashIndex.fromRows(rows);
  const d = idx.distanceTo(rows[1].cardId, hexToHash(ZERO), hexToHash(ZERO));
  assert.equal(d?.pDistance, 1);
  assert.equal(d?.oracleGroup, 0);
  assert.equal(idx.distanceTo('nope', hexToHash(ZERO), hexToHash(ZERO)), null);
});

test('binary round-trip preserves hashes, groups and ids', () => {
  const idx = CardHashIndex.fromRows(rows);
  const back = CardHashIndex.fromBytes(idx.toBytes());
  assert.equal(back.size, rows.length);
  for (let i = 0; i < rows.length; i++) {
    assert.equal(back.cardIdAt(i), rows[i].cardId, `id at ${i}`);
    const d = back.distanceTo(rows[i].cardId, rows[i].artPHash, rows[i].artDHash);
    assert.equal(d?.pDistance, 0, `phash at ${i}`);
    assert.equal(d?.dDistance, 0, `dhash at ${i}`);
    assert.equal(d?.oracleGroup, rows[i].oracleGroup, `group at ${i}`);
  }
});

test('binary round-trip preserves the non-UUID id via the string table', () => {
  const back = CardHashIndex.fromBytes(CardHashIndex.fromRows(rows).toBytes());
  assert.ok(
    back.printingsInGroup(3).includes('lightning-bolt-lea'),
    'hand-seeded non-UUID ids must survive serialisation',
  );
});

test('binary round-trip preserves hashes with the top bit set', () => {
  // A hash above 2^63 is where a signed/unsigned slip would show up.
  const hi: IndexRow[] = [row('ffffffff-ffff-4fff-8fff-ffffffffffff', 0, FULL, FULL)];
  const back = CardHashIndex.fromBytes(CardHashIndex.fromRows(hi).toBytes());
  const d = back.distanceTo(hi[0].cardId, hexToHash(FULL), hexToHash(FULL));
  assert.equal(d?.pDistance, 0);
  assert.equal(hashToHex({ hi: 0xffffffff, lo: 0xffffffff }), FULL);
});

test('an empty index round-trips', () => {
  const back = CardHashIndex.fromBytes(CardHashIndex.fromRows([]).toBytes());
  assert.equal(back.size, 0);
});

test('fromBytes rejects a corrupt or foreign blob rather than mis-parsing it', () => {
  assert.throws(() => CardHashIndex.fromBytes(new Uint8Array(24)), /bad magic/);
  const good = CardHashIndex.fromRows(rows).toBytes();
  const wrongVersion = good.slice();
  new DataView(wrongVersion.buffer).setUint32(4, 99, true);
  assert.throws(() => CardHashIndex.fromBytes(wrongVersion), /unsupported version/);
});

test('the packed layout costs 36 bytes per entry', () => {
  // Pins the shipping size. 16 bytes of UUID, 4 of group, 16 of hashes. If this
  // changes, the download the user pays for changed too.
  const many: IndexRow[] = Array.from({ length: 100 }, (_, i) =>
    row(
      `${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`,
      i,
      ZERO,
      ZERO,
    ),
  );
  const bytes = CardHashIndex.fromRows(many).toBytes();
  assert.equal(bytes.byteLength, 24 + 100 * 36);
});

test('distanceTo resolves a printing at any position, and is unaffected by the group cache', () => {
  // `distanceTo` is the printing-resolution layer's workhorse: it is called
  // once per sibling to ask "how far is the photo from THIS exact printing?".
  // It used to locate the row with `cardIds.indexOf`, an O(n) scan, which made
  // that layer quadratic in catalogue size — measured at 2.3-3.8 ms per call
  // over a 54k-row index, so a card with 12 printings spent ~28 ms there
  // against 0.74 ms for the entire top-10 search. It is a map lookup now.
  //
  // Position matters in this test because a lookup that is only correct for
  // early rows is exactly what a broken map would produce, and the old scan
  // masked it by always being correct and always being slow.
  const idx = CardHashIndex.fromRows(rows);

  for (const r of rows) {
    const hit = idx.distanceTo(r.cardId, hexToHash(ZERO), hexToHash(ZERO));
    assert.ok(hit, `${r.cardId} was not found`);
    assert.equal(hit.cardId, r.cardId);
    assert.equal(hit.oracleGroup, r.oracleGroup);
  }

  // The last row is the one a scan reaches last, and the non-UUID id is the one
  // the packed format stores out-of-line — both are the shapes a lookup table
  // is most likely to get wrong.
  const last = idx.distanceTo('lightning-bolt-lea', hexToHash(ZERO), hexToHash(ZERO));
  assert.equal(last?.pDistance, 8);
  assert.equal(last?.oracleGroup, 3);

  // Both caches are lazy and built independently; touching one must not
  // disturb the other.
  idx.printingsInGroup(0);
  const after = idx.distanceTo(rows[4].cardId, hexToHash(ZERO), hexToHash(ZERO));
  assert.equal(after?.pDistance, 8);

  assert.equal(idx.distanceTo('not-in-the-index', hexToHash(ZERO), hexToHash(ZERO)), null);
});

test('distanceTo survives a binary round-trip', () => {
  // The browser queries an index rebuilt from cached bytes, not from rows, so
  // the id lookup has to work against ids reconstructed from packed UUIDs.
  const idx = CardHashIndex.fromBytes(CardHashIndex.fromRows(rows).toBytes());
  for (const r of rows) {
    const hit = idx.distanceTo(r.cardId, hexToHash(ZERO), hexToHash(ZERO));
    assert.ok(hit, `${r.cardId} was lost across the binary round-trip`);
    assert.equal(hit.oracleGroup, r.oracleGroup);
  }
});
