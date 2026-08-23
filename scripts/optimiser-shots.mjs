/**
 * Screenshots of the optimiser's new front door and the page behind it.
 *
 *   npm run build
 *   node scripts/optimiser-shots.mjs dist-optimiser-after
 *
 * Written to `.shots/`, which is gitignored. `--disable-lcd-text` because
 * subpixel antialiasing puts coloured fringes on thin type over dark grounds
 * and reads as a styling bug that is not there.
 *
 * Four frames, and each one answers something the request counts cannot:
 * whether the door is visible without scrolling, whether the destination looks
 * like part of the deck, whether the five steps read as a sequence, and whether
 * a swap still shows both cards whole with their prices.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = process.argv[2] || 'dist';
const PORT = Number(process.env.PORT || 4417);
const WIDTH = Number(process.env.WIDTH || 1600);
const HEIGHT = Number(process.env.HEIGHT || 1000);

const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'optimiser-apply-shim.js'), 'utf8');
const OUT = path.join(here, '..', '.shots');
const DECK = 'dddddddd-0000-4000-8000-00000000dm01';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(DIST, p);
  let ext = path.extname(file);
  if (!ext || !fs.existsSync(file)) {
    file = path.join(DIST, 'index.html');
    ext = '.html';
  }
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(fs.readFileSync(file));
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function clickText(page, selector, text) {
  const box = await page.evaluate(
    (sel, want) => {
      const hit = [...document.querySelectorAll(sel)].find(n =>
        (n.textContent || '').trim().toLowerCase().includes(want.toLowerCase())
      );
      if (!hit) return null;
      hit.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = hit.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    selector,
    text
  );
  if (!box) return false;
  await sleep(200);
  await page.mouse.click(box.x, box.y);
  return true;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-lcd-text'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });
  await page.evaluateOnNewDocument('window.__DM_SWAP_COUNT = 9;');
  await page.evaluateOnNewDocument(SHIM);

  const shot = async name => {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    console.log(`   ${file}`);
    return file;
  };

  // 1. The deck page: is the door visible without scrolling?
  await page.goto(`http://127.0.0.1:${PORT}/deck/${DECK}`, { waitUntil: 'networkidle2', timeout: 120000 });
  await sleep(7000);
  await shot('optimiser-1-deck-header');
  const door = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x =>
      /^optimise$/i.test((x.textContent || '').trim())
    );
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { top: Math.round(r.top), aboveFold: r.bottom <= window.innerHeight };
  });
  console.log(`Optimise control: ${JSON.stringify(door)}`);

  // 2. The destination, before a pass.
  await page.goto(`http://127.0.0.1:${PORT}/deck/${DECK}/optimise`, { waitUntil: 'networkidle2', timeout: 120000 });
  await sleep(6000);
  await shot('optimiser-2-route-ready');

  // 3. The five steps, after one.
  await clickText(page, 'button', 'Optimise deck');
  await page.waitForFunction(
    () => [...document.querySelectorAll('[role="tab"]')].some(t => /Swaps/i.test(t.textContent || '')),
    { timeout: 120000 }
  );
  await sleep(4000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  await shot('optimiser-3-five-steps');

  // 4. A swap, both cards whole, with prices.
  await clickText(page, '[role="tab"]', 'Swaps');
  await sleep(3000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x =>
      /Apply this swap/i.test(x.textContent || '')
    );
    if (b) b.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  await sleep(1200);
  await shot('optimiser-4-a-swap');

  await browser.close();
  server.close();
})();
