/** Walk the /play flow one press at a time and print what is on screen. */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8081';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = '.shots/flow';
const VITE_CLIENT_STUB = `
export function createHotContext(){return{accept(){},acceptExports(){},dispose(){},prune(){},decline(){},invalidate(){},on(){},off(){},send(){},data:{}};}
const sheets=new Map();
export function updateStyle(id,c){let s=sheets.get(id);if(!s){s=document.createElement('style');s.setAttribute('data-vite-dev-id',id);s.textContent=c;document.head.appendChild(s);sheets.set(id,s);}else{s.textContent=c;}}
export function removeStyle(id){const s=sheets.get(id);if(s){document.head.removeChild(s);sheets.delete(id);}}
export function injectQuery(u){return u;}`;

const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000, args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => errs.push('PAGE ' + e.message.slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') errs.push('CON ' + m.text().slice(0, 200)); });
await page.setRequestInterception(true);
page.on('request', r => r.url().includes('/@vite/client')
  ? r.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB })
  : r.continue());
await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await sleep(6000); await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(7000);
fs.mkdirSync(OUT, { recursive: true });

const dump = async label => {
  const btns = await page.evaluate(() => [...document.querySelectorAll('button')]
    .filter(b => { const r = b.getBoundingClientRect(); return r.width > 2 && r.height > 2; })
    .map(b => ({ t: (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60), ti: (b.getAttribute('title') || '').slice(0, 60), d: !!b.disabled })));
  const text = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 600));
  await page.screenshot({ path: `${OUT}/${label}.png` });
  const g = await page.evaluate(() => window.__dmGame ? { turn: window.__dmGame.turn, step: window.__dmGame.step, status: window.__dmGame.status } : null);
  console.log(`\n===== ${label} =====\ngame: ${JSON.stringify(g)}\ntext: ${text}\nbuttons(${btns.length}):`);
  for (const b of btns) console.log(`  [${b.d ? 'x' : ' '}] "${b.t}" title="${b.ti}"`);
};

const press = (src) => page.evaluate(s => {
  const re = new RegExp(s, 'i');
  const b = [...document.querySelectorAll('button')].find(x => !x.disabled && (re.test((x.innerText || '').trim()) || re.test(x.getAttribute('title') || '')));
  if (!b) return null; const l = ((b.innerText || '').trim() || b.getAttribute('title') || '').slice(0, 50); b.click(); return l;
}, src);

await dump('00-landing');
console.log('press VERSUS BOTS ->', await press('VERSUS BOTS'));
await sleep(2500);
await dump('01-after-mode');
console.log('press deck ->', await press('Choose opponents|Use this deck|seeded'));
await sleep(2500);
await dump('02-after-deck');
console.log('press start ->', await press('Start|Shuffle|Deal|Sit down'));
await sleep(4000);
await dump('03-after-start');
await sleep(6000);
await dump('04-later');
console.log('press start2 ->', await press('Start|Shuffle|Deal|Sit down|Keep'));
await sleep(5000);
await dump('05-after-start2');
console.log('\nERRORS:', JSON.stringify(errs.slice(0, 12), null, 2));
await browser.close();
