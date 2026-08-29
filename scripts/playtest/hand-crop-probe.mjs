/**
 * WHICH element squashes a hand card out of card aspect?
 *
 * CardImage puts `aspect-ratio: 488/680` on its wrapper and `object-cover` on
 * the img, which is why battlefield cards measure 0% drift. Hand cards measure
 * up to 13.8% drift, so something above them is clamping the height and the
 * cover is then throwing pixels away. This walks up from a cropped <img> and
 * prints the chain so the culprit can be named rather than guessed at.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
fs.mkdirSync('.shots/handcrop', { recursive: true });
const BASE = process.env.BASE || 'http://127.0.0.1:8081';
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
const STUB = `
export function createHotContext(){return{accept(){},acceptExports(){},dispose(){},prune(){},decline(){},invalidate(){},on(){},off(){},send(){},data:{}};}
const s=new Map();
export function updateStyle(i,c){let e=s.get(i);if(!e){e=document.createElement('style');e.setAttribute('data-vite-dev-id',i);e.textContent=c;document.head.appendChild(e);s.set(i,e);}else{e.textContent=c;}}
export function removeStyle(i){const e=s.get(i);if(e){document.head.removeChild(e);s.delete(i);}}
export function injectQuery(u){return u;}`;
await page.setRequestInterception(true);
page.on('request', r => r.url().includes('/@vite/client')
  ? r.respond({ status: 200, contentType: 'application/javascript', body: STUB }) : r.continue());

const press = re => page.evaluate(src => {
  const el = [...document.querySelectorAll('button')].find(b => !b.disabled && new RegExp(src, 'i').test((b.innerText || '').trim()));
  if (!el) return false; el.click(); return true; }, re.source);

await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000); await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(6000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /VERSUS BOTS/i.test(x.innerText || '')); if (b) b.click(); });
await sleep(1500);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /seeded|Use this deck|Choose/i.test(x.innerText || '')); if (b) b.click(); });
await sleep(1200);
await press(/Start .*game/);
await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
await sleep(2500);
await press(/^Keep$/); await sleep(2000);

const result = await page.evaluate(() => {
  const CARD_AR = 488 / 680;
  const imgs = [...document.querySelectorAll('img')].filter(i => {
    const r = i.getBoundingClientRect();
    if (r.width < 60 || !i.naturalWidth) return false;
    const drift = Math.abs(r.width / r.height - CARD_AR) / CARD_AR;
    return drift > 0.02;
  });
  const chains = imgs.slice(0, 3).map(img => {
    const chain = [];
    let n = img;
    for (let i = 0; i < 9 && n && n !== document.body; i++) {
      const cs = getComputedStyle(n), r = n.getBoundingClientRect();
      chain.push({
        tag: n.tagName,
        cls: (n.className || '').toString().slice(0, 96),
        box: `${Math.round(r.width)}x${Math.round(r.height)}`,
        ar: +(r.width / r.height).toFixed(3),
        aspectRatio: cs.aspectRatio, height: cs.height, maxHeight: cs.maxHeight,
        transform: cs.transform === 'none' ? 'none' : cs.transform.slice(0, 40),
        overflow: cs.overflow, objectFit: cs.objectFit,
      });
      n = n.parentElement;
    }
    return { alt: img.alt, chain };
  });
  const vh = innerHeight;
  const hand = [...document.querySelectorAll('button[title]')]
    .filter(b => (b.getAttribute('title') || '').includes('Click to preview'))
    .map(b => { const r = b.getBoundingClientRect(); return { t: (b.getAttribute('title') || '').slice(0, 26), bottom: Math.round(r.bottom), overflow: Math.round(r.bottom - vh) }; });
  return { cardAR: +CARD_AR.toFixed(3), vh, chains, hand };
});
log('CARD_ASPECT =', result.cardAR, ' viewport height =', result.vh);
for (const c of result.chains) {
  log('\n--- cropped card:', c.alt);
  for (const n of c.chain) log('   ', JSON.stringify(n));
}
log('\n--- hand cards vs bottom of window ---');
for (const h of result.hand) log('   ', JSON.stringify(h));
fs.writeFileSync('.shots/handcrop/chain.json', JSON.stringify(result, null, 2));
await page.screenshot({ path: '.shots/handcrop/hand.png' });
await browser.close();
