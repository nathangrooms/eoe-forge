/**
 * Walk every page this agent owns, at four widths, and MEASURE the design law
 * rather than eyeball it.
 *
 *   npm run build
 *   node scripts/ui-walk.mjs dist scratch/ui-before
 *
 * Reuses `scripts/deck-save-shim.js` for the fixture session, so protected
 * routes render without a password. Cards on screen are real `cards_unique`
 * rows; only the deck and the owner-scoped tables are fixtures.
 *
 * What it measures, per route per width:
 *
 *  - `contentW` / `deadRight`: the widest laid-out block inside the main
 *    column against the viewport. A page that centres a 720 px column in a
 *    1920 px window reports deadRight ~ 600 and is the "stranded narrow
 *    column" the owner keeps naming.
 *  - `overflowX`: content wider than the viewport, the mobile failure.
 *  - card image geometry: the smallest and median rendered width of every
 *    Scryfall <img>, plus how many are drawn shorter than a 5:7 card would be
 *    at that width (a cropped strip) and how many carry a filter.
 *
 * Everything here is read off the live DOM after settle. Nothing is inferred
 * from source.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = process.argv[2] || 'dist';
const OUT = process.argv[3] || 'scratch/ui-walk';
const PORT = Number(process.env.PORT || 4419);
const SETTLE = Number(process.env.SETTLE || 4200);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const WIDTHS = (process.env.WIDTHS || '1280,1600,1920,390')
  .split(',')
  .map(Number);

const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'deck-save-shim.js'), 'utf8');
const DECK = 'dddddddd-0000-4000-8000-00000000dm01';

/* Routes this agent owns. Play/**, AIBuilder and ai-builder/** belong to other
   agents right now and are deliberately absent. */
const ROUTES = [
  ['proxies-deck', `/deck/${DECK}/proxies`],
  ['proxies-list', '/proxies'],
  ['deck-export', `/deck/${DECK}/export`],
  ['deck-share', `/deck/${DECK}/share`],
  ['deck-optimise', `/deck/${DECK}/optimise`],
  ['deck-testhand', `/deck/${DECK}/testhand`],
  ['deck-commander', `/deck/${DECK}/commander`],
  ['dashboard', '/dashboard'],
  ['decks', '/decks'],
  ['collection', '/collection'],
  ['cards', '/cards'],
  ['marketplace', '/marketplace'],
  ['wishlist', '/wishlist'],
  ['shopping', '/shopping'],
  ['precons', '/precons'],
  ['tutor', '/tutor'],
  ['templates', '/templates'],
  ['scan', '/scan'],
  ['settings', '/settings'],
  ['tournament', '/tournament'],
  ['decks-new', '/decks/new'],
  ['collection-import', '/collection/import'],
  ['life', '/life'],
];

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
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
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

