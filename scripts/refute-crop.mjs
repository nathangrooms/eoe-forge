/**
 * Cut readable slices out of the full-page walk screenshots.
 *
 *   node scripts/refute-crop.mjs scratch/refute-1600 scratch/refute-slices 1500
 *
 * A full-page shot of a 10,000px deck tab shrinks to an unreadable ribbon. This
 * takes the first N pixels of each and scales that to a width a person (or a
 * model) can actually read.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const IN = process.argv[2] || 'scratch/refute-1600';
const OUT = process.argv[3] || 'scratch/refute-slices';
const TOP = Number(process.argv[4] || 1500);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

fs.mkdirSync(OUT, { recursive: true });

for (const file of fs.readdirSync(IN)) {
  if (!file.endsWith('.png')) continue;
  const base = file.replace(/-\d+\.png$/, '');
  if (ONLY && !ONLY.includes(base)) continue;
  const img = sharp(path.join(IN, file));
  const meta = await img.metadata();
  const h = Math.min(TOP, meta.height);
  await sharp(path.join(IN, file))
    .extract({ left: 0, top: 0, width: meta.width, height: h })
    .resize({ width: 900 })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, file));
  console.log(`${file}  ${meta.width}x${meta.height} -> top ${h}`);
}
