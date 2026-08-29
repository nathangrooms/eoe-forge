/** Crop a region out of a shot so a defect can be looked at rather than assumed. */
import sharp from 'sharp';
const [,, src, x, y, w, h, out, scale] = process.argv;
const s = Number(scale || 1);
const img = sharp(src).extract({ left: +x, top: +y, width: +w, height: +h });
if (s !== 1) img.resize({ width: Math.round(+w * s) });
await img.toFile(out);
console.log('wrote', out);
