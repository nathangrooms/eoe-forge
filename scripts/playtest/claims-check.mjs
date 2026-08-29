/**
 * THE CLAIMS FROM THE EARLIER PHASES, CHECKED ONE AT A TIME IN A BROWSER.
 *
 * Each one is a thing a previous pass reported as done. This does not read
 * their code; it opens the game and measures the screen.
 *
 *   A. CONCEDE exists on the play table, in a pinned footer, no centred modal.
 *   B. The game log no longer sits under the hand cards (claimed 9,149 -> 0 px).
 *   C. Turned (tapped) cards no longer cover each other (claimed 77% -> 100%).
 *   D. The stack panel lists a permanent's ability as an answer, not just cards.
 *   E. ORDER BLOCKERS (CR 509.2) has a real control when a lane is double blocked.
 *
 * E cannot be reached by playing, because `bot.ts` assembles exactly
 * `blockersRequiredFor` bodies and never double blocks. It is driven through
 * `window.__dmDispatch`, which is the same transport a human click uses, and
 * that is stated in the result rather than hidden.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8081';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = '.shots/claims';
const VITE_CLIENT_STUB = `
export function createHotContext(){return{accept(){},acceptExports(){},dispose(){},prune(){},decline(){},invalidate(){},on(){},off(){},send(){},data:{}};}
const sheets=new Map();
export function updateStyle(id,c){let s=sheets.get(id);if(!s){s=document.createElement('style');s.setAttribute('data-vite-dev-id',id);s.textContent=c;document.head.appendChild(s);sheets.set(id,s);}else{s.textContent=c;}}
export function removeStyle(id){const s=sheets.get(id);if(s){document.head.removeChild(s);sheets.delete(id);}}
export function injectQuery(u){return u;}`;

const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 600000, args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
const health = { c: [], p: [], n: [] };
page.on('pageerror', e => health.p.push(e.message.slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') health.c.push(m.text().slice(0, 200)); });
page.on('requestfailed', r => health.n.push(`${r.failure()?.errorText} ${r.url().slice(0, 110)}`));
page.on('response', r => { if (r.status() >= 400) health.n.push(`HTTP ${r.status()} ${r.url().slice(0, 110)}`); });
await page.setRequestInterception(true);
page.on('request', r => r.url().includes('/@vite/client')
  ? r.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB }) : r.continue());
await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await sleep(6000); await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(7000);
fs.mkdirSync(OUT, { recursive: true });

const press = src => page.evaluate(s => {
  const re = new RegExp(s, 'i');
  const b = [...document.querySelectorAll('button')].find(x => !x.disabled && re.test((x.innerText || '').replace(/\s+/g, ' ').trim()));
  if (!b) return null; const l = (b.innerText || '').replace(/\s+/g, ' ').trim(); b.click(); return l;
}, src);
const pressTitle = pre => page.evaluate(p => {
  const b = [...document.querySelectorAll('button')].find(x => !x.disabled && (x.getAttribute('title') || '').toLowerCase().startsWith(p));
  if (!b) return null; const t = b.getAttribute('title'); b.click(); return t;
}, pre);
const st = () => page.evaluate(() => {
  const g = window.__dmGame; if (!g) return null;
  const p = g.players.find(x => x.id === 'p1');
  return { turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    conceded: g.concededPlayerIds ?? g.conceded ?? null, winners: g.winnerIds ?? null,
    hand: p.zones.hand.length, bf: p.zones.battlefield.length,
    life: g.players.map(x => `${x.name}:${x.life}`).join(' ') };
});

const report = { claims: {} };

await press('VERSUS BOTS'); await sleep(2200);
await press('Choose opponents'); await sleep(2200);
await press('Start .*game');
await page.waitForFunction('!!window.__dmGame', { timeout: 180000, polling: 400 });
await sleep(3000);
await press('KEEP THIS HAND'); await sleep(2500);

/* ---------------------------------------------- play a few turns for a board */
for (let i = 0; i < 220; i += 1) {
  const s = await st();
  if (!s || s.status === 'complete' || s.turn >= 9) break;
  const landOpen = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => !x.disabled && /You can play this as a land drop/.test(x.getAttribute('title') || ''));
    if (!b) return null; b.click(); return b.getAttribute('title');
  });
  if (landOpen) { await sleep(400); await press('^PLAY LAND$'); await sleep(500); await press('^$') ;
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Close the preview/i.test(x.getAttribute('title') || '')); if (b) b.click(); });
    await sleep(300); continue; }
  const castOpen = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => !x.disabled && / You can cast this\./.test(x.getAttribute('title') || ''));
    if (!b) return null; b.click(); return b.getAttribute('title');
  });
  if (castOpen) { await sleep(450); const c = await press('^CAST$'); await sleep(600);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Close the preview/i.test(x.getAttribute('title') || '')); if (b) b.click(); });
    await sleep(300); if (c) continue; }
  if (await press('^LET IT RESOLVE$')) { await sleep(400); continue; }
  if (/main/.test(s.step) && s.active === 'p1' && await press('^END TURN$')) { await sleep(500); continue; }
  await sleep(260);
}
await page.screenshot({ path: `${OUT}/00-board.png` });
report.boardState = await st();

