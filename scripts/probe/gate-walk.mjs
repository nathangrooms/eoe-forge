/** What a signed-out visitor sees when they follow a gated link. */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
const OUT='.shots/launch-repair'; fs.mkdirSync(OUT,{recursive:true});
const b=await puppeteer.launch({headless:'new',args:['--disable-lcd-text','--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:390,height:844});
for (const route of ['/dashboard','/decks','/deck/abc123']) {
  await p.goto('http://127.0.0.1:8080'+route,{waitUntil:'networkidle2',timeout:60000});
  await new Promise(r=>setTimeout(r,1500));
  const info=await p.evaluate(()=>({url:location.pathname+location.search,
    title:document.title,
    text:document.body.innerText.replace(/\s+/g,' ').slice(0,200),
    buttons:[...document.querySelectorAll('a,button')].map(x=>x.innerText.trim()).filter(Boolean)}));
  console.log(route,'->',JSON.stringify(info,null,1));
  await p.screenshot({path:`${OUT}/gate-${route.replace(/\W+/g,'_')}.png`});
}
await b.close();
