/**
 * Crop a region out of a PNG at 2x, so a detail can be READ rather than guessed.
 *
 * Every "the label is wrong" / "the box is empty" claim on this project that
 * turned out to be false was read off a 1600px screenshot at thumbnail size.
 * Usage: node scripts/playtest/zoom.mjs <in.png> <x> <y> <w> <h> <out.png>
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const [inFile, x, y, w, h, outFile] = process.argv.slice(2);
if (!inFile || !outFile) { console.error('usage: zoom.mjs in.png x y w h out.png'); process.exit(1); }

const data = fs.readFileSync(path.resolve(inFile)).toString('base64');
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-lcd-text'] });
const page = await browser.newPage();
await page.setViewport({ width: Number(w) * 2, height: Number(h) * 2, deviceScaleFactor: 1 });
await page.setContent(`<body style="margin:0;background:#000">
<img src="data:image/png;base64,${data}"
     style="position:absolute;left:${-x * 2}px;top:${-y * 2}px;width:${1600 * 2}px;image-rendering:auto">
</body>`);
await new Promise(r => setTimeout(r, 400));
fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
await page.screenshot({ path: outFile });
await browser.close();
console.log('wrote', outFile);
