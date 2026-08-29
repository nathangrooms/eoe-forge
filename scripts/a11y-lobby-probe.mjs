import puppeteer from 'puppeteer';
const BASE='http://127.0.0.1:8080';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-lcd-text']});
const p=await b.newPage();await p.setViewport({width:1440,height:1400});
const errs=[];p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,160));});
p.on('pageerror',e=>errs.push('pageerror '+e.message.slice(0,160)));
await p.goto(BASE+'/play/online',{waitUntil:'networkidle2'});await sleep(5000);
console.log('FULL TEXT A READER WOULD HEAR:');
console.log(JSON.stringify(await p.evaluate(()=>(document.body.innerText||'').replace(/\n{2,}/g,'\n').trim()),null,1));
console.log('\nCATEGORY BUTTONS:');
console.log(JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('button')]
 .filter(x=>/General|Looking for a game|Deck help/.test((x.innerText||'').trim()))
 .map(x=>({t:(x.innerText||'').trim(),pressed:x.getAttribute('aria-pressed'),role:x.getAttribute('role'),
   sel:x.getAttribute('aria-selected'),inTablist:!!x.closest('[role="tablist"]')}))),null,1));
console.log('\nEMPTY STATE / LIST REGION:');
console.log(JSON.stringify(await p.evaluate(()=>{
  const lists=[...document.querySelectorAll('ul,ol,[role="list"],[role="feed"]')];
  return {lists:lists.length,
    listItems:lists.map(l=>l.children.length),
    anyEmptyCopy:[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/no topics|nothing here|be the first|no conversation|empty/i.test(e.textContent||'')).map(e=>e.textContent.trim().slice(0,80))};
}),null,1));
console.log('\nerrors: '+JSON.stringify([...new Set(errs)].slice(0,8)));
await p.screenshot({path:'.shots/a11y/17-lobby-full.png',fullPage:true});
await b.close();
