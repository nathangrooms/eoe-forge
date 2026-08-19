/**
 * Build the perceptual-hash index over every printing in the catalogue.
 *
 * Downloads each printing's artwork, rectifies nothing (catalogue renders are
 * already flat and square-on), crops the art window, hashes it with the exact
 * same code the browser runs, and upserts the result into
 * `public.card_image_hashes`.
 *
 * INCREMENTAL BY DEFAULT. A row is rebuilt only when one of these is true:
 *   * it has no hash row yet (new card from the nightly sync);
 *   * `source_url` differs from the catalogue's current image URL (Scryfall
 *     re-rendered the art — its URLs carry a cache-busting timestamp);
 *   * `algo_version` is below the current one (we changed the hash or the art
 *     window, so every row is stale by definition).
 * So the nightly path costs one query plus however many cards were added,
 * rather than 34k image downloads.
 *
 * Usage:
 *   node --experimental-strip-types scripts/vision/build-hash-index.mjs [options]
 *
 *     --cache <dir>     reuse/populate a local image cache (skips re-download)
 *     --limit <n>       only process n rows (for a smoke run)
 *     --full            ignore existing rows and rehash everything
 *     --dry-run         compute but do not write to the database
 *     --concurrency <n> parallel image fetches, default 12
 *     --out <file>      also write the packed binary blob here, and report its size
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment
 * (service role, because the table is read-only to anon by design).
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

import { rgbToGray, cropGray } from '../../src/lib/vision/image.ts';
import { pHash, dHash, hashToHex } from '../../src/lib/vision/hash.ts';
import { ART_WINDOW } from '../../src/lib/vision/artWindow.ts';
import { CardHashIndex } from '../../src/lib/vision/hashIndex.ts';

/** Bump together with the `algo_version` default in the migration. */
const ALGO_VERSION = 1;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const CACHE_DIR = opt('cache');
const LIMIT = opt('limit') ? parseInt(opt('limit'), 10) : Infinity;
const FULL = flag('full');
const DRY_RUN = flag('dry-run');
const CONCURRENCY = parseInt(opt('concurrency', '12'), 10);
const OUT_BLOB = opt('out');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const READ_KEY = SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !READ_KEY) {
  console.error('set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY for --dry-run)');
  process.exit(2);
}
if (!DRY_RUN && !SERVICE_KEY) {
  console.error('writing requires SUPABASE_SERVICE_ROLE_KEY; use --dry-run to compute without writing');
  process.exit(2);
}

// Scryfall rejects generic User-Agents with HTTP 400. Identify ourselves.
const IMAGE_HEADERS = {
  'User-Agent': 'DeckMatrix-HashIndex/1.0 (+https://deckmatrix.app)',
  Accept: 'image/jpeg,image/png,*/*',
};

