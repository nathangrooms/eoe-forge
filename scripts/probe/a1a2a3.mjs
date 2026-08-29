import puppeteer from 'puppeteer';
import fs from 'node:fs';
const BASE=process.env.BASE||'http://127.0.0.1:4178';
const OUT='.shots/seventh'; fs.mkdirSync(OUT,{recursive:true});
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-lcd-text','--font-render-hinting=none'],protocolTimeout:240000});

/* ---------- A3: pinch zoom ---------- */
{
  const p=await b.newPage(); await p.setViewport({width:390,height:844});
  await p.goto(BASE+'/',{waitUntil:'networkidle2',timeout:120000});
  const vp=await p.evaluate(()=>document.querySelector('meta[name=viewport]').content);
  console.log('A3 viewport meta:', vp);
  console.log('A3 blocks zoom:', /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(vp));
  await p.close();
}

/* ---------- A2: terms + privacy on register ---------- */
{
  const p=await b.newPage(); await p.setViewport({width:1280,height:1000});
  await p.goto(BASE+'/register',{waitUntil:'networkidle2',timeout:120000});
  await new Promise(r=>setTimeout(r,2500));
  const links=await p.evaluate(()=>[...document.querySelectorAll('a[href]')]
    .filter(a=>/terms|privacy/i.test(a.innerText))
    .map(a=>({text:a.innerText.trim(),href:a.getAttribute('href'),target:a.getAttribute('target')})));
  console.log('A2 legal links on /register:',JSON.stringify(links));
  const agree=await p.evaluate(()=>{
    const n=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&/Terms of/i.test(e.innerText));
    return n? n.closest('p,div,label')?.innerText.trim().slice(0,200) : null;
  });
  console.log('A2 agreement sentence:',JSON.stringify(agree));
  await p.screenshot({path:`${OUT}/A2-register-1280.png`});
  await p.close();
}
for (const route of ['/terms','/privacy']) {
  const p=await b.newPage(); await p.setViewport({width:1280,height:1000});
  const codes=[];
  p.on('response',r=>{try{if(new URL(r.url()).host===new URL(BASE).host&&r.url().endsWith(route))codes.push(r.status())}catch{}});
  await p.goto(BASE+route,{waitUntil:'networkidle2',timeout:120000});
  await new Promise(r=>setTimeout(r,2000));
  const d=await p.evaluate(()=>({title:document.title,h1:document.querySelector('h1')?.innerText,words:document.body.innerText.split(/\s+/).length,back:[...document.querySelectorAll('a[href],button')].map(x=>x.innerText.trim()).filter(Boolean).slice(0,8)}));
  console.log(`A2 ${route}:`,JSON.stringify(d));
  await p.screenshot({path:`${OUT}/A2${route.replace('/','-')}-1280.png`,fullPage:true});
  await p.close();
}

/* ---------- A1: homepage search, card links, lobby, shared deck ---------- */
{
  const p=await b.newPage(); await p.setViewport({width:1280,height:1000});
  await p.goto(BASE+'/',{waitUntil:'networkidle2',timeout:120000});
  await new Promise(r=>setTimeout(r,4000));
  const d=await p.evaluate(()=>{
    const inputs=[...document.querySelectorAll('input,textarea')].map(i=>({type:i.type,ph:i.placeholder,aria:i.getAttribute('aria-label'),name:i.name}));
    const hrefs=[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href'));
    return {
      inputCount:inputs.length, inputs,
      cardLinks:hrefs.filter(h=>h&&h.startsWith('/cards/')).length,
      toGatedCards:hrefs.filter(h=>h==='/cards').length,
      allHrefs:[...new Set(hrefs)],
      docH:document.documentElement.scrollHeight,
    };
  });
  console.log('A1 homepage inputs:',d.inputCount,JSON.stringify(d.inputs));
  console.log('A1 links to /cards/<id>:',d.cardLinks,'| links to bare /cards:',d.toGatedCards);
  console.log('A1 homepage height:',d.docH);
  fs.writeFileSync(`${OUT}/home-hrefs.json`,JSON.stringify(d.allHrefs,null,1));
  await p.screenshot({path:`${OUT}/A1-home-1280.png`});
  // type into the search box
  const sel=await p.evaluate(()=>{const i=[...document.querySelectorAll('input')].find(x=>/search|card|commander/i.test((x.placeholder||'')+(x.getAttribute('aria-label')||'')));return i?true:false;});
  if(sel){
    await p.evaluate(()=>{const i=[...document.querySelectorAll('input')].find(x=>/search|card|commander/i.test((x.placeholder||'')+(x.getAttribute('aria-label')||'')));i.scrollIntoView({block:'center'});i.focus();});
    await p.keyboard.type('Atraxa, Praetors',{delay:35});
    await new Promise(r=>setTimeout(r,4500));
    const res=await p.evaluate(()=>{
      const hrefs=[...document.querySelectorAll('a[href^="/cards/"]')].map(a=>({t:a.innerText.trim().slice(0,60),h:a.getAttribute('href')}));
      return {results:hrefs.slice(0,6), count:hrefs.length};
    });
    console.log('A1 search results:',JSON.stringify(res));
    await p.screenshot({path:`${OUT}/A1-home-search-1280.png`});
  } else console.log('A1 NO SEARCH INPUT FOUND ON HOMEPAGE');
  await p.close();
}
await b.close();
