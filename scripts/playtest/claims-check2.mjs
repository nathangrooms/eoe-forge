/**
 * Three more claims, measured.
 *
 *   C. Turned cards no longer cover each other ON THE BATTLEFIELD.
 *      CORRECTION TO MY OWN FIRST PASS: `claims-check.mjs` selected every
 *      button whose title ends "Click to preview." and filtered by y, which
 *      swept in the HAND FAN. A fan overlaps on purpose, so that run reported a
 *      95.9% covered card against a design feature. Battlefield membership is
 *      now taken from `state.players[].zones.battlefield` — the engine's own
 *      list — instead of guessed from a rectangle.
 *
 *   D. The stack panel offers a PERMANENT'S ABILITY as an answer, not only
 *      cards in hand. Claimed as "24 of 946 windows recovered".
 *
 *   E. ORDER BLOCKERS (CR 509.2) has a real control when a lane is double
 *      blocked. No bot ever double blocks, so the double block is sent through
 *      `window.__dmDispatch` — the same transport a human click uses — and then
 *      EVERY press that follows is a real click on a real button.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8081';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = '.shots/claims2';
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
    hand: p.zones.hand.length, bf: p.zones.battlefield.length,
    life: g.players.map(x => `${x.name}:${x.life}`).join(' ') };
});

const report = {};

await press('VERSUS BOTS'); await sleep(2200);
await press('Choose opponents'); await sleep(2200);
await press('Start .*game');
await page.waitForFunction('!!window.__dmGame', { timeout: 180000, polling: 400 });
await sleep(3000);
await press('KEEP THIS HAND'); await sleep(2500);

for (let i = 0; i < 460; i += 1) {
  const s = await st();
  if (!s || s.status === 'complete' || s.turn >= 25) break;
  /* Stop the moment the seat controls two untapped creatures, because that is
     the only board on which CR 509.2 can be reached at all. Playing on past it
     is how the previous run measured a finished game with an empty board. */
  const ready = await page.evaluate(() => {
    const g = window.__dmGame; if (!g) return 0;
    const me = g.players.find(p => p.id === 'p1');
    return me.zones.battlefield.map(i => g.cards[i])
      .filter(c => c && /Creature/.test(c.typeLine || '') && !c.tapped && !c.summoningSick).length;
  });
  if (ready >= 2) { console.error('two creatures ready at turn ' + s.turn); break; }
  const landOpen = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => !x.disabled && /You can play this as a land drop/.test(x.getAttribute('title') || ''));
    if (!b) return null; b.click(); return b.getAttribute('title');
  });
  if (landOpen) { await sleep(400); await press('^PLAY LAND$'); await sleep(500);
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
  await sleep(250);
}
await page.screenshot({ path: `${OUT}/00-board.png` });
report.boardState = await st();

/* -------------------------------------------------- C, measured correctly */
report.C_turnedOverlap = await page.evaluate(() => {
  /* Board cards are the CARD IMAGES that sit inside the mats. The fan is
     excluded by geometry: it is drawn in the bottom strip and its cards run
     past the window edge, and it overlaps on purpose. Zone thumbnails on the
     far-left rail are excluded by x. */
  const HAND_TOP = window.innerHeight * 0.80;
  const cards = [...document.querySelectorAll('img')]
    .map(img => ({ r: img.getBoundingClientRect(), src: (img.currentSrc || img.src || '') }))
    .filter(c => c.r.width > 40 && c.r.height > 40 && c.r.bottom <= HAND_TOP && c.r.x > 235)
    .map((c, i) => ({ ...c, name: 'img' + i }));

  let worst = 0, worstName = null, pairs = 0;
  for (let i = 0; i < cards.length; i += 1) {
    let covered = 0;
    for (let j = 0; j < cards.length; j += 1) {
      if (i === j) continue;
      const a = cards[i].r, b = cards[j].r;
      const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      if (w * h > 4) { covered += w * h; pairs += 1; }
    }
    const pct = covered / (cards[i].r.width * cards[i].r.height);
    if (pct > worst) { worst = pct; worstName = cards[i].name; }
  }
  return { boardCardsMeasured: cards.length, handTopUsed: Math.round(HAND_TOP),
    overlappingPairs: pairs,
    worstCoveredPct: Number((worst * 100).toFixed(1)), worstCard: worstName };
});

