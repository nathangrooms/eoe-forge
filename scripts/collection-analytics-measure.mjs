/**
 * Measure the Collection analytics tab: what it downloads, how many requests it
 * makes, how long it takes to become readable, and how much the layout moves.
 *
 *   npm run build
 *   node scripts/collection-analytics-measure.mjs dist after
 *
 * ## Why it serves `dist/` rather than the dev server
 *
 * Production parity. Lovable serves the built, gzipped chunks, and a dev-server
 * run measures unbundled modules and hundreds of requests that no visitor ever
 * makes. `scripts/measure-first-load.mjs` established this static gzip server
 * and this is the same one.
 *
 * ## Why it needs a shim at all
 *
 * `/collection` is behind auth and `user_collections` is owner-scoped, so a
 * signed-out run measures a login redirect. `scripts/collection-analytics-shim.js`
 * answers the owner-scoped tables locally and lets everything world readable
 * through to the real database, so the cards on screen are real cards with real
 * prices. Only the quantities are fixture, and they are a fixed pattern so two
 * runs are comparable.
 *
 * ## The layout figure
 *
 * Cumulative Layout Shift, from the browser's own `layout-shift` entries, summed
 * by a PerformanceObserver registered before any application code runs. Every
 * shift is attributed to the elements that moved, so a non-zero result names the
 * thing to fix instead of leaving it to a guess.
 *
 * Written rather than committed to the app: nothing here is bundled, Vite's
 * build input is `index.html` alone.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = process.argv[2] || 'dist';
const LABEL = process.argv[3] || 'run';
const PORT = Number(process.env.PORT || 4399);
const SAMPLE = Number(process.env.SAMPLE || 240);
const RUNS = Number(process.env.RUNS || 3);
const WIDTH = Number(process.env.WIDTH || 1680);
const HEIGHT = Number(process.env.HEIGHT || 1050);

const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'collection-analytics-shim.js'), 'utf8');

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
  headers['content-length'] = body.length;
  res.writeHead(200, headers);
  res.end(body);
});

await new Promise(r => server.listen(PORT, r));

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 240000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox', '--disable-dev-shm-usage'],
});

const ORIGIN = `http://127.0.0.1:${PORT}`;
const SCRYFALL = /scryfall\.io|scryfall\.com/;
const SUPABASE = /supabase\.co/;

async function run(index) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(`window.__DM_SAMPLE = ${SAMPLE};`);
  await page.evaluateOnNewDocument(SHIM);

  const errors = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 180)));

  const cdp = await page.target().createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');

  const inflight = new Map();
  const bytes = new Map();
  cdp.on('Network.requestWillBeSent', e => inflight.set(e.requestId, e.request.url));
  cdp.on('Network.loadingFinished', e => {
    const url = inflight.get(e.requestId);
    if (url) bytes.set(url, Math.max(bytes.get(url) || 0, e.encodedDataLength));
  });

  const t0 = Date.now();
  await page
    .goto(`${ORIGIN}/collection?tab=analytics`, { waitUntil: 'load', timeout: 90000 })
    .catch(e => errors.push(`nav: ${e.message}`));

  /* Readable, not merely mounted.
     "market value" comes from `CollectionQuickStats` in the page header, which
     only prints once the collection has resolved and been valued, and which is
     the same in both the version being measured and the one it replaced. A
     marker unique to either version would make the two runs incomparable, which
     is the mistake the first pass at this script made. */
  let readable = null;
  await page
    .waitForFunction(
      () => /market value/i.test(document.getElementById('root')?.innerText || ''),
      { timeout: 60000, polling: 100 }
    )
    .then(() => {
      readable = Date.now() - t0;
    })
    .catch(() => errors.push('headline never rendered'));

  /* Then hold still long enough for the lazy chart chunk, the card art and any
     late shift to land. A fixed settle rather than networkidle: the app holds a
     realtime socket open, so the network never goes idle and that wait would
     end in a timeout of a different length on every run. */
  await new Promise(r => setTimeout(r, 9000));

  const shift = await page.evaluate(() => window.__dmShift);
  const fixture = await page.evaluate(() => window.__dmFixture ?? null);
  /**
   * Every PostgREST call the page made, in order, including the ones the shim
   * answered locally. This is the figure that matters for database discipline:
   * the network count would hide a per-card loop entirely, because the shim
   * serves those from memory. A repeated `cards: prices` line here IS the
   * per-card pattern.
   */
  const selects = await page.evaluate(() => window.__dmRequests ?? []);
  const paint = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const lcp = performance.getEntriesByType('largest-contentful-paint').pop();
    return {
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      load: nav ? Math.round(nav.loadEventEnd) : null,
      fcp: fcp ? Math.round(fcp.startTime) : null,
      lcp: lcp ? Math.round(lcp.startTime) : null,
    };
  });

  const charts = await page.evaluate(() => ({
    svgs: document.querySelectorAll('.recharts-surface').length,
    bars: document.querySelectorAll('.recharts-bar-rectangle').length,
    railCards: document.querySelectorAll('[aria-label="Most valuable cards"] img').length,
  }));

  const counts = { app: 0, images: 0, api: 0, other: 0 };
  const size = { app: 0, images: 0, api: 0, other: 0, total: 0 };
  const files = [];
  for (const [url, n] of bytes) {
    size.total += n;
    if (url.startsWith(ORIGIN)) {
      counts.app += 1;
      size.app += n;
      files.push([url.slice(ORIGIN.length).split('?')[0], n]);
    } else if (SCRYFALL.test(url)) {
      counts.images += 1;
      size.images += n;
    } else if (SUPABASE.test(url)) {
      counts.api += 1;
      size.api += n;
    } else {
      counts.other += 1;
      size.other += n;
    }
  }
  files.sort((a, b) => b[1] - a[1]);

  await page.close();
  return {
    run: index,
    readableMs: readable,
    paint,
    requests: { ...counts, total: counts.app + counts.images + counts.api + counts.other },
    bytes: size,
    cls: Number((shift?.total ?? 0).toFixed(5)),
    shiftEntries: shift?.entries ?? [],
    charts,
    fixture,
    postgrestCalls: selects.length,
    postgrestByTable: selects.reduce((acc, line) => {
      const table = line.split(':')[0];
      acc[table] = (acc[table] || 0) + 1;
      return acc;
    }, {}),
    selects: [...new Set(selects)],
    topFiles: files.slice(0, 12),
    errors,
  };
}

