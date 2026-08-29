import puppeteer from 'puppeteer';
const BASE=process.env.BASE||'http://127.0.0.1:4178';
const CARD=process.env.CARD||'ee6e5a35-fe21-4dee-b0ef-a8f2841511ad';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-lcd-text'],protocolTimeout:240000});
const p=await b.newPage(); await p.setViewport({width:1280,height:1000});
await p.goto(BASE+'/cards/'+CARD,{waitUntil:'networkidle2',timeout:120000});
await new Promise(r=>setTimeout(r,9000));
const t=await p.evaluate(()=>document.body.innerText);
console.log(t.slice(0,4200));
console.log('\n===== RELATED CARD TILES =====');
console.log(await p.evaluate(()=>{
  const h=[...document.querySelectorAll('h2,h3')].map(x=>x.innerText.trim());
  return JSON.stringify(h,null,0);
}));
await p.screenshot({path:'.shots/seventh/card-full.png',fullPage:true});
await b.close();
