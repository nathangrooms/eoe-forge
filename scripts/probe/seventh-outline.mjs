import puppeteer from 'puppeteer';
const BASE=process.env.BASE||'http://127.0.0.1:4178';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-lcd-text','--font-render-hinting=none']});
for(const route of ['/cards','/decks','/','/login','/terms']){
  const p=await b.newPage(); await p.setViewport({width:1280,height:1000});
  await p.goto(BASE+route,{waitUntil:'networkidle2',timeout:120000});
  await new Promise(r=>setTimeout(r,3500));
  const d=await p.evaluate(()=>{
    const a=document.activeElement;
    const big=[...document.querySelectorAll('body *')].filter(e=>{
      const r=e.getBoundingClientRect(); const s=getComputedStyle(e);
      if(r.width<400||r.height<300) return false;
      const ow=parseFloat(s.outlineWidth);
      const hasOutline = s.outlineStyle!=='none' && ow>0 && s.outlineColor!=='rgba(0, 0, 0, 0)';
      const hasBorder = ['Top','Right','Bottom','Left'].some(k=>parseFloat(s['border'+k+'Width'])>0 && !/rgba\(.*, ?0\)/.test(s['border'+k+'Color']));
      return hasOutline||hasBorder;
    }).map(e=>{const s=getComputedStyle(e);const r=e.getBoundingClientRect();
      return {tag:e.tagName,cls:String(e.className||'').slice(0,45),
        outline:s.outlineStyle+' '+s.outlineWidth+' '+s.outlineColor,
        border:s.borderTopWidth+' '+s.borderTopColor,
        box:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],
        isActive: e===document.activeElement, tabindex:e.getAttribute('tabindex')};});
    return {focus:a?a.tagName+' '+String(a.className||'').slice(0,40)+' tabindex='+a.getAttribute('tabindex'):'none', big};
  });
  console.log(`\n${route}  focus=${d.focus}`);
  d.big.forEach(x=>console.log('   ',x.tag,x.cls,'| outline:',x.outline,'| border:',x.border,'| box',JSON.stringify(x.box),x.isActive?'<< THIS IS THE FOCUSED ELEMENT':''));
  await p.close();
}
await b.close();
