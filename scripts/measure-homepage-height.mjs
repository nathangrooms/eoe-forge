/**
 * Measures how tall the homepage actually is, per section, at a real phone
 * viewport and at desktop.
 *
 * The owner's complaint was "homepage not mobile optimised", and the reason a
 * page reads as a wall is almost never a thousand small paddings. It is a
 * handful of sections that are one screen wide on desktop and three screens
 * tall on a phone, because a multi-column layout stacks. This script says which
 * ones, so the cutting happens where the height is rather than where it is easy.
 *
 * It serves `dist/` rather than the dev server on purpose: the dev server ships
 * unminified CSS and no image preloading, and the numbers have to describe what
 * a visitor gets.
 *
 * Usage:  node scripts/measure-homepage-height.mjs [label] [port]
 * Output: JSON on stdout, one object per viewport, so two runs can be diffed.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const LABEL = process.argv[2] || 'run';
const PORT = Number(process.argv[3] || 4399);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(DIST, p);
  let ext = path.extname(file);
  if (!ext || !fs.existsSync(file)) { file = path.join(DIST, 'index.html'); ext = '.html'; }
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  const body = fs.readFileSync(file);
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(body);
});
await new Promise(r => server.listen(PORT, r));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--disable-lcd-text', '--no-sandbox', '--disable-dev-shm-usage'],
});

/* The homepage waits up to 1200ms on the feature flag before it draws, and the
   database is not reachable from here, so every run pays that wait once. */
const SETTLE_MS = 3500;

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, dsf: 3, mobile: true },
  { name: 'desktop', width: 1440, height: 900, dsf: 1, mobile: false },
];

const results = {};

for (const vp of VIEWPORTS) {
  const page = await browser.newPage();
  await page.setViewport({
    width: vp.width, height: vp.height,
    deviceScaleFactor: vp.dsf, isMobile: vp.mobile, hasTouch: vp.mobile,
  });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, SETTLE_MS));

  /* Scroll the whole way down before measuring. Every screenshot and most card
     art is lazy-loaded, and an image that has not been asked for yet still
     occupies its reserved box — but anything without a reserved box would
     measure short. Scrolling makes the measurement describe a page that has
     been read rather than one that has just loaded. */
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
  });
  await new Promise(r => setTimeout(r, 1200));

  const data = await page.evaluate((viewportHeight) => {
    const root = document.querySelector('div.min-h-screen') || document.body;
    const blocks = [...root.children];
    const label = (el) => {
      if (el.tagName === 'FOOTER') return 'Footer';
      if (el.tagName === 'NAV' || el.querySelector(':scope > nav')) return 'Navigation';
      const h = el.querySelector('h1, h2');
      const t = h && h.textContent.trim().replace(/\s+/g, ' ');
      return t ? t.slice(0, 62) : `<${el.tagName.toLowerCase()}>`;
    };
    const sections = blocks.map((el) => ({
      label: label(el),
      tag: el.tagName.toLowerCase(),
      height: Math.round(el.getBoundingClientRect().height),
    })).filter(s => s.height > 0);

    /* Anything that scrolls sideways inside itself is a bug at 390px unless it
       is deliberately a swipe rail, so report every one and judge them by name. */
    const overflowing = [...document.querySelectorAll('*')]
      .filter(el => el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0)
      .map(el => ({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && String(el.className)).slice(0, 90),
        client: el.clientWidth,
        scroll: el.scrollWidth,
      }))
      .slice(0, 40);

    /* Tap targets. Anything interactive under 40px in either direction is hard
       to hit with a thumb; 44px is the number Apple publishes and 48 is Google's. */
    const small = [...document.querySelectorAll('a, button, [role="button"], input, select, summary')]
      .map(el => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => r.width > 0 && r.height > 0 && (r.height < 40 || r.width < 24)
        && el.offsetParent !== null)
      .map(({ el, r }) => ({
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
        w: Math.round(r.width), h: Math.round(r.height),
      }));

    return {
      total: Math.round(document.documentElement.scrollHeight),
      screens: +(document.documentElement.scrollHeight / viewportHeight).toFixed(1),
      docScrollsX: document.documentElement.scrollWidth > window.innerWidth + 1,
      sections,
      overflowing,
      smallTapTargets: small,
    };
  }, vp.height);

  results[vp.name] = data;
  await page.close();
}

await browser.close();
server.close();

console.log(JSON.stringify({ label: LABEL, ...results }, null, 2));