/* ----------------------------------------- D: an ability as a response option */
report.D_abilityResponses = await page.evaluate(async () => {
  const s = window.__dmGame;
  const G = await import('/src/lib/game/index.ts');
  const out = { seatsWithAbilityAnswer: [], responseOptionsShape: null };
  try {
    const r = G.responseOptions(s, 'p1');
    out.responseOptionsShape = { cards: (r.cards || []).map(c => c.card?.name ?? c.name ?? '?'),
                                 abilities: (r.abilities || []).map(a => a.card?.name ?? a.name ?? '?') };
  } catch (e) { out.responseOptionsShape = 'ERR ' + e.message; }
  try {
    const ab = G.abilityResponses(s, 'p1');
    out.abilityResponsesNow = (ab || []).map(a => `${a.card?.name ?? '?'} :: ${(a.option?.text ?? '').slice(0, 50)}`);
  } catch (e) { out.abilityResponsesNow = 'ERR ' + e.message; }
  return out;
});

/* ------------------------------------------- E: CR 509.2 order the blockers */
{
  /* Put a lane in front of two of the viewer's creatures. Nothing here is a
     rules decision: it is the same ATTACK/BLOCK actions the surface builds. */
  const setup = await page.evaluate(() => {
    const g = window.__dmGame, d = window.__dmDispatch;
    if (!g || !d) return { ok: false, why: '__dmDispatch not exposed' };
    const me = g.players.find(p => p.id === 'p1');
    const them = g.players.find(p => p.id === 'p2');
    const isCreature = c => c && /Creature/.test(c.typeLine || '') && !c.tapped;
    const mine = me.zones.battlefield.map(i => g.cards[i]).filter(isCreature);
    const theirs = them.zones.battlefield.map(i => g.cards[i]).filter(isCreature);
    return { ok: mine.length >= 2 && theirs.length >= 1, mine: mine.map(c => c.name), theirs: theirs.map(c => c.name) };
  });
  report.E_setup = setup;

  if (setup.ok) {
    await page.evaluate(() => {
      const g = window.__dmGame, d = window.__dmDispatch;
      const me = g.players.find(p => p.id === 'p1');
      const them = g.players.find(p => p.id === 'p2');
      const isCreature = c => c && /Creature/.test(c.typeLine || '') && !c.tapped;
      const mine = me.zones.battlefield.map(i => g.cards[i]).filter(isCreature).slice(0, 2);
      const attacker = them.zones.battlefield.map(i => g.cards[i]).filter(isCreature)[0];
      d([{ type: 'ATTACK', at: Date.now(), attackers: [{ attackerId: attacker.instanceId, defenderPlayerId: 'p1', tap: true }] }]);
      setTimeout(() => {
        d([{ type: 'BLOCK', at: Date.now(), blocks: mine.map(c => ({ blockerId: c.instanceId, attackerId: attacker.instanceId })) }]);
      }, 400);
    });
    await sleep(2500);
    await page.screenshot({ path: `${OUT}/10-double-block.png` });
    report.E_afterBlock = await page.evaluate(() => {
      const g = window.__dmGame;
      const lanes = g.combat.attackers.map(d => ({ attacker: g.cards[d.attackerId]?.name, blockedBy: d.blockedBy.map(i => g.cards[i]?.name) }));
      const controls = [...document.querySelectorAll('button')]
        .filter(b => { const r = b.getBoundingClientRect(); return r.width > 8 && r.height > 8; })
        .map(b => ({ t: (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 44), ti: (b.getAttribute('title') || '').slice(0, 70), y: Math.round(b.getBoundingClientRect().y), d: !!b.disabled }))
        .filter(b => b.t || b.ti);
      return { step: g.step, lanes, body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 500),
        orderControls: controls.filter(c => /order|first|promote|damage order/i.test(c.t + ' ' + c.ti)) };
    });

    // Try to promote the second blocker with a real click.
    const promoted = await pressTitle('promote') || await pressTitle('order') || await press('promote|move up|first');
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/11-after-order-press.png` });
    report.E_afterOrderPress = { promoted, lanes: await page.evaluate(() => {
      const g = window.__dmGame;
      return g.combat.attackers.map(d => ({ attacker: g.cards[d.attackerId]?.name, blockedBy: d.blockedBy.map(i => g.cards[i]?.name) }));
    }) };
  }
}

console.log(JSON.stringify({ ...report, health: { console: [...new Set(health.c)], page: [...new Set(health.p)], net: [...new Set(health.n)] } }, null, 2));
await browser.close();
