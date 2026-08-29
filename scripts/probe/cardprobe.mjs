import puppeteer from 'puppeteer';
import fs from 'node:fs';
const BASE='http://127.0.0.1:8080';
const ID=process.env.CARD||'ee6e5a35-fe21-4dee-b0ef-a8f2841511ad';
const OUT='.shots/launch-repair'; fs.mkdirSync(OUT,{recursive:true});
const b=await puppeteer.launch({headless:'new',protocolTimeout:300000,args:['--disable-lcd-text','--no-sandbox']});
const p=await b.newPage();
await p.setViewport({width:390,height:844});
await p.goto(`${BASE}/cards/${ID}`,{waitUntil:'networkidle2',timeout:60000});
await new Promise(r=>setTimeout(r,3000));
const info=await p.evaluate(()=>({title:document.title,h1:document.querySelector('h1')?.innerText,
  buttons:[...document.querySelectorAll('button')].map(x=>x.innerText.trim()).filter(Boolean)}));
console.log(JSON.stringify(info,null,1).slice(0,1200));
// find shopping list button
const found = await p.evaluate(()=>{
  const b=[...document.querySelectorAll('button')].find(x=>/shopping list/i.test(x.innerText)||/shopping/i.test(x.getAttribute('aria-label')||''));
  if(!b) return null; b.scrollIntoView({block:'center'}); b.setAttribute('data-probe','1'); return b.innerText.trim()||b.getAttribute('aria-label');
});
console.log('shopping button:',found);
if(found){ await p.click('[data-probe="1"]'); await new Promise(r=>setTimeout(r,1500));
  const toast=await p.evaluate(()=>document.body.innerText.match(/.*(permission denied|Sign in required|Could not add that).*/i)?.[0]||null);
  console.log('TOAST:',toast);
  await p.screenshot({path:`${OUT}/card-shopping-toast.png`});
}
await b.close();
