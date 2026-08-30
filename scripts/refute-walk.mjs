/**
 * Walk EVERY route in the app, at four widths, and measure the things the
 * design law can actually be checked for. Written for an adversarial review, so
 * it deliberately checks the two things the previous walks got wrong:
 *
 *  1. **Desaturation is inherited.** `filter: grayscale(1)` on a wrapper greys
 *     the card inside it while the <img>'s own computed filter still reads
 *     `none`. A previous pass proved "filter: none on every Scryfall <img>" and
 *     that proves nothing. This walks the ancestor chain and reports the
 *     EFFECTIVE filter.
 *  2. **Cropping is done by the container.** A whole card image inside a short
 *     `overflow: hidden` box is cropped no matter what its own aspect ratio
 *     says. This compares each image's rect against every clipping ancestor and
 *     reports the fraction of the card actually visible.
 *
 * Run:
 *   npm run build
 *   node scripts/refute-walk.mjs dist scratch/refute
 *   ONLY=deck-cards,collection WIDTHS=1600 node scripts/refute-walk.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = process.argv[2] || 'dist';
const OUT = process.argv[3] || 'scratch/refute';
const PORT = Number(process.env.PORT || 4531);
const SETTLE = Number(process.env.SETTLE || 9000);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SIGNED_OUT = process.env.SIGNED_OUT === '1';
const ADMIN = process.env.ADMIN === '1';
const SHOTS = process.env.SHOTS !== '0';
const WIDTHS = (process.env.WIDTHS || '1280,1600,1920,390').split(',').map(Number);

const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'refute-shim.js'), 'utf8');
/* An optional second layer over the shim, injected after it. `EXTRA_SHIM=
   scripts/refute-rpc-layer.js` answers the RPCs and edge functions the base
   shim returns null for, so the routes that depend on them are walked doing
   their job rather than drawing an empty state. Off by default: the base walk
   deliberately records those calls as unanswered. */
const EXTRA = process.env.EXTRA_SHIM
  ? fs.readFileSync(path.resolve(process.env.EXTRA_SHIM), 'utf8')
  : null;
const DECK = 'e0909132-5a48-4416-924c-dd2374d3d34d';

