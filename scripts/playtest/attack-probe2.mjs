/**
 * The decisive attack test.
 *
 * PlayHUD renders an ATTACK button gated on canReachCombat, with a Swords icon
 * and the word "Attack" — and NO title attribute, which is exactly why the
 * previous probe (which matched on title) reported no attack control and made
 * it look like the human could not swing. Match on the visible word instead,
 * press it, and watch the BOT's life, not mine.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
fs.mkdirSync('.shots/attack2', { recursive: true });
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
  return { turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    myCreatures: p.zones.battlefield.map(i => g.cards[i]).filter(c => /Creature/i.test(c.typeLine || '')).map(c => c.name),
    life: Object.fromEntries(g.players.map(x => [x.name, x.life])) }; });
const hasAttackBtn = () => page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^Attack$/i.test((x.innerText || '').trim()));
  return b ? { found: true, disabled: b.disabled, y: Math.round(b.getBoundingClientRect().y) } : { found: false }; });

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

/* Get creatures down and STOP on my own turn, on a turn where they can
   actually swing. A creature that arrived this turn is summoning sick, so the
   ATTACK button is correctly absent on turn one and looking only there proves
   nothing. */
for (let i = 0; i < 40; i++) {
  let g = await game();
  if (g.status !== 'playing') break;
  /* The opponent's turn still stops for ME whenever something is on the stack.
     Sleeping through it just deadlocks the probe, which is what made the last
     two runs look like the turn never came back. */
  if (g.active !== 'p1') {
    await pressTitle('Close the preview');
    if (!(await press(/^(LET IT RESOLVE|NO BLOCKS|NO ATTACKS)$/))) await press(/^RESPOND$/);
    await sleep(1800);
    continue;
  }
  {
    const atk0 = await hasAttackBtn();
    if (g.myCreatures.length && atk0.found) {
      log(`T${g.turn} ${g.step} active=p1 creatures=${JSON.stringify(g.myCreatures)} ATTACK: ${JSON.stringify(atk0)}`);
      break;
    }
  }
  const titles = await handTitles();
  const l = titles.find(t => t.includes('land drop'));
  if (l) { await clickHand(l); await sleep(400); await press(/^Play land$/); await sleep(600); }
  for (const t of titles.filter(x => !x.includes('land drop')).slice(0, 4)) {
    await clickHand(t); await sleep(400);
    if (await press(/^Cast$/)) { await sleep(800); await press(/^LET IT RESOLVE$/); await sleep(800); }
    await pressTitle('Close the preview'); await sleep(200);
  }
  g = await game();
  const atk = await hasAttackBtn();
  log(`T${g.turn} ${g.step} active=${g.active} creatures=${JSON.stringify(g.myCreatures)} ATTACK button: ${JSON.stringify(atk)}`);
  /* Creatures have summoning sickness the turn they land, so swing next turn. */
  if (g.myCreatures.length && atk.found) break;
  await press(/^END TURN$/); await sleep(7000);
}

await page.screenshot({ path: '.shots/attack2/before-attack.png' });
const before = await game();
log('\nbefore attack:', JSON.stringify(before));
log('ATTACK button present:', JSON.stringify(await hasAttackBtn()));

log('pressed ATTACK:', await press(/^Attack$/));
await sleep(1800);
await page.screenshot({ path: '.shots/attack2/combat-bar.png' });
const mid = await game();
log('after ATTACK press:', JSON.stringify(mid));
const bar = await page.evaluate(() => [...document.querySelectorAll('button')]
  .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && !b.disabled; })
  .map(b => (b.innerText || '').trim()).filter(Boolean).slice(0, 24));
log('controls now:', JSON.stringify(bar));

/* Pick attackers: the combat view marks each creature swingable. */
const swung = await page.evaluate(() => {
  const out = [];
  for (const b of document.querySelectorAll('button[title]')) {
    const t = b.getAttribute('title') || '';
    if (/^(Attack with|Send |Swing )/i.test(t) || /attacks?$/i.test(t)) { b.click(); out.push(t.slice(0, 40)); }
  }
  return out; });
log('creature attack toggles clicked:', JSON.stringify(swung));
await sleep(900);
await page.screenshot({ path: '.shots/attack2/attackers-chosen.png' });

log('confirm:', await press(/^Attack with \d+$/));
await sleep(1500);
await page.screenshot({ path: '.shots/attack2/after-confirm.png' });
for (let i = 0; i < 10; i++) {
  const g = await game();
  if (g.active !== 'p1') break;
  await press(/^(NEXT|No blocks|NO BLOCKS|LET IT RESOLVE|END TURN)$/);
  await sleep(1400);
}
const after = await game();
log('\nbefore life:', JSON.stringify(before.life));
log('after  life:', JSON.stringify(after.life));
log('BOT TOOK DAMAGE:', JSON.stringify(before.life) !== JSON.stringify(after.life));
fs.writeFileSync('.shots/attack2/attack2.json', JSON.stringify({ before, mid, after, bar, swung, errs }, null, 2));
log('errors:', errs.length);
await browser.close();
