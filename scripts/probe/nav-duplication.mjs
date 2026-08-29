/** D14 said the header nav appears twice in the DOM. Is the inactive one hidden? */
import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});
for (const w of [390,1440]) {
  const p=await b.newPage(); await p.setViewport({width:w,height:900});
  await p.goto('http://127.0.0.1:8080/',{waitUntil:'networkidle2',timeout:60000});
  await new Promise(r=>setTimeout(r,1500));
  console.log(w+'px', JSON.stringify(await p.evaluate(()=>{
    const navs=[...document.querySelectorAll('nav')];
    return {
      navCount:navs.length,
      navs:navs.map(n=>({label:n.getAttribute('aria-label'),
        display:getComputedStyle(n).display, hidden:n.getAttribute('aria-hidden')})),
      // How many links are actually reachable by keyboard?
      focusable:[...document.querySelectorAll('a[href],button')].filter(e=>{
        const r=e.getBoundingClientRect();
        return r.width>0 && r.height>0;
      }).length,
      duplicateLinkTexts:(()=>{
        const seen={}; for(const a of document.querySelectorAll('a[href]')){
          const r=a.getBoundingClientRect(); if(!r.width||!r.height) continue;
          const k=(a.innerText||'').trim()+'|'+a.getAttribute('href');
          if(k.trim()!=='|') seen[k]=(seen[k]||0)+1; }
        return Object.entries(seen).filter(([,n])=>n>1).slice(0,5);
      })(),
    };
  }),null,1));
  await p.close();
}
await b.close();
