/** Counts live regions and whether one message lands in two of them. */
import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1440,height:900});
await p.goto('http://127.0.0.1:8080/register',{waitUntil:'networkidle2',timeout:60000});
await new Promise(r=>setTimeout(r,1500));
await p.type('#username','probe'); await p.type('#email','probe@example.invalid');
await p.type('#password','abcdefgh'); await p.type('#confirmPassword','nope');
await p.click('button[type=submit]');
await new Promise(r=>setTimeout(r,900));
console.log(JSON.stringify(await p.evaluate(()=>{
  const regions=[...document.querySelectorAll('[aria-live],[role=status],[role=alert]')].map(el=>({
    role:el.getAttribute('role'), live:el.getAttribute('aria-live'),
    text:(el.textContent||'').trim().slice(0,80)}));
  const withText=regions.filter(r=>r.text);
  const dup={};
  for(const r of withText) dup[r.text]=(dup[r.text]||0)+1;
  return {regions:regions.length, withText, duplicated:Object.entries(dup).filter(([,n])=>n>1)};
}),null,1));
await b.close();
