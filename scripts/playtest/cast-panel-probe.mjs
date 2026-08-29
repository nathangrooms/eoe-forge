/**
 * WHAT IS ACTUALLY IN THE PANEL WHEN YOU PRESS A CASTABLE CARD IN HAND?
 *
 * The previous probe reported no CAST control on three separate turns. That is
 * a big claim, so this one photographs the panel and dumps every button inside
 * it with position, size and disabled flag, instead of pattern-matching text.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { BASE, sleep, pressText, gameState } from './uiLib.mjs';

const W = 1600, H = 1000, OUT = '.shots/cast';
const VITE_CLIENT_STUB = `
export function createHotContext(){return{accept(){},acceptExports(){},dispose(){},prune(){},decline(){},invalidate(){},on(){},off(){},send(){},data:{}};}
const sheets=new Map();
export function updateStyle(id,c){let s=sheets.get(id);if(!s){s=document.createElement('style');s.setAttribute('data-vite-dev-id',id);s.textContent=c;document.head.appendChild(s);sheets.set(id,s);}else{s.textContent=c;}}
export function removeStyle(id){const s=sheets.get(id);if(s){document.head.removeChild(s);sheets.delete(id);}}
export function injectQuery(u){return u;}`;

const ALL_BUTTONS = page => page.evaluate(() => [...document.querySelectorAll('button,[role=button]')]
  .map(b => { const r = b.getBoundingClientRect(); return { r, b }; })
  .filter(o => o.r.width > 16 && o.r.height > 10)
  .map(o => ({ label: (o.b.innerText || '').trim().replace(/\n/g, '/').slice(0, 40),
    title: (o.b.getAttribute('title') || '').slice(0, 40),
    dis: !!o.b.disabled, x: Math.round(o.r.x), y: Math.round(o.r.y),
    w: Math.round(o.r.width), h: Math.round(o.r.height) })));

const run = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000,
    args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on('request', r => r.url().includes('/@vite/client')
    ? r.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB }) : r.continue());
  await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(6000); await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(7000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /VERSUS BOTS/i.test(x.innerText || '')); if (b) b.click(); });
  await sleep(1800);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /seeded|Use this deck|Choose/i.test(x.innerText || '')); if (b) b.click(); });
  await sleep(1400);
  await pressText(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
  await sleep(2500);
  await pressText(page, /^Keep$/);
  await sleep(2500);

  // land first so there is mana
  await page.evaluate(() => {
    const vh = window.innerHeight;
    const c = [...document.querySelectorAll('button')].find(b => {
      const r = b.getBoundingClientRect();
      return r.top > vh * 0.72 && /can play this as a land drop/i.test(b.getAttribute('title') || '');
    });
    if (c) c.click();
  });
  await sleep(800);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^PLAY LAND$/i.test((x.innerText || '').trim())); if (b) b.click(); });
  await sleep(1400);
  console.log('after land: ' + JSON.stringify(await gameState(page)));

  const hand = await page.evaluate(() => {
    const vh = window.innerHeight;
    return [...document.querySelectorAll('button')].filter(b => {
      const r = b.getBoundingClientRect(); return r.top > vh * 0.72 && r.width > 80;
    }).map(b => (b.getAttribute('title') || '').slice(0, 80));
  });
  console.log('\n=== HAND TOOLTIPS AFTER THE LAND DROP ===');
  hand.forEach(h => console.log('  ' + h));

  const target = await page.evaluate(() => {
    const vh = window.innerHeight;
    const c = [...document.querySelectorAll('button')].find(b => {
      const r = b.getBoundingClientRect();
      return r.top > vh * 0.72 && /You can cast this/i.test(b.getAttribute('title') || '');
    });
    if (!c) return null; const t = c.getAttribute('title'); c.click(); return t;
  });
  console.log('\n=== OPENED ===\n  ' + target);
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/00-castable-panel.png` });

  console.log('\n=== EVERY BUTTON ON SCREEN WITH THE PANEL OPEN ===');
  console.table(await ALL_BUTTONS(page));

  console.log('\n=== PANEL TEXT ===');
  console.log((await page.evaluate(() => (document.body.innerText || '').replace(/\n+/g, ' | '))).slice(0, 900));

  // does a double click or a drag do it instead?
  console.log('\n=== TRY: double click the card in hand ===');
  const before = await gameState(page);
  await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find(b => /Close the preview/i.test(b.getAttribute('title') || '')); if (x) x.click(); });
  await sleep(600);
  const pos = await page.evaluate(() => {
    const vh = window.innerHeight;
    const c = [...document.querySelectorAll('button')].find(b => {
      const r = b.getBoundingClientRect();
      return r.top > vh * 0.72 && /You can cast this/i.test(b.getAttribute('title') || '');
    });
    if (!c) return null; const r = c.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + 40) };
  });
  if (pos) {
    await page.mouse.click(pos.x, pos.y, { clickCount: 2 });
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/01-after-doubleclick.png` });
    console.log('before ' + JSON.stringify(before));
    console.log('after  ' + JSON.stringify(await gameState(page)));
  }
  await browser.close();
};
run().catch(e => { console.error('PROBE FAILED', e); process.exit(1); });
