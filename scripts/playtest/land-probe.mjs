/**
 * ONE QUESTION: does pressing PLAY LAND in the card preview put the land on
 * the battlefield?
 *
 * Driven three ways so a failure cannot be blamed on how the click was sent:
 *   1. synthetic `el.click()` from inside the page
 *   2. a real mouse press at the button's own centre coordinates
 *   3. keyboard Enter with the button focused
 * State is read from `window.__dmGame` before and after each.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8081';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = '.shots/landprobe';
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
page.on('pageerror', e => errs.push('PAGE ' + e.message.slice(0, 260)));
page.on('console', m => { if (m.type() === 'error') errs.push('CON ' + m.text().slice(0, 260)); });
await page.setRequestInterception(true);
page.on('request', r => r.url().includes('/@vite/client')
  ? r.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB })
  : r.continue());
await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await sleep(6000); await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(7000);
fs.mkdirSync(OUT, { recursive: true });

const press = src => page.evaluate(s => {
  const re = new RegExp(s, 'i');
  const b = [...document.querySelectorAll('button')].find(x => !x.disabled && (re.test((x.innerText || '').trim()) || re.test(x.getAttribute('title') || '')));
  if (!b) return null; const l = ((b.innerText || '').trim() || b.getAttribute('title') || '').slice(0, 46); b.click(); return l;
}, src);

const state = () => page.evaluate(() => {
  const g = window.__dmGame; if (!g) return null;
  const p = g.players.find(x => x.id === 'p1');
  return { turn: g.turn, step: g.step, hand: p.zones.hand.length, bf: p.zones.battlefield.length,
    handNames: p.zones.hand.map(i => g.cards[i]?.name), bfNames: p.zones.battlefield.map(i => g.cards[i]?.name),
    landDrops: g.turnState?.landDrops ?? g.landDrops ?? null };
});

await press('VERSUS BOTS'); await sleep(2000);
await press('Choose opponents'); await sleep(2000);
await press('Start 2-player game');
await page.waitForFunction('!!window.__dmGame', { timeout: 180000, polling: 400 });
await sleep(3000);
await press('KEEP THIS HAND'); await sleep(2500);
console.log('AFTER KEEP:', JSON.stringify(await state()));

// Open the Mountain.
const opened = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('title') || '').startsWith('Mountain.'));
  if (!b) return null; b.click(); return b.getAttribute('title');
});
console.log('OPENED CARD:', opened);
await sleep(1200);
await page.screenshot({ path: `${OUT}/00-preview-open.png` });

// What is on screen now, with position and whether anything covers the button.
const preview = await page.evaluate(() => {
  const out = [];
  for (const b of document.querySelectorAll('button')) {
    const r = b.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const t = (b.innerText || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 50) continue;
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    out.push({ t, d: !!b.disabled, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      covered: !(b === top || b.contains(top)), topEl: top ? top.tagName + '.' + String(top.className).slice(0, 40) : null });
  }
  return out;
});
console.log('BUTTONS WITH TEXT IN VIEW:');
for (const b of preview) console.log(`  [${b.d ? 'x' : ' '}] "${b.t}" @${b.x},${b.y} ${b.w}x${b.h} covered=${b.covered} top=${b.topEl}`);

const bodyNow = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 1200));
console.log('\nBODY:', bodyNow);

const target = preview.find(b => /^play land$/i.test(b.t));
console.log('\nPLAY LAND BUTTON:', JSON.stringify(target));

console.log('\nBEFORE:', JSON.stringify(await state()));

// 1. synthetic click
const syn = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^play land$/i.test((x.innerText || '').trim()));
  if (!b) return 'no button'; b.click(); return 'clicked';
});
await sleep(1500);
console.log('1 synthetic:', syn, JSON.stringify(await state()));
await page.screenshot({ path: `${OUT}/01-after-synthetic.png` });

// 2. real mouse
if (target && !target.d) {
  await page.mouse.click(target.x + target.w / 2, target.y + target.h / 2);
  await sleep(1500);
  console.log('2 real mouse:', JSON.stringify(await state()));
  await page.screenshot({ path: `${OUT}/02-after-mouse.png` });
}

// 3. focus + Enter
const focused = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^play land$/i.test((x.innerText || '').trim()));
  if (!b) return false; b.focus(); return document.activeElement === b;
});
if (focused) { await page.keyboard.press('Enter'); await sleep(1500); }
console.log('3 enter (focused=' + focused + '):', JSON.stringify(await state()));
await page.screenshot({ path: `${OUT}/03-after-enter.png` });

console.log('\nBODY AFTER:', await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 900)));
console.log('\nERRORS:', JSON.stringify(errs.slice(0, 10), null, 1));
await browser.close();
