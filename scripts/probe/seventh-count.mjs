import puppeteer from 'puppeteer';
const BASE=process.env.BASE||'http://127.0.0.1:4178';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1280,height:900});
await p.goto(BASE+'/play/online',{waitUntil:'networkidle2',timeout:120000});
await new Promise(r=>setTimeout(r,5000));
const d=await p.evaluate(()=>{
  const main=document.querySelector('main').innerText;
  return {asks:(main.match(/sign in|make an account|create account|log in/gi)||[]),
    words:main.split(/\s+/).length,
    postCount:1};
});
console.log('lobby <main>: ',d.words,'words');
console.log('asks to sign in / make an account inside main:',d.asks.length);
console.log(JSON.stringify(d.asks));
await b.close();
