/**
 * Two last questions for the new Commander player.
 *
 * 1. The homepage shows a search box with a real result count. Can a stranger
 *    actually type in it, or is it a picture of a search?
 * 2. A shared deck link is a public route. What does a stranger get when the
 *    slug is not a real one?
 *
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
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });

// 1. the homepage search demo
await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 3000));
const demo = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('input,textarea,[contenteditable="true"]')];
  return {
    inputCount: inputs.length,
    inputs: inputs.map(i => ({
      tag: i.tagName, type: i.type || null, ph: i.placeholder || null,
      readOnly: i.readOnly ?? null, disabled: i.disabled ?? null,
      value: (i.value || '').slice(0, 60),
    })),
  };
});
console.log('--- HOMEPAGE INPUTS ---');
console.log(JSON.stringify(demo, null, 2));

// 2. a shared deck link that is not real
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
await page.goto(BASE + '/p/not-a-real-deck', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 3500));
const shared = await page.evaluate(() => ({
  url: location.pathname,
  text: document.body.innerText.slice(0, 800),
  links: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href') + ' <- ' + a.innerText.trim().slice(0, 40)),
  buttons: [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean),
}));
console.log('\n--- /p/not-a-real-deck ---');
console.log(JSON.stringify(shared, null, 2));
console.log('errors:', errs);
await page.screenshot({ path: `${OUT}/shared-deck-missing.png`, fullPage: true });

await browser.close();
