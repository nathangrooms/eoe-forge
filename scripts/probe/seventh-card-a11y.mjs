import puppeteer from 'puppeteer';
const BASE=process.env.BASE||'http://127.0.0.1:4178';
const CARD=process.env.CARD||'ee6e5a35-fe21-4dee-b0ef-a8f2841511ad';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-lcd-text','--font-render-hinting=none'],protocolTimeout:300000});
const p=await b.newPage(); await p.setViewport({width:1280,height:1000});
await p.goto(BASE+'/cards/'+CARD,{waitUntil:'networkidle2',timeout:120000});
await new Promise(r=>setTimeout(r,8000));

/* tab walk */
console.log('===== TAB WALK: /cards/:id (first 46 stops) =====');
const seen=[];
for(let i=0;i<46;i++){
  await p.keyboard.press('Tab');
  const s=await p.evaluate(()=>{const e=document.activeElement;if(!e||e===document.body)return{tag:'BODY',n:'(focus lost)'};
    const r=e.getBoundingClientRect(); const st=getComputedStyle(e);
    return{tag:e.tagName,n:(e.getAttribute('aria-label')||e.innerText||e.getAttribute('title')||'').trim().replace(/\s+/g,' ').slice(0,58),
      w:Math.round(r.width),h:Math.round(r.height),
      ring:(st.outlineStyle!=='none'&&parseFloat(st.outlineWidth)>0)?'y':(st.boxShadow!=='none'?'shadow':'NO RING'),
      pressed:e.getAttribute('aria-pressed')};});
  seen.push(s); if(s.tag==='BODY'&&i>3)break;
}
seen.forEach((s,i)=>console.log(String(i+1).padStart(2),s.tag,'|',JSON.stringify(s.n),'|',s.w+'x'+s.h,'|',s.ring,(s.pressed!==null?'| aria-pressed='+s.pressed:''),(s.w<24||s.h<24)?'| *** UNDER 24px ***':''));

/* contrast on the legality grid + smallest type */
const contrast=await p.evaluate(()=>{
  function px(c){const m=c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);if(!m)return null;return[+m[1],+m[2],+m[3],m[4]===undefined?1:+m[4]];}
  function lin(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}
  function L(c){return 0.2126*lin(c[0])+0.7152*lin(c[1])+0.0722*lin(c[2]);}
  function over(fg,bg){const a=fg[3];return [fg[0]*a+bg[0]*(1-a),fg[1]*a+bg[1]*(1-a),fg[2]*a+bg[2]*(1-a),1];}
  function bgOf(el){let e=el;while(e){const c=px(getComputedStyle(e).backgroundColor);if(c&&c[3]>0.92)return c;e=e.parentElement;}return [10,10,11,1];}
  const out=[];
  for(const el of document.querySelectorAll('*')){
    if(el.children.length) continue;
    const t=(el.innerText||'').trim(); if(!t||t.length>60) continue;
    const r=el.getBoundingClientRect(); if(r.width<4||r.height<4) continue;
    const st=getComputedStyle(el);
    const fg=px(st.color); if(!fg) continue;
    const bg=bgOf(el);
    const eff=over(fg,bg);
    const l1=L(eff),l2=L(bg);
    const ratio=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
    const size=parseFloat(st.fontSize); const wgt=parseInt(st.fontWeight)||400;
    const large = size>=24 || (size>=18.66 && wgt>=700);
    const need = large?3:4.5;
    if(ratio<need) out.push({t:t.slice(0,40),ratio:+ratio.toFixed(2),size,need});
  }
  return out;
});
console.log('\n===== CONTRAST FAILURES on /cards/:id (1280px) =====');
console.log('count:',contrast.length);
contrast.slice(0,25).forEach(c=>console.log('  ',c.ratio.toFixed?c.ratio:c.ratio,'need',c.need,'@',c.size+'px  ',JSON.stringify(c.t)));

/* legality grid specifically */
const leg=await p.evaluate(()=>{
  const g=[...document.querySelectorAll('*')].filter(e=>/^NOT LEGAL$|^LEGAL$|^BANNED$|^RESTRICTED$/.test((e.innerText||'').trim())&&e.children.length===0);
  return g.slice(0,4).map(e=>{const st=getComputedStyle(e);return{t:e.innerText.trim(),color:st.color,size:st.fontSize,bg:st.backgroundColor};});
});
console.log('\nlegality cells:',JSON.stringify(leg));

/* modals + hairlines + card art */
const misc=await p.evaluate(()=>{
  const imgs=[...document.querySelectorAll('img')];
  return {
    dialogs:document.querySelectorAll('[role=dialog],[role=alertdialog]').length,
    desat:imgs.filter(i=>/grayscale|saturate\(0/.test(getComputedStyle(i).filter)).map(i=>i.alt),
    cropped:imgs.filter(i=>getComputedStyle(i).objectFit==='cover'&&/scryfall|card/i.test(i.src)).length,
    imgTotal:imgs.length,
    noAlt:imgs.filter(i=>i.getAttribute('alt')===null).length,
  };
});
console.log('\nmisc:',JSON.stringify(misc));
await b.close();
