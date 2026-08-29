import puppeteer from 'puppeteer';
const BASE=process.env.BASE||'http://127.0.0.1:4178';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-lcd-text']});
for(const w of [390,1280]){
  const p=await b.newPage(); await p.setViewport({width:w,height:900});
  await p.goto(BASE+'/cards/ee6e5a35-fe21-4dee-b0ef-a8f2841511ad',{waitUntil:'networkidle2',timeout:120000});
  await new Promise(r=>setTimeout(r,6000));
  await p.evaluate(()=>{const btn=[...document.querySelectorAll('button')].find(x=>/add to deck/i.test(x.innerText));btn&&btn.click();});
  await new Promise(r=>setTimeout(r,1400));
  const d=await p.evaluate(()=>{
    const panel=[...document.querySelectorAll('*')].find(e=>/ADD TO A DECK/.test(e.innerText||'')&&e.children.length<12&&getComputedStyle(e).position==='fixed');
    const overlay=[...document.querySelectorAll('*')].filter(e=>{const s=getComputedStyle(e);const r=e.getBoundingClientRect();
      return s.position==='fixed'&&r.width>=window.innerWidth*0.9&&r.height>=window.innerHeight*0.9&&s.backgroundColor!=='rgba(0, 0, 0, 0)';})
      .map(e=>({bg:getComputedStyle(e).backgroundColor,op:getComputedStyle(e).opacity,cls:String(e.className||'').slice(0,50)}));
    const closes=[...document.querySelectorAll('button')].filter(x=>/close/i.test((x.getAttribute('aria-label')||x.innerText||'')))
      .map(x=>{const r=x.getBoundingClientRect();return{w:Math.round(r.width),h:Math.round(r.height),vis:r.width>0};}).filter(x=>x.vis);
    const signin=[...document.querySelectorAll('a[href]')].filter(a=>{const r=a.getBoundingClientRect();return r.width>0&&r.left>window.innerWidth*0.5&&/sign in|log in|create account|account/i.test(a.innerText);}).map(a=>a.innerText.trim());
    const pr=panel?panel.getBoundingClientRect():null;
    return {panelBox:pr?{x:Math.round(pr.x),y:Math.round(pr.y),w:Math.round(pr.width),h:Math.round(pr.height)}:null,
      overlays:overlay, closes, signinLinksInPanel:signin,
      panelText:panel?panel.innerText.replace(/\s+/g,' ').slice(0,140):null};
  });
  console.log(`\n=== add-to-deck panel @${w}px ===`);
  console.log(JSON.stringify(d,null,1));
  await p.close();
}
await b.close();
