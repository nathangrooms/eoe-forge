/** Measures whether any text field on a public page still draws a hairline. */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
const BASE=process.env.BASE||'http://127.0.0.1:8080';
const OUT='.shots/launch-repair'; fs.mkdirSync(OUT,{recursive:true});
const b=await puppeteer.launch({headless:'new',args:['--disable-lcd-text','--no-sandbox']});
for (const w of [390,1440]) {
  const p=await b.newPage(); await p.setViewport({width:w,height:900});
  for (const route of ['/login','/register','/reset-password','/play/online']) {
    await p.goto(BASE+route,{waitUntil:'networkidle2',timeout:60000});
    await new Promise(r=>setTimeout(r,1800));
    const fields=await p.evaluate(()=>[...document.querySelectorAll('input:not([type=hidden]),textarea')].map(el=>{
      const cs=getComputedStyle(el); const parent=el.parentElement?getComputedStyle(el.parentElement).backgroundColor:'';
      return {id:el.id||el.name||el.type, border:`${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`, bg:cs.backgroundColor, parentBg:parent};
    }));
    if (fields.length) console.log(`${w}px ${route}`, JSON.stringify(fields,null,1));
    if (w===390 && route==='/register') await p.screenshot({path:`${OUT}/register-fields.png`,fullPage:true});
  }
  await p.close();
}
await b.close();
