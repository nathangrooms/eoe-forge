import puppeteer from 'puppeteer';
const BASE='http://127.0.0.1:8080';
const CARD='5bef0790-aa1b-4144-8391-338e59e86115';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const log=(...a)=>console.log(...a);
const b=await puppeteer.launch({headless:'new',protocolTimeout:300000,args:['--no-sandbox','--disable-lcd-text']});
const p=await b.newPage();

log('=== chart title/desc content ===');
await p.setViewport({width:1440,height:900});
await p.goto(BASE+'/cards/'+CARD,{waitUntil:'networkidle2'});await sleep(4000);
await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=500){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,110));}});
await sleep(1200);
log(JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('.recharts-wrapper svg')].map(s=>({
  title:JSON.stringify(s.querySelector('title')?.textContent),
  desc:JSON.stringify(s.querySelector('desc')?.textContent),
  textNodesInSvg:[...s.querySelectorAll('text')].length}))),null,1));

log('\n=== card page price-range toggles ===');
log(JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('button')]
  .filter(x=>/^(7d|30d|90d|1y|All)$/.test((x.innerText||'').trim()))
  .map(x=>({t:(x.innerText||'').trim(),pressed:x.getAttribute('aria-pressed'),role:x.getAttribute('role'),
            cls:(x.className||'').slice(0,60)}))),null,1));

log('\n=== 390px: the navigation button and every unnamed control ===');
await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
await p.goto(BASE+'/',{waitUntil:'networkidle2'});await sleep(3000);
log(JSON.stringify(await p.evaluate(()=>{
  const vis=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);
    return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
  const nm=e=>(e.getAttribute('aria-label')||(e.innerText||'').replace(/\s+/g,' ').trim()||e.getAttribute('title')||'').slice(0,50);
  const all=[...document.querySelectorAll('button,a[href],[role="button"]')].filter(vis);
  return {
    total:all.length,
    unnamed:all.filter(e=>!nm(e)).map(e=>({tag:e.tagName.toLowerCase(),
      expanded:e.getAttribute('aria-expanded'),controls:e.getAttribute('aria-controls'),
      cls:(typeof e.className==='string'?e.className:'').slice(0,70),
      html:e.outerHTML.slice(0,150)})),
    tapTooSmall:all.filter(e=>{const r=e.getBoundingClientRect();return r.width<24||r.height<24;})
      .map(e=>({n:nm(e),w:Math.round(e.getBoundingClientRect().width),h:Math.round(e.getBoundingClientRect().height)})).slice(0,10),
  };
}),null,1));
await p.screenshot({path:'.shots/a11y/15-mobile-home.png'});

log('\n=== 390px: open the nav and see if focus is managed ===');
const opened=await p.evaluate(()=>{
  const btn=[...document.querySelectorAll('button[aria-expanded]')].find(b=>b.getAttribute('aria-controls')==='public-nav-menu');
  if(!btn)return 'no nav button';
  btn.focus();btn.click();return 'clicked';
});
await sleep(900);
log('open result: '+opened);
log(JSON.stringify(await p.evaluate(()=>{
  const a=document.activeElement;
  const m=document.getElementById('public-nav-menu');
  return {focus:a?a.tagName+' "'+((a.getAttribute('aria-label')||(a.innerText||'').trim()).slice(0,30))+'"':'none',
    menuVisible:m?getComputedStyle(m).display!=='none':null,
    menuLinks:m?[...m.querySelectorAll('a,button')].map(x=>(x.innerText||'').trim().slice(0,24)):[]};
})));
await p.screenshot({path:'.shots/a11y/16-mobile-nav-open.png'});
await b.close();
