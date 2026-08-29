import puppeteer from 'puppeteer';
import fs from 'node:fs';
const OUT='.shots/launch-repair'; fs.mkdirSync(OUT,{recursive:true});
const b=await puppeteer.launch({headless:'new',args:['--disable-lcd-text','--no-sandbox']});
for (const w of [390,1440]) {
  const p=await b.newPage(); await p.setViewport({width:w,height:900});
  await p.goto('http://127.0.0.1:8080/play/online',{waitUntil:'networkidle2',timeout:90000});
  await new Promise(r=>setTimeout(r,4000));
  await p.screenshot({path:`${OUT}/lobby-${w}.png`,fullPage:true});
  const t=await p.evaluate(()=>document.body.innerText.replace(/\n{3,}/g,'\n\n'));
  console.log(`=== ${w}px\n`+t.slice(0,1400));
  await p.close();
}
await b.close();
