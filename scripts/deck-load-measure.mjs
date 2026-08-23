/**
 * Count the Supabase requests each deck tab costs to open.
 *
 *   npm run build
 *   node scripts/deck-load-measure.mjs dist after
 *   node scripts/deck-load-measure.mjs ../dm-before/dist before
 *
 * Companion to `scripts/deck-save-measure.mjs`, which counts what one EDIT
 * costs. This counts what ARRIVING costs, per tab, which is the figure the deck
 * tab rebuild had to hold: the standing rule in this project is one query for a
 * set and never one per row, and a page that grows a tab has to be shown not to
 * have grown a query loop with it.
 *
 * ## What is measured
 *
 * Two windows per tab, both recorded by `scripts/deck-save-shim.js` at
 * `window.fetch`:
 *
 *   load     every call to the Supabase origin from navigation until the page
 *            has settled. This is the cost of opening `/deck/:id` on that tab
 *            cold, the page's own load included.
 *   tab      the same count taken again after switching to the tab from Cards,
 *            which is what a reader who is already on the page pays.
 *
 * A request is any call to the Supabase origin with its method and table:
 * PostgREST reads and writes, RPC calls and edge-function invocations. Calls to
 * `cards` / `cards_unique` are forwarded to the real database and counted the
 * same as the rest.
 *
 * ## What it cannot see
 *
 * The shim answers owner-scoped tables locally with a fixture, so a table it
 * holds no rows for answers empty. `card_price_history` and the printing spread
 * are two of those: the REQUEST is counted, which is the thing being measured,
 * and the panel then draws its own "no record yet" state. So this measures
 * request COUNT honestly and says nothing about what those panels look like
 * with real data.
 *
 * Console errors are reported per tab, because a tab that throws makes fewer
 * requests than a tab that works and would otherwise look like an improvement.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = process.argv[2] || 'dist';
const LABEL = process.argv[3] || 'run';
const PORT = Number(process.env.PORT || 4412);
const WIDTH = Number(process.env.WIDTH || 1600);
const HEIGHT = Number(process.env.HEIGHT || 1000);
const SETTLE = Number(process.env.SETTLE || 4000);

const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'deck-save-shim.js'), 'utf8');

/** The eight tabs, by the id each one carries in the query string. */
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

function summarise(requests) {
  const byKey = new Map();
  for (const r of requests) {
    const key = `${r.method} ${r.table}`;
    const cur = byKey.get(key) || { key, calls: 0 };
    cur.calls += 1;
    byKey.set(key, cur);
  }
  return [...byKey.values()].sort((a, b) => b.calls - a.calls || a.key.localeCompare(b.key));
}

async function measureTab(browser, deckId, tab) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });
  await page.evaluateOnNewDocument(SHIM);

  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  const query = tab === 'cards' ? '' : `?tab=${tab}`;
  const url = `http://127.0.0.1:${PORT}/deck/${deckId}${query}`;

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(SETTLE);
  const load = await page.evaluate(() => window.__dmReq.slice());

  /* The second window: what a reader already on the page pays to open this
     tab. Measured from Cards, which is where every visit starts. */
  let switched = [];
  if (tab !== 'cards') {
    await page.goto(`http://127.0.0.1:${PORT}/deck/${deckId}`, {
      waitUntil: 'networkidle2',
      timeout: 90000,
    });
    await sleep(SETTLE);
    await page.evaluate(() => window.__dmResetReq());
    const pressed = await page.evaluate(id => {
      const strip = document.querySelector('[role="tablist"]');
      if (!strip) return false;
      const wanted = id === 'edh' ? 'edh' : id;
      const button = [...strip.querySelectorAll('[role="tab"]')].find(b =>
        b.textContent.toLowerCase().trim().startsWith(wanted)
      );
      if (!button) return false;
      button.click();
      return true;
    }, tab);
    if (!pressed) errors.push(`could not find the ${tab} tab in the strip`);
    await sleep(SETTLE);
    switched = await page.evaluate(() => window.__dmReq.slice());
  }

  await page.close();
  return { tab, load, switched, errors: [...new Set(errors)] };
}

(async () => {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const deckId = 'dddddddd-0000-4000-8000-00000000dm01';
  const results = [];
  for (const tab of TABS) results.push(await measureTab(browser, deckId, tab));

  await browser.close();
  server.close();

  console.log(`\n=== ${LABEL} · ${DIST} ===`);
  console.log('tab        cold load   from Cards');
  for (const r of results) {
    console.log(
      `${r.tab.padEnd(10)} ${String(r.load.length).padStart(9)} ${
        r.tab === 'cards' ? '        —' : String(r.switched.length).padStart(10)
      }`
    );
  }

  for (const r of results) {
    console.log(`\n-- ${r.tab}: ${r.load.length} on a cold load`);
    for (const row of summarise(r.load)) {
      console.log(`   ${String(row.calls).padStart(2)} x  ${row.key}`);
    }
    if (r.tab !== 'cards') {
      console.log(`   switching to it from Cards: ${r.switched.length}`);
      for (const row of summarise(r.switched)) {
        console.log(`      ${String(row.calls).padStart(2)} x  ${row.key}`);
      }
    }
    if (r.errors.length > 0) {
      console.log(`   CONSOLE ERRORS: ${r.errors.length}`);
      for (const e of r.errors.slice(0, 5)) console.log(`      ${e.slice(0, 200)}`);
    }
  }

  const out = path.join(here, '..', 'scratch');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, `deck-load-${LABEL}.json`),
    JSON.stringify({ label: LABEL, dist: DIST, results }, null, 2)
  );
  console.log(`\nwritten to scratch/deck-load-${LABEL}.json`);
})();
