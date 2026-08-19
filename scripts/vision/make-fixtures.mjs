/**
 * Build the committed test fixtures for the recognition regression suite.
 *
 * The suite needs to run over *real card photographs* — synthetic patterns
 * cannot catch the failures that matter — but it also has to live in the repo
 * and run in CI without a database, a network, or a 1.8 MB index. So this
 * produces a small self-contained corpus:
 *
 *   cards/<id>.jpg     the catalogue render, i.e. what the index was built from
 *   captures/<id>.jpg  a degraded "photograph" of that card, downscaled
 *   index.bin          those cards plus several thousand real distractors
 *   truth.json         ids, names, sets, collector numbers, sibling printings
 *
 * The distractors matter. An index containing only the answer would make
 * matching trivially easy and the test worthless as a regression signal; real
 * distractor hashes mean a change that degrades discrimination shows up here.
 * Headline accuracy still comes from `evaluate.mjs` against the full index —
 * this corpus pins behaviour, it does not measure it.
 *
 * Usage:
 *   node --experimental-strip-types scripts/vision/make-fixtures.mjs \
 *     --index <full-index.bin> --testset <testset.json> \
 *     --cards <smallimgdir> --captures <capturedir> --out src/lib/vision/__fixtures__
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { CardHashIndex } from '../../src/lib/vision/hashIndex.ts';

const argv = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const FULL_INDEX = opt('index');
const TESTSET = opt('testset');
const CARDS_DIR = opt('cards');
const CAPTURE_DIR = opt('captures');
const OUT = opt('out', 'src/lib/vision/__fixtures__');
const DISTRACTORS = parseInt(opt('distractors', '6000'), 10);

if (!FULL_INDEX || !TESTSET || !CARDS_DIR || !CAPTURE_DIR) {
  console.error('missing required arguments; see header');
  process.exit(2);
}

const full = CardHashIndex.fromBytes(new Uint8Array(fs.readFileSync(FULL_INDEX)));
const testset = JSON.parse(fs.readFileSync(TESTSET, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(CAPTURE_DIR, 'manifest.json'), 'utf8'));

/**
 * Chosen to cover the cases that actually break things, not a random sample:
 * a card whose printings share art (must defer), a card with a unique art
 * printing (must resolve), a special frame, a double-faced card, and plain
 * controls.
 */
const WANT_GROUPS = ['F_regression', 'A_multi_printing', 'C_special_frame', 'D_double_faced', 'E_control'];
const PER_GROUP = 2;

const picked = [];
for (const g of WANT_GROUPS) {
  const inGroup = testset.filter((r) => r.group === g);
  for (const r of inGroup.slice(0, PER_GROUP)) picked.push(r);
}

// Keep only cards we have both a render and a capture for.
const CONDITIONS = ['clean', 'moderate'];
const usable = picked.filter(
  (r) =>
    fs.existsSync(path.join(CARDS_DIR, `${r.id}.jpg`)) &&
    CONDITIONS.every((c) => fs.existsSync(path.join(CAPTURE_DIR, c, `${r.id}.jpg`))),
);

console.log(`picked ${usable.length} fixture cards of ${picked.length} candidates`);

fs.mkdirSync(path.join(OUT, 'cards'), { recursive: true });
for (const c of CONDITIONS) fs.mkdirSync(path.join(OUT, 'captures', c), { recursive: true });

let bytesWritten = 0;
for (const r of usable) {
  const cardDest = path.join(OUT, 'cards', `${r.id}.jpg`);
  fs.copyFileSync(path.join(CARDS_DIR, `${r.id}.jpg`), cardDest);
  bytesWritten += fs.statSync(cardDest).size;

  for (const cond of CONDITIONS) {
    const dest = path.join(OUT, 'captures', cond, `${r.id}.jpg`);
    // Downscaled and re-encoded to keep the repo small. At 440px the card is
    // still ~230px wide in frame — comfortably more than the hash needs, since
    // the art is reduced to 32x32 regardless, and enough for the detector to
    // find four corners. Chroma is irrelevant to a grayscale pipeline, so the
    // aggressive quality setting costs nothing that this test measures.
    await sharp(path.join(CAPTURE_DIR, cond, `${r.id}.jpg`))
      .resize({ width: 440 })
      .jpeg({ quality: 70, chromaSubsampling: '4:2:0' })
      .toFile(dest);
    bytesWritten += fs.statSync(dest).size;
  }
}

// ---- the fixture index: the answers plus real distractors ----------------
const wantedIds = new Set(usable.map((r) => r.id));
for (const r of usable) for (const s of r.sibling_ids ?? []) wantedIds.add(s);

// Every truth card and its siblings first, so printing resolution has
// something real to resolve between.
const chosen = new Map();
for (let i = 0; i < full.size; i++) {
  const id = full.cardIdAt(i);
  if (wantedIds.has(id) && !chosen.has(id)) chosen.set(id, full.rowAt(i));
}
const truthRowCount = chosen.size;

// Distractors, spread evenly across the catalogue rather than taken as a
// prefix, so they are not all from one alphabetical corner.
const step = Math.max(1, Math.floor(full.size / DISTRACTORS));
for (let i = 0; i < full.size && chosen.size < truthRowCount + DISTRACTORS; i += step) {
  const id = full.cardIdAt(i);
  if (!chosen.has(id)) chosen.set(id, full.rowAt(i));
}

const realRows = [...chosen.values()];

const fixtureIndex = CardHashIndex.fromRows(realRows);
const blob = fixtureIndex.toBytes();
fs.writeFileSync(path.join(OUT, 'index.bin'), blob);
bytesWritten += blob.byteLength;

const truth = usable.map((r) => ({
  id: r.id,
  name: r.name,
  oracle_id: r.oracle_id,
  set: r.set,
  set_name: r.set_name,
  cn: r.cn,
  layout: r.layout,
  group: r.group,
  group_size: r.group_size,
  sibling_ids: r.sibling_ids ?? [],
}));
fs.writeFileSync(path.join(OUT, 'truth.json'), JSON.stringify(truth, null, 1));

console.log(
  JSON.stringify(
    {
      fixture_cards: usable.length,
      conditions: CONDITIONS,
      index_entries: fixtureIndex.size,
      truth_and_siblings: truthRowCount,
      index_kb: +(blob.byteLength / 1024).toFixed(1),
      total_fixture_kb: +(bytesWritten / 1024).toFixed(1),
      out: OUT,
    },
    null,
    2,
  ),
);
