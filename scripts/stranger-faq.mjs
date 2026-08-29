/**
 * Open every FAQ answer on the homepage and read it. The new Commander player
 * decides here: is it free, is it legitimate, what does it actually do.
 * Signed out, writes nothing.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const OUT = '.shots/stranger';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1400, deviceScaleFactor: 1 });
await page.goto(BASE + '/#faq', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 3000));

const qs = await page.evaluate(() =>
  [...document.querySelectorAll('button')].map((b, i) => ({ i, t: b.innerText.trim() })).filter(x => /\?$/.test(x.t))
);

for (const q of qs) {
  const answer = await page.evaluate(async idx => {
    const b = [...document.querySelectorAll('button')][idx];
    b.scrollIntoView({ block: 'center' });
    const before = b.closest('div')?.parentElement?.innerText || '';
    b.click();
    await new Promise(r => setTimeout(r, 600));
    // walk up until the text grew, that container holds the answer
    let node = b;
    for (let i = 0; i < 6; i++) {
      node = node.parentElement;
      if (!node) break;
      const t = node.innerText || '';
      if (t.length > before.length + 20) return t.trim();
    }
    return '(no answer text found)';
  }, q.i);
  console.log('\nQ: ' + q.t + '\nA: ' + answer.replace(q.t, '').trim().slice(0, 900));
}

await page.evaluate(() => {
  const h = [...document.querySelectorAll('h2')].find(e => /Frequently asked/i.test(e.innerText));
  h?.scrollIntoView({ block: 'start' });
});
await new Promise(r => setTimeout(r, 900));
await page.screenshot({ path: `${OUT}/faq-open.png` });
await browser.close();
