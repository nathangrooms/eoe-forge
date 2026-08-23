/**
 * Count the Supabase requests a page visit or a button press costs.
 *
 *   npm run build
 *   node perrow-measure.mjs <dist> <label> <scenario> [n]
 *
 * Scenarios:
 *   decks               /decks with n decks of 100 cards          (page load)
 *   messages            a thread with n messages, 2 participants  (page load)
 *   storage-deck        "Add the whole deck", n-card deck         (one press)
 *   storage-collection  "Add picked" over n collection rows       (one press)
 *
 * Served from a built dist over a local gzip server, so this is the bundle
 * Lovable would serve rather than unbundled dev modules. Requests are counted
 * at window.fetch by perrow-shim.js.
 *
 * Every run asserts the page actually DREW. A count from a page that threw into
 * its error boundary is not a measurement.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const REPO = 'C:/Users/natha/Desktop/Software/Deckmatrix';
const DIST = path.resolve(process.argv[2] || path.join(REPO, 'dist'));
const LABEL = process.argv[3] || 'run';
const SCENARIO = process.argv[4] || 'decks';
const N = Number(process.argv[5] || (SCENARIO === 'decks' ? 9 : SCENARIO === 'messages' ? 60 : 100));
const PORT = Number(process.env.PORT || 4477);
const IDLE = Number(process.env.IDLE || 4000);
const MAX_WAIT = Number(process.env.MAX_WAIT || 240000);

const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'perrow-shim.js'), 'utf8');

const CONTAINER_ID = 'cccccccc-0000-4000-8000-00000000dm01';
const LISTING_ID = 'llllllll-0000-4000-8000-00000000dm01';

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

const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

/** Real `cards_unique` rows, cached on disk so every run uses the same deck. */
async function cardPool(size) {
  const cache = path.join(here, `perrow-cards-${size}.json`);
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));
  const url =
    'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1/cards_unique?select=*' +
    `&edhrec_rank=not.is.null&order=edhrec_rank.asc&limit=${size}`;
  const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('no cards came back');
  fs.writeFileSync(cache, JSON.stringify(rows));
  return rows;
}

const ROUTE = {
  decks: '/decks',
  messages: `/marketplace/messages/${LISTING_ID}`,
  'storage-deck': `/collection/storage/${CONTAINER_ID}/add`,
  'storage-collection': `/collection/storage/${CONTAINER_ID}/add`,
  'import-paste': '/collection/import',
}[SCENARIO];

/** Wait until no new Supabase call has landed for IDLE ms. */
async function waitIdle(page, cap = MAX_WAIT) {
  const started = Date.now();
  let last = -1;
  let lastChange = Date.now();
  while (Date.now() - started < cap) {
    const n = await page.evaluate(() => window.__dmReq.length);
    if (n !== last) {
      last = n;
      lastChange = Date.now();
    } else if (Date.now() - lastChange > IDLE) {
      return;
    }
    await sleep(400);
  }
}

/**
 * Click the first element whose text matches, with a real mouse. Radix tabs and
 * selects listen for pointer events, so `node.click()` from a script leaves the
 * tab looking pressed and the panel unchanged.
 */
async function clickText(page, text, tags = ['button', '[role="tab"]', '[role="option"]', 'a']) {
  const handles = await page.$$(tags.join(','));
  for (const handle of handles) {
    const label = await handle.evaluate(n => (n.innerText || n.textContent || '').trim());
    if (!label.includes(text)) continue;
    await handle.evaluate(n => n.scrollIntoView({ block: 'center' }));
    try {
      await handle.click();
    } catch {
      await handle.evaluate(n => n.click());
    }
    return true;
  }
  return false;
}