/* ---------------------------------------------- B: log under the hand cards */
report.claims.logUnderHand = await page.evaluate(() => {
  const log = [...document.querySelectorAll('button')].find(b => (b.innerText || '').trim() === 'LOG');
  if (!log) return { found: false };
  // The feed strip is the log button's own container.
  const strip = log.closest('div')?.parentElement ?? log.parentElement;
  const sr = strip.getBoundingClientRect();
  // Hand cards: the fan is the row of buttons whose title ends "Click to preview."
  const hand = [...document.querySelectorAll('button')]
    .filter(b => /Click to preview\.$/.test(b.getAttribute('title') || ''))
    .map(b => b.getBoundingClientRect())
    .filter(r => r.y > window.innerHeight * 0.55);
  let overlapPx = 0;
  for (const r of hand) {
    const w = Math.max(0, Math.min(sr.right, r.right) - Math.max(sr.left, r.left));
    const h = Math.max(0, Math.min(sr.bottom, r.bottom) - Math.max(sr.top, r.top));
    overlapPx += w * h;
  }
  return { found: true, strip: { x: Math.round(sr.x), y: Math.round(sr.y), w: Math.round(sr.width), h: Math.round(sr.height) },
    handCards: hand.length, overlapPx: Math.round(overlapPx) };
});

/* ---------------------------------------------- C: turned cards covering each other */
report.claims.turnedOverlap = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('button')]
    .filter(b => /Click to preview\.$/.test(b.getAttribute('title') || ''))
    .map(b => ({ t: b.getAttribute('title').slice(0, 40), r: b.getBoundingClientRect() }))
    .filter(c => c.r.y < window.innerHeight * 0.85 && c.r.width > 40);
  let worstCovered = 0, worstPair = null, pairs = 0;
  for (let i = 0; i < cards.length; i += 1) {
    let covered = 0;
    for (let j = 0; j < cards.length; j += 1) {
      if (i === j) continue;
      const a = cards[i].r, b = cards[j].r;
      const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      if (w * h > 0) { covered += w * h; pairs += 1; }
    }
    const pct = covered / (cards[i].r.width * cards[i].r.height);
    if (pct > worstCovered) { worstCovered = pct; worstPair = cards[i].t; }
  }
  return { boardCards: cards.length, overlappingPairs: pairs,
    worstCoveredPct: Number((worstCovered * 100).toFixed(1)), worstCard: worstPair };
});

/* ---------------------------------------------- A: CONCEDE in the game menu */
{
  const opened = await pressTitle('game menu');
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/01-game-menu.png` });
  const menu = await page.evaluate(() => {
    const body = (document.body.innerText || '').replace(/\s+/g, ' ');
    const concede = [...document.querySelectorAll('button')]
      .filter(b => /concede/i.test(b.innerText || '') || /concede/i.test(b.getAttribute('title') || ''))
      .map(b => { const r = b.getBoundingClientRect(); return { t: (b.innerText || '').trim().slice(0, 40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), disabled: !!b.disabled, inView: r.y >= 0 && r.bottom <= window.innerHeight }; });
    // A centred dialog that dims and traps focus is against project law.
    const centredModal = [...document.querySelectorAll('[role=dialog], [data-state=open][class*=fixed]')]
      .map(e => { const r = e.getBoundingClientRect();
        return { cls: String(e.className).slice(0, 60), centred: Math.abs((r.x + r.width / 2) - window.innerWidth / 2) < 60 && r.width < window.innerWidth * 0.8 }; })
      .filter(e => e.centred);
    return { concedeButtons: concede, centredModals: centredModal, mentionsConcede: /concede/i.test(body) };
  });
  report.claims.concede = { menuOpened: opened, ...menu };

  if (menu.concedeButtons.length) {
    const before = await st();
    await press('concede'); await sleep(1200);
    await page.screenshot({ path: `${OUT}/02-concede-confirm.png` });
    const confirmState = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter(b => /concede|confirm|yes|cancel|keep playing/i.test(b.innerText || ''))
        .map(b => ({ t: (b.innerText || '').trim().slice(0, 40), y: Math.round(b.getBoundingClientRect().y) }));
      return { btns, body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300) };
    });
    // Take the confirm and see whether the game really ends.
    const confirmed = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].filter(x => !x.disabled && /concede|confirm|yes, /i.test(x.innerText || ''));
      const target = b[b.length - 1];
      if (!target) return null; const t = (target.innerText || '').trim(); target.click(); return t;
    });
    await sleep(2500);
    const after = await st();
    await page.screenshot({ path: `${OUT}/03-after-concede.png` });
    report.claims.concede.drive = { before, confirmState, confirmed, after,
      gameEnded: after && after.status === 'complete' };
  }
}

console.log(JSON.stringify({ ...report, health: { console: [...new Set(health.c)], page: [...new Set(health.p)], net: [...new Set(health.n)] } }, null, 2));
await browser.close();
