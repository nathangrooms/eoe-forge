/** Finds every em-dash in what a reader actually sees on a public route. */
import puppeteer from 'puppeteer';
const BASE=process.env.BASE||'http://127.0.0.1:8080';
const ROUTES=(process.env.ROUTES||'/,/login,/register,/terms,/privacy,/play/online,/cards/ee6e5a35-fe21-4dee-b0ef-a8f2841511ad').split(',');
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1440,height:900});
for (const r of ROUTES) {
  await p.goto(BASE+r,{waitUntil:'networkidle2',timeout:90000});
  await new Promise(x=>setTimeout(x,3000));
  const hits=await p.evaluate(()=>{
    const out=[]; const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let n; while((n=w.nextNode())){ const t=n.nodeValue||''; if(t.includes('\u2014')){
      const el=n.parentElement; const cs=el?getComputedStyle(el):null;
      if(cs && (cs.display==='none'||cs.visibility==='hidden')) continue;
      out.push(t.trim().slice(0,140)); } }
    return out;
  });
  if(hits.length) { console.log(`\n=== ${r}  (${hits.length})`); hits.forEach(h=>console.log('  '+h)); }
}
await b.close();
