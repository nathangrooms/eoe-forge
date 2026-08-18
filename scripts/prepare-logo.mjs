/**
 * Prepare the DeckMatrix logotype for the app.
 *
 *   node scripts/prepare-logo.mjs <source-image>
 *
 * The supplied logotype arrives on a white background. Placed as-is on the
 * charcoal chrome that would show as a white slab, so this:
 *
 *   1. Strips the white ground to transparency (with a tolerance, because the
 *      edges are antialiased against white and a hard threshold leaves a halo).
 *   2. Trims the surrounding transparent margin so the mark's own height is
 *      what the CSS height controls — otherwise padding baked into the file
 *      makes the logo look small and inconsistently placed.
 *   3. Emits 1x and 2x WebP at the sizes the header actually uses.
 *
 * Writes public/logo-deckmatrix.webp and public/logo-deckmatrix@2x.webp.
 */

import sharp from 'sharp';
import { existsSync } from 'node:fs';

const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error('Usage: node scripts/prepare-logo.mjs <source-image>');
  console.error('The source file was not found.');
  process.exit(1);
}

/** Pixels this close to pure white become transparent. */
const WHITE_TOLERANCE = 26;

const image = sharp(src).ensureAlpha();
const { width, height } = await image.metadata();
console.log(`source: ${width}x${height}`);

const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
const px = new Uint8ClampedArray(data);

let cleared = 0;
for (let i = 0; i < px.length; i += info.channels) {
  const r = px[i], g = px[i + 1], b = px[i + 2];
  const min = Math.min(r, g, b);
  if (min >= 255 - WHITE_TOLERANCE) {
    /* Fade rather than hard-cut, so antialiased edges do not leave a halo. */
    const distance = 255 - min;
    px[i + 3] = Math.round((distance / WHITE_TOLERANCE) * px[i + 3]);
    if (px[i + 3] === 0) cleared++;
  }
}
console.log(`cleared ${cleared} background pixels`);

const transparent = sharp(Buffer.from(px), {
  raw: { width: info.width, height: info.height, channels: info.channels },
}).trim();

const trimmed = await transparent.toBuffer({ resolveWithObject: true });
console.log(`trimmed to: ${trimmed.info.width}x${trimmed.info.height}`);

/* The header renders at h-8 (32px) and the auth panel at h-12 (48px); 2x of the
   largest use is the ceiling worth shipping. */
for (const [out, h] of [['public/logo-deckmatrix.webp', 96], ['public/logo-deckmatrix@2x.webp', 192]]) {
  await sharp(trimmed.data).resize({ height: h }).webp({ quality: 92, effort: 6 }).toFile(out);
  console.log('wrote', out);
}
