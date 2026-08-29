import puppeteer from 'puppeteer';
const BASE=process.env.BASE||'http://127.0.0.1:4178';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-lcd-text','--font-render-hinting=none'],protocolTimeout:300000});

/* ---- B9: single-point price chart axis ---- */
for(const [id,name] of [['28383124-df99-4002-9966-0a6da67be881','Ghyrson Starn'],['7ad8ab3d-8a77-4fd3-8d5a-ac1e8a09e3bc','Dragon Whelp'],['988c23f6-59fe-49f9-a9ce-9881dccb7033','Nine-Lives Familiar']]){
  const p=await b.newPage(); await p.setViewport({width:1280,height:1000});
  await p.goto(BASE+'/cards/'+id,{waitUntil:'networkidle2',timeout:120000});
  await new Promise(r=>setTimeout(r,7000));
  const d=await p.evaluate(()=>{
    const svgText=[...document.querySelectorAll('svg text, svg tspan')].map(n=>n.textContent.trim()).filter(Boolean);
    return {axis:svgText.filter(t=>/^\$?-?[\d,.]+$/.test(t)||/^\$/.test(t)),
      neg:svgText.filter(t=>/\$-/.test(t)), zero:svgText.filter(t=>/^\$0\.00$/.test(t)),
      bodyZero:(document.body.innerText.match(/\$0\.00(?!\d)/g)||[]).length,
      hist:/Snapshot history|price/i.test(document.body.innerText)};
  });
  console.log(`B9 ${name}: axis=${JSON.stringify(d.axis.slice(0,10))} negatives=${JSON.stringify(d.neg)} $0.00-in-svg=${JSON.stringify(d.zero)} $0.00-in-text=${d.bodyZero}`);
  await p.screenshot({path:`.shots/seventh/B9-${name.replace(/\W+/g,'')}.png`,fullPage:false});
  await p.close();
}

/* ---- B8: shopping list button signed out ---- */
{
  const p=await b.newPage(); await p.setViewport({width:1280,height:1000});
  await p.goto(BASE+'/cards/ee6e5a35-fe21-4dee-b0ef-a8f2841511ad',{waitUntil:'networkidle2',timeout:120000});
  await new Promise(r=>setTimeout(r,6000));
  for(const label of ['shopping list','proxy list','Add to deck','Add to collection','Wishlist']){
    await p.evaluate(l=>{const btn=[...document.querySelectorAll('button')].find(x=>new RegExp(l,'i').test(x.getAttribute('aria-label')||x.innerText));btn&&btn.click();},label);
    await new Promise(r=>setTimeout(r,1600));
    const t=await p.evaluate(()=>{
      const toasts=[...document.querySelectorAll('[role=status],[role=alert],li[data-sonner-toast],ol li')].map(n=>n.innerText.trim().replace(/\s+/g,' ')).filter(Boolean);
      const panel=[...document.querySelectorAll('[role=dialog],[data-state=open]')].map(n=>n.innerText.trim().replace(/\s+/g,' ').slice(0,160)).filter(Boolean);
      return {toasts:[...new Set(toasts)],panel:[...new Set(panel)].slice(0,2)};
    });
    console.log(`B8 "${label}" ->`, JSON.stringify(t).slice(0,420));
    await p.screenshot({path:`.shots/seventh/B8-${label.replace(/\W+/g,'')}.png`});
    await p.keyboard.press('Escape'); await new Promise(r=>setTimeout(r,900));
  }
  await p.close();
}
await b.close();
