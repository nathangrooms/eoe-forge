/**
 * The last three things a screen reader user runs into on the public app.
 *
 * A chart drawn as an svg is a picture unless something says otherwise, so it
 * asks whether the price history has any text a reader could reach. An
 * accordion is only usable if the collapsed and expanded states are announced,
 * so it asks radix what it exposes. And /play/t/:code is on the signed out
 * route tree, so it gets walked like everything else.
 *
 * Read only.
 */
import puppeteer from 'puppeteer';
const BASE='http://127.0.0.1:8080';
const CARD=process.env.CARD_ID||'5bef0790-aa1b-4144-8391-338e59e86115';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const log=(...a)=>console.log(...a);
const b=await puppeteer.launch({headless:'new',protocolTimeout:300000,args:['--no-sandbox','--disable-lcd-text']});
const p=await b.newPage();
await p.setViewport({width:1440,height:900});
const errs=[];
p.on('pageerror',e=>errs.push('pageerror '+e.message.slice(0,180)));
p.on('console',m=>{if(m.type()==='error')errs.push('console '+m.text().slice(0,180));});

log('='.repeat(72));log('THE PRICE HISTORY CHART');log('='.repeat(72));
await p.goto(BASE+'/cards/'+CARD,{waitUntil:'networkidle2'});await sleep(4000);
await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=500){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,110));}window.scrollTo(0,0);});
await sleep(1500);
log(JSON.stringify(await p.evaluate(()=>{
  const svgs=[...document.querySelectorAll('svg.recharts-surface, .recharts-wrapper svg')];
  return svgs.map(s=>({
    role:s.getAttribute('role'),
    ariaLabel:s.getAttribute('aria-label'),
    ariaHidden:s.getAttribute('aria-hidden'),
    title:!!s.querySelector('title'),
    desc:!!s.querySelector('desc'),
    focusable:s.getAttribute('tabindex'),
    wrapperRole:s.closest('[role]')?.getAttribute('role')||null,
    // is there any text equivalent near it, a table or a sr-only summary
    tableNearby:!!s.closest('section,div')?.querySelector('table'),
    srOnly:[...(s.closest('section,div')?.querySelectorAll('.sr-only')||[])].map(e=>e.textContent.trim().slice(0,80)),
  }));
}),null,1));

log('\n'+'='.repeat(72));log('THE FAQ ACCORDION ON THE HOMEPAGE');log('='.repeat(72));
await p.goto(BASE+'/',{waitUntil:'networkidle2'});await sleep(2500);
const acc=await p.evaluate(()=>[...document.querySelectorAll('button[aria-expanded]')].slice(0,4).map(b=>({
  name:(b.innerText||'').trim().slice(0,44),expanded:b.getAttribute('aria-expanded'),
  controls:b.getAttribute('aria-controls'),targetExists:!!document.getElementById(b.getAttribute('aria-controls')||'')})));
log(JSON.stringify(acc,null,1));
log('buttons with NO aria-expanded that look like toggles: '+JSON.stringify(await p.evaluate(()=>
  [...document.querySelectorAll('button')].filter(b=>!b.hasAttribute('aria-expanded')&&/^(Commander|Modern|Pioneer|Standard|Pauper|Legacy|MTG Arena|MTGO|CSV|JSON|Plain text|Moxfield CSV)$/.test((b.innerText||'').trim()))
  .map(b=>({t:(b.innerText||'').trim(),pressed:b.getAttribute('aria-pressed'),sel:b.getAttribute('aria-selected'),role:b.getAttribute('role')})))));

log('\n'+'='.repeat(72));log('/play/t/:code SIGNED OUT');log('='.repeat(72));
errs.length=0;
await p.goto(BASE+'/play/t/ABCD',{waitUntil:'networkidle2'}).catch(()=>{});await sleep(4000);
log(JSON.stringify(await p.evaluate(()=>({
  title:document.title,url:location.pathname,
  h1:[...document.querySelectorAll('h1')].map(h=>h.innerText.trim().slice(0,60)),
  main:document.querySelectorAll('main').length,
  text:(document.body.innerText||'').replace(/\s+/g,' ').trim().slice(0,260)})),null,1));
log('errors: '+JSON.stringify([...new Set(errs)].slice(0,6)));
await p.screenshot({path:'.shots/a11y/14-play-table.png'});
await b.close();
