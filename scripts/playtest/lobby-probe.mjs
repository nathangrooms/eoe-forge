/**
 * See the friends list and the chat box, rather than reading them in source.
 *
 *   node scripts/playtest/lobby-probe.mjs
 *
 * The previous evidence pass marked the chat box "DONE IN CODE, NOT SEEN",
 * because `/play/online` is behind `ProtectedRoute`. This drives the shipped
 * `Lobby` page through `lobby-harness.html`, signed out, and measures the
 * chat-box shape the owner asked for as GEOMETRY:
 *
 *   one column          every message row shares an x and a width
 *   newest at bottom    the list is scrolled to its end on arrival
 *   composer last       the input's y is below every message row
 *
 * and it measures whether the friends list is on the page at all.
 *
 * No account is created and no credentials are entered.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = process.env.OUT || '.shots/lobby';
const BASE = process.env.BASE || 'http://127.0.0.1:8081';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const consoleErrors = [], pageErrors = [], netFails = [];

const browser = await puppeteer.launch({
  headless: 'new', protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
page.on('pageerror', e => { pageErrors.push(e.message.slice(0, 300)); log('  [pageerror]', e.message.slice(0, 200)); });
page.on('console', m => { if (m.type() === 'error') { consoleErrors.push(m.text().slice(0, 300)); log('  [console.error]', m.text().slice(0, 200)); } });
page.on('requestfailed', r => netFails.push(`${r.failure()?.errorText} ${r.url().slice(0, 140)}`));
page.on('response', r => { if (r.status() >= 400) netFails.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`); });

const VITE_CLIENT_STUB = `
export function createHotContext(){return{accept(){},acceptExports(){},dispose(){},prune(){},decline(){},invalidate(){},on(){},off(){},send(){},data:{}};}
const sheets=new Map();
export function updateStyle(id,content){let s=sheets.get(id);if(!s){s=document.createElement('style');s.setAttribute('type','text/css');s.setAttribute('data-vite-dev-id',id);s.textContent=content;document.head.appendChild(s);sheets.set(id,s);}else{s.textContent=content;}}
export function removeStyle(id){const s=sheets.get(id);if(s){document.head.removeChild(s);sheets.delete(id);}}
export function injectQuery(u){return u;}`;
await page.setRequestInterception(true);
page.on('request', req => {
  if (req.url().includes('/@vite/client')) return req.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB });
  return req.continue();
});

let shotN = 0;
const shot = async name => {
  const f = `${OUT}/${String(shotN++).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: f, fullPage: false }); log('  shot ->', f); return f;
};

log('== open ==');
await page.goto(`${BASE}/lobby-harness.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000); await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(9000);

const present = await page.evaluate(() => {
  const text = document.body.innerText || '';
  return {
    rootWidth: Math.round(document.getElementById('root').getBoundingClientRect().width),
    viewportWidth: window.innerWidth,
    hasFriendsHeading: /friends/i.test(text),
    hasChatComposer: !!document.querySelector('textarea'),
    headings: [...document.querySelectorAll('h1,h2,h3,h4')]
      .map(h => (h.innerText || '').trim()).filter(Boolean).slice(0, 24),
  };
});
log('  page:', JSON.stringify(present, null, 2));
await shot('lobby-top');

// Scroll to the discussion.
await page.evaluate(() => {
  const t = document.querySelector('textarea');
  if (t) t.scrollIntoView({ block: 'center' });
});
await sleep(1200);
await shot('lobby-chat');

/**
 * The chat-box shape, as geometry.
 *
 * A message row is found by walking up from each rendered post body to the
 * nearest element that is a direct child of the scrolling list, so this does
 * not depend on a class name.
 */
const chat = await page.evaluate(() => {
  const composer = document.querySelector('textarea');
  if (!composer) return { composer: false };
  const composerBox = composer.getBoundingClientRect();

  // The scroller is the nearest ancestor of the composer's sibling list that
  // actually scrolls.
  const scrollers = [...document.querySelectorAll('div')].filter(el => {
    const cs = getComputedStyle(el);
    return /auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4;
  });
  const scroller = scrollers.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] ?? null;

  const rows = scroller
    ? [...scroller.children].map(el => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), w: Math.round(r.width), y: Math.round(r.y), text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 40) };
      }).filter(r => r.w > 40)
    : [];

  const xs = [...new Set(rows.map(r => r.x))];
  const ws = [...new Set(rows.map(r => r.w))];

  return {
    composer: true,
    composerY: Math.round(composerBox.y),
    scrollerFound: !!scroller,
    scrollTop: scroller ? Math.round(scroller.scrollTop) : null,
    scrollHeight: scroller ? Math.round(scroller.scrollHeight) : null,
    clientHeight: scroller ? Math.round(scroller.clientHeight) : null,
    atEnd: scroller ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48 : null,
    rows: rows.length,
    distinctRowX: xs.length,
    distinctRowW: ws.length,
    lowestRowY: rows.length ? Math.max(...rows.map(r => r.y)) : null,
    composerBelowEveryRow: rows.length ? composerBox.y > Math.max(...rows.map(r => r.y)) : null,
    sample: rows.slice(-4),
  };
});
log('  chat box:', JSON.stringify(chat, null, 2));

log('\n== console/network ==');
log('  console errors', consoleErrors.length, '| page errors', pageErrors.length, '| net failures', netFails.length);
if (pageErrors.length) log(JSON.stringify(pageErrors.slice(0, 4), null, 2));
if (consoleErrors.length) log(JSON.stringify(consoleErrors.slice(0, 4), null, 2));
if (netFails.length) log(JSON.stringify(netFails.slice(0, 4), null, 2));

fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify({ present, chat, consoleErrors, pageErrors, netFails }, null, 2));
await browser.close();
