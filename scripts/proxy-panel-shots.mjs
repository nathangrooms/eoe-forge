/**
 * The "Print as proxies" panel on `/shopping`, open, with its card grid drawn.
 *
 *   npm run build
 *   node scripts/proxy-panel-shots.mjs dist scratch/proxy-panel
 *
 * It is a right-hand slide-out, so nothing photographs it by loading a URL.
 * This opens it by its accessible name and then measures where each overlay
 * badge lands on the card underneath, because that is the thing in question:
 * a badge over the top-right corner of a Magic card covers the mana cost, and
 * one over the top-left covers the name.
 */
import http from 'node:http';
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = process.argv[2] || 'dist';
const OUT = process.argv[3] || 'scratch/proxy-panel';
const PORT = Number(process.env.PORT || 4427);
const WIDTHS = (process.env.WIDTHS || '1600,390').split(',').map(Number);
const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'deck-save-shim.js'), 'utf8');

const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon','.txt':'text/plain','.webmanifest':'application/manifest+json'};
const COMPRESSIBLE=new Set(['.html','.js','.css','.json','.svg','.txt','.webmanifest']);
const server=http.createServer((req,res)=>{const p=decodeURIComponent(req.url.split('?')[0]);let f=path.join(DIST,p);let e=path.extname(f);if(!e||!fs.existsSync(f)){f=path.join(DIST,'index.html');e='.html';}if(!fs.existsSync(f)){res.writeHead(404);return res.end();}const b=fs.readFileSync(f);const a=String(req.headers['accept-encoding']||'');const h={'content-type':MIME[e]||'application/octet-stream','cache-control':'no-store'};if(COMPRESSIBLE.has(e)&&a.includes('gzip')){const g=zlib.gzipSync(b,{level:9});h['content-encoding']='gzip';h['content-length']=g.length;res.writeHead(200,h);return res.end(g);}res.writeHead(200,h);res.end(b);});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
  const br=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage','--disable-lcd-text']});
  fs.mkdirSync(OUT,{recursive:true});
  for(const width of WIDTHS){
    const page=await br.newPage();
    await page.setViewport({width,height:width<500?844:1000,deviceScaleFactor:1,isMobile:width<500,hasTouch:width<500});
    await page.evaluateOnNewDocument(SHIM);
    await page.goto(`http://127.0.0.1:${PORT}/shopping`,{waitUntil:'networkidle2',timeout:90000});
    await sleep(4500);
    const opened = await page.evaluate(()=>{
      const b=[...document.querySelectorAll('button')].find(x=>/print as proxies/i.test(x.textContent||''));
      if(b){b.click();return true;} return false;
    });
    await sleep(4000);
    /* Where does each overlay badge sit on the card it is drawn over? */
    const badges = await page.evaluate(()=>{
      const imgs=[...document.querySelectorAll('img')].filter(i=>/scryfall/.test(i.currentSrc||i.src||''));
      const out=[];
      for(const img of imgs.slice(0,6)){
        const box=img.closest('button')||img.parentElement;
        if(!box) continue;
        const r=img.getBoundingClientRect();
        for(const s of box.querySelectorAll('span')){
          const sr=s.getBoundingClientRect();
          if(sr.width<4||sr.height<4) continue;
          if(sr.top>r.bottom||sr.bottom<r.top) continue;
          const vy=(sr.top+sr.height/2-r.top)/r.height;
          const vx=(sr.left+sr.width/2-r.left)/r.width;
          if(vy>0.98||vy<0) continue;
          out.push({card:img.alt||'?', text:(s.textContent||'').trim().slice(0,12),
            x:+vx.toFixed(2), y:+vy.toFixed(2),
            over: vy<0.12 ? (vx>0.6?'MANA COST':(vx<0.5?'CARD NAME':'title bar')) : (vy>0.85?'collector line':'art')});
        }
      }
      return out;
    });
    await page.screenshot({path:path.join(OUT,`proxy-panel-${width}.png`)});
    console.log(width,'opened='+opened);
    for(const b of badges) console.log('   badge',JSON.stringify(b));
    await page.close();
  }
  await br.close(); server.close();
})();
