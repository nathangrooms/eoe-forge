/**
 * Tests for the index download path.
 *
 * This module had no coverage, which is how it kept an OFFSET-paged download
 * long after `scripts/vision/build-hash-index.mjs` had established that offset
 * paging over `card_image_hashes` is incorrect while the catalogue sync writes
 * to it. The central test here is `a row inserted mid-download is never
 * skipped`: it drives the loader against a table that grows underneath it, the
 * way the real one does, and asserts nothing goes missing.
 *
 * That failure mode is worth a test rather than a comment because it is
 * invisible in production. A skipped row does not error — it removes one
 * printing from the index, and the recogniser then matches its sibling, finds
 * no contender inside the ambiguity margin, and commits to the wrong printing
 * as `hash-unique-art` with high confidence. The user gets a confidently wrong
 * card in their collection and no signal that anything failed.
 *
 * IndexedDB does not exist in Node, so the caching branch is genuinely not
 * exercised here; these tests cover the fetch/paging/grouping logic, which is
 * where the correctness risk is. `loadHashIndex` swallows cache failures by
 * design, so the absence of IndexedDB makes it take the uncached path rather
 * than fail.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadHashIndex, type HashSource, type HashRowDto } from './loadIndex.ts';

const ZERO_P = '0000000000000000';

function dto(cardId: string, oracleId: string, phash = ZERO_P): HashRowDto {
  return {
    card_id: cardId,
    oracle_id: oracleId,
    art_phash: phash,
    art_dhash: ZERO_P,
    hashed_at: '2026-08-19T00:00:00Z',
  };
}

/** Ids that sort in the order they are generated, so paging is predictable. */
const id = (n: number) => `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;

/**
 * A keyset-paged fake table. `onPage` runs after each page is served, which is
 * where a test simulates a concurrent insert.
 */
function fakeSource(
  rows: HashRowDto[],
  onPage?: (served: number, table: HashRowDto[]) => void,
): { source: HashSource; cursors: (string | null)[]; table: HashRowDto[] } {
  const table = rows.slice();
  const cursors: (string | null)[] = [];
  let served = 0;
  const source: HashSource = {
    async fetchManifest() {
      return { entryCount: table.length, newestHashedAt: '2026-08-19T00:00:00Z', algoVersion: 1 };
    },
    async fetchRows(_since, afterCardId, limit) {
      cursors.push(afterCardId);
      const sorted = table.slice().sort((a, b) => a.card_id.localeCompare(b.card_id));
      const start = afterCardId === null ? 0 : sorted.findIndex((r) => r.card_id > afterCardId);
      const page = start < 0 ? [] : sorted.slice(start, start + limit);
      served++;
      onPage?.(served, table);
      return page;
    },
  };
  return { source, cursors, table };
}

test('the loader pages by key, not by offset', async () => {
  // 2500 rows against a 2000-row page forces a second page. The cursor handed
  // to that second call must be the last id of the first page — an offset-paged
  // loader would ask for a number instead.
  const rows = Array.from({ length: 2500 }, (_, i) => dto(id(i), id(i)));
  const { source, cursors } = fakeSource(rows);

  const index = await loadHashIndex(source);

  assert.equal(index.size, 2500);
  assert.equal(cursors[0], null, 'first page must start from the beginning');
  assert.equal(cursors[1], id(1999), 'second page must resume after the last id of the first');
});

test('a row inserted mid-download is never skipped', async () => {
  // The exact production race: the catalogue sync inserts a row that sorts
  // BEFORE the page boundary while the browser is between pages. Under offset
  // paging every later row shifts right by one and the row that slid across the
  // boundary is never returned. Keyset paging cannot lose it.
  const rows = Array.from({ length: 2500 }, (_, i) => dto(id(i * 2), id(i * 2)));
  const inserted = dto(id(1), id(1)); // sorts second, far behind the boundary

  const { source } = fakeSource(rows, (served, table) => {
    if (served === 1) table.push(inserted);
  });

  const index = await loadHashIndex(source);

  // Every original row must still be present.
  for (let i = 0; i < 2500; i++) {
    assert.notEqual(
      index.distanceTo(id(i * 2), { hi: 0, lo: 0 }, { hi: 0, lo: 0 }),
      null,
      `row ${id(i * 2)} was dropped by the download`,
    );
  }
  assert.equal(index.size, 2500, 'no row may be lost when the table grows mid-download');
});

test('printings of one card share an oracle group across a page boundary', async () => {
  // Grouping is assigned during packing, over the concatenation of all pages.
  // If paging dropped or reordered rows, two printings of the same card could
  // land in different groups — which would make the engine treat them as
  // different cards and commit to one without ever offering the other.
  const rows: HashRowDto[] = [];
  for (let i = 0; i < 1999; i++) rows.push(dto(id(i), id(i)));
  rows.push(dto(id(1999), 'shared-oracle'));
  rows.push(dto(id(2000), 'shared-oracle')); // first row of page two

  const { source } = fakeSource(rows);
  const index = await loadHashIndex(source);

  const a = index.distanceTo(id(1999), { hi: 0, lo: 0 }, { hi: 0, lo: 0 });
  const b = index.distanceTo(id(2000), { hi: 0, lo: 0 }, { hi: 0, lo: 0 });
  assert.ok(a && b);
  assert.equal(a.oracleGroup, b.oracleGroup, 'siblings split across pages must still group together');
  assert.equal(index.printingsInGroup(a.oracleGroup).length, 2);
});

test('a source that ignores the cursor terminates instead of looping forever', async () => {
  // Defensive: a backend that silently drops the `gt` filter would serve page
  // one forever. Pinning the tab is a worse failure than a short index, which
  // the caller can at least notice against the manifest count.
  const rows = Array.from({ length: 2500 }, (_, i) => dto(id(i), id(i)));
  let calls = 0;
  const source: HashSource = {
    async fetchManifest() {
      return { entryCount: rows.length, newestHashedAt: null, algoVersion: 1 };
    },
    async fetchRows(_since, _after, limit) {
      calls++;
      if (calls > 20) throw new Error('loader looped on a non-advancing cursor');
      return rows.slice(0, limit); // always the same page
    },
  };

  const index = await loadHashIndex(source);
  assert.ok(calls <= 3, `expected the loader to stop quickly, took ${calls} calls`);
  assert.equal(index.size, 2000);
});

test('an empty table yields an empty index rather than hanging', async () => {
  const { source } = fakeSource([]);
  const index = await loadHashIndex(source);
  assert.equal(index.size, 0);
});
