/**
 * Two shots of the same screen, stacked with BEFORE over AFTER and labelled,
 * so a person can see the difference rather than read a claim about it.
 *
 * Stacked rather than side by side because these are 1600px-wide screens: put
 * two of them next to each other and each is 800px on a page, which is exactly
 * the "look how small it is" problem the pictures are meant to settle.
 */
import sharp from 'sharp';
import fs from 'node:fs';

const [, , before, after, out, cropSpec] = process.argv;
const GAP = 34, PAD = 0;

const label = (text, width) => Buffer.from(
  `<svg width="${width}" height="${GAP}" xmlns="http://www.w3.org/2000/svg">
     <rect width="${width}" height="${GAP}" fill="#0b0b0b"/>
     <text x="10" y="23" font-family="monospace" font-size="17" fill="#e8e8e8">${text}</text>
   </svg>`
);

const load = async file => {
  let img = sharp(file);
  if (cropSpec) {
    const [l, t, w, h] = cropSpec.split(',').map(Number);
    img = sharp(await img.extract({ left: l, top: t, width: w, height: h }).toBuffer());
  }
  return img;
};

const a = await load(before), b = await load(after);
const am = await a.metadata(), bm = await b.metadata();
const W = Math.max(am.width, bm.width);
const H = GAP + am.height + GAP + bm.height;

await sharp({ create: { width: W, height: H, channels: 3, background: '#0b0b0b' } })
  .composite([
    { input: label('BEFORE', W), top: 0, left: 0 },
    { input: await a.toBuffer(), top: GAP, left: 0 },
    { input: label('AFTER', W), top: GAP + am.height, left: 0 },
    { input: await b.toBuffer(), top: GAP + am.height + GAP, left: 0 },
  ])
  .png()
  .toFile(out);
console.log('wrote', out, `${W}x${H}`);
