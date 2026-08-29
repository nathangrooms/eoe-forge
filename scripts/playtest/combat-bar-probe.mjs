/**
 * ONE EXPERIMENT, RUN ON A REAL GAME IN A REAL BROWSER.
 *
 * At the declare-blockers stop, with a block already declared, the screen shows
 * TWO controls that both say "declare blockers":
 *
 *   the loudest control on the page, top right   DECLARE BLOCKERS
 *   the combat bar in the middle of the table    CONFIRM 1 BLOCK
 *
 * The question is what each one does. Nothing is asserted from reading the
 * code: the probe reads `window.__dmGame` before and after each press and
 * prints the pair, so the answer is a measurement.
 *
 * The same experiment runs for declare attackers.
 *
 * Run:  node scripts/playtest/combat-bar-probe.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8081';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = '.shots/combatbar';
const VITE_CLIENT_STUB = `
export function createHotContext(){return{accept(){},acceptExports(){},dispose(){},prune(){},decline(){},invalidate(){},on(){},off(){},send(){},data:{}};}
const sheets=new Map();
export function updateStyle(id,c){let s=sheets.get(id);if(!s){s=document.createElement('style');s.setAttribute('data-vite-dev-id',id);s.textContent=c;document.head.appendChild(s);sheets.set(id,s);}else{s.textContent=c;}}
export function removeStyle(id){const s=sheets.get(id);if(s){document.head.removeChild(s);sheets.delete(id);}}
export function injectQuery(u){return u;}`;

const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 600000, args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => errs.push('PAGE ' + e.message.slice(0, 220)));
page.on('console', m => { if (m.type() === 'error') errs.push('CON ' + m.text().slice(0, 220)); });
await page.setRequestInterception(true);
page.on('request', r => r.url().includes('/@vite/client')
  ? r.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB }) : r.continue());
await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await sleep(6000); await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(7000);
fs.mkdirSync(OUT, { recursive: true });

const byText = t0 => page.evaluate(t => {
  const b = [...document.querySelectorAll('button')].find(x => !x.disabled && (x.innerText || '').replace(/\s+/g, ' ').trim().toUpperCase() === t.toUpperCase());
  if (!b) return null; b.click(); return t;
}, t0);
const byTextRe = src => page.evaluate(s => {
  const re = new RegExp(s, 'i');
  const b = [...document.querySelectorAll('button')].find(x => !x.disabled && re.test((x.innerText || '').replace(/\s+/g, ' ').trim()));
  if (!b) return null; const l = (b.innerText || '').replace(/\s+/g, ' ').trim(); b.click(); return l;
}, src);
const byTitlePrefix = pre => page.evaluate(p => {
  const b = [...document.querySelectorAll('button')].find(x => !x.disabled && (x.getAttribute('title') || '').toLowerCase().startsWith(p));
  if (!b) return null; const t = b.getAttribute('title'); b.click(); return t;
}, pre);
const titlesStarting = pre => page.evaluate(p => [...document.querySelectorAll('button')]
  .filter(x => !x.disabled && (x.getAttribute('title') || '').toLowerCase().startsWith(p))
  .map(x => x.getAttribute('title')), pre);

const st = () => page.evaluate(() => {
  const g = window.__dmGame; if (!g) return null;
  const p = g.players.find(x => x.id === 'p1');
  return { turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    blocks: (g.combat?.attackers || []).reduce((n, d) => n + d.blockedBy.length, 0),
    attackers: (g.combat?.attackers || []).length,
    life: g.players.map(x => `${x.name}:${x.life}`).join(' '),
    hand: p.zones.hand.length, bf: p.zones.battlefield.length };
});
const buttons = () => page.evaluate(() => [...document.querySelectorAll('button')]
  .filter(b => { const r = b.getBoundingClientRect(); return r.width > 4 && r.height > 4 && !b.disabled; })
  .map(b => ({ t: (b.innerText || '').replace(/\s+/g, ' ').trim(), ti: (b.getAttribute('title') || '').slice(0, 60),
               y: Math.round(b.getBoundingClientRect().y) }))
  .filter(b => b.t.length > 2));

// -------------------------------------------------------------- get to a game
await byTextRe('VERSUS BOTS'); await sleep(2000);
await byTextRe('Choose opponents'); await sleep(2000);
await byTextRe('Start .*game');
await page.waitForFunction('!!window.__dmGame', { timeout: 180000, polling: 400 });
await sleep(3000);
await byTextRe('KEEP THIS HAND'); await sleep(2000);
console.log('game started:', JSON.stringify(await st()));

// ----------------------------------------------------- play until each stop
const experiments = { blockers: null, attackers: null };

for (let i = 0; i < 900 && (!experiments.blockers || !experiments.attackers); i++) {
  const s = await st();
  if (!s || s.status === 'complete') { console.log('game over at pass', i, JSON.stringify(s)); break; }
  if (i % 20 === 0) console.log('pass', i, JSON.stringify(s));

  // ---- the blockers experiment
  if (!experiments.blockers && s.step === 'declare_blockers' && s.active !== 'p1') {
    const shields = await titlesStarting('block with ');
    if (shields.length) {
      await page.screenshot({ path: `${OUT}/00-blockers-before.png` });
      const declared = await byTitlePrefix('block with ');
      await sleep(900);
      const afterToggle = await st();
      const bar = await buttons();
      await page.screenshot({ path: `${OUT}/01-blockers-one-declared.png` });

      const before = await st();
      const pressedHud = await byText('DECLARE BLOCKERS');
      await sleep(1600);
      const afterHud = await st();
      await page.screenshot({ path: `${OUT}/02-after-hud-declare-blockers.png` });

      const confirmLabel = (await buttons()).find(b => /^CONFIRM \d+ BLOCK/i.test(b.t));
      const pressedBar = confirmLabel ? await byText(confirmLabel.t) : null;
      await sleep(1600);
      const afterBar = await st();
      await page.screenshot({ path: `${OUT}/03-after-combatbar-confirm.png` });

      experiments.blockers = {
        shieldsOffered: shields, declared, afterToggle,
        buttonsOnScreen: bar.map(b => `${b.t} @y${b.y}`),
        hudPress: { pressed: pressedHud, before, after: afterHud, changed: JSON.stringify(before) !== JSON.stringify(afterHud) },
        barPress: { pressed: pressedBar, before: afterHud, after: afterBar, changed: JSON.stringify(afterHud) !== JSON.stringify(afterBar) },
      };
      continue;
    }
  }

  // ---- the attackers experiment
  if (!experiments.attackers && s.step === 'declare_attackers' && s.active === 'p1') {
    const swords = await titlesStarting('attack with ');
    if (swords.length) {
      await page.screenshot({ path: `${OUT}/10-attackers-before.png` });
      const declared = await byTitlePrefix('attack with ');
      await sleep(900);
      const afterToggle = await st();
      const bar = await buttons();
      await page.screenshot({ path: `${OUT}/11-attackers-one-declared.png` });

      const before = await st();
      const pressedHud = await byText('DECLARE ATTACKERS');
      await sleep(1600);
      const afterHud = await st();
      await page.screenshot({ path: `${OUT}/12-after-hud-declare-attackers.png` });

      const barLabel = (await buttons()).find(b => /^ATTACK WITH \d+/i.test(b.t));
      const pressedBar = barLabel ? await byText(barLabel.t) : null;
      await sleep(1600);
      const afterBar = await st();
      await page.screenshot({ path: `${OUT}/13-after-combatbar-attack.png` });

      experiments.attackers = {
        swordsOffered: swords, declared, afterToggle,
        buttonsOnScreen: bar.map(b => `${b.t} @y${b.y}`),
        hudPress: { pressed: pressedHud, before, after: afterHud, changed: JSON.stringify(before) !== JSON.stringify(afterHud) },
        barPress: { pressed: pressedBar, before: afterHud, after: afterBar, changed: JSON.stringify(afterHud) !== JSON.stringify(afterBar) },
      };
      continue;
    }
  }

  // ---- otherwise just play: land, a creature, into combat, end the turn
  const played = await byTitlePrefix('play ') ;
  if (!played) {
    const opened = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => !x.disabled && /You can play this as a land drop/.test(x.getAttribute('title') || ''));
      if (!b) return null; b.click(); return b.getAttribute('title');
    });
    if (opened) { await sleep(400); await byText('PLAY LAND'); await sleep(500);
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Close the preview/i.test(x.getAttribute('title') || '')); if (b) b.click(); });
      await sleep(300); continue; }
  } else { await sleep(400); continue; }

  const castOpen = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => !x.disabled && /^[^.]+\. You can cast this\./.test(x.getAttribute('title') || ''));
    if (!b) return null; b.click(); return b.getAttribute('title');
  });
  if (castOpen) {
    await sleep(450);
    const cast = await byText('CAST');
    await sleep(600);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Close the preview/i.test(x.getAttribute('title') || '')); if (b) b.click(); });
    await sleep(300);
    if (cast) continue;
  }

  if (s.step === 'precombat_main' && s.active === 'p1' && await byText('ATTACK')) { await sleep(700); continue; }
  if (/main/.test(s.step) && await byText('END TURN')) { await sleep(600); continue; }
  if (await byTextRe('^LET IT RESOLVE$')) { await sleep(500); continue; }
  if (await byTextRe('^NO BLOCKS$')) { await sleep(500); continue; }
  await sleep(350);
}

console.log('\n===== RESULT =====');
console.log(JSON.stringify(experiments, null, 2));
console.log('\nERRORS:', JSON.stringify(errs.slice(0, 8)));
await browser.close();
