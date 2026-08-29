/**
 * CR 509.2, ORDER THE BLOCKERS: is there a control on screen, and does it work?
 *
 * The previous phase added `ORDER_BLOCKERS`, `lanesNeedingDamageOrder`, a
 * 'damage-order' stop and `OrderBlockersBar`, and reported it working. It could
 * not be reached by playing, and neither could I: over six complete browser
 * games the human seat never once controlled two untapped, ready creatures
 * before dying, because `bot.ts` also never double blocks.
 *
 * So the board is built with controls that SHIP: the card preview's own
 * "To battlefield" button, which is the manual move every card carries, pressed
 * as a person presses it. The attack and the double block are then sent through
 * `window.__dmDispatch` — the same transport a click uses — because no bot will
 * produce them. Every press AFTER that point is a real click on a real button,
 * and the result says which is which.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8081';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = '.shots/order-blockers';
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
const closePreview = () => page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Close the preview/i.test(x.getAttribute('title') || ''));
  if (!b) return null; b.click(); return true;
});
const st = () => page.evaluate(() => {
  const g = window.__dmGame; if (!g) return null;
  const me = g.players.find(p => p.id === 'p1');
  return { turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    creatures: me.zones.battlefield.map(i => g.cards[i]).filter(c => c && /Creature/.test(c.typeLine || '')).map(c => `${c.name}${c.tapped ? '(T)' : ''}${c.summoningSick ? '(sick)' : ''}`),
    handCreatures: me.zones.hand.map(i => g.cards[i]).filter(c => c && /Creature/.test(c.typeLine || '')).map(c => c.name),
    life: g.players.map(x => `${x.name}:${x.life}`).join(' ') };
});

const report = {};
await press('VERSUS BOTS'); await sleep(2200);
await press('Choose opponents'); await sleep(2200);
await press('Start .*game');
await page.waitForFunction('!!window.__dmGame', { timeout: 180000, polling: 400 });
await sleep(3000);
await press('KEEP THIS HAND'); await sleep(2500);

/* Get to a main phase where the manual move is offered. */
for (let i = 0; i < 60; i += 1) {
  const s = await st();
  if (!s || s.status === 'complete') break;
  if (s.step === 'precombat_main' && s.active === 'p1' && s.turn >= 3) break;
  if (/main/.test(s.step) && s.active === 'p1' && await press('^END TURN$')) { await sleep(600); continue; }
  await sleep(300);
}
report.beforeManualMove = await st();

/* Put two creatures on the board with the preview's own "To battlefield". */
const placed = [];
for (const name of (report.beforeManualMove?.handCreatures ?? []).slice(0, 2)) {
  const opened = await page.evaluate(n => {
    const b = [...document.querySelectorAll('button')].find(x => !x.disabled && (x.getAttribute('title') || '').startsWith(n + '.'));
    if (!b) return null; b.click(); return b.getAttribute('title');
  }, name);
  if (!opened) { placed.push(`${name}: no card control`); continue; }
  await sleep(500);
  const moved = await press('^To battlefield$');
  placed.push(`${name}: ${moved ?? 'NO "To battlefield" BUTTON'}`);
  await sleep(600); await closePreview(); await sleep(300);
}
report.manualMove = { placed, after: await st() };
await page.screenshot({ path: `${OUT}/00-two-creatures.png` });

/* Pass a turn so summoning sickness clears. */
for (let i = 0; i < 80; i += 1) {
  const s = await st();
  if (!s || s.status === 'complete') break;
  if (s.turn > (report.manualMove.after?.turn ?? 0) + 1 && s.active === 'p1' && s.step === 'precombat_main') break;
  if (await press('^LET IT RESOLVE$')) { await sleep(400); continue; }
  if (await press('^NO BLOCKS$')) { await sleep(400); continue; }
  if (/main/.test(s.step) && s.active === 'p1' && await press('^END TURN$')) { await sleep(600); continue; }
  await sleep(300);
}
report.beforeLane = await st();

/* The double block. Sent through the transport, and said so. */
/*
 * CR 509.2 belongs to the ATTACKING player, so the human only owes it when the
 * human ATTACKED and the opponent put two bodies in front of one creature.
 * That means: swing with a real press, reach declare_blockers, and only the
 * opponent's double block is synthetic.
 */
/*
 * The surface walks declare_blockers in 130 ms when nothing is owed, so a
 * dispatch sent from node loses that race every time: the first attempt landed
 * in postcombat_main and reported "step is postcombat_main". The watcher is
 * therefore armed INSIDE the page and fires on the same tick the step arrives.
 */
