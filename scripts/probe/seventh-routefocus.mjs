import puppeteer from 'puppeteer';
const BASE=process.env.BASE||'http://127.0.0.1:4178';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-lcd-text']});
const p=await b.newPage(); await p.setViewport({width:1280,height:1000});
await p.goto(BASE+'/',{waitUntil:'networkidle2',timeout:120000});
await new Promise(r=>setTimeout(r,4500));
console.log('start:', await p.evaluate(()=>document.title));
/* click a real in-app link the way a keyboard user would activate it */
for (const label of ['Create account','Sign in']) {
  const ok=await p.evaluate(l=>{const a=[...document.querySelectorAll('a[href^="/"]')].find(x=>x.innerText.trim()===l);if(!a)return false;a.focus();a.click();return true;},label);
  if(!ok){console.log('   (no link '+label+')');continue;}
  await new Promise(r=>setTimeout(r,2500));
  const d=await p.evaluate(()=>({
    url:location.pathname, title:document.title,
    focus:document.activeElement===document.body?'BODY (reading position lost)':document.activeElement.tagName+' '+(document.activeElement.getAttribute('aria-label')||document.activeElement.innerText||'').trim().slice(0,40),
    outline:(()=>{const a=document.activeElement;if(!a||a===document.body)return '-';const s=getComputedStyle(a);return s.outlineStyle+' '+s.outlineWidth+' '+s.outlineColor;})(),
    live:[...document.querySelectorAll('[aria-live]')].map(n=>n.innerText.trim()).filter(Boolean),
  }));
  console.log(`after clicking "${label}" ->`, JSON.stringify(d));
  await p.goBack({waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,2200));
}
/* and a card link, which is the deep in-page case */
await p.evaluate(()=>{const a=document.querySelector('a[href^="/cards/"]');a&&a.click();});
await new Promise(r=>setTimeout(r,4000));
console.log('after clicking a card ->', await p.evaluate(()=>JSON.stringify({url:location.pathname,title:document.title,focus:document.activeElement===document.body?'BODY (reading position lost)':document.activeElement.tagName,live:[...document.querySelectorAll('[aria-live]')].map(n=>n.innerText.trim()).filter(Boolean)})));
await b.close();
