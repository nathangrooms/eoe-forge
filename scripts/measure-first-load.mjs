// Measures what a first-time visitor actually downloads.
// Serves dist/ over a local gzip-enabled static server (production parity: Lovable
// serves compressed), loads each URL in a cold-cache Chrome, and sums the real
// encodedDataLength reported by the network stack.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import puppeteer from 'puppeteer';

const DIST = process.argv[2];
const LABEL = process.argv[3] || 'run';
const PORT = Number(process.argv[4] || 4321);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.webmanifest']);

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
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
    res.writeHead(200, headers); return res.end(gz);
  }
  headers['content-length'] = body.length;
  res.writeHead(200, headers); res.end(body);
});

await new Promise(r => server.listen(PORT, r));

const targets = JSON.parse(process.env.TARGETS);
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--disable-lcd-text', '--no-sandbox', '--disable-dev-shm-usage'],
});

const out = [];
for (const t of targets) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 1440, height: 900 });
  const cdp = await page.target().createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');
  const byUrl = new Map();
  const record = (url, bytes) => {
    const prev = byUrl.get(url) || 0;
    byUrl.set(url, Math.max(prev, bytes));
  };
  const inflight = new Map();
  cdp.on('Network.requestWillBeSent', e => inflight.set(e.requestId, e.request.url));
  cdp.on('Network.loadingFinished', e => {
    const url = inflight.get(e.requestId);
    if (url) record(url, e.encodedDataLength);
  });

  /* `load` plus a fixed settle, not `networkidle0`. The app holds a Supabase
     realtime socket open, so the network never goes idle and that wait would
     end in a timeout rather than a measurement. A timeout is a different
     length on every run, which would make the before and after numbers
     incomparable. A fixed settle gives every run the same window to fetch in. */
  await page.goto(`http://localhost:${PORT}${t.path}`, { waitUntil: 'load', timeout: 60000 })
    .catch(e => console.error('nav', t.path, e.message));

  /* Then wait for the page to have actually painted something, because a run
     that measured a spinner would report a smaller download than a real visit
     and flatter whichever build it happened to hit. */
  await page
    .waitForFunction(() => (document.getElementById('root')?.innerText || '').trim().length > 40, {
      timeout: 45000,
      polling: 250,
    })
    .catch(() => console.error('never rendered', t.path));
  await new Promise(r => setTimeout(r, 8000));

  const origin = `http://localhost:${PORT}`;
  let appJs = 0, appCss = 0, appOther = 0, thirdParty = 0, total = 0;
  const files = [];
  for (const [url, bytes] of byUrl) {
    total += bytes;
    if (url.startsWith(origin)) {
      const clean = url.slice(origin.length).split('?')[0];
      files.push([clean, bytes]);
      if (clean.endsWith('.js')) appJs += bytes;
      else if (clean.endsWith('.css')) appCss += bytes;
      else appOther += bytes;
    } else thirdParty += bytes;
  }
  files.sort((a, b) => b[1] - a[1]);
  const bodyText = await page.evaluate(() => document.getElementById('root')?.innerText?.slice(0, 200) || '');
  out.push({ path: t.path, name: t.name, appJs, appCss, appOther, thirdParty, total, files, rendered: bodyText.replace(/\s+/g, ' ').trim().slice(0, 90) });
  await page.close();
}

await browser.close();
server.close();
console.log(JSON.stringify({ label: LABEL, results: out }, null, 2));