await page.evaluate(() => {
  window.__orderProbe = { fired: null };
  const tick = () => {
    const g = window.__dmGame, d = window.__dmDispatch;
    if (g && d && g.step === 'declare_blockers' && !window.__orderProbe.fired) {
      const lane = g.combat.attackers[0];
      const them = g.players.find(p => p.id === 'p2');
      const bodies = them.zones.battlefield.map(i => g.cards[i])
        .filter(c => c && /Creature/.test(c.typeLine || '') && !c.tapped);
      if (lane && bodies.length >= 2) {
        window.__orderProbe.fired = { attacker: g.cards[lane.attackerId]?.name, blockers: bodies.slice(0, 2).map(c => c.name) };
        d([{ type: 'BLOCK', at: Date.now(),
             blocks: bodies.slice(0, 2).map(c => ({ blockerId: c.instanceId, attackerId: lane.attackerId })) }]);
      } else if (lane) {
        window.__orderProbe.fired = { skipped: true, attacker: g.cards[lane.attackerId]?.name,
          untappedOpponentCreatures: bodies.map(c => c.name) };
      }
    }
    window.__orderProbeTimer = setTimeout(tick, 16);
  };
  tick();
});

await press('^ATTACK$'); await sleep(1500);
const swung = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => !x.disabled && (x.getAttribute('title') || '').toLowerCase().startsWith('attack with '));
  if (!b) return null; const t = b.getAttribute('title'); b.click(); return t;
});
await sleep(700);
const confirmed = await press('^ATTACK WITH \\d+$');
await sleep(1800);
report.swing = { swung, confirmed, state: await st() };
await page.screenshot({ path: `${OUT}/01-attack-declared.png` });

report.laneSetup = await page.evaluate(() => {
  clearTimeout(window.__orderProbeTimer);
  const f = window.__orderProbe?.fired ?? null;
  return f && !f.skipped ? { ok: true, ...f } : { ok: false, why: 'the watcher saw', fired: f, step: window.__dmGame?.step };
});
if (report.laneSetup.ok) {
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/01-double-blocked.png` });

  report.lane = await page.evaluate(async () => {
    const g = window.__dmGame;
    const G = await import('/src/lib/game/index.ts');
    const FLOW = await import('/src/components/play/turnFlow.ts');
    const controls = [...document.querySelectorAll('button')]
      .filter(b => { const r = b.getBoundingClientRect(); return r.width > 8 && r.height > 8 && !b.disabled; })
      .map(b => ({ t: (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50), ti: (b.getAttribute('title') || '').slice(0, 80), y: Math.round(b.getBoundingClientRect().y) }))
      .filter(b => b.t || b.ti);
    return {
      step: g.step,
      lanes: g.combat.attackers.map(d => ({ attacker: g.cards[d.attackerId]?.name, blockedBy: d.blockedBy.map(i => g.cards[i]?.name) })),
      lanesNeedingOrder: (G.lanesNeedingDamageOrder(g, 'p2') || []).length,
      decisionForAttacker: FLOW.decisionFor(g, 'p2') ?? null,
      decisionForDefender: FLOW.decisionFor(g, 'p1') ?? null,
      bodyMentionsOrder: /order|first|damage order/i.test(document.body.innerText || ''),
      orderControls: controls.filter(c => /order|promote|first|damage/i.test(c.t + ' ' + c.ti)),
      allControls: controls.map(c => `${c.t || '(icon)'} | ${c.ti} @y${c.y}`),
    };
  });
}

/* Same experiment as the two combat declarations: does the loudest control on
   the page move the game, or is DAMAGE ORDER another dead press? */
if (report.lane) {
  const key = () => page.evaluate(() => {
    const g = window.__dmGame;
    return `${g.turn}/${g.step}/${g.players.map(p => p.name + ':' + p.life).join(' ')}/${(g.combat.attackers[0]?.blockedBy || []).join(',')}`;
  });
  await page.screenshot({ path: `${OUT}/02-damage-order-bar.png` });
  const before = await key();
  const pressedHud = await press('^DAMAGE ORDER$');
  await sleep(1600);
  const afterHud = await key();
  await page.screenshot({ path: `${OUT}/03-after-hud-damage-order.png` });

  // Promote the second blocker with a real click, then deal damage.
  const promoted = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => !x.disabled && /^Assign damage to /i.test(x.getAttribute('title') || ''));
    if (!b) return null; const t = b.getAttribute('title'); b.click(); return t;
  });
  await sleep(900);
  const orderAfterPromote = await page.evaluate(() => {
    const g = window.__dmGame;
    return (g.combat.attackers[0]?.blockedBy || []).map(i => g.cards[i]?.name);
  });
  const dealt = await press('^DEAL DAMAGE$');
  await sleep(2000);
  const afterBar = await key();
  await page.screenshot({ path: `${OUT}/04-after-deal-damage.png` });
  report.damageOrderExperiment = {
    hud: { pressed: pressedHud, before, after: afterHud, movedTheGame: before !== afterHud },
    promoted, orderAfterPromote,
    bar: { pressed: dealt, before: afterHud, after: afterBar, movedTheGame: afterHud !== afterBar },
    graveyard: await page.evaluate(() => {
      const g = window.__dmGame;
      return g.players.map(p => `${p.name} graveyard: ${p.zones.graveyard.map(i => g.cards[i]?.name).join(', ')}`);
    }),
  };
}

console.log(JSON.stringify({ ...report, health: { console: [...new Set(health.c)], page: [...new Set(health.p)], net: [...new Set(health.n)] } }, null, 2));
await browser.close();
