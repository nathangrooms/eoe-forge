/**
 * Photograph the pager on the surfaces that carry it.
 *
 *   node scripts/paging-shots.mjs
 *
 * Reuses the harness `scripts/paging-bench.mjs` writes, and the same cached
 * Scryfall pages, so what is on screen is real card data. Launched with
 * `--disable-lcd-text` because subpixel antialiasing puts coloured fringes on
 * thin type over dark backgrounds and reads as a styling bug that is not there.
 *
 * What each shot is for:
 *   01  card search, page 1 of a known total: numbers, first/last, "of 30,636"
 *   02  card search, page 8: the window slides, the gaps appear
 *   03  collection, 1,200 rows paged
 *   04  the pager on its own, close up, to check it against design law
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 8474);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = '.shots/paging';
const HARNESS = 'paging-harness.html';

fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PAGES = JSON.parse(fs.readFileSync('scratch/bench/scryfall-staples.json', 'utf8'));
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

if (!fs.existsSync(HARNESS)) {
  console.error('Run scripts/paging-bench.mjs first; it writes the harness.');
  process.exit(1);
}

const server = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }
);
server.stderr.on('data', d => process.stderr.write(d));

for (let i = 0; i < 120; i++) {
  try {
    const r = await fetch(`${BASE}/${HARNESS}`);
    if (r.ok) break;
  } catch {}
  await sleep(500);
}

const browser = await puppeteer.launch({
  headless: true,
  args: ['--disable-lcd-text', '--no-sandbox', '--font-render-hinting=none'],
});

async function page() {
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  await p.setRequestInterception(true);
  p.on('console', m => m.type() === 'error' && console.log('[console error]', m.text()));
  p.on('pageerror', e => console.log('[pageerror]', e.message));
  p.on('request', req => {
    const url = req.url();
    if (url.includes('/__bench/cards.json')) {
      return req.respond({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(PAGES[0].data),
      });
    }
    if (url.startsWith('https://api.scryfall.com/cards/search')) {
      const n = Number(new URL(url).searchParams.get('page') || 1);
      const src = PAGES[Math.min(n, PAGES.length) - 1];
      return req.respond({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          object: 'list',
          total_cards: src.total_cards,
          has_more: true,
          data: src.data,
        }),
      });
    }
    if (url.startsWith('https://api.scryfall.com/')) {
      return req.respond({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ object: 'list', data: [] }),
      });
    }
    // Card art: real Scryfall images make the shots worth looking at.
    if (/\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/i.test(url) && url.startsWith(BASE)) {
      return req.respond({ status: 200, contentType: 'image/png', body: PNG_1x1 });
    }
    req.continue();
  });
  return p;
}

const report = {};

async function shoot(p, name) {
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log('shot', name);
}

/* ---------------------------------------------------------- card search */
{
  const p = await page();
  await p.goto(`${BASE}/${HARNESS}?bench=search`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('nav[aria-label="Search result pages"]', { timeout: 40000 });
  await sleep(2500);
  await shoot(p, '01-card-search-page-1');

  report.searchPage1 = await p.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Search result pages"]');
    return {
      text: nav?.innerText.replace(/\s+/g, ' ').trim(),
      buttons: [...nav.querySelectorAll('button')].map(b => b.getAttribute('aria-label')),
      current: nav.querySelector('[aria-current="page"]')?.textContent,
      tiles: document.querySelector('.grid')?.children.length,
    };
  });

  // Jump into the middle of the results.
  await p.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Search result pages"]');
    const next = [...nav.querySelectorAll('button')].find(
      b => b.getAttribute('aria-label') === 'Go to next page'
    );
    for (let i = 0; i < 1; i++) next.click();
  });
  await sleep(1200);
  await p.evaluate(() => window.scrollTo(0, 0));
  await sleep(400);
  await shoot(p, '02-card-search-page-2');

  report.searchPage2 = await p.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Search result pages"]');
    return {
      url: location.search,
      text: nav?.innerText.replace(/\s+/g, ' ').trim(),
      current: nav.querySelector('[aria-current="page"]')?.textContent,
      firstCardAlt: document.querySelector('.grid img')?.getAttribute('alt'),
    };
  });

  // Back must undo the page turn.
  await p.goBack({ waitUntil: 'domcontentloaded' });

  await sleep(1200);
  report.searchAfterBack = await p.evaluate(() => ({
    url: location.search,
    current: document
      .querySelector('nav[aria-label="Search result pages"] [aria-current="page"]')
      ?.textContent,
  }));

  // The pager on its own.
  const nav = await p.$('nav[aria-label="Search result pages"]');
  if (nav) await nav.screenshot({ path: `${OUT}/04-pager-closeup.png` });

  await p.close();
}

/* ---------------------------------------------------------- collection */
{
  const p = await page();
  await p.goto(`${BASE}/${HARNESS}?bench=collection&n=1200`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('nav[aria-label="Collection pages"]', { timeout: 40000 });
  await sleep(2000);
  await shoot(p, '03-collection-page-1');

  report.collection = await p.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Collection pages"]');
    return {
      text: nav?.innerText.replace(/\s+/g, ' ').trim(),
      current: nav.querySelector('[aria-current="page"]')?.textContent,
      tiles: document.querySelector('.grid')?.children.length,
      pagers: document.querySelectorAll('nav[aria-label="Collection pages"]').length,
    };
  });

  await p.close();
}

await browser.close();
server.kill();

fs.writeFileSync('scratch/bench/shots-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
