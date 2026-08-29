/**
 * Does a browser game actually FINISH, or does it deadlock?
 *
 * Runs #4 and #5 both broke off at a step where the top action bar was empty
 * and called it stuck. But the snapshot taken straight after showed the game
 * had moved on by itself, so "stuck" was the driver being impatient. This
 * settles it: play a few turns, then sit still and watch the clock. No presses
 * at all once the watch starts.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8081';
const OUT = '.shots/wait';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => { errs.push('pageerror: ' + e.message.slice(0, 200)); log('  [pageerror]', e.message.slice(0, 160)); });
page.on('console', m => { if (m.type() === 'error') { errs.push('console: ' + m.text().slice(0, 200)); log('  [console.error]', m.text().slice(0, 160)); } });

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
const pressTitle = n => page.evaluate(n => {
  const el = [...document.querySelectorAll('button')].find(b => (b.getAttribute('title') || '').includes(n));
  if (!el) return false; el.click(); return true; }, n);
const game = () => page.evaluate(() => {
  const g = window.__dmGame; if (!g) return null;
  const p = g.players.find(x => x.id === 'p1');
  return { turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    stack: (g.stack || []).length, bf: p.zones.battlefield.length,
    life: g.players.map(x => `${x.name}:${x.life}`).join(' ') }; });
/** What the top bar is offering the human right now. */
const bar = () => page.evaluate(() => {
  const vw = innerWidth;
  return [...document.querySelectorAll('button')].filter(b => {
    const r = b.getBoundingClientRect();
    return !b.disabled && r.height > 18 && r.y < 120 && (r.x + r.width) > vw * 0.6 && (b.innerText || '').trim();
  }).map(b => (b.innerText || '').trim().slice(0, 24));
});

log('== open ==');
await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000); await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(6000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /VERSUS BOTS/i.test(x.innerText || '')); if (b) b.click(); });
await sleep(1500);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /seeded|Use this deck|Choose/i.test(x.innerText || '')); if (b) b.click(); });
await sleep(1200);
await press(/Start .*game/);
await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
await sleep(2500);
await press(/^Keep$/); await sleep(1500);

log('== hands off. no presses from here. watching for 180s ==');
const t0 = Date.now();
const seen = [];
let last = '';
while (Date.now() - t0 < 180000) {
  const g = await game();
  if (!g) break;
  const sig = `${g.turn}/${g.step}/${g.active}/${g.stack}/${g.life}`;
  if (sig !== last) {
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const b = await bar();
    log(`  +${secs}s T${g.turn} ${g.step} active=${g.active} stack=${g.stack} bf=${g.bf} ${g.life} | bar: ${JSON.stringify(b)}`);
    seen.push({ t: +secs, ...g, bar: b });
    last = sig;
  }
  if (g.status !== 'playing') { log('  GAME OVER, status =', g.status); break; }
  await sleep(1500);
}
await page.screenshot({ path: `${OUT}/after-wait.png` });
const g = await game();
log('\n== after 180s of no input ==');
log('final:', JSON.stringify(g));
log('distinct states observed:', seen.length);
const stalledAt = seen.length ? seen[seen.length - 1] : null;
log('last state:', JSON.stringify(stalledAt));
log('errors:', errs.length);
fs.writeFileSync(`${OUT}/wait.json`, JSON.stringify({ seen, final: g, errs }, null, 2));
await browser.close();