async function rest(pathAndQuery, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: READ_KEY,
      Authorization: `Bearer ${READ_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`REST ${res.status} ${pathAndQuery}: ${await res.text()}`);
  return res;
}

/**
 * Page through a table by key, not by offset.
 *
 * OFFSET pagination re-scans and discards every preceding row, so page N costs
 * O(N * pageSize) and the last pages of a 38k table time out once the database
 * is also serving the nightly sync. Worse, it is *incorrect* under concurrent
 * inserts: a row added earlier in the sort order shifts everything right, so
 * offset paging silently skips rows. The catalogue sync writes continuously, so
 * that is not hypothetical here.
 *
 * Keyset pagination ("give me the next N after this id") is O(log n) per page
 * via the primary key and cannot skip or duplicate rows.
 */
async function fetchAllKeyset(table, select, keyCol = 'id', pageSize = 500) {
  const rows = [];
  let cursor = null;
  for (;;) {
    const where = cursor === null ? '' : `&${keyCol}=gt.${encodeURIComponent(cursor)}`;
    const res = await restWithRetry(
      `${table}?select=${select}&order=${keyCol}.asc&limit=${pageSize}${where}`,
    );
    const batch = await res.json();
    if (batch.length === 0) break;
    rows.push(...batch);
    cursor = batch[batch.length - 1][keyCol];
    if (batch.length < pageSize) break;
  }
  return rows;
}

/** The catalogue sync makes transient 500s and statement timeouts normal. Retry them. */
async function restWithRetry(pathAndQuery, attempts = 5) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await rest(pathAndQuery);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr;
}

const t0 = Date.now();
process.stdout.write('reading catalogue...\n');
// `image_uris` is a fat jsonb blob (six URLs per row) and we need exactly one
// field from it. Projecting it server-side with a PostgREST json path cuts the
// response by roughly 80%, which is the difference between this completing and
// hitting a statement timeout while the nightly catalogue sync is running.
const cards = await fetchAllKeyset(
  'cards',
  'id,oracle_id,name,small:image_uris->>small,normal:image_uris->>normal',
  'id',
);

// Alchemy rows are digital-only rebalanced cards. They can never be
// photographed from cardboard, and they carry the *same art* as their paper
// original — so leaving them in the index creates pairs that are identical in
// hash space and can only produce wrong answers. Excluding them is a pure win.
const alchemy = cards.filter((c) => c.name?.startsWith('A-')).length;

const catalogue = cards
  .filter((c) => !c.name?.startsWith('A-'))
  .map((c) => ({
    id: c.id,
    oracleId: c.oracle_id,
    url: c.small || c.normal || null,
  }))
  .filter((c) => c.url);

const missingImage = cards.length - alchemy - catalogue.length;

process.stdout.write(
  `catalogue: ${cards.length} rows, ${alchemy} Alchemy excluded, ${missingImage} without images, ${catalogue.length} to consider\n`,
);

// ---- work out what is actually stale -----------------------------------
let existing = new Map();
if (!FULL) {
  process.stdout.write('reading existing hashes...\n');
  const rows = await fetchAllKeyset(
    'card_image_hashes',
    'card_id,source_url,algo_version',
    'card_id',
  );
  existing = new Map(rows.map((r) => [r.card_id, r]));
  process.stdout.write(`existing hash rows: ${existing.size}\n`);
}

const stale = catalogue.filter((c) => {
  const prev = existing.get(c.id);
  if (!prev) return true;
  if (prev.algo_version < ALGO_VERSION) return true;
  return prev.source_url !== c.url;
});

const work = stale.slice(0, Number.isFinite(LIMIT) ? LIMIT : stale.length);
process.stdout.write(
  `${stale.length} rows stale (${catalogue.length - stale.length} already current); processing ${work.length}\n`,
);

// ---- hash ---------------------------------------------------------------
const results = [];
const failures = [];
let done = 0;
let fetched = 0;
let fromCache = 0;
let downloadedBytes = 0;

if (CACHE_DIR) fs.mkdirSync(CACHE_DIR, { recursive: true });

async function loadImage(row) {
  const cachePath = CACHE_DIR ? path.join(CACHE_DIR, `${row.id}.jpg`) : null;
  if (cachePath && fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
    fromCache++;
    return fs.readFileSync(cachePath);
  }
  // Scryfall asks for ~100ms between requests; with modest concurrency and
  // retries this stays well inside their guidance.
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(row.url, { headers: IMAGE_HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fetched++;
      downloadedBytes += buf.byteLength;
      if (cachePath) fs.writeFileSync(cachePath, buf);
      return buf;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function hashOne(row) {
  const buf = await loadImage(row);
  const raw = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const gray = rgbToGray(new Uint8Array(raw.data), raw.info.width, raw.info.height);
  const art = cropGray(gray, ART_WINDOW);
  return {
    card_id: row.id,
    oracle_id: row.oracleId,
    art_phash: hashToHex(pHash(art)),
    art_dhash: hashToHex(dHash(art)),
    source_url: row.url,
    algo_version: ALGO_VERSION,
  };
}

async function worker(slice) {
  for (const row of slice) {
    try {
      results.push(await hashOne(row));
    } catch (err) {
      failures.push({ id: row.id, error: String(err?.message ?? err) });
    }
    done++;
    if (done % 2000 === 0) {
      const rate = done / ((Date.now() - t0) / 1000);
      process.stdout.write(`  ${done}/${work.length}  ${rate.toFixed(0)}/s\n`);
    }
  }
}

const slices = Array.from({ length: CONCURRENCY }, (_, i) =>
  work.filter((_, idx) => idx % CONCURRENCY === i),
);
const tHash = Date.now();
await Promise.all(slices.map(worker));
const hashSeconds = (Date.now() - tHash) / 1000;

// ---- write --------------------------------------------------------------
let written = 0;
if (!DRY_RUN && results.length) {
  process.stdout.write('upserting...\n');
  const CHUNK = 500;
  for (let i = 0; i < results.length; i += CHUNK) {
    const chunk = results.slice(i, i + CHUNK).map(({ oracle_id, ...row }) => row);
    await upsertHashes(chunk);
    written += chunk.length;
  }
}

async function upsertHashes(chunk) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/card_image_hashes`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(chunk),
  });
  if (!res.ok) throw new Error(`upsert ${res.status}: ${await res.text()}`);
}

