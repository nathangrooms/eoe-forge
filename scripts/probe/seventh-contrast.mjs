import puppeteer from 'puppeteer';
const BASE=process.env.BASE||'http://127.0.0.1:4178';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-lcd-text','--font-render-hinting=none'],protocolTimeout:300000});
const ROUTES=[['/','home'],['/login','login'],['/register','register'],['/terms','terms'],['/privacy','privacy'],['/play/online','lobby'],['/cards/ee6e5a35-fe21-4dee-b0ef-a8f2841511ad','card'],['/this-route-does-not-exist','404']];
let total=0;
for(const [route,name] of ROUTES){
  const p=await b.newPage(); await p.setViewport({width:1280,height:1000});
  await p.goto(BASE+route,{waitUntil:'networkidle2',timeout:120000});
  await new Promise(r=>setTimeout(r,5000));
  await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=800){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,90));}window.scrollTo(0,0);});
  await new Promise(r=>setTimeout(r,2500));
  const fails=await p.evaluate(()=>{
    const px=c=>{const m=c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);return m?[+m[1],+m[2],+m[3],m[4]===undefined?1:+m[4]]:null;};
    const lin=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
    const L=c=>0.2126*lin(c[0])+0.7152*lin(c[1])+0.0722*lin(c[2]);
    const over=(f,b)=>[f[0]*f[3]+b[0]*(1-f[3]),f[1]*f[3]+b[1]*(1-f[3]),f[2]*f[3]+b[2]*(1-f[3]),1];
    const bgOf=el=>{let e=el;while(e){const c=px(getComputedStyle(e).backgroundColor);if(c&&c[3]>0.92)return c;
      const bi=getComputedStyle(e).backgroundImage; if(bi&&bi!=='none') return null; e=e.parentElement;}return [10,10,11,1];};
    const out=[];
    for(const el of document.querySelectorAll('body *')){
      if(el.children.length) continue;
      const t=(el.innerText||'').trim(); if(!t||t.length>70) continue;
      const r=el.getBoundingClientRect(); if(r.width<4||r.height<4) continue;
      const st=getComputedStyle(el); if(st.visibility==='hidden'||st.opacity==='0') continue;
      const fg=px(st.color); const bg=bgOf(el); if(!fg||!bg) continue;   // skip text over images
      const eff=over(fg,bg); const l1=L(eff),l2=L(bg);
      const ratio=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
      const size=parseFloat(st.fontSize), wgt=parseInt(st.fontWeight)||400;
      const need=(size>=24||(size>=18.66&&wgt>=700))?3:4.5;
      if(ratio<need) out.push({t:t.slice(0,38),r:+ratio.toFixed(2),size,need,color:st.color});
    }
    // dedupe by colour+size
    const seen=new Set(); return out.filter(o=>{const k=o.color+o.size+o.t;if(seen.has(k))return false;seen.add(k);return true;});
  });
  total+=fails.length;
  console.log(`\n${name.padEnd(9)} ${route}  -> ${fails.length} contrast failure(s)`);
  fails.slice(0,10).forEach(f=>console.log(`   ${f.r} (need ${f.need}) @${f.size}px ${f.color}  ${JSON.stringify(f.t)}`));
  await p.close();
}
console.log('\nTOTAL contrast failures across the public surface:',total);
await b.close();
