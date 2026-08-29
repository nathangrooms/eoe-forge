/**
 * Point-blank probe of one route: every Scryfall image and every Scryfall CSS
 * background, with its EFFECTIVE filter (own plus every ancestor's) and how
 * much of it a hard clip leaves visible.
 *
 *   node scripts/refute-probe.mjs /life 1600
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROUTE = process.argv[2] || '/life';
const WIDTH = Number(process.argv[3] || 1600);
const DIST = process.env.DIST || 'dist';
const PORT = Number(process.env.PORT || 4577);
const SETTLE = Number(process.env.SETTLE || 9000);
const SHOT = process.env.SHOT || null;

const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'refute-shim.js'), 'utf8');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(DIST, p);
  let ext = path.extname(file);
  if (!ext || !fs.existsSync(file)) { file = path.join(DIST, 'index.html'); ext = '.html'; }
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(fs.readFileSync(file));
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-lcd-text'] });
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: WIDTH < 500 ? 844 : 1000, isMobile: WIDTH < 500, hasTouch: WIDTH < 500 });
  if (process.env.NO_SHIM !== '1') {
    await page.evaluateOnNewDocument('window.__DM_ADMIN = ' + (process.env.ADMIN === '1') + ';');
    await page.evaluateOnNewDocument(SHIM);
  }
  await page.goto(`http://127.0.0.1:${PORT}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(SETTLE);

  const out = await page.evaluate(() => {
    function chain(el) {
      const parts = [];
      let n = el;
      while (n && n !== document.documentElement) {
        const s = getComputedStyle(n);
        if (s.filter && s.filter !== 'none') parts.push(`${n.tagName}.${String(n.className).split(' ')[0]}: ${s.filter}`);
        if (s.opacity && s.opacity !== '1') parts.push(`${n.tagName}: opacity ${s.opacity}`);
        n = n.parentElement;
      }
      return parts;
    }
    const imgs = [...document.querySelectorAll('img')]
      .filter(i => /scryfall/.test(i.currentSrc || i.src || ''))
      .map(i => {
        const r = i.getBoundingClientRect();
        return { kind: 'img', alt: i.alt, w: Math.round(r.width), h: Math.round(r.height), src: (i.currentSrc || i.src).slice(-60), filters: chain(i) };
      });
    const bgs = [];
    for (const n of document.querySelectorAll('*')) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && /scryfall/.test(s.backgroundImage)) {
        const r = n.getBoundingClientRect();
        bgs.push({
          kind: 'bg', tag: n.tagName, cls: String(n.className).slice(0, 60),
          w: Math.round(r.width), h: Math.round(r.height),
          url: (s.backgroundImage.match(/https?:[^"')]+/) || [''])[0].slice(-60),
          size: s.backgroundSize, filters: chain(n),
        });
      }
    }
    return { imgs, bgs, title: document.title, path: location.pathname };
  });

  if (SHOT) await page.screenshot({ path: SHOT, fullPage: true });
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  server.close();
})();
