import puppeteer from 'puppeteer';
const BASE=process.env.BASE||'http://127.0.0.1:4178';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-lcd-text','--font-render-hinting=none'],protocolTimeout:240000});

async function tabWalk(p,max=70){
  const stops=[];
  for(let i=0;i<max;i++){
    await p.keyboard.press('Tab');
    const s=await p.evaluate(()=>{
      const e=document.activeElement;
      if(!e||e===document.body) return {tag:'BODY',name:'(focus lost to body)'};
      const r=e.getBoundingClientRect();
      const label=(e.getAttribute('aria-label')||e.innerText||e.value||e.getAttribute('placeholder')||e.getAttribute('title')||'').trim().replace(/\s+/g,' ').slice(0,52);
      const st=getComputedStyle(e);
      const ring = st.outlineStyle!=='none' && parseFloat(st.outlineWidth)>0 ? 'outline' : (st.boxShadow!=='none'?'shadow':'NONE');
      return {tag:e.tagName,type:e.type||'',name:label,
        w:Math.round(r.width),h:Math.round(r.height),
        offscreen: r.width===0||r.height===0,
        ring,
        invalid:e.getAttribute('aria-invalid'),desc:e.getAttribute('aria-describedby')};
    });
    stops.push(s);
    if(s.tag==='BODY'&&i>3) break;
  }
  return stops;
}

/* ---- REGISTER ---- */
{
  const p=await b.newPage(); await p.setViewport({width:1280,height:1000});
  await p.goto(BASE+'/register',{waitUntil:'networkidle2',timeout:120000});
  await new Promise(r=>setTimeout(r,3000));
  console.log('===== TAB WALK: /register =====');
  const stops=await tabWalk(p,30);
  stops.forEach((s,i)=>console.log(String(i+1).padStart(2),s.tag+(s.type?'['+s.type+']':''),'|',JSON.stringify(s.name),'|',s.w+'x'+s.h,'| focusring:'+s.ring,(s.offscreen?'| OFFSCREEN':''),(s.invalid!==null?'| aria-invalid='+s.invalid:''),(s.desc?'| describedby='+s.desc:'')));

  // submit empty and see what is announced / whether fields mark themselves
  console.log('\n--- submit with a bad password, keyboard only ---');
  await p.evaluate(()=>{const i=document.querySelector('input[type=email]');i&&i.focus();});
  await p.keyboard.type('seventh.person@example.com',{delay:12});
  const before=await p.evaluate(()=>[...document.querySelectorAll('input')].map(i=>({t:i.type,inv:i.getAttribute('aria-invalid'),desc:i.getAttribute('aria-describedby')})));
  console.log('fields before submit:',JSON.stringify(before));
  await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/create account/i.test(x.innerText));b&&b.click();});
  await new Promise(r=>setTimeout(r,1400));
  const at1400=await p.evaluate(()=>({
    live:[...document.querySelectorAll('[aria-live],[role=alert],[role=status]')].map(n=>n.innerText.trim().replace(/\s+/g,' ')).filter(Boolean),
    fields:[...document.querySelectorAll('input')].map(i=>({t:i.type,inv:i.getAttribute('aria-invalid'),desc:i.getAttribute('aria-describedby')})),
    focus:document.activeElement.tagName+' '+(document.activeElement.getAttribute('aria-label')||document.activeElement.innerText||document.activeElement.type||'').trim().slice(0,40),
  }));
  console.log('at +1400ms:',JSON.stringify(at1400));
  await p.screenshot({path:'.shots/seventh/C5-register-error.png'});
  await new Promise(r=>setTimeout(r,3000));
  const at4400=await p.evaluate(()=>({live:[...document.querySelectorAll('[aria-live],[role=alert],[role=status]')].map(n=>n.innerText.trim().replace(/\s+/g,' ')).filter(Boolean),visibleErr:/at least 8|invalid|required|error|must/i.test(document.body.innerText)}));
  console.log('at +4400ms:',JSON.stringify(at4400));
  await p.close();
}

/* ---- LOGIN tab order (D5) ---- */
{
  const p=await b.newPage(); await p.setViewport({width:1280,height:1000});
  await p.goto(BASE+'/login',{waitUntil:'networkidle2',timeout:120000});
  await new Promise(r=>setTimeout(r,2500));
  console.log('\n===== TAB WALK: /login =====');
  (await tabWalk(p,16)).forEach((s,i)=>console.log(String(i+1).padStart(2),s.tag+(s.type?'['+s.type+']':''),'|',JSON.stringify(s.name),'|',s.w+'x'+s.h,'| ring:'+s.ring));
  await p.close();
}
await b.close();
