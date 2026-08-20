/**
 * Photograph the Collection analytics tab, from the built bundle.
 *
 *   npm run build
 *   node scripts/collection-analytics-shots.mjs dist after
 *
 * Same server and same shim as `scripts/collection-analytics-measure.mjs`, so
 * what is photographed is exactly what was measured. Shots land in `.shots/`,
 * which is gitignored.
 *
 * Three widths, because "full width" and "not stretched" are claims about
 * behaviour across sizes, not about one screenshot. Launched with
 * `--disable-lcd-text`: subpixel antialiasing puts coloured fringes on thin type
 * over dark backgrounds and reads as a styling bug that is not there.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = process.argv[2] || 'dist';
const TAG = process.argv[3] || 'after';
const PORT = Number(process.env.PORT || 4421);
const OUT = process.env.OUT || '.shots';
fs.mkdirSync(OUT, { recursive: true });

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
  const body = fs.readFileSync(file);
  const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' };
  if (COMPRESSIBLE.has(ext) && String(req.headers['accept-encoding'] || '').includes('gzip')) {
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
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});

const SIZES = [
  { name: 'wide', width: 2200, height: 1400 },
  { name: 'desktop', width: 1680, height: 1200 },
  { name: 'laptop', width: 1280, height: 1000 },
  { name: 'phone', width: 420, height: 900 },
];

for (const size of SIZES) {
  const page = await browser.newPage();
  await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument('window.__DM_SAMPLE = 240;');
  await page.evaluateOnNewDocument(SHIM);
  page.on('pageerror', e => console.error('  [pageerror]', e.message.slice(0, 200)));

  await page.goto(`http://127.0.0.1:${PORT}/collection?tab=analytics`, {
    waitUntil: 'load',
    timeout: 90000,
  });
  await page
    .waitForFunction(() => /market value/i.test(document.getElementById('root')?.innerText || ''), {
      timeout: 60000,
      polling: 150,
    })
    .catch(() => console.error('  never rendered', size.name));

  /* Long enough for the lazy chart chunk and the card art. Then scroll the
     whole page once so every lazily loaded image is asked for, otherwise the
     lower half photographs as empty boxes. */
  await new Promise(r => setTimeout(r, 4000));
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 220));
    }
    window.scrollTo(0, 0);
  });
  await new Promise(r => setTimeout(r, 2500));

  /**
   * Grow the viewport to the page and take an ordinary screenshot, rather than
   * `fullPage: true`.
   *
   * `fullPage` stitches from the compositor and the recharts SVGs came out
   * blank in every one of them, on a page whose charts had definitely rendered
   * (their bars were in the DOM with real geometry and real fills). A shot that
   * silently drops the thing being reviewed is worse than no shot. CLAUDE.md
   * already warns that this environment frequently will not composite; this is
   * that, and a tall viewport goes through the normal paint path instead.
   */
  const pageHeight = await page.evaluate(() =>
    Math.min(document.documentElement.scrollHeight + 40, 9000)
  );
  await page.setViewport({ width: size.width, height: pageHeight, deviceScaleFactor: 1 });
  await new Promise(r => setTimeout(r, 2500));

  const file = `${OUT}/${TAG}-analytics-${size.name}.png`;
  await page.screenshot({ path: file });
  console.log('shot ->', file, `${size.width}x${pageHeight}`);

  const text = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(`${OUT}/${TAG}-analytics-${size.name}.txt`, text);

  /* Two things the copy rules ban outright, and one the pricing rules do.
     Cheap to check here and easy to miss by eye. */
  const zeros = (text.match(/\$0\.00/g) || []).length;
  const dashes = (text.match(/(?<![\d.])—(?![\d.])/g) || []).length;
  console.log(`  [${size.name}] $0.00 x${zeros}   em-dash x${dashes}`);

  await page.close();
}

await browser.close();
server.close();
