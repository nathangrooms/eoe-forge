/**
 * Slice a long public page into viewport-sized screenshots, so a person can be
 * judged on what they actually see as they scroll rather than on a 22,000 pixel
 * strip nobody looks at that way. Signed out, changes nothing.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const ROUTE = process.env.ROUTE || '/';
const NAME = process.env.NAME || 'home';
const W = Number(process.env.W || 1600);
const H = Number(process.env.H || 1000);
const OUT = `.shots/stranger/${NAME}`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 3000));

const total = await page.evaluate(() => document.documentElement.scrollHeight);
const step = Math.round(H * 0.9);
let i = 0;
for (let y = 0; y < total; y += step) {
  await page.evaluate(v => window.scrollTo(0, v), y);
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: `${OUT}/${String(i).padStart(2, '0')}.png` });
  i++;
  if (i > 40) break;
}
console.log(`${NAME}: ${total}px -> ${i} slices in ${OUT}`);
await browser.close();
