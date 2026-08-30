/* Read the Mana tab's own words back, because a screenshot of the same height
   is not evidence that the advice changed. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = 'dist';
const PORT = 4577;
const DECK = 'e0909132-5a48-4416-924c-dd2374d3d34d';
const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.resolve('scripts/refute-shim.js'), 'utf8');

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.woff2':'font/woff2', '.ico':'image/x-icon' };
const server = http.createServer((req,res)=>{
  const p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(DIST, p); let ext = path.extname(file);
  if (!ext || !fs.existsSync(file)) { file = path.join(DIST,'index.html'); ext='.html'; }
  res.writeHead(200, {'content-type': MIME[ext] || 'application/octet-stream'});
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(PORT, r));

const browser = await puppeteer.launch({ headless:'new', args:['--disable-lcd-text','--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width:1600, height:1200 });
await page.evaluateOnNewDocument(SHIM);
await page.goto(`http://localhost:${PORT}/deck/${DECK}?tab=mana`, { waitUntil:'networkidle0' });
await new Promise(r => setTimeout(r, 11000));

const out = await page.evaluate(() => {
  const text = document.body.innerText;
  const advice = [...text.matchAll(/(Add|Remove) \d+ more [WUBRG] sources|(Add|Remove) \d+ (more )?lands?/g)].map(m=>m[0]);
  const sources = [...text.matchAll(/(White|Blue|Black|Red|Green)\s+(\d+)\s+\d+%/g)].map(m=>`${m[1]} ${m[2]}`);
  const fix = text.slice(text.indexOf('What would fix this'), text.indexOf('What would fix this')+600);
  return { advice: [...new Set(advice)], sources, fix };
});
console.log('SOURCES BY COLOUR (engine):', out.sources.join(' | ') || '(none read)');
console.log('ADVICE                    :', out.advice.join(' | ') || '(none)');
console.log('---- What would fix this ----');
console.log(out.fix.replace(/\n+/g,'\n').slice(0,520));
await browser.close();
server.close();
