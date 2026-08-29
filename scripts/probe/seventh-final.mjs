import puppeteer from 'puppeteer';
const BASE=process.env.BASE||'http://127.0.0.1:4178';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-lcd-text','--font-render-hinting=none'],protocolTimeout:300000});
/* where does "Open the full card browser" actually land? */
{
  const p=await b.newPage(); await p.setViewport({width:1280,height:1000});
  await p.goto(BASE+'/cards',{waitUntil:'networkidle2',timeout:120000});
  await new Promise(r=>setTimeout(r,3000));
  console.log('/cards signed out ->', await p.evaluate(()=>document.title+' | h1: '+(document.querySelector('h1')?.innerText)+' | '+document.body.innerText.replace(/\s+/g,' ').slice(120,300)));
  await p.screenshot({path:'.shots/seventh/A1-cards-gate-1280.png'});
  await p.close();
}
/* full-page clipping sweep */
for (const [route,name] of [['/','home'],['/register','register'],['/play/online','lobby'],['/terms','terms']]) {
  for (const w of [390,1280,1920]) {
    const p=await b.newPage(); await p.setViewport({width:w,height:900});
    await p.goto(BASE+route,{waitUntil:'networkidle2',timeout:120000});
    await new Promise(r=>setTimeout(r,3500));
    const d=await p.evaluate(()=>{
      const vw=window.innerWidth;
      const over=[...document.querySelectorAll('body *')].filter(e=>{
        const r=e.getBoundingClientRect(); const s=getComputedStyle(e);
        if(s.position==='fixed'||s.display==='none'||r.width===0) return false;
        return r.right>vw+2 || r.left<-2;
      }).slice(0,4).map(e=>({tag:e.tagName,cls:String(e.className||'').slice(0,40),right:Math.round(e.getBoundingClientRect().right),left:Math.round(e.getBoundingClientRect().left)}));
      // widest content block vs viewport: is anything stranded in a narrow column?
      const main=document.querySelector('main');
      const mw=main?Math.round(main.getBoundingClientRect().width):0;
      return {vw, scrollW:document.documentElement.scrollWidth, overflowing:over, mainW:mw, mainPct:Math.round(mw/vw*100)};
    });
    const bad=d.scrollW>d.vw+1;
    console.log(`${name.padEnd(9)} ${String(w).padStart(4)}px  scrollW=${d.scrollW} vw=${d.vw} ${bad?'*** HORIZONTAL SCROLL ***':'ok'}  main=${d.mainW}px (${d.mainPct}% of viewport)`+(d.overflowing.length?'  overflowing: '+JSON.stringify(d.overflowing):''));
    if(w!==1280) await p.screenshot({path:`.shots/seventh/full-${name}-${w}.png`,fullPage:false});
    await p.close();
  }
}
await b.close();
