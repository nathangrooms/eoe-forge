/**
 * A full-page screenshot of every deck tab, from the built bundle.
 *
 *   npm run build
 *   node scripts/deck-tab-shots.mjs dist docs/design/deck-tabs
 *
 * Companion to `scripts/deck-load-measure.mjs`, which counts what each tab
 * costs in requests. This is what each one looks like while it costs it, drawn
 * against the same fixture deck through `scripts/deck-save-shim.js`, so the
 * cards on screen are real rows out of the live catalogue and only the deck
 * around them is a fixture.
 *
 * 1600 x 1000 is the width `scripts/app-shots.mjs` established as the one the
 * app is really used at, and the one `docs/design/CONSISTENCY.md` measured
 * every other page at.
 *
 * What it cannot show: the owner-scoped tables the shim answers locally are
 * empty, so the price record, the printing spread, the match history and the
 * collection all draw their "nothing yet" states. Those states are worth seeing
 * too — they are what a new account gets — but a tab is not proven finished by
 * a screenshot of its empty state.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = process.argv[2] || 'dist';
const OUT = process.argv[3] || 'scratch/deck-tabs';
const PORT = Number(process.env.PORT || 4413);
const WIDTH = Number(process.env.WIDTH || 1600);
const HEIGHT = Number(process.env.HEIGHT || 1000);
const SETTLE = Number(process.env.SETTLE || 4500);

const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'deck-save-shim.js'), 'utf8');

const TABS = ['cards', 'add', 'mana', 'edh', 'analysis', 'legality', 'value', 'record'];

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.webmanifest']);

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(DIST, p);
  let ext = path.extname(file);
  if (!ext || !fs.existsSync(file)) {
    file = path.join(DIST, 'index.html');
    ext = '.html';
  }
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  const body = fs.readFileSync(file);
  const accepts = String(req.headers['accept-encoding'] || '');
  const headers = {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': 'no-store',
  };
  if (COMPRESSIBLE.has(ext) && accepts.includes('gzip')) {
    const gz = zlib.gzipSync(body, { level: 9 });
    headers['content-encoding'] = 'gzip';
    headers['content-length'] = gz.length;
    res.writeHead(200, headers);
    return res.end(gz);
  }
  res.writeHead(200, headers);
  res.end(body);
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-lcd-text'],
  });

  fs.mkdirSync(OUT, { recursive: true });
  const deckId = 'dddddddd-0000-4000-8000-00000000dm01';
  const report = [];

  for (const tab of TABS) {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(SHIM);
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message || e)));
    page.on('console', m => {
      if (m.type() === 'error') errors.push(m.text());
    });

    const query = tab === 'cards' ? '' : `?tab=${tab}`;
    await page.goto(`http://127.0.0.1:${PORT}/deck/${deckId}${query}`, {
      waitUntil: 'networkidle2',
      timeout: 90000,
    });
    await sleep(SETTLE);

    /* Measured off the live DOM rather than eyeballed off the picture: the
       three things the design law can be checked for mechanically. */
    const audit = await page.evaluate(() => {
      const main = document.querySelector('#main-content') || document.body;
      const nodes = [...main.querySelectorAll('*')];
      const hairlines = nodes.filter(n => {
        const s = getComputedStyle(n);
        return ['Top', 'Right', 'Bottom', 'Left'].some(side => {
          const w = parseFloat(s[`border${side}Width`]);
          const style = s[`border${side}Style`];
          const colour = s[`border${side}Color`];
          return w > 0 && style !== 'none' && !/rgba\(0, 0, 0, 0\)/.test(colour);
        });
      });
      const controls = main.querySelectorAll('button, input, select, [role="slider"], textarea');
      const cards = main.querySelectorAll('img[src*="cards.scryfall.io"], img[src*="scryfall"]');
      const metricValues = [...main.querySelectorAll('*')].filter(n => {
        const s = getComputedStyle(n);
        return parseFloat(s.fontSize) >= 22 && /^\S/.test(n.textContent || '') && n.children.length === 0;
      });
      return {
        height: document.documentElement.scrollHeight,
        hairlines: hairlines.length,
        controls: controls.length,
        cardImages: cards.length,
        bigFigures: metricValues.length,
      };
    });

    const file = path.join(OUT, `${tab}-${WIDTH}.png`);
    await page.screenshot({ path: file, fullPage: true });
    await page.close();

    report.push({ tab, ...audit, errors: [...new Set(errors)] });
    console.log(
      `${tab.padEnd(10)} ${String(audit.controls).padStart(3)} controls  ` +
        `${String(audit.cardImages).padStart(3)} cards  ` +
        `${String(audit.hairlines).padStart(3)} hairlines  ` +
        `${String(audit.height).padStart(5)}px  ` +
        `${audit.errors?.length ? 'ERRORS' : ''}${report[report.length - 1].errors.length ? ' ' + report[report.length - 1].errors.length + ' console errors' : ''}`
    );
  }

  await browser.close();
  server.close();

  fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(report, null, 2));
  console.log(`\nwritten to ${OUT}`);
})();
