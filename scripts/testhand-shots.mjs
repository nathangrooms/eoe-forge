/**
 * Photograph `/deck/:id/testhand` in the state that matters: a hand drawn.
 *
 * The empty state is one sentence, so a screenshot of it says nothing about
 * the page. This clicks the draw control and waits for the seven cards, at
 * every width the design law is checked at.
 *
 *   npm run build
 *   node scripts/testhand-shots.mjs dist scratch/testhand-before
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = process.argv[2] || 'dist';
const OUT = process.argv[3] || 'scratch/testhand';
const PORT = Number(process.env.PORT || 4421);
const SETTLE = Number(process.env.SETTLE || 4200);
const WIDTHS = (process.env.WIDTHS || '1280,1600,1920,390').split(',').map(Number);
const DECK = 'dddddddd-0000-4000-8000-00000000dm01';

const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'deck-save-shim.js'), 'utf8');

const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon','.txt':'text/plain','.webmanifest':'application/manifest+json' };
const COMPRESSIBLE = new Set(['.html','.js','.css','.json','.svg','.txt','.webmanifest']);
const server = http.createServer((req,res)=>{
  const p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(DIST,p); let ext = path.extname(file);
  if(!ext||!fs.existsSync(file)){file=path.join(DIST,'index.html');ext='.html';}
  if(!fs.existsSync(file)){res.writeHead(404);return res.end();}
  const body=fs.readFileSync(file); const accepts=String(req.headers['accept-encoding']||'');
  const headers={'content-type':MIME[ext]||'application/octet-stream','cache-control':'no-store'};
  if(COMPRESSIBLE.has(ext)&&accepts.includes('gzip')){const gz=zlib.gzipSync(body,{level:9});headers['content-encoding']='gzip';headers['content-length']=gz.length;res.writeHead(200,headers);return res.end(gz);}
  res.writeHead(200,headers); res.end(body);
});
const sleep = ms => new Promise(r=>setTimeout(r,ms));

(async()=>{
  await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
  const browser = await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage','--disable-lcd-text']});
  fs.mkdirSync(OUT,{recursive:true});
  for(const width of WIDTHS){
    const page = await browser.newPage();
    await page.setViewport({width,height:width<500?844:1000,deviceScaleFactor:1,isMobile:width<500,hasTouch:width<500});
    await page.evaluateOnNewDocument(SHIM);
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,200)));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,200));});
    await page.goto(`http://127.0.0.1:${PORT}/deck/${DECK}/testhand`,{waitUntil:'networkidle2',timeout:90000});
    await sleep(SETTLE);
    const click = async (re) => page.evaluate(r=>{
      const b=[...document.querySelectorAll('button')].find(x=>new RegExp(r,'i').test(x.textContent||''));
      if(b){b.click();return b.textContent.trim();}
      return null;
    }, re.source ?? re);

    const clicked = await click(/draw a hand/);
    await sleep(2500);

    if (process.env.SCENARIO === 'mulligan') {
      /* Mulligan once, put one card on the bottom, keep the six. That is the
         London mulligan the page now models, and the state a screenshot of a
         "test hand" page should actually show. */
      await click(/mulligan/);
      await sleep(2000);
      await page.evaluate(()=>{
        const b=[...document.querySelectorAll('button[aria-pressed]')]
          .filter(x=>/staying in hand/.test(x.getAttribute('aria-label')||''));
        if(b[3]) b[3].click();
      });
      await sleep(600);
      await click(/keep these/);
      await sleep(1500);
      await click(/new hand/);
      await sleep(2500);
    }
    await sleep(1200);
    const audit = await page.evaluate(()=>{
      const main=document.querySelector('#main-content')||document.querySelector('main')||document.body;
      const imgs=[...main.querySelectorAll('img')].filter(i=>/scryfall/.test(i.currentSrc||i.src||''));
      const w=imgs.map(i=>Math.round(i.getBoundingClientRect().width)).sort((a,b)=>a-b);
      return {docH:document.documentElement.scrollHeight, vh:window.innerHeight,
        overflowX:Math.max(0,document.documentElement.scrollWidth-window.innerWidth),
        imgs:imgs.length, minW:w[0]??null, maxW:w[w.length-1]??null,
        h1:[...main.querySelectorAll('h1,h2,h3')].map(h=>h.tagName+':'+h.textContent.trim().slice(0,40))};
    });
    await page.screenshot({path:path.join(OUT,`testhand-${process.env.SCENARIO||'plain'}-${width}.png`),fullPage:true});
    console.log(width, 'clicked='+clicked, JSON.stringify(audit), errors.length?('ERR '+errors[0]):'');
    await page.close();
  }
  await browser.close(); server.close();
})();
