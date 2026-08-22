/**
 * Count the Supabase requests one deck edit costs.
 *
 *   npm run build
 *   node scripts/deck-save-measure.mjs dist-before-merge before /deck-builder?deck=DECK
 *   node scripts/deck-save-measure.mjs dist after /deck/DECK
 *
 * The third argument is a URL template; `DECK` is replaced with the harness
 * deck's id. Default is the merged page.
 *
 * ## The action being measured
 *
 * Removing one copy of one card from the decklist, by clicking the control the
 * decklist actually draws for it. One logical save. Chosen over "add a copy"
 * because a Commander deck caps every nonbasic at one copy, so the add control
 * refuses before it ever reaches a save and there would be nothing to count.
 *
 * ## What counts as a request
 *
 * Every call to the Supabase origin, recorded by `scripts/deck-save-shim.js` at
 * `window.fetch` with its method and table: PostgREST reads and writes, RPC
 * calls, and edge-function invocations. Requests to `cards` / `cards_unique`
 * are forwarded to the real database and counted the same as the rest.
 *
 * The window opens when the counter is reset — after the page has settled — and
 * closes `SETTLE` ms after the click, which is comfortably past the longest
 * debounce in either implementation (the builder's autosave is 1000ms and its
 * power write is 1500ms).
 *
 * Served from a built `dist/` over a local gzip server, the same way
 * `scripts/collection-analytics-measure.mjs` does it, so this is the bundle
 * Lovable would serve rather than unbundled dev modules.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = process.argv[2] || 'dist';
const LABEL = process.argv[3] || 'run';
const ROUTE = process.argv[4] || '/deck/DECK';
const PORT = Number(process.env.PORT || 4411);
const WIDTH = Number(process.env.WIDTH || 1600);
const HEIGHT = Number(process.env.HEIGHT || 1000);
const SETTLE = Number(process.env.SETTLE || 4500);
const RUNS = Number(process.env.RUNS || 2);

const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'deck-save-shim.js'), 'utf8');

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
  const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' };
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

/** The control that removes one copy, on either implementation. */
const REMOVE_SELECTOR =
  'button[title="Remove one copy"], button[aria-label="Remove one copy"]';

async function runOnce(browser, deckId) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });
  await page.evaluateOnNewDocument(SHIM);

  const url = `http://127.0.0.1:${PORT}${ROUTE.replace('DECK', deckId)}`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });

  // Wait for the decklist to draw a card with a quantity control on it.
  await page.waitForFunction(
    sel => document.querySelectorAll(sel).length > 0,
    { timeout: 60000 },
    REMOVE_SELECTOR
  );

  // Let every load-time effect finish before the window opens, so the count is
  // the cost of the edit and not the cost of arriving.
  await sleep(2500);

  const before = await page.evaluate(() => {
    window.__dmResetReq();
    return document.querySelectorAll('button[title="Remove one copy"], button[aria-label="Remove one copy"]').length;
  });

  const clicked = await page.evaluate(sel => {
    const button = document.querySelector(sel);
    if (!button) return null;
    // `.click()` rather than a mouse move: the control lives inside a hover
    // overlay that is `pointer-events: none` until hover, and hovering is not
    // what is being measured.
    button.click();
    return button.getAttribute('title') || button.getAttribute('aria-label');
  }, REMOVE_SELECTOR);

  await sleep(SETTLE);

  const requests = await page.evaluate(() => window.__dmReq.slice());
  const fixture = await page.evaluate(() => window.__dmFixture || null);
  await page.close();

  return { controls: before, clicked, requests, fixture };
}

function summarise(requests) {
  const byKey = new Map();
  for (const r of requests) {
    const key = `${r.method} ${r.table}`;
    const cur = byKey.get(key) || { key, calls: 0, rows: 0 };
    cur.calls += 1;
    cur.rows += r.rows || 0;
    byKey.set(key, cur);
  }
  return [...byKey.values()].sort((a, b) => b.calls - a.calls || a.key.localeCompare(b.key));
}

(async () => {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const deckId = 'dddddddd-0000-4000-8000-00000000dm01';
  const runs = [];
  for (let i = 0; i < RUNS; i += 1) runs.push(await runOnce(browser, deckId));

  await browser.close();
  server.close();

  console.log(`\n=== ${LABEL} · ${DIST} · ${ROUTE} ===`);
  console.log(`fixture: ${JSON.stringify(runs[0].fixture)}`);
  console.log(`remove controls in the DOM: ${runs.map(r => r.controls).join(', ')}`);
  console.log(`clicked: ${runs[0].clicked}`);
  for (const [i, run] of runs.entries()) {
    console.log(`\n-- run ${i + 1}: ${run.requests.length} requests in the window`);
    for (const row of summarise(run.requests)) {
      console.log(`   ${String(row.calls).padStart(2)} x  ${row.key}${row.rows ? `   (${row.rows} rows)` : ''}`);
    }
  }
  const totals = runs.map(r => r.requests.length);
  console.log(`\nTOTAL requests per edit: ${totals.join(' / ')}`);

  const out = path.join(here, '..', 'scratch');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, `deck-save-${LABEL}.json`),
    JSON.stringify({ label: LABEL, dist: DIST, route: ROUTE, runs }, null, 2)
  );
})();