const results = [];
for (let i = 1; i <= RUNS; i += 1) results.push(await run(i));

await browser.close();
server.close();

const median = arr => {
  const s = [...arr].filter(n => typeof n === 'number').sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

const summary = {
  label: LABEL,
  dist: DIST,
  viewport: `${WIDTH}x${HEIGHT}`,
  runs: RUNS,
  sampleCards: SAMPLE,
  fixture: results[0].fixture,
  median: {
    readableMs: median(results.map(r => r.readableMs)),
    fcp: median(results.map(r => r.paint.fcp)),
    lcp: median(results.map(r => r.paint.lcp)),
    load: median(results.map(r => r.paint.load)),
    requestsTotal: median(results.map(r => r.requests.total)),
    requestsApp: median(results.map(r => r.requests.app)),
    requestsApi: median(results.map(r => r.requests.api)),
    requestsImages: median(results.map(r => r.requests.images)),
    bytesTotal: median(results.map(r => r.bytes.total)),
    bytesApp: median(results.map(r => r.bytes.app)),
    postgrestCalls: median(results.map(r => r.postgrestCalls)),
  },
  postgrestByTable: results[0].postgrestByTable,
  clsPerRun: results.map(r => r.cls),
  clsWorst: Math.max(...results.map(r => r.cls)),
  charts: results[0].charts,
  selects: results[0].selects,
  shiftSources: results.flatMap(r => r.shiftEntries).slice(0, 12),
  errors: [...new Set(results.flatMap(r => r.errors))],
  topFiles: results[0].topFiles,
};

console.log(JSON.stringify({ summary, results: results.map(({ shiftEntries, ...r }) => r) }, null, 2));
