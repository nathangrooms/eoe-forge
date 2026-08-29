/** How many cards are drawn on the signed-out homepage, and how many go anywhere. */
import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1440,height:900});
await p.goto('http://127.0.0.1:8080/',{waitUntil:'networkidle2',timeout:90000});
// scroll the whole page so every lazy section mounts
await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,90));}});
await new Promise(r=>setTimeout(r,3000));
console.log(JSON.stringify(await p.evaluate(()=>{
  const imgs=[...document.querySelectorAll('img')].filter(i=>/scryfall/.test(i.currentSrc||i.src||''));
  const linked=imgs.filter(i=>i.closest('a[href^="/cards/"]'));
  const sections={};
  for(const i of imgs){ const s=i.closest('section'); const k=(s?.querySelector('h2,h3')?.innerText||'(no heading)').slice(0,40);
    sections[k]=sections[k]||{total:0,linked:0}; sections[k].total++; if(i.closest('a[href^="/cards/"]')) sections[k].linked++; }
  return {cardImages:imgs.length, linkedToCardPage:linked.length, bySection:sections};
}),null,1));
await b.close();
