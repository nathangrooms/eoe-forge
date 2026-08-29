import puppeteer from 'puppeteer';
const BASE=process.env.BASE||'http://127.0.0.1:4178';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-lcd-text']});
const p=await b.newPage(); await p.setViewport({width:1280,height:1000});
await p.goto(BASE+'/',{waitUntil:'networkidle2',timeout:120000});
await new Promise(r=>setTimeout(r,4000));
await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=800){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,110));}window.scrollTo(0,0);});
await new Promise(r=>setTimeout(r,3000));
const ctas=await p.evaluate(()=>[...document.querySelectorAll('a[href],button')]
  .filter(e=>{const r=e.getBoundingClientRect();return r.width>60&&r.height>26;})
  .map(e=>({tag:e.tagName,text:e.innerText.trim().replace(/\s+/g,' ').slice(0,44),href:e.getAttribute('href')}))
  .filter(x=>x.text));
const seen=new Set(); const list=ctas.filter(c=>{const k=c.text+c.href;if(seen.has(k))return false;seen.add(k);return true;});
console.log('=== homepage call-to-action controls, and where they go ===');
const gated=new Set(['/decks','/scan','/play','/life','/marketplace','/tournament','/precons','/tutor','/collection','/wishlist','/collection/storage','/cards']);
let bounce=0,real=0,scroll=0;
for(const c of list){
  let verdict;
  if(!c.href) { verdict='button (no href)'; scroll++; }
  else if(gated.has(c.href.split('?')[0])) { verdict='>>> BOUNCES to sign-in'; bounce++; }
  else if(c.href.startsWith('/cards/')) { verdict='card page (public)'; real++; }
  else { verdict='public'; real++; }
  console.log(' ', (c.text||'(icon)').padEnd(44), (c.href||'-').padEnd(24), verdict);
}
console.log(`\nsummary: ${bounce} bounce to sign-in, ${real} land on something public, ${scroll} are buttons`);
await b.close();
