/**
 * COMBAT, CAUGHT RATHER THAN SKIPPED PAST.
 *
 * The earlier probes drove with END TURN, which walks straight through the
 * combat steps, so they proved nothing about blocking. This one polls fast and
 * STOPS the moment a combat step appears, before pressing anything, and
 * records what a player is actually offered.
 *
 * It also builds a board for the human seat by playing a land every turn and
 * casting whatever the hand offers, so there is something to attack WITH.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { BASE, sleep, pressText, gameState } from './uiLib.mjs';

const W = 1600, H = 1000, OUT = '.shots/combat';
const VITE_CLIENT_STUB = `
export function createHotContext(){return{accept(){},acceptExports(){},dispose(){},prune(){},decline(){},invalidate(){},on(){},off(){},send(){},data:{}};}
const sheets=new Map();
export function updateStyle(id,c){let s=sheets.get(id);if(!s){s=document.createElement('style');s.setAttribute('data-vite-dev-id',id);s.textContent=c;document.head.appendChild(s);sheets.set(id,s);}else{s.textContent=c;}}
export function removeStyle(id){const s=sheets.get(id);if(s){document.head.removeChild(s);sheets.delete(id);}}
export function injectQuery(u){return u;}`;

const buttons = page => page.evaluate(() => [...new Set(
  [...document.querySelectorAll('button')].filter(b => !b.disabled)
    .map(b => { const r = b.getBoundingClientRect(); return r.height > 12 && r.width > 24
      ? `${(b.innerText || b.getAttribute('title') || '').trim().slice(0, 34)}@${Math.round(r.y)}` : null; })
    .filter(Boolean))].slice(0, 30));

const bodyHead = page => page.evaluate(() => (document.body.innerText || '').replace(/\n+/g, ' | ').slice(0, 320));

/** Click a hand card, then press whatever cast/play control appears. */
async function playFromHand(page) {
  const opened = await page.evaluate(() => {
    const vh = window.innerHeight;
    const cards = [...document.querySelectorAll('button')].filter(b => {
      const r = b.getBoundingClientRect();
      return r.top > vh * 0.72 && r.width > 80 && /^[A-Z]/.test((b.getAttribute('title') || '').trim());
    });
    // prefer something castable; the title says so in plain words
    const castable = cards.find(b => /can play this as a land drop|You can cast/i.test(b.getAttribute('title') || ''));
    const pick = castable || cards[0];
    if (!pick) return null;
    const t = (pick.getAttribute('title') || '').slice(0, 60);
    pick.click();
    return t;
  });
  if (!opened) return null;
  await sleep(700);
  const pressed = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].filter(x => !x.disabled)
      .find(x => /^(PLAY LAND|CAST|PLAY)\b/i.test((x.innerText || '').trim()));
    if (!b) return null; b.click(); return (b.innerText || '').trim();
  });
  await sleep(900);
  // close the panel if it stayed open
  await page.evaluate(() => {
    const x = [...document.querySelectorAll('button')].find(b => /Close the preview/i.test(b.getAttribute('title') || ''));
    if (x) x.click();
  });
  await sleep(300);
  return { opened, pressed };
}

const run = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000,
    args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
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

  const seen = {};
  const record = async (key, note) => {
    if (seen[key]) return;
    seen[key] = true;
    const g = await gameState(page);
    const file = `${OUT}/${Object.keys(seen).length.toString().padStart(2, '0')}-${key}.png`;
    await page.screenshot({ path: file });
    console.log(`\n### ${key}  ${note || ''}`);
    console.log('  state   ' + JSON.stringify(g));
    console.log('  buttons ' + JSON.stringify(await buttons(page)));
    console.log('  body    ' + await bodyHead(page));
    console.log('  shot    ' + file);
  };

  let lastTurn = 0;
  for (let i = 0; i < 1200; i++) {
    const g = await gameState(page);
    if (!g) break;
    if (g.status === 'complete') { await record('game-over'); break; }

    // build our own board on our main phases
    if (g.active === 'p1' && g.step === 'precombat_main' && g.turn !== lastTurn) {
      lastTurn = g.turn;
      for (let k = 0; k < 3; k++) { const r = await playFromHand(page); if (!r || !r.pressed) break; }
      const g2 = await gameState(page);
      if (g2 && g2.bf >= 2) await record('our-board-built', `turn ${g2.turn}`);
    }

    if (g.step === 'declare_attackers' && g.active === 'p1') await record('we-declare-attackers');
    if (g.step === 'declare_attackers' && g.active !== 'p1') await record('bot-declares-attackers');
    if (g.step === 'declare_blockers' && g.active !== 'p1') await record('we-declare-blockers', 'we are defending');
    if (g.step === 'declare_blockers' && g.active === 'p1') await record('bot-declares-blockers');
    if (g.step === 'combat_damage') await record('combat-damage');
    if (g.stack > 0) await record('stack-live');

    if (g.turn > 24) break;
    if (Object.keys(seen).length >= 7) break;

    // gentle advance: never press a combat control, so combat is not skipped
    const acted = await page.evaluate(() => {
      const pick = re => [...document.querySelectorAll('button')].filter(b => !b.disabled)
        .find(b => re.test((b.innerText || '').trim()));
      const lets = pick(/^LET IT RESOLVE$/); if (lets) { lets.click(); return 'resolve'; }
      const et = pick(/^(END TURN|NEXT|CONTINUE)$/); if (et) { et.click(); return 'advance'; }
      return null;
    });
    await sleep(acted ? 420 : 260);
  }

  console.log('\n=== SCREENS CAUGHT ===');
  console.log(Object.keys(seen).join(', ') || 'NONE');
  const missing = ['we-declare-attackers', 'we-declare-blockers', 'combat-damage', 'stack-live']
    .filter(k => !seen[k]);
  console.log('=== NOT REACHED IN THIS RUN ===');
  console.log(missing.join(', ') || 'none');
  console.log('\nfinal ' + JSON.stringify(await gameState(page)));
  console.log('\n=== ERRORS ===\n' + ([...new Set(errs)].slice(0, 20).join('\n') || 'none'));
  await browser.close();
};
run().catch(e => { console.error('PROBE FAILED', e); process.exit(1); });
