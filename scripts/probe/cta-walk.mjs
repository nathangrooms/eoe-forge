/** Do the homepage's search calls to action lead anywhere a stranger can go? */
import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1440,height:900});
await p.goto('http://127.0.0.1:8080/',{waitUntil:'networkidle2',timeout:90000});
await p.waitForFunction(()=>document.querySelector('#home-search'),{timeout:30000});
await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=700){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,70));}});
await new Promise(r=>setTimeout(r,2500));
const ctas=await p.evaluate(()=>[...document.querySelectorAll('a[href="/cards"]')]
  .map(a=>({text:a.innerText.replace(/\s+/g,' ').trim()})));
console.log('calls to action pointing at the gated browser:', JSON.stringify(ctas));
for (const label of ['Search every card','Search the Commander pool']) {
  await p.goto('http://127.0.0.1:8080/',{waitUntil:'networkidle2',timeout:90000});
  await p.waitForFunction(()=>document.querySelector('#home-search'),{timeout:30000});
  await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=700){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,70));}});
  await new Promise(r=>setTimeout(r,2000));
  const out=await p.evaluate(async(want)=>{
    const a=[...document.querySelectorAll('a[href="/cards"]')].find(x=>x.innerText.replace(/\s+/g,' ').trim()===want);
    if(!a) return {missing:true};
    a.click();
    await new Promise(r=>setTimeout(r,1400));
    const box=document.getElementById('home-search');
    return {path:location.pathname, focusedTheSearchBox:document.activeElement===box,
      boxNearMiddle: box ? Math.abs(box.getBoundingClientRect().top - window.innerHeight/2) < 400 : false};
  }, label);
  console.log(`"${label}" ->`, JSON.stringify(out));
}
await b.close();
