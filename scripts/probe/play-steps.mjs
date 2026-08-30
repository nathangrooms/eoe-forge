/* Does each step URL render its own step? Three routes reporting identical page
   heights is either a coincidence or all three drawing the same screen. */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer';
const DIST='dist', PORT=4583, DECK='e0909132-5a48-4416-924c-dd2374d3d34d';
const SHIM=fs.readFileSync(path.resolve('scripts/refute-shim.js'),'utf8');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{const p=decodeURIComponent(req.url.split('?')[0]);let f=path.join(DIST,p),e=path.extname(f);if(!e||!fs.existsSync(f)){f=path.join(DIST,'index.html');e='.html';}res.writeHead(200,{'content-type':MIME[e]||'application/octet-stream'});res.end(fs.readFileSync(f));});
await new Promise(r=>server.listen(PORT,r));
const browser=await puppeteer.launch({headless:'new',args:['--disable-lcd-text','--no-sandbox']});
for(const [label,url] of [
  ['mode wall','/play'],
  ['deck step',`/play?mode=bots&step=deck`],
  ['seat step',`/play?mode=bots&deck=${DECK}&step=table`],
  ['goldfish deck',`/play?mode=goldfish&step=deck`],
  ['goldfish seats',`/play?mode=goldfish&deck=${DECK}&step=table`],
]){
  const page=await browser.newPage();
  await page.setViewport({width:1600,height:1000});
  await page.evaluateOnNewDocument(SHIM);
  await page.goto(`http://localhost:${PORT}${url}`,{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,7000));
  const o=await page.evaluate(()=>{
    const t=document.body.innerText;
    const h1=document.querySelector('h1')?.innerText ?? '(no h1)';
    const step=(t.match(/STEP (ONE|TWO|THREE)|Step (one|two|three) of (two|three)/i)||[])[0] ?? '(no step label)';
    const btns=[...document.querySelectorAll('button,a')].map(b=>b.innerText.trim()).filter(Boolean).slice(0,10);
    return {h1, step, url: location.pathname+location.search, first: t.split('\n').filter(Boolean).slice(0,4).join(' / '), btns: btns.join(' | ')};
  });
  console.log(`\n== ${label} -> ${o.url}`);
  console.log(`   h1: ${o.h1}   |   ${o.step}`);
  console.log(`   text: ${o.first.slice(0,150)}`);
  console.log(`   controls: ${o.btns.slice(0,150)}`);
  await page.close();
}
await browser.close(); server.close();
