/**
 * Prove the one-sheet preview did not change what prints.
 *
 * The preview now draws a single sheet and hides the rest. Every hidden sheet
 * is still in the DOM — `proxy-page--off` is inside `@media screen` — so the
 * printer must still receive all twelve. This asserts exactly that, by flipping
 * puppeteer's emulated media type and counting the sheets that lay out.
 *
 *   node scripts/proxy-print-verify.mjs dist
 *
 * It also drives the pager, so "sheet 7 shows sheet 7's nine cards" is measured
 * rather than assumed.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = process.argv[2] || 'dist';
const PORT = Number(process.env.PORT || 4421);
const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'deck-save-shim.js'), 'utf8');
const DECK = 'dddddddd-0000-4000-8000-00000000dm01';

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
  const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' };
  if (COMPRESSIBLE.has(ext) && String(req.headers['accept-encoding'] || '').includes('gzip')) {
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

const countSheets = () => {
  const pages = [...document.querySelectorAll('.proxy-page')];
  const visible = pages.filter(p => p.getBoundingClientRect().height > 0);
  return {
    inDom: pages.length,
    laidOut: visible.length,
    slotsOnVisible: visible.reduce(
      (n, p) => n + p.querySelectorAll('.proxy-slot:not(.proxy-slot--empty)').length,
      0
    ),
  };
};

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(SHIM);
  await page.goto(`http://127.0.0.1:${PORT}/deck/${DECK}/proxies`, {
    waitUntil: 'networkidle2',
    timeout: 90000,
  });
  await sleep(9000);

  const screen = await page.evaluate(countSheets);
  const docHScreen = await page.evaluate(() => document.documentElement.scrollHeight);

  /* The promised count is read off the print button rather than hard-coded.
     The fixture draws real `cards_unique` rows, so how many of the 100 are
     double-faced — and therefore how many extra back-face slots exist — moves
     between runs. An earlier version of this script asserted 105 and failed on
     a run that legitimately had 104. */
  const promised = await page.evaluate(() => {
    const m = document.body.innerText.match(/Print (\d+) on (\d+) sheets/);
    return m ? { cards: Number(m[1]), sheets: Number(m[2]) } : null;
  });

  await page.emulateMediaType('print');
  await sleep(600);
  const print = await page.evaluate(countSheets);

  await page.emulateMediaType('screen');
  await sleep(400);

  /* Drive the pager to the last sheet and confirm it draws that sheet. */
  const paged = await page.evaluate(async () => {
    const next = [...document.querySelectorAll('button')].find(
      b => b.getAttribute('aria-label') === 'Next sheet'
    );
    if (!next) return { error: 'no pager' };
    for (let i = 0; i < 11; i++) next.click();
    await new Promise(r => setTimeout(r, 900));
    const label = [...document.querySelectorAll('span')]
      .map(s => s.textContent || '')
      .find(t => /^Sheet \d+ of \d+$/.test(t.trim()));
    const pages = [...document.querySelectorAll('.proxy-page')];
    const visibleIndex = pages.findIndex(p => p.getBoundingClientRect().height > 0);
    return {
      label: (label || '').trim(),
      visibleIndex,
      visibleCount: pages.filter(p => p.getBoundingClientRect().height > 0).length,
      slotsOnVisible: pages[visibleIndex]
        ? pages[visibleIndex].querySelectorAll('.proxy-slot:not(.proxy-slot--empty)').length
        : -1,
    };
  });

  await browser.close();
  server.close();

  console.log('SCREEN  sheets in DOM:', screen.inDom, ' laid out:', screen.laidOut,
    ' cards on visible sheet:', screen.slotsOnVisible);
  console.log('PRINT   sheets in DOM:', print.inDom, ' laid out:', print.laidOut,
    ' cards across sheets:', print.slotsOnVisible);
  console.log('PAGER   ', JSON.stringify(paged));
  console.log('PROMISED', JSON.stringify(promised));
  console.log('docH on screen:', docHScreen);

  const ok =
    Boolean(promised) &&
    screen.laidOut === 1 &&
    print.laidOut === print.inDom &&
    print.inDom === promised.sheets &&
    print.slotsOnVisible === promised.cards &&
    paged.visibleCount === 1 &&
    paged.visibleIndex === promised.sheets - 1 &&
    paged.label === `Sheet ${promised.sheets} of ${promised.sheets}`;
  console.log(
    ok
      ? `\nPASS: one sheet on screen, all ${promised.sheets} sheets and ${promised.cards} cards still print.`
      : '\nFAIL'
  );
  process.exit(ok ? 0 : 1);
})();
