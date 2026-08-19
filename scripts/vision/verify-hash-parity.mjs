/**
 * Assert the shipped JavaScript hash implementation reproduces the OpenCV
 * reference exactly, on real card images.
 *
 * Why this matters: the index is built once in Node and queried forever in a
 * browser, and the accuracy thresholds baked into the recogniser were measured
 * with OpenCV. Silent arithmetic drift between the two would not throw — it
 * would just quietly lower accuracy. So we pin it.
 *
 * Usage:
 *   python scripts/vision/parity-reference.py <imgdir> ref.json 200
 *   node --experimental-strip-types scripts/vision/verify-hash-parity.mjs <imgdir> ref.json
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { rgbToGray, cropGray, resizeAreaGray } from '../../src/lib/vision/image.ts';
import { pHash, dHash, hashToHex } from '../../src/lib/vision/hash.ts';
import { ART_WINDOW } from '../../src/lib/vision/artWindow.ts';

const [imgdir, refPath] = process.argv.slice(2);
if (!imgdir || !refPath) {
  console.error('usage: verify-hash-parity.mjs <imgdir> <ref.json>');
  process.exit(2);
}

const ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));

let checked = 0;
const mismatches = [];
const graySumMismatches = [];

for (const row of ref) {
  const buf = await sharp(path.join(imgdir, `${row.id}.jpg`))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = buf.info;
  const gray = rgbToGray(new Uint8Array(buf.data), width, height);
  const art = cropGray(gray, ART_WINDOW);

  // localise any failure: compare the 32x32 reduction before the DCT
  const g32 = resizeAreaGray(gray, 32, 32);
  let s = 0;
  for (const v of g32.data) s += v;
  const a32 = resizeAreaGray(art, 32, 32);
  let as = 0;
  for (const v of a32.data) as += v;
  if (s !== row.gray32_checksum || as !== row.art_gray32_checksum) {
    graySumMismatches.push({
      id: row.id,
      js_whole: s,
      py_whole: row.gray32_checksum,
      js_art: as,
      py_art: row.art_gray32_checksum,
    });
  }

  const got = {
    whole_p: hashToHex(pHash(gray)),
    whole_d: hashToHex(dHash(gray)),
    art_p: hashToHex(pHash(art)),
    art_d: hashToHex(dHash(art)),
  };
  for (const k of Object.keys(got)) {
    if (got[k] !== row[k]) mismatches.push({ id: row.id, field: k, js: got[k], py: row[k] });
  }
  checked++;
}

// The 32x32 checksum is a diagnostic, not the contract. OpenCV rounds the
// area-resize accumulator half-to-even; we round half-away-from-zero. On a
// 1024-pixel reduction that lands one pixel one grey level apart now and then.
// It is reported so the size of the discrepancy stays visible, but the contract
// is hash equality — a hash bit only flips if a coefficient crosses the median,
// and a single-level nudge on one pixel does not do that.
let maxGrayDelta = 0;
for (const m of graySumMismatches) {
  maxGrayDelta = Math.max(maxGrayDelta, Math.abs(m.js_whole - m.py_whole), Math.abs(m.js_art - m.py_art));
}

const result = {
  images_checked: checked,
  hash_fields_compared: checked * 4,
  hash_mismatches: mismatches.length,
  hash_parity: mismatches.length === 0,
  gray32_reductions_compared: checked * 2,
  gray32_checksum_mismatches: graySumMismatches.length,
  gray32_max_abs_delta: maxGrayDelta,
};
console.log(JSON.stringify(result, null, 2));
if (mismatches.length) console.log('sample hash mismatches:', JSON.stringify(mismatches.slice(0, 8), null, 1));
// A checksum delta above 1 would mean a real algorithmic divergence rather than
// a rounding tie, so that is worth failing on even though hashes still match.
if (maxGrayDelta > 1) {
  console.error(`gray32 delta ${maxGrayDelta} exceeds rounding tolerance of 1`);
  process.exit(1);
}
process.exit(result.hash_parity ? 0 : 1);