const AUDIT = () => {
  const main = document.querySelector('#main-content') || document.querySelector('main') || document.body;
  const vw = window.innerWidth;

  /* The widest thing actually laid out inside the main column. Elements that
     are wider than the viewport (overlays) or zero-height are ignored. */
  let contentLeft = Infinity;
  let contentRight = 0;
  for (const n of main.querySelectorAll('*')) {
    const r = n.getBoundingClientRect();
    if (r.height < 8 || r.width < 8) continue;
    const s = getComputedStyle(n);
    if (s.position === 'fixed' || s.visibility === 'hidden' || s.display === 'none') continue;
    if (r.width > vw + 4) continue;
    if (r.left < contentLeft) contentLeft = r.left;
    if (r.right > contentRight) contentRight = r.right;
  }
  if (!isFinite(contentLeft)) contentLeft = 0;

  const mainRect = main.getBoundingClientRect();

  const imgs = [...main.querySelectorAll('img')].filter(i =>
    /scryfall/.test(i.currentSrc || i.src || '')
  );
  const geo = imgs
    .map(i => {
      const r = i.getBoundingClientRect();
      const s = getComputedStyle(i);
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        ratio: r.width > 0 ? r.height / r.width : 0,
        filter: s.filter && s.filter !== 'none' ? s.filter : null,
        fit: s.objectFit,
        src: (i.currentSrc || i.src || '').slice(0, 120),
      };
    })
    .filter(g => g.w >= 4 && g.h >= 4);

  const widths = geo.map(g => g.w).sort((a, b) => a - b);
  /* A whole card is 5:7 -> h/w = 1.395. Anything materially shorter is a
     strip, whatever the URL says. */
  const strips = geo.filter(g => g.ratio > 0 && g.ratio < 1.25);
  const filtered = geo.filter(g => g.filter && !/^opacity/.test(g.filter));
  const cropUrls = geo.filter(g => /art_crop/.test(g.src));

  return {
    vw,
    docH: document.documentElement.scrollHeight,
    overflowX: Math.max(0, document.documentElement.scrollWidth - vw),
    mainLeft: Math.round(mainRect.left),
    mainW: Math.round(mainRect.width),
    contentL: Math.round(contentLeft),
    contentR: Math.round(contentRight),
    contentW: Math.round(contentRight - contentLeft),
    deadRight: Math.round(vw - contentRight),
    cardImgs: geo.length,
    minCardW: widths[0] ?? null,
    medCardW: widths.length ? widths[Math.floor(widths.length / 2)] : null,
    maxCardW: widths[widths.length - 1] ?? null,
    tinyCards: widths.filter(w => w < 90).length,
    strips: strips.length,
    stripSample: strips.slice(0, 3).map(s => `${s.w}x${s.h} fit=${s.fit}`),
    filteredImgs: filtered.length,
    filterSample: filtered.slice(0, 3).map(f => f.filter),
    artCropImgs: cropUrls.length,
  };
};

(async () => {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-lcd-text'],
  });
  fs.mkdirSync(OUT, { recursive: true });

  const routes = ONLY ? ROUTES.filter(r => ONLY.includes(r[0])) : ROUTES;
  const report = [];

  for (const [name, route] of routes) {
    for (const width of WIDTHS) {
      const page = await browser.newPage();
      await page.setViewport({
        width,
        height: width < 500 ? 844 : 1000,
        deviceScaleFactor: 1,
        isMobile: width < 500,
        hasTouch: width < 500,
      });
      await page.evaluateOnNewDocument(SHIM);
      const errors = [];
      page.on('pageerror', e => errors.push(String(e.message || e).slice(0, 200)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

      let audit = null;
      try {
        await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: 'networkidle2', timeout: 90000 });
        await sleep(SETTLE);
        audit = await page.evaluate(AUDIT);
        await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage: true });
      } catch (e) {
        errors.push(`WALK FAILED: ${String(e.message || e).slice(0, 200)}`);
      }
      await page.close();

      const row = { name, route, width, ...(audit || {}), errors: [...new Set(errors)].slice(0, 4) };
      report.push(row);
      if (audit) {
        console.log(
          `${name.padEnd(18)} ${String(width).padStart(4)}  ` +
            `content ${String(audit.contentW).padStart(4)}  dead ${String(audit.deadRight).padStart(4)}  ` +
            `ovf ${String(audit.overflowX).padStart(3)}  ` +
            `imgs ${String(audit.cardImgs).padStart(3)} min ${String(audit.minCardW ?? '-').padStart(4)} ` +
            `med ${String(audit.medCardW ?? '-').padStart(4)}  ` +
            `strip ${String(audit.strips).padStart(3)} filt ${String(audit.filteredImgs).padStart(2)} ` +
            `crop ${String(audit.artCropImgs).padStart(2)}  ${row.errors.length ? 'ERR' : ''}`
        );
      } else {
        console.log(`${name.padEnd(18)} ${String(width).padStart(4)}  FAILED  ${row.errors[0] || ''}`);
      }
    }
  }

  await browser.close();
  server.close();
  fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(report, null, 2));
  console.log(`\nwritten to ${OUT}`);
})();