// ---- optionally emit the packed blob and measure it ---------------------
let blobReport = null;
if (OUT_BLOB) {
  // Build the blob from the full current index, not just this run's slice, so
  // the reported size is the real shipping size.
  const all = new Map(results.map((r) => [r.card_id, r]));
  if (!FULL) {
    // pull the rows we did not rebuild
    const rows = await fetchAllKeyset(
      'card_image_hashes',
      'card_id,art_phash,art_dhash',
      'card_id',
    );
    for (const r of rows) if (!all.has(r.card_id)) all.set(r.card_id, r);
  }

  const oracleOf = new Map(catalogue.map((c) => [c.id, c.oracleId]));
  const groupIds = new Map();
  const rows = [];
  for (const [cardId, r] of all) {
    const oid = oracleOf.get(cardId) ?? cardId;
    if (!groupIds.has(oid)) groupIds.set(oid, groupIds.size);
    rows.push({
      cardId,
      oracleGroup: groupIds.get(oid),
      artPHash: hexToHash64(r.art_phash),
      artDHash: hexToHash64(r.art_dhash),
    });
  }
  const index = CardHashIndex.fromRows(rows);
  const bytes = index.toBytes();
  fs.writeFileSync(OUT_BLOB, bytes);
  blobReport = {
    path: OUT_BLOB,
    entries: rows.length,
    distinct_cards: groupIds.size,
    bytes: bytes.byteLength,
    kb: +(bytes.byteLength / 1024).toFixed(1),
    bytes_per_entry: +(bytes.byteLength / rows.length).toFixed(1),
  };
}

function hexToHash64(hex) {
  return { hi: parseInt(hex.slice(0, 8), 16) >>> 0, lo: parseInt(hex.slice(8, 16), 16) >>> 0 };
}

const totalSeconds = (Date.now() - t0) / 1000;
console.log(
  JSON.stringify(
    {
      algo_version: ALGO_VERSION,
      mode: FULL ? 'full' : 'incremental',
      dry_run: DRY_RUN,
      catalogue_rows: cards.length,
      alchemy_excluded: alchemy,
      without_images: missingImage,
      considered: catalogue.length,
      already_current: catalogue.length - stale.length,
      stale: stale.length,
      processed: work.length,
      hashed_ok: results.length,
      failures: failures.length,
      images_from_cache: fromCache,
      images_downloaded: fetched,
      downloaded_mb: +(downloadedBytes / 1024 / 1024).toFixed(1),
      hash_seconds: +hashSeconds.toFixed(1),
      ms_per_image: results.length ? +((hashSeconds * 1000) / results.length).toFixed(2) : null,
      rows_written: written,
      total_seconds: +totalSeconds.toFixed(1),
      packed_blob: blobReport,
      sample_failures: failures.slice(0, 5),
    },
    null,
    2,
  ),
);