const ROUTES = [
  ['home', '/'],
  ['login', '/login'],
  ['register', '/register'],
  ['reset', '/reset-password'],
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
  ['deck-add', `/deck/${DECK}?tab=add`],
  ['deck-mana', `/deck/${DECK}?tab=mana`],
  ['deck-edh', `/deck/${DECK}?tab=edh`],
  ['deck-analysis', `/deck/${DECK}?tab=analysis`],
  ['deck-legality', `/deck/${DECK}?tab=legality`],
  ['deck-value', `/deck/${DECK}?tab=value`],
  ['deck-record', `/deck/${DECK}?tab=record`],
  ['deck-optimise', `/deck/${DECK}/optimise`],
  ['deck-export', `/deck/${DECK}/export`],
  ['deck-share', `/deck/${DECK}/share`],
  ['deck-proxies', `/deck/${DECK}/proxies`],
  ['deck-testhand', `/deck/${DECK}/testhand`],
  ['deck-commander', `/deck/${DECK}/commander`],
  ['smart-builder', '/smart-builder'],
  ['tutor', '/tutor'],
  ['templates', '/templates'],
  ['cards', '/cards'],
  ['card-detail', '/cards/d0d33d52-3d28-4635-b985-51e126289259'],
  ['wishlist', '/wishlist'],
  ['shopping', '/shopping'],
  ['proxies', '/proxies'],
  ['play', '/play'],
  /* The load-in flow's later steps. They are URL addressable, so they are
     walkable: `step` is a search param exactly so back, forward and a pasted
     link all land on the screen they name. */
  ['play-deck', '/play?mode=bots'],
  ['play-seats', '/play?mode=bots&step=table'],
  ['play-goldfish', '/play?mode=goldfish&step=table'],
  ['play-online', '/play/online'],
  ['play-mats', '/play/mats'],
  ['life', '/life'],
  ['tournament', '/tournament'],
  ['tournament-new', '/tournament/new'],
  ['settings', '/settings'],
  ['admin', '/admin'],
  ['notfound', '/definitely-not-a-route'],
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

const AUDIT = () => {
  const main = document.querySelector('#main-content') || document.querySelector('main') || document.body;
  const vw = window.innerWidth;

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

  /* Effective filter: the img's own, plus every ancestor's, because filter on a
     parent paints the child. */
  function effectiveFilter(el) {
    const parts = [];
    let n = el;
    while (n && n !== document.documentElement) {
      const f = getComputedStyle(n).filter;
      if (f && f !== 'none') parts.push(f);
      n = n.parentElement;
    }
    return parts;
  }

  /* Visible fraction against HARD clips only.
     `overflow: auto|scroll` hides the far end of a carousel, which is not a
     crop — the rest of the card is one scroll away. `overflow: hidden|clip` on
     a box shorter than the card is a crop, and permanent. Only the second kind
     is counted, or every horizontal card rail reports as cropped. */
  function visibleFraction(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return 0;
    let box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    let n = el.parentElement;
    while (n && n !== document.documentElement) {
      const s = getComputedStyle(n);
      const hard = side => /^(hidden|clip)$/.test(side);
      if (hard(s.overflowX) || hard(s.overflowY)) {
        const cr = n.getBoundingClientRect();
        box = {
          l: hard(s.overflowX) ? Math.max(box.l, cr.left) : box.l,
          t: hard(s.overflowY) ? Math.max(box.t, cr.top) : box.t,
          r: hard(s.overflowX) ? Math.min(box.r, cr.right) : box.r,
          b: hard(s.overflowY) ? Math.min(box.b, cr.bottom) : box.b,
        };
      }
      n = n.parentElement;
    }
    const w = Math.max(0, box.r - box.l);
    const h = Math.max(0, box.b - box.t);
    return (w * h) / (r.width * r.height);
  }

  function blurred(el) {
    let n = el;
    while (n && n !== document.documentElement) {
      if (/blur\(/.test(getComputedStyle(n).filter || '')) return true;
      n = n.parentElement;
    }
    return false;
  }

  const imgs = [...document.querySelectorAll('img')].filter(i => /scryfall/.test(i.currentSrc || i.src || ''));
  const geo = imgs.map(i => {
    const r = i.getBoundingClientRect();
    const s = getComputedStyle(i);
    const filters = effectiveFilter(i);
    return {
      w: Math.round(r.width), h: Math.round(r.height),
      ratio: r.width > 0 ? +(r.height / r.width).toFixed(3) : 0,
      filters,
      desat: filters.some(f => /grayscale|saturate\(0|sepia|invert/.test(f)),
      fit: s.objectFit,
      visible: +visibleFraction(i).toFixed(3),
      blur: blurred(i),
      artCrop: /art_crop/.test(i.currentSrc || i.src || ''),
      src: (i.currentSrc || i.src || '').slice(0, 160),
      alt: (i.alt || '').slice(0, 60),
    };
  }).filter(g => g.w >= 4 && g.h >= 4);

  /* CSS background images pointing at Scryfall art. */
  const bgArt = [];
  for (const n of document.querySelectorAll('*')) {
    const bg = getComputedStyle(n).backgroundImage;
    if (bg && /scryfall/.test(bg)) bgArt.push({ tag: n.tagName, crop: /art_crop/.test(bg), blur: blurred(n), cls: String(n.className).slice(0, 80) });
  }

  const widths = geo.map(g => g.w).sort((a, b) => a - b);
  const desat = geo.filter(g => g.desat);
  const clipped = geo.filter(g => g.visible < 0.9);
  /* An art_crop behind a heavy blur is the approved identity ground; a sharp
     one is a cropped card and the design law forbids it. */
  const cropUrls = geo.filter(g => g.artCrop && !g.blur);
  const cropBlurred = geo.filter(g => g.artCrop && g.blur);

  const text = (main.innerText || '').trim();

  return {
    vw,
    docH: document.documentElement.scrollHeight,
    overflowX: Math.max(0, document.documentElement.scrollWidth - vw),
    contentW: Math.round(contentRight - contentLeft),
    deadRight: Math.round(vw - contentRight),
    textLen: text.length,
    head: text.slice(0, 90).replace(/\s+/g, ' '),
    cardImgs: geo.length,
    minCardW: widths[0] ?? null,
    medCardW: widths.length ? widths[Math.floor(widths.length / 2)] : null,
    desatCount: desat.length,
    desatSample: desat.slice(0, 4).map(d => `${d.alt || d.src.slice(-30)} :: ${d.filters.join(' | ')}`),
    clippedCount: clipped.length,
    clippedSample: clipped.slice(0, 4).map(c => `${c.alt || c.src.slice(-30)} vis=${c.visible} ${c.w}x${c.h} fit=${c.fit}`),
    artCropCount: cropUrls.length,
    artCropSample: cropUrls.slice(0, 6).map(c => `${c.alt || c.src.slice(-40)} ${c.w}x${c.h}`),
    artCropBlurred: cropBlurred.length,
    bgArtCount: bgArt.length,
    bgArtCrop: bgArt.filter(b => b.crop && !b.blur).length,
    bgArtSample: bgArt.filter(b => b.crop && !b.blur).slice(0, 4).map(b => `${b.tag} ${b.cls}`),
    rpc: [...new Set(window.__dmRpc || [])],
    fixture: window.__dmFixture || null,
    href: location.pathname + location.search,
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
        width, height: width < 500 ? 844 : 1000,
        deviceScaleFactor: 1, isMobile: width < 500, hasTouch: width < 500,
      });
      if (!SIGNED_OUT) {
        await page.evaluateOnNewDocument(`window.__DM_ADMIN = ${ADMIN};`);
        await page.evaluateOnNewDocument(SHIM);
        if (EXTRA) await page.evaluateOnNewDocument(EXTRA);
      }
      const errors = [];
      const slow = [];
      const failed = [];
      const started = new Map();
      page.on('pageerror', e => errors.push('PAGEERROR ' + String(e.message || e).slice(0, 180)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 180)); });
      page.on('request', r => started.set(r, Date.now()));
      page.on('requestfinished', r => {
        const t0 = started.get(r);
        if (t0 == null) return;
        const ms = Date.now() - t0;
        const u = r.url();
        if (ms > 1000 && !u.startsWith('data:')) slow.push(`${ms}ms ${u.slice(0, 110)}`);
      });
      page.on('requestfailed', r => {
        const u = r.url();
        if (!u.startsWith('data:')) failed.push(`${r.failure()?.errorText || 'failed'} ${u.slice(0, 110)}`);
      });
      page.on('response', res => {
        if (res.status() >= 400) failed.push(`HTTP ${res.status()} ${res.url().slice(0, 110)}`);
      });

      let audit = null;
      try {
        await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await sleep(SETTLE);
        audit = await page.evaluate(AUDIT);
        if (SHOTS) await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage: true });
      } catch (e) {
        errors.push(`WALK FAILED: ${String(e.message || e).slice(0, 200)}`);
      }
      await page.close();

      const row = {
        name, route, width, ...(audit || {}),
        errors: [...new Set(errors)].slice(0, 6),
        slow: [...new Set(slow)].slice(0, 6),
        failed: [...new Set(failed)].slice(0, 6),
      };
      report.push(row);
      if (audit) {
        console.log(
          `${name.padEnd(20)} ${String(width).padStart(4)}  ` +
          `dead ${String(audit.deadRight).padStart(4)}  ovf ${String(audit.overflowX).padStart(3)}  ` +
          `h ${String(audit.docH).padStart(6)}  txt ${String(audit.textLen).padStart(5)}  ` +
          `img ${String(audit.cardImgs).padStart(3)} desat ${String(audit.desatCount).padStart(2)} ` +
          `clip ${String(audit.clippedCount).padStart(3)} crop ${String(audit.artCropCount).padStart(2)} ` +
          `bg ${String(audit.bgArtCount).padStart(2)}  ` +
          `${row.errors.length ? 'ERR' + row.errors.length : ''} ${row.slow.length ? 'SLOW' + row.slow.length : ''} ${row.failed.length ? 'FAIL' + row.failed.length : ''}  -> ${audit.href}`
        );
      } else {
        console.log(`${name.padEnd(20)} ${String(width).padStart(4)}  FAILED  ${row.errors[0] || ''}`);
      }
    }
  }

  await browser.close();
  server.close();
  fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(report, null, 2));
  console.log(`\nwritten to ${OUT}`);
})();
