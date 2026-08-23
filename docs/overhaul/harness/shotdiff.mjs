/**
 * How different are two full-page screenshots, really.
 *
 * Byte inequality proves nothing on this app: card art comes from the real
 * Scryfall CDN, so one run can finish an image the other had not. Compare
 * PIXELS, and report where the differing ones are, so a layout change cannot
 * hide behind "the images loaded differently".
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), 'shots');

const pairs = fs
  .readdirSync(dir)
  .filter(f => f.includes('-BEFORE-'))
  .map(f => [f, f.replace('-BEFORE-', '-AFTER-')])
  .filter(([, a]) => fs.existsSync(path.join(dir, a)));

for (const [b, a] of pairs) {
  const B = sharp(path.join(dir, b));
  const A = sharp(path.join(dir, a));
  const mb = await B.metadata();
  const ma = await A.metadata();

  if (mb.width !== ma.width || mb.height !== ma.height) {
    console.log(
      `SIZE   ${b.padEnd(44)} ${mb.width}x${mb.height} vs ${ma.width}x${ma.height}`
    );
    continue;
  }

  const rawB = await B.raw().toBuffer();
  const rawA = await A.raw().toBuffer();
  const channels = mb.channels;
  let differing = 0;
  let firstRow = -1;
  let lastRow = -1;
  for (let y = 0; y < mb.height; y += 1) {
    let rowDiff = 0;
    for (let x = 0; x < mb.width; x += 1) {
      const i = (y * mb.width + x) * channels;
      if (
        Math.abs(rawB[i] - rawA[i]) > 8 ||
        Math.abs(rawB[i + 1] - rawA[i + 1]) > 8 ||
        Math.abs(rawB[i + 2] - rawA[i + 2]) > 8
      )
        rowDiff += 1;
    }
    if (rowDiff > 0) {
      differing += rowDiff;
      if (firstRow < 0) firstRow = y;
      lastRow = y;
    }
  }
  const total = mb.width * mb.height;
  const pct = ((differing / total) * 100).toFixed(3);
  console.log(
    `${differing === 0 ? 'SAME  ' : 'DIFF  '} ${b.replace('-BEFORE', '').padEnd(40)} ${mb.width}x${mb.height}  ${pct}% pixels` +
      (differing ? `  rows ${firstRow}-${lastRow}` : '')
  );
}
