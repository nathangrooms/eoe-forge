import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1440,height:900});
await p.goto('http://127.0.0.1:8080/cards/ee6e5a35-fe21-4dee-b0ef-a8f2841511ad',{waitUntil:'networkidle2',timeout:90000});
await new Promise(x=>setTimeout(x,3500));
console.log(JSON.stringify(await p.evaluate(()=>{
  const out=[]; const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  let n; while((n=w.nextNode())){ const t=(n.nodeValue||'').trim();
    if(t==='\u2014'){ const el=n.parentElement;
      out.push({cls:el.className.toString().slice(0,80), parentText:(el.parentElement?.innerText||'').replace(/\s+/g,' ').slice(0,120)}); } }
  return out;}),null,1));
await b.close();
