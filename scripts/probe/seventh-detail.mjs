import puppeteer from 'puppeteer';
import fs from 'node:fs';
const BASE=process.env.BASE||'http://127.0.0.1:4178';
const OUT='.shots/seventh';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-lcd-text','--font-render-hinting=none'],protocolTimeout:240000});

/* --- C1 sticky nav at three widths --- */
for (const w of [390,768,1280,1920]) {
  const p=await b.newPage(); await p.setViewport({width:w,height:844});
  await p.goto(BASE+'/',{waitUntil:'networkidle2',timeout:120000});
  await new Promise(r=>setTimeout(r,3500));
  const r=await p.evaluate(()=>{
    window.scrollTo(0,6000);
    return new Promise(res=>setTimeout(()=>{
      const hdr=document.querySelector('header');
      const rect=hdr?hdr.getBoundingClientRect():null;
      res({scrollY:window.scrollY, headerTop:rect?Math.round(rect.top):'no header',
           pos:hdr?getComputedStyle(hdr).position:'-',
           bodyOverflowX:getComputedStyle(document.body).overflowX,
           htmlOverflowX:getComputedStyle(document.documentElement).overflowX});
    },700));
  });
  console.log(`C1 ${w}px  scrollY=${r.scrollY}  header.top=${r.headerTop}  position=${r.pos}  body.overflowX=${r.bodyOverflowX} html=${r.htmlOverflowX}`);
  await p.screenshot({path:`${OUT}/C1-sticky-${w}.png`});
  await p.close();
}

/* --- nav duplication (D14) --- */
{
  for (const w of [390,1280]) {
    const p=await b.newPage(); await p.setViewport({width:w,height:900});
    await p.goto(BASE+'/',{waitUntil:'networkidle2',timeout:120000});
    await new Promise(r=>setTimeout(r,3000));
    const d=await p.evaluate(()=>{
      const navs=[...document.querySelectorAll('nav')].map(n=>{const r=n.getBoundingClientRect();return{visible:r.width>0&&r.height>0,hidden:n.getAttribute('aria-hidden'),display:getComputedStyle(n).display};});
      const feat=[...document.querySelectorAll('a,button')].filter(e=>/^(features|faq)$/i.test(e.innerText.trim()));
      return {navs, featureControls:feat.map(e=>{const r=e.getBoundingClientRect();return{t:e.innerText.trim(),vis:r.width>0&&r.height>0,href:e.getAttribute('href')};})};
    });
    console.log(`D14 ${w}px navs=`,JSON.stringify(d.navs),' features/faq=',JSON.stringify(d.featureControls));
    await p.close();
  }
}

/* --- homepage search results: accessible names --- */
{
  const p=await b.newPage(); await p.setViewport({width:1280,height:1000});
  await p.goto(BASE+'/',{waitUntil:'networkidle2',timeout:120000});
  await new Promise(r=>setTimeout(r,3500));
  await p.evaluate(()=>{const i=document.querySelector('input[type=search]');i.scrollIntoView({block:'center'});i.focus();});
  await p.keyboard.type('Atraxa',{delay:30});
  await new Promise(r=>setTimeout(r,4500));
  const d=await p.evaluate(()=>{
    const res=[...document.querySelectorAll('a[href^="/cards/"]')].filter(a=>{const r=a.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>0;});
    return res.slice(0,8).map(a=>({
      href:a.getAttribute('href'),
      text:a.innerText.trim().slice(0,50),
      aria:a.getAttribute('aria-label'),
      title:a.getAttribute('title'),
      imgAlt:[...a.querySelectorAll('img')].map(i=>i.getAttribute('alt')),
      h:Math.round(a.getBoundingClientRect().height), w:Math.round(a.getBoundingClientRect().width),
    }));
  });
  console.log('A1 search result accessible names:'); d.forEach(x=>console.log('   ',JSON.stringify(x)));
  await p.screenshot({path:`${OUT}/A1-search-results-1280.png`});
  await p.close();
}

/* --- lobby (C10) --- */
for (const w of [390,1280]) {
  const p=await b.newPage(); await p.setViewport({width:w,height:900});
  await p.goto(BASE+'/play/online',{waitUntil:'networkidle2',timeout:120000});
  await new Promise(r=>setTimeout(r,5000));
  const t=await p.evaluate(()=>document.body.innerText.replace(/\n{2,}/g,'\n'));
  console.log(`\n===== LOBBY ${w}px =====\n`+t.slice(0,1800));
  await p.screenshot({path:`${OUT}/C10-lobby-${w}.png`,fullPage:true});
  await p.close();
}
await b.close();
