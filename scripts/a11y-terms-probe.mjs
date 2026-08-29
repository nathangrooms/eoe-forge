import puppeteer from 'puppeteer';
const BASE='http://127.0.0.1:8080';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-lcd-text']});
const p=await b.newPage();await p.setViewport({width:1440,height:900});
await p.goto(BASE+'/register',{waitUntil:'networkidle2'});await sleep(2500);
console.log(JSON.stringify(await p.evaluate(()=>{
  const hit=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/Terms of Service|Privacy Policy/i.test(e.textContent||''));
  return {
    matches:hit.map(e=>({tag:e.tagName,href:e.getAttribute('href'),tabindex:e.getAttribute('tabindex'),
      role:e.getAttribute('role'),text:(e.textContent||'').trim().slice(0,40),
      focusable:['A','BUTTON'].includes(e.tagName)&&(e.tagName!=='A'||e.hasAttribute('href')),
      html:e.outerHTML.slice(0,140)})),
    wholeLine:(()=>{const n=[...document.querySelectorAll('p,div,span')].find(e=>/By creating an account/i.test(e.textContent||''));
      return n?{html:n.outerHTML.slice(0,420)}:null;})(),
    // is the password hint tied to the field
    hint:(()=>{const h=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&/At least 8 characters/i.test(e.textContent||''));
      if(!h)return null;
      const pw=document.getElementById('password');
      return {hintId:h.id||null,hintParentId:h.parentElement?.id||null,
        pwDescribedby:pw?.getAttribute('aria-describedby')||null,
        linked:!!(pw&&pw.getAttribute('aria-describedby')&&document.getElementById(pw.getAttribute('aria-describedby'))?.textContent.includes('8'))};})(),
  };
}),null,1));
// and does /terms or /privacy even exist
for(const r of ['/terms','/privacy','/terms-of-service','/privacy-policy']){
  await p.goto(BASE+r,{waitUntil:'networkidle2'}).catch(()=>{});await sleep(1800);
  console.log(r+' -> h1='+JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('h1')].map(h=>h.innerText.trim().slice(0,40)))));
}
await b.close();
