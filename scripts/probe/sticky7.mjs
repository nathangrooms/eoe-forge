import puppeteer from 'puppeteer';
const BASE=process.env.BASE||'http://127.0.0.1:4178';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-lcd-text']});
for (const w of [390,768,1280,1920]) {
  const p=await b.newPage(); await p.setViewport({width:w,height:844});
  await p.goto(BASE+'/',{waitUntil:'networkidle2',timeout:120000});
  await new Promise(r=>setTimeout(r,3500));
  const d=await p.evaluate(async()=>{
    const sticky=[...document.querySelectorAll('*')].filter(e=>{
      const s=getComputedStyle(e); const r=e.getBoundingClientRect();
      return (s.position==='sticky'||s.position==='fixed') && r.width>50 && r.height>10;
    }).map(e=>({tag:e.tagName,cls:(e.className&&e.className.baseVal!==undefined?e.className.baseVal:String(e.className||'')).slice(0,60),pos:getComputedStyle(e).position,top0:Math.round(e.getBoundingClientRect().top)}));
    window.scrollTo(0,6000);
    await new Promise(r=>setTimeout(r,700));
    const after=sticky.map((s,i)=>{
      const el=[...document.querySelectorAll('*')].filter(e=>{
        const st=getComputedStyle(e); const r=e.getBoundingClientRect();
        return (st.position==='sticky'||st.position==='fixed') && r.width>50 && r.height>10;
      })[i];
      return {...s, topAfter: el?Math.round(el.getBoundingClientRect().top):null};
    });
    // does the logo / signin remain reachable?
    const brand=[...document.querySelectorAll('a')].find(a=>/DeckMatrix/i.test(a.innerText));
    const signin=[...document.querySelectorAll('a,button')].find(a=>/^(log in|sign in|create account)$/i.test(a.innerText.trim()));
    return {scrollY:window.scrollY, sticky:after,
      brandTop: brand?Math.round(brand.getBoundingClientRect().top):'none',
      signinTop: signin?Math.round(signin.getBoundingClientRect().top)+' ('+signin.innerText.trim()+')':'none',
      docH:document.documentElement.scrollHeight};
  });
  console.log(`\n${w}px  scrollY=${d.scrollY}  docHeight=${d.docH}`);
  console.log('   sticky/fixed elements:',JSON.stringify(d.sticky));
  console.log('   brand top after scroll:',d.brandTop,' | signin control top:',d.signinTop);
  await p.screenshot({path:`.shots/seventh/sticky7-${w}.png`});
  await p.close();
}
await b.close();
