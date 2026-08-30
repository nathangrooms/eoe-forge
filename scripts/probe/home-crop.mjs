/* What exactly is the cropped card image on the dashboard, and is it the
   approved blurred identity ground or a genuinely cut-off card? */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer';
const DIST='dist', PORT=4589;
const SHIM=fs.readFileSync(path.resolve('scripts/refute-shim.js'),'utf8');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=http.createServer((q,s)=>{const p=decodeURIComponent(q.url.split('?')[0]);let f=path.join(DIST,p),e=path.extname(f);if(!e||!fs.existsSync(f)){f=path.join(DIST,'index.html');e='.html';}s.writeHead(200,{'content-type':MIME[e]||'application/octet-stream'});s.end(fs.readFileSync(f));});
await new Promise(r=>server.listen(PORT,r));
const b=await puppeteer.launch({headless:'new',args:['--disable-lcd-text','--no-sandbox']});
const page=await b.newPage();
await page.setViewport({width:1600,height:1000});
await page.evaluateOnNewDocument(SHIM);
await page.goto(`http://localhost:${PORT}/dashboard`,{waitUntil:'networkidle0'});
await new Promise(r=>setTimeout(r,9000));
const out=await page.evaluate(()=>{
  const CARD=5/7; const found=[];
  for(const img of document.querySelectorAll('img')){
    const src=img.currentSrc||img.src||'';
    if(!/scryfall/i.test(src)) continue;
    const r=img.getBoundingClientRect();
    if(r.width<20||r.height<20) continue;
    const cs=getComputedStyle(img);
    const aspect=r.width/r.height;
    if(cs.objectFit!=='cover' || Math.abs(aspect-CARD)/CARD<=0.12) continue;
    // walk up for a blur / scrim
    let blur='none', el=img, depth=0, section='';
    while(el && depth<8){ const s=getComputedStyle(el); if(s.filter&&s.filter!=='none'){blur=s.filter;break;} el=el.parentElement; depth++; }
    let sec=img.closest('section,article,[class*=hero],[class*=Hero]');
    section=sec? (sec.querySelector('h1,h2,h3')?.innerText?.slice(0,50) ?? sec.className.slice(0,60)) : '(no section)';
    found.push({w:Math.round(r.width),h:Math.round(r.height),aspect:aspect.toFixed(2),objectFit:cs.objectFit,filter:blur,opacity:cs.opacity,section,src:src.slice(src.lastIndexOf('/')+1,src.lastIndexOf('/')+34),cls:img.className.slice(0,80)});
  }
  return found;
});
console.log(JSON.stringify(out,null,2));
await b.close(); server.close();
