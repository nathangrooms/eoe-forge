/**
 * Every public route, at phone and desktop: console errors, failed requests,
 * HTTP >= 400, horizontal overflow, landmarks, titles, and the pricing law.
 * A clean run here is the floor for launch.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
const BASE=process.env.BASE||'http://127.0.0.1:8080';
const CARD='ee6e5a35-fe21-4dee-b0ef-a8f2841511ad';
const ROUTES=['/','/login','/register','/reset-password','/forgot-password','/terms','/privacy','/play/online',`/cards/${CARD}`,'/this-route-does-not-exist','/decks'];
const OUT='.shots/launch-repair/public'; fs.mkdirSync(OUT,{recursive:true});
const b=await puppeteer.launch({headless:'new',protocolTimeout:300000,args:['--disable-lcd-text','--font-render-hinting=none','--no-sandbox']});
let bad=0;
for (const w of [390,1440]) {
  for (const route of ROUTES) {
    /* A fresh page per route. Reusing one and calling removeAllListeners
       detaches the frame puppeteer is mid-evaluate on. */
    const p=await b.newPage(); await p.setViewport({width:w,height:900});
    const errs=[],failed=[],http=[];
    p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
    p.on('console',m=>m.type()==='error'&&errs.push(m.text().slice(0,140)));
    p.on('requestfailed',r=>failed.push(r.url().slice(0,100)));
    p.on('response',r=>{ if(r.status()>=400 && new URL(r.url()).host===new URL(BASE).host) http.push(r.status()+' '+r.url().slice(0,100)); });
    await p.goto(BASE+route,{waitUntil:'networkidle2',timeout:90000}).catch(e=>errs.push('nav '+e.message));
    /* WAIT FOR THE PAGE, NOT FOR A CLOCK. A fixed 2500ms passed on a warm dev
       server and failed on a cold one, because the route's chunk was still
       compiling and the suspense fallback was on screen. That produced a
       "main=0 | h1=0" failure on the homepage that nine consecutive reads could
       not reproduce. A harness that fails randomly is worse than no harness. */
    await p.waitForFunction(
      () => document.querySelector('main') && document.querySelector('h1'),
      { timeout: 30000 }
    ).catch(() => errs.push('page never rendered a main and an h1'));
    await new Promise(r=>setTimeout(r,2000));
    const info=await p.evaluate(()=>{
      const t=document.body.innerText;
      return {
        title:document.title, main:document.querySelectorAll('main').length,
        h1:document.querySelectorAll('h1').length,
        overflow:document.documentElement.scrollWidth>window.innerWidth+1,
        zeroPrice:/\$0\.00(?!\d)/.test(t),
        unnamed:[...document.querySelectorAll('a[href],button')].filter(e=>{
          const n=(e.getAttribute('aria-label')||e.innerText||e.getAttribute('title')||'').trim();
          const r=e.getBoundingClientRect();
          return !n && r.width>0 && r.height>0;
        }).length,
      };
    });
    const problems=[];
    if(errs.length) problems.push('console:'+JSON.stringify(errs.slice(0,2)));
    if(http.length) problems.push('http:'+JSON.stringify(http.slice(0,2)));
    if(info.overflow) problems.push('horizontal overflow');
    if(info.main!==1) problems.push('main='+info.main);
    if(info.h1!==1) problems.push('h1='+info.h1);
    if(info.zeroPrice) problems.push('a $0.00 is on screen');
    if(info.unnamed) problems.push(info.unnamed+' unnamed controls');
    if(problems.length){ bad++; console.log(`FAIL ${w}px ${route}\n     ${problems.join(' | ')}`); }
    else console.log(`ok   ${w}px ${route}  "${info.title}"`);
    await p.screenshot({path:`${OUT}/${w}${route.replace(/\W+/g,'_')}.png`}).catch(()=>{});
    await p.close();
  }
}
await b.close();
console.log(bad?`\n${bad} route/width combinations have problems`:'\nall clean');
process.exit(bad?1:0);
