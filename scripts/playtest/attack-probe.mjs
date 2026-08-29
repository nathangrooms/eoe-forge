/**
 * CAN THE HUMAN ATTACK?
 *
 * Across four runs the only life that moved was mine, because the bot attacked
 * and this driver never found an attack control on my own turn. That is not
 * evidence the control is missing — it is evidence the driver did not look
 * properly. This gets a creature down, unpauses to MY declare-attackers step,
 * and dumps every control on offer before deciding anything.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
fs.mkdirSync('.shots/attack', { recursive: true });
const BASE = process.env.BASE || 'http://127.0.0.1:8081';
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
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
  const creatures = p.zones.battlefield.map(id => g.cards[id]).filter(c => /Creature/i.test(c.typeLine || ''));
  return { turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    stack: (g.stack || []).length, myCreatures: creatures.map(c => c.name),
    life: g.players.map(x => `${x.name}:${x.life}`).join(' ') }; });
const controls = () => page.evaluate(() => [...document.querySelectorAll('button')]
  .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && !b.disabled; })
  .map(b => ({ text: (b.innerText || '').trim().slice(0, 30), title: (b.getAttribute('title') || '').slice(0, 60) }))
  .filter(x => x.text || x.title));

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
await pressTitle('Game menu'); await sleep(1200);
await pressTitle('Ignore mana entirely'); await sleep(600);
await pressTitle('Close the menu'); await sleep(800);

const handTitles = () => page.evaluate(() => [...document.querySelectorAll('button[title]')]
  .map(e => e.getAttribute('title')).filter(t => t && t.includes('Click to preview')));
const clickHand = t => page.evaluate(t => {
  const el = [...document.querySelectorAll('button[title]')].find(e => e.getAttribute('title') === t);
  if (!el) return false; el.click(); return true; }, t);
const closePreview = () => pressTitle('Close the preview');

/* Land a creature of my own. */
log('== casting creatures ==');
for (let i = 0; i < 6; i++) {
  const g = await game();
  if (g.myCreatures.length) break;
  if (g.active !== 'p1') { await press(/^END TURN$/); await sleep(5000); continue; }
  const titles = await handTitles();
  const l = titles.find(t => t.includes('land drop'));
  if (l) { await clickHand(l); await sleep(400); await press(/^Play land$/); await sleep(600); }
  for (const t of titles.filter(x => !x.includes('land drop')).slice(0, 4)) {
    await clickHand(t); await sleep(400);
    if (await press(/^Cast$/)) { await sleep(900); await press(/^LET IT RESOLVE$/); await sleep(900); }
    await closePreview(); await sleep(250);
  }
  const g2 = await game();
  log('  after casting:', JSON.stringify(g2.myCreatures), g2.step);
  if (g2.myCreatures.length) break;
  await press(/^END TURN$/); await sleep(6000);
}

let g = await game();
log('my creatures:', JSON.stringify(g.myCreatures));

/* Walk to MY declare_attackers. */
log('== walking to my declare_attackers ==');
for (let i = 0; i < 40; i++) {
  g = await game();
  if (g.active === 'p1' && g.step === 'declare_attackers') break;
  await closePreview();
  if (!(await press(/^(END TURN|NEXT|LET IT RESOLVE|NO BLOCKS|NO ATTACKS)$/))) await pressTitle('Advance one step');
  await sleep(1400);
}
g = await game();
log('state:', JSON.stringify(g));
await page.screenshot({ path: '.shots/attack/at-declare-attackers.png' });

const ctl = await controls();
log('\n== controls offered at my declare_attackers ==');
for (const c of ctl) log('   ', JSON.stringify(c));

/* Try to attack with the documented affordance. */
const attackBtns = ctl.filter(c => /attack/i.test(c.text) || /attack/i.test(c.title));
log('\nattack-looking controls:', JSON.stringify(attackBtns));
const did = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => !x.disabled &&
    (/^Attack with /i.test(x.getAttribute('title') || '') || /attack/i.test(x.getAttribute('title') || '')));
  if (!b) return null; const t = b.getAttribute('title'); b.click(); return t; });
log('clicked:', did);
await sleep(1200);
await page.screenshot({ path: '.shots/attack/after-attack-click.png' });
log('after click:', JSON.stringify(await game()));
const after = await controls();
log('bar now:', JSON.stringify(after.filter(c => /attack|block|damage|done|confirm|next|end/i.test(c.text)).slice(0, 8)));

/* Confirm the swing and see if damage lands. */
const lifeBefore = (await game()).life;
await press(/^(CONFIRM ATTACK|DONE|NEXT|ALL ATTACK)$/);
await sleep(1500);
for (let i = 0; i < 8; i++) { await press(/^(NEXT|NO BLOCKS|LET IT RESOLVE)$/); await sleep(1400); }
const lifeAfter = (await game()).life;
log('\nlife before swing:', lifeBefore);
log('life after swing: ', lifeAfter);
log('DAMAGE LANDED:', lifeBefore !== lifeAfter);
await page.screenshot({ path: '.shots/attack/after-damage.png' });
fs.writeFileSync('.shots/attack/attack.json', JSON.stringify({ controls: ctl, clicked: did, lifeBefore, lifeAfter, errs }, null, 2));
log('errors:', errs.length);
await browser.close();
