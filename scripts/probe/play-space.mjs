/**
 * How much of the screen the play flow actually uses.
 *
 * Owner's standing instruction: "Ensure we are utilising the full width of the
 * app - no weird small windows or unutilised space." A page that ends two
 * hundred pixels above the fold on a laptop is dead space, and on the one
 * screen whose whole job is presenting four choices it is the choices that are
 * being made small.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const DIST = 'dist';
const PORT = 4581;
const SHIM = fs.readFileSync(path.resolve('scripts/refute-shim.js'), 'utf8');
const DECK = 'e0909132-5a48-4416-924c-dd2374d3d34d';

const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon' };
const server = http.createServer((req,res)=>{
  const p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(DIST,p); let ext = path.extname(file);
  if(!ext || !fs.existsSync(file)){ file = path.join(DIST,'index.html'); ext='.html'; }
  res.writeHead(200,{'content-type':MIME[ext]||'application/octet-stream'});
  res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(PORT,r));

const ROUTES = [
  ['mode wall',   '/play'],
  ['deck step',   `/play?mode=bots&step=deck`],
  ['seat step',   `/play?mode=bots&deck=${DECK}&step=table`],
  ['goldfish deck', `/play?mode=goldfish&step=deck`],
];
const WIDTHS = [[1600,1000],[1280,800],[390,844]];

const browser = await puppeteer.launch({ headless:'new', args:['--disable-lcd-text','--no-sandbox'] });
console.log('route            viewport    page h   content ends   DEAD BELOW   widest gap');
for (const [label, url] of ROUTES) {
  for (const [w,h] of WIDTHS) {
    const page = await browser.newPage();
    await page.setViewport({ width:w, height:h });
    await page.evaluateOnNewDocument(SHIM);
    await page.goto(`http://localhost:${PORT}${url}`, { waitUntil:'networkidle0' });
    await new Promise(r=>setTimeout(r,7000));
    const m = await page.evaluate(() => {
      const main = document.querySelector('main') ?? document.body;
      let lowest = 0;
      for (const el of main.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.width > 0 && getComputedStyle(el).visibility !== 'hidden') {
          lowest = Math.max(lowest, r.bottom + window.scrollY);
        }
      }
      return { pageH: document.documentElement.scrollHeight, contentEnds: Math.round(lowest), viewH: window.innerHeight };
    });
    const dead = Math.max(0, m.viewH - m.contentEnds);
    console.log(
      `${label.padEnd(16)} ${String(w).padStart(4)}x${String(h).padEnd(4)} ${String(m.pageH).padStart(6)} ${String(m.contentEnds).padStart(14)} ${String(dead).padStart(12)}`
    );
    await page.close();
  }
}
await browser.close();
server.close();
