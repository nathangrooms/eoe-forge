/**
 * Does the page actually USE the window, or is it a ribbon down the middle?
 *
 *   npm run build
 *   node scripts/refute-width.mjs dist scratch/width
 *
 * `refute-walk.mjs` already reports `deadRight`, and it missed this. Its
 * measure is the widest laid-out element inside the main column, and every
 * page has an invisible full-bleed wrapper, so `/collection/import` — a 768px
 * card centred in a 1592px window with 285px of empty charcoal down each side,
 * which is the exact thing the owner keeps naming — reported `dead 8` and read
 * as passing. A screenshot showed it in one glance.
 *
 * So this measures the PAINTED width instead: the union of every element that
 * draws something a person can see, which is a background colour, a background
 * image, a border or a shadow. An invisible wrapper paints nothing and cannot
 * hide a narrow column behind itself.
 *
 * Reported per route per width:
 *
 *   paintedW   how wide the visible page actually is
 *   dead       the empty band, measured against the space the page was GIVEN
 *   deadPct    that as a share of it, which is the number to argue with
 *
 * `dead` is `viewport - main's left edge - painted`, not `viewport - painted`.
 * The left nav is 256px and it is not dead space; subtracting it from the
 * viewport instead made every route report an identical 16.3% and turned a
 * clean sweep into 28 false failures. A figure that is the same on every page
 * is measuring the shell, not the page.
 *
 * Measured at 1920 after the collection pages were widened: 3.4% at worst,
 * which is the page's own right gutter plus the scrollbar. Anything above
 * roughly 8% is a real ribbon and worth opening.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = process.argv[2] || 'dist';
const OUT = process.argv[3] || 'scratch/width';
const PORT = Number(process.env.PORT || 4711);
const SETTLE = Number(process.env.SETTLE || 6000);
const WIDTHS = (process.env.WIDTHS || '1280,1600,1920').split(',').map(Number);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'refute-shim.js'), 'utf8');
const EXTRA = fs.readFileSync(path.join(here, 'refute-rpc-layer.js'), 'utf8');
const DECK = 'e0909132-5a48-4416-924c-dd2374d3d34d';

const ROUTES = [
  ['dashboard', '/dashboard'],
  ['collection', '/collection'],
  ['collection-storage', '/collection/storage'],
  ['collection-import', '/collection/import'],
  ['collection-insurance', '/collection/insurance'],
  ['marketplace', '/marketplace'],
  ['scan', '/scan'],
  ['decks', '/decks'],
  ['decks-new', '/decks/new'],
  ['precons', '/precons'],
  ['deck-cards', `/deck/${DECK}`],
  ['deck-mana', `/deck/${DECK}?tab=mana`],
  ['deck-edh', `/deck/${DECK}?tab=edh`],
  ['deck-value', `/deck/${DECK}?tab=value`],
  ['deck-optimise', `/deck/${DECK}/optimise`],
  ['deck-export', `/deck/${DECK}/export`],
  ['deck-share', `/deck/${DECK}/share`],
  ['deck-testhand', `/deck/${DECK}/testhand`],
  ['deck-commander', `/deck/${DECK}/commander`],
  ['cards', '/cards'],
  ['card-detail', '/cards/d0d33d52-3d28-4635-b985-51e126289259'],
  ['wishlist', '/wishlist'],
  ['shopping', '/shopping'],
  ['proxies', '/proxies'],
  ['templates', '/templates'],
  ['tutor', '/tutor'],
  ['settings', '/settings'],
  ['tournament', '/tournament'],
  ['tournament-new', '/tournament/new'],
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
  if (!ext || !fs.existsSync(file)) { file = path.join(DIST, 'index.html'); ext = '.html'; }
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

const MEASURE = () => {
  const main = document.querySelector('#main-content') || document.querySelector('main') || document.body;
  const vw = window.innerWidth;
  const mainRect = main.getBoundingClientRect();

  let left = Infinity;
  let right = 0;
  let widest = null;

  const paints = s =>
    (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') ||
    (s.backgroundImage && s.backgroundImage !== 'none') ||
    (s.boxShadow && s.boxShadow !== 'none') ||
    (s.borderTopWidth !== '0px' || s.borderLeftWidth !== '0px');

  for (const n of main.querySelectorAll('*')) {
    const r = n.getBoundingClientRect();
    if (r.width < 24 || r.height < 8) continue;
    if (r.width > vw + 4) continue;
    const s = getComputedStyle(n);
    if (s.visibility === 'hidden' || s.display === 'none' || s.position === 'fixed') continue;
    if (Number(s.opacity) === 0) continue;
    if (!paints(s) && n.tagName !== 'IMG' && n.tagName !== 'CANVAS' && n.tagName !== 'SVG') continue;
    if (r.left < left) left = r.left;
    if (r.right > right) {
      right = r.right;
      widest = `${n.tagName.toLowerCase()}.${String(n.className).slice(0, 60)}`;
    }
  }
  if (!isFinite(left)) { left = mainRect.left; right = mainRect.right; }

  const painted = Math.round(right - left);
  /* Against the space the page was given, which starts where the nav ends. */
  const available = Math.round(vw - mainRect.left);
  const dead = available - painted;
  return {
    vw,
    mainLeft: Math.round(mainRect.left),
    available,
    paintedW: painted,
    dead,
    deadPct: Math.round((dead / available) * 1000) / 10,
    widest,
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
      await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
      await page.evaluateOnNewDocument('window.__DM_ADMIN = false;');
      await page.evaluateOnNewDocument(SHIM);
      await page.evaluateOnNewDocument(EXTRA);
      let m = null;
      try {
        await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await sleep(SETTLE);
        m = await page.evaluate(MEASURE);
      } catch (e) {
        m = { error: String(e.message || e).slice(0, 120) };
      }
      await page.close();
      report.push({ name, route, width, ...m });
      console.log(
        `${name.padEnd(20)} ${String(width).padStart(4)}  painted ${String(m.paintedW ?? '-').padStart(5)}  ` +
        `dead ${String(m.dead ?? '-').padStart(5)} (${String(m.deadPct ?? '-').padStart(5)}%)  ${m.error || ''}`
      );
    }
  }

  await browser.close();
  server.close();
  fs.writeFileSync(path.join(OUT, 'width.json'), JSON.stringify(report, null, 2));
  const worst = report
    .filter(r => (r.deadPct ?? 0) > 8)
    .sort((a, b) => b.deadPct - a.deadPct);
  console.log(`\n${worst.length} readings over 8% dead:`);
  for (const w of worst) console.log(`  ${w.name} @${w.width}  ${w.deadPct}%  painted ${w.paintedW}`);
})();
