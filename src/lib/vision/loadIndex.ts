/**
 * Getting the hash index into the browser, once, and keeping it fresh.
 *
 * The index lives in Postgres (`card_image_hashes`) because the catalogue is a
 * moving target — the nightly Scryfall sync adds printings continuously, and an
 * asset baked into the bundle would silently fail to recognise every card added
 * since the last deploy.
 *
 * But 38k rows of JSON is several megabytes and dozens of round trips, which is
 * not something to do on every page load. So:
 *
 *   first visit   fetch all rows, pack them into the compact binary layout,
 *                 store the blob in IndexedDB with the manifest as its key
 *   later visits  read the blob back (one IndexedDB get, no network), then
 *                 check the manifest and fetch only rows newer than the
 *                 watermark
 *
 * The result is a ~1.3 MB one-time cost and near-zero cost thereafter, with
 * freshness that tracks the database rather than the deploy.
 */

import { CardHashIndex, type IndexRow } from './hashIndex.ts';
import { hexToHash } from './hash.ts';

const DB_NAME = 'deckmatrix-vision';
const DB_VERSION = 1;
const STORE = 'hash-index';
const BLOB_KEY = 'index-v1';
const META_KEY = 'index-v1-meta';

export interface IndexLoadProgress {
  phase: 'cache' | 'manifest' | 'download' | 'pack' | 'ready';
  loaded: number;
  total: number;
}

interface CachedMeta {
  entryCount: number;
  newestHashedAt: string | null;
  algoVersion: number;
  /** Maps card id -> dense oracle group, so deltas can extend the grouping. */
  groupSeed: number;
}

/** Minimal Supabase-client surface this module needs, so it can be stubbed in tests. */
export interface HashSource {
  fetchManifest(): Promise<{ entryCount: number; newestHashedAt: string | null; algoVersion: number }>;
  /**
   * The next `limit` rows ordered by `card_id`, strictly after `afterCardId`
   * (or from the start when it is null).
   *
   * KEYSET, not offset. `card_image_hashes` is written continuously by the
   * catalogue sync while the browser is downloading it, and OFFSET paging is
   * incorrect under concurrent inserts: a row inserted earlier in the sort
   * order shifts every later row right by one, so the next page skips whatever
   * slid across the boundary. A skipped row is a printing missing from the
   * index, and a missing printing does not degrade gracefully — the engine
   * finds the absent printing's sibling instead, sees no contender within the
   * ambiguity margin, and commits to the WRONG printing as `hash-unique-art`.
   * That is exactly the silent-wrong-printing failure this feature exists to
   * prevent, so the download path must not be able to manufacture it.
   *
   * `scripts/vision/build-hash-index.mjs` reached the same conclusion for the
   * server side; this is the client half of the same fix.
   */
  fetchRows(since: string | null, afterCardId: string | null, limit: number): Promise<HashRowDto[]>;
}

export interface HashRowDto {
  card_id: string;
  oracle_id: string;
  art_phash: string;
  art_dhash: string;
  hashed_at: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Drop the cached index. Used when the algorithm version changes. */
export async function clearCachedIndex(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(BLOB_KEY);
    tx.objectStore(STORE).delete(META_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load the index, using the cache when it is current.
 *
 * `source` is injected so this is testable without a browser or a database.
 */
export async function loadHashIndex(
  source: HashSource,
  onProgress?: (p: IndexLoadProgress) => void,
): Promise<CardHashIndex> {
  const report = (phase: IndexLoadProgress['phase'], loaded = 0, total = 0) =>
    onProgress?.({ phase, loaded, total });

  report('cache');
  let cachedBlob: ArrayBuffer | undefined;
  let cachedMeta: CachedMeta | undefined;
  try {
    cachedBlob = await idbGet<ArrayBuffer>(BLOB_KEY);
    cachedMeta = await idbGet<CachedMeta>(META_KEY);
  } catch {
    // Private browsing and some embedded webviews refuse IndexedDB. Falling
    // back to a fresh download is slower but entirely correct.
  }

  report('manifest');
  let manifest: Awaited<ReturnType<HashSource['fetchManifest']>> | null = null;
  try {
    manifest = await source.fetchManifest();
  } catch {
    // Offline. A cached index is exactly what we want here.
    if (cachedBlob) {
      report('ready');
      return CardHashIndex.fromBytes(new Uint8Array(cachedBlob));
    }
    throw new Error('Card index is not cached and the network is unavailable.');
  }

  // A cached index built by an older hash algorithm is not merely stale, it is
  // incomparable — its distances mean nothing against new queries.
  const algoChanged = cachedMeta != null && cachedMeta.algoVersion !== manifest.algoVersion;
  if (algoChanged) {
    await clearCachedIndex().catch(() => {});
    cachedBlob = undefined;
    cachedMeta = undefined;
  }

  if (
    cachedBlob &&
    cachedMeta &&
    cachedMeta.entryCount === manifest.entryCount &&
    cachedMeta.newestHashedAt === manifest.newestHashedAt
  ) {
    report('ready');
    return CardHashIndex.fromBytes(new Uint8Array(cachedBlob));
  }

  // Cache is stale or absent. A partial (delta) update would need the existing
  // rows' oracle grouping, which the packed blob deliberately does not store as
  // ids — so when anything changed, rebuild from a full download. At ~1.3 MB
  // and only when the catalogue actually moves, that is the simpler correct
  // choice over a delta-merge path that is hard to test and easy to get subtly
  // wrong.
  report('download', 0, manifest.entryCount);
  const PAGE = 2000;
  const dtos: HashRowDto[] = [];
  let cursor: string | null = null;
  for (;;) {
    const batch = await source.fetchRows(null, cursor, PAGE);
    if (batch.length === 0) break;

    // A cursor that fails to advance means the source is not honouring
    // `afterCardId` and is re-serving the page we just read. Discard it rather
    // than appending: absorbing it would duplicate every row, and a duplicated
    // printing shows up twice in its own sibling list, inflating the contender
    // count and making the engine ask the user to choose between a card and
    // itself. Stopping here leaves a short index, which the caller can detect
    // against the manifest's entry count; looping would pin the tab forever.
    const next = batch[batch.length - 1].card_id;
    if (next === cursor) break;

    dtos.push(...batch);
    cursor = next;
    report('download', dtos.length, manifest.entryCount);
    if (batch.length < PAGE) break;
  }

  report('pack', dtos.length, dtos.length);
  const groups = new Map<string, number>();
  const rows: IndexRow[] = dtos.map((d) => {
    let g = groups.get(d.oracle_id);
    if (g === undefined) {
      g = groups.size;
      groups.set(d.oracle_id, g);
    }
    return {
      cardId: d.card_id,
      oracleGroup: g,
      artPHash: hexToHash(d.art_phash),
      artDHash: hexToHash(d.art_dhash),
    };
  });

  const index = CardHashIndex.fromRows(rows);
  try {
    const bytes = index.toBytes();
    await idbPut(BLOB_KEY, bytes.buffer);
    await idbPut(META_KEY, {
      entryCount: manifest.entryCount,
      newestHashedAt: manifest.newestHashedAt,
      algoVersion: manifest.algoVersion,
      groupSeed: groups.size,
    } satisfies CachedMeta);
  } catch {
    // Caching is an optimisation; failing to cache must not fail the load.
  }

  report('ready');
  return index;
}
