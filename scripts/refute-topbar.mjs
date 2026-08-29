/**
 * Can a thumb actually reach every control in the top bar?
 *
 *   npm run build
 *   node scripts/refute-topbar.mjs dist
 *
 * The header is `position: fixed` with its overflow clipped, so a control that
 * does not fit is not merely ugly: it cannot be reached by scrolling, swiping
 * or tapping, on every page of the app. Counting widths is not enough — a
 * control can be inside the bar and still be underneath another one. So this
 * asks the page what is actually painted at each control's own centre point,
 * and reports a control as unreachable when the answer is not that control.
 *
 * Widths are the four that matter: 360 covers most Android handsets, 390 the
 * iPhone 12 to 15, 414 the Plus and Max, and 768 is where the desktop layout
 * takes over.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = process.argv[2] || 'dist';
const PORT = Number(process.env.PORT || 4733);
const SETTLE = Number(process.env.SETTLE || 5000);
const WIDTHS = (process.env.WIDTHS || '360,390,414,768').split(',').map(Number);
const ROUTE = process.env.ROUTE || '/dashboard';

const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'refute-shim.js'), 'utf8');
const EXTRA = fs.readFileSync(path.join(here, 'refute-rpc-layer.js'), 'utf8');

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(DIST, p);
  if (!path.extname(file) || !fs.existsSync(file)) file = path.join(DIST, 'index.html');
  const ext = path.extname(file);
  const mime = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  }[ext] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': mime, 'cache-control': 'no-store' });
  res.end(fs.readFileSync(file));
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

const PROBE = () => {
  const header = document.querySelector('header');
  if (!header) return { error: 'no header' };
  const hr = header.getBoundingClientRect();

  const controls = [...header.querySelectorAll('a,button,input,[role="button"]')].filter(el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none';
  });

  const name = el =>
    (el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.getAttribute('placeholder') ||
      (el.textContent || '').trim() ||
      el.tagName).slice(0, 34);

  const unreachable = [];
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    if (x < 0 || x > window.innerWidth || r.right > hr.right + 1 || r.left < hr.left - 1) {
      unreachable.push(`${name(el)} (outside the bar)`);
      continue;
    }
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(el.contains(hit) || hit.contains(el))) {
      unreachable.push(`${name(el)} (covered by ${hit ? hit.tagName.toLowerCase() : 'nothing'})`);
    }
  }

  /* How much of the bar the controls actually occupy, left edge of the first to
     right edge of the last. A first version summed the widths of
     `header.firstElementChild`'s children, which is only the flex row on some
     builds and reported a flat 0 on this one. A number that comes out 0 at
     every width is measuring nothing. */
  let cLeft = Infinity;
  let cRight = 0;
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    if (r.left < cLeft) cLeft = r.left;
    if (r.right > cRight) cRight = r.right;
  }
  const needs = isFinite(cLeft) ? Math.round(cRight - cLeft) : 0;

  return {
    vw: window.innerWidth,
    barW: Math.round(hr.width),
    needs,
    controls: controls.length,
    unreachable,
  };
};

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-lcd-text'],
  });

  let bad = 0;
  for (const width of WIDTHS) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 844, isMobile: width < 768, hasTouch: width < 768 });
    await page.evaluateOnNewDocument(SHIM);
    await page.evaluateOnNewDocument(EXTRA);
    await page.goto(`http://127.0.0.1:${PORT}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(SETTLE);
    const r = await page.evaluate(PROBE);
    await page.close();
    bad += (r.unreachable || []).length;
    console.log(
      `${String(width).padStart(4)}  bar ${String(r.barW).padStart(4)}  needs ${String(r.needs).padStart(4)}  ` +
      `controls ${String(r.controls).padStart(2)}  ` +
      (r.unreachable && r.unreachable.length
        ? `UNREACHABLE: ${r.unreachable.join(' | ')}`
        : 'all reachable')
    );
  }

  await browser.close();
  server.close();
  console.log(bad === 0 ? '\nevery top-bar control reachable at every width' : `\n${bad} unreachable readings`);
})();