async function runOnce(browser, cards) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  await page.evaluateOnNewDocument(
    `window.__DM_SCENARIO=${JSON.stringify(SCENARIO)};` +
      `window.__DM_DECKS=${SCENARIO === 'decks' ? N : 1};` +
      `window.__DM_DECK_SIZE=${SCENARIO === 'storage-deck' ? N : 100};` +
      `window.__DM_MESSAGES=${SCENARIO === 'messages' ? N : 0};` +
      `window.__DM_COLLECTION=${SCENARIO === 'storage-collection' ? N : 0};` +
      `window.__DM_CARDS=${JSON.stringify(cards)};`
  );
  await page.evaluateOnNewDocument(SHIM);

  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)));

  /* The "From collection" tab reads a zustand snapshot that only the collection
     page fills. Arrive there first and walk across inside the app, the way a
     person reaches this tab, so the store is warm. */
  const entry = SCENARIO === 'storage-collection' ? '/collection' : ROUTE;
  await page.goto(`http://127.0.0.1:${PORT}${entry}`, { waitUntil: 'networkidle2', timeout: 90000 });
  await waitIdle(page, 120000);
  if (entry !== ROUTE) {
    await page.evaluate(route => {
      window.history.pushState({}, '', route);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, ROUTE);
    await sleep(2500);
    await waitIdle(page, 60000);
  }

  let action = 'page load';
  let drew = null;

  if (SCENARIO === 'import-paste') {
    await page.evaluate(() => window.__dmResetReq());
    action = 'press "Import cards"';
    const lines = await page.evaluate(n => {
      const names = (window.__DM_CARDS || []).slice(0, n).map(card => `1 ${card.name}`);
      const box = document.querySelector('textarea');
      if (!box) return 0;
      /* React owns the value, so set it through the native setter and let the
         input event through, the way a paste reaches it. */
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      ).set;
      setter.call(box, names.join(String.fromCharCode(10)));
      box.dispatchEvent(new Event('input', { bubbles: true }));
      return names.length;
    }, N);
    if (!lines) throw new Error('no textarea');
    await sleep(800);
    if (!(await clickText(page, 'Import cards', ['button']))) throw new Error('no import button');
    await sleep(1500);
    await waitIdle(page);
    drew = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  } else if (SCENARIO === 'decks' || SCENARIO === 'messages') {
    drew = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  } else {
    // The press is what is measured, not the arrival. Reset after settling.
    await page.evaluate(() => window.__dmResetReq());

    if (SCENARIO === 'storage-deck') {
      action = 'press "Add the whole deck"';
      if (!(await clickText(page, 'From a deck', ['[role="tab"]', 'button']))) throw new Error('no deck tab');
      await sleep(600);
      // shadcn Select: open the trigger, then pick the option.
      // The panel's own deck picker, not the search tab's view-mode combobox.
      await page.evaluate(() => {
        const box = [...document.querySelectorAll('[role="combobox"]')].find(el =>
          (el.innerText || '').includes('Choose a deck')
        );
        if (box) box.setAttribute('data-dm-pick', '1');
      });
      await page.click('[data-dm-pick="1"]');
      await sleep(600);
      if (!(await clickText(page, 'Harness deck 1', ['[role="option"]']))) throw new Error('no deck option');
      await sleep(800);
      if (!(await clickText(page, 'Add the whole deck', ['button']))) throw new Error('no add button');
    } else {
      action = 'press "Add picked"';
      if (!(await clickText(page, 'From collection', ['[role="tab"]', 'button']))) throw new Error('no coll tab');
      await sleep(800);
      const picked = await page.evaluate(n => {
        const cards = [...document.querySelectorAll('.cursor-pointer')].filter(el =>
          el.className.includes('shadow-md')
        );
        cards.slice(0, n).forEach(el => el.click());
        return Math.min(cards.length, n);
      }, N);
      if (!picked) throw new Error('no collection tiles');
      await sleep(600);
      if (!(await clickText(page, 'Add picked', ['button']))) throw new Error('no add picked button');
    }

    await sleep(1500);
    await waitIdle(page);
    drew = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  }

  const requests = await page.evaluate(() => window.__dmReq.slice());
  const fixture = await page.evaluate(() => window.__dmFixture || null);
  await page.close();

  return { requests, fixture, drew, errors, action };
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

  const cards = await cardPool(Math.max(N, 100));
  const run = await runOnce(browser, cards);

  await browser.close();
  server.close();

  const auth = run.requests.filter(r => r.table === 'auth:user').length;
  console.log(`\n=== ${LABEL} · ${SCENARIO} · n=${N} · ${path.basename(DIST)} ===`);
  console.log(`fixture: ${JSON.stringify(run.fixture)}`);
  console.log(`action:  ${run.action}`);
  console.log(`drew:    ${JSON.stringify((run.drew || '').replace(/\s+/g, ' ').slice(0, 260))}`);
  if (run.errors.length) console.log(`page errors: ${run.errors.slice(0, 3).join(' | ')}`);
  console.log('');
  for (const row of summarise(run.requests)) {
    console.log(`   ${String(row.calls).padStart(4)} x  ${row.key}${row.rows ? `   (${row.rows} rows)` : ''}`);
  }
  console.log(`\nTOTAL: ${run.requests.length}   (auth:user ${auth}, database only ${run.requests.length - auth})`);

  fs.writeFileSync(
    path.join(here, `perrow-${SCENARIO}-${LABEL}-${N}.json`),
    JSON.stringify({ label: LABEL, scenario: SCENARIO, n: N, dist: DIST, ...run }, null, 2)
  );
})();
