/**
 * Put two screenshots next to each other so a change can be judged rather than
 * described. Reads the files as data URIs into a plain page and photographs it,
 * because puppeteer is already a dependency and an image library is not.
 *
 *   node scripts/shots-side-by-side.mjs out.png "Before" a.png "After" b.png
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const [out, ...rest] = process.argv.slice(2);
if (!out || rest.length < 4 || rest.length % 2) {
  console.error('usage: node scripts/shots-side-by-side.mjs out.png "Label" a.png "Label" b.png');
  process.exit(1);
}

const panes = [];
for (let i = 0; i < rest.length; i += 2) {
  panes.push({ label: rest[i], file: rest[i + 1] });
}

const uri = file =>
  `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;

const html = `<!doctype html><meta charset="utf-8">
<style>
  body { margin:0; background:#0b0b0b; font-family: ui-sans-serif, system-ui, sans-serif; }
  .row { display:flex; gap:12px; padding:12px; }
  figure { margin:0; flex:1; min-width:0; }
  figcaption { color:#e6e6e6; font-size:22px; letter-spacing:.14em; text-transform:uppercase;
               padding:6px 2px 10px; }
  img { width:100%; height:auto; display:block; border-radius:8px; }
</style>
<div class="row">
${panes
  .map(p => `<figure><figcaption>${p.label}</figcaption><img src="${uri(p.file)}"></figure>`)
  .join('\n')}
</div>`;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1900, height: 700, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 400));
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out, fullPage: true });
console.log('wrote', out);
await browser.close();
