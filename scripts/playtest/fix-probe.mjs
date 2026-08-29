/**
 * Drive the shipped play page and photograph the three fixes working.
 *
 *   node scripts/playtest/fix-probe.mjs
 *
 * WHAT IT PROVES, in order:
 *   1. CONCEDE   the control exists in the game menu, confirms in place, and
 *                pressing it puts the seat out of the game (`__dmGame` is read
 *                for `players[].conceded` and `status`, not inferred from pixels).
 *   2. ORDER     an attacker blocked by two creatures draws the CR 509.2 strip,
 *                pressing a blocker promotes it, and `combat.attackers[].blockedBy`
 *                changes order in the live state.
 *   3. RESPOND   a permanent that can answer a spell is offered on the stack
 *                strip beside the castable cards.
 *
 * The opponent's double block is sent through `__dmDispatch`, which the hook's
 * own comment describes as "the same transport as every human click" and which
 * exists for exactly this: `bot.ts` assembles only `blockersRequiredFor` bodies
 * and never double-blocks, so a bot game cannot produce the board this strip is
 * for. A human opponent double-blocks with two presses. Said out loud rather
 * than buried, because the block is the one action here that a bot did not take
 * on its own.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = process.env.OUT || '.shots/fixes';
const BASE = process.env.BASE || 'http://127.0.0.1:8081';
fs.mkdirSync(OUT, { recursive: true });

let shotN = 0;
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

const shot = async name => {
  const f = `${OUT}/${String(shotN++).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: f }); log('  shot ->', f); return f;
};
const pressText = re => page.evaluate(src => {
  const el = [...document.querySelectorAll('button')].find(b => !b.disabled && new RegExp(src, 'i').test((b.innerText || '').trim()));
  if (!el) return false; el.click(); return true;
}, re.source);
const pressTitle = n => page.evaluate(n => {
  const el = [...document.querySelectorAll('button')].find(b => (b.getAttribute('title') || '').includes(n));
  if (!el) return false; el.click(); return true;
}, n);
const game = () => page.evaluate(() => {
  const g = window.__dmGame; if (!g) return null;
  return {
    turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    stack: (g.stack || []).length,
    conceded: g.players.filter(p => p.conceded).map(p => p.id),
    lost: g.players.filter(p => p.hasLost).map(p => p.id),
    winners: g.winnerIds,
    lanes: (g.combat.attackers || []).map(d => ({
      attacker: g.cards[d.attackerId]?.name ?? '?',
      blockedBy: d.blockedBy.map(id => g.cards[id]?.name ?? '?'),
    })),
  };
});
const buttons = () => page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map(b => ({ t: (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 46), title: (b.getAttribute('title') || '').slice(0, 60), disabled: b.disabled })));

const findings = {};

/* ------------------------------------------------------------------- run */
log('== open ==');
await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000); await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(6000);

await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /VERSUS BOTS/i.test(x.innerText || '')); if (b) b.click(); });
await sleep(1800);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /seeded|Use this deck|Choose/i.test(x.innerText || ''));
  if (b) b.click();
});
await sleep(1500);
for (let i = 0; i < 6; i++) {
  if (await pressText(/Start .*game/)) break;
  await pressText(/Choose opponents|Continue|Next/);
  await sleep(1000);
}
await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
await sleep(3000);
await pressText(/^Keep$/); await sleep(1500);
log('  game:', JSON.stringify(await game()));

/* ---------------------------------------------- 2. ORDER BLOCKERS (first,
   because conceding ends the game and there is no combat after it) */
log('\n== fix 2: CR 509.2 damage assignment order ==');
// Free cast, so a board arrives quickly and the probe is not a mana simulator.
await pressTitle('Game menu'); await sleep(900);
await pressTitle('Ignore mana entirely'); await sleep(600);
/* Auto-advance OFF. The first run of this probe swung, the walk stepped
   through declare blockers in 130 ms because no block had been declared yet,
   and the double block landed in postcombat main where it meant nothing. The
   step is a real stop once a lane needs an order; it is not a stop while the
   lane is still empty, which is correct and is what this has to work around. */
await pressTitle('Walk through every step that holds no decision'); await sleep(600);
await pressTitle('Close the menu'); await sleep(600);

/* Build the board through the same transport a click uses: two creatures for
   the defender, one attacker for the human, then swing and double block. */
const built = await page.evaluate(() => {
  const g = window.__dmGame; const d = window.__dmDispatch;
  if (!g || !d) return 'no dispatcher';
  const mk = (id, owner, name, power, toughness) => ({
    type: 'CREATE_TOKEN', playerId: owner,
    token: { instanceId: id, name, typeLine: 'Creature — Test', power, toughness },
  });
  d([
    mk('probe-att', 'p1', 'Probe Ogre', '2', '5'),
    mk('probe-b1', 'p2', 'Probe Rat', '1', '1'),
    mk('probe-b2', 'p2', 'Probe Bear', '2', '2'),
  ]);
  return 'built';
});
log('  board:', built);
await sleep(1200);
const tokens = await page.evaluate(() => {
  const g = window.__dmGame;
  return Object.values(g.cards).filter(c => /^Probe /.test(c.name)).map(c => ({ id: c.instanceId, n: c.name, z: c.zone, sick: c.summoningSick }));
});
log('  tokens:', JSON.stringify(tokens));

/* Get to declare attackers on the human's own turn, with the token able to
   swing. Summoning sickness is cleared the same way a haste effect would be. */
await page.evaluate(ids => {
  const d = window.__dmDispatch;
  for (const id of ids) d({ type: 'SET_KEYWORD', instanceId: id, keyword: 'haste', on: true });
}, tokens.filter(t => /Ogre/.test(t.n)).map(t => t.id));
await sleep(800);

for (let i = 0; i < 40; i++) {
  const g = await game();
  if (!g) break;
  if (g.step === 'declare_attackers' && g.active === 'p1') break;
  if (g.active !== 'p1') { await pressTitle("Advance one step"); await sleep(400); continue; }
  if (!(await pressText(/^Attack$/))) { await pressTitle('Advance one step'); }
  await sleep(500);
}
log('  at:', JSON.stringify(await game()));
await shot('declare-attackers');

// Swing with the token.
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Attack with Probe Ogre/i.test(x.getAttribute('title') || ''));
  if (b) b.click();
});
await sleep(900);
await pressText(/^Attack with \d/); await sleep(1500);
log('  after swing:', JSON.stringify(await game()));

// Walk to declare blockers by hand, one step at a time.
for (let i = 0; i < 6; i++) {
  const g = await game();
  if (g && g.step === 'declare_blockers') break;
  await pressTitle('Advance one step'); await sleep(700);
}
log('  at blockers:', JSON.stringify(await game()));

// The opponent double blocks. See the header: no bot does this on its own.
await page.evaluate(() => {
  const g = window.__dmGame; const d = window.__dmDispatch;
  const lane = g.combat.attackers.find(a => g.cards[a.attackerId]?.name === 'Probe Ogre');
  if (!lane) return;
  const rat = Object.values(g.cards).find(c => c.name === 'Probe Rat');
  const bear = Object.values(g.cards).find(c => c.name === 'Probe Bear');
  d({ type: 'BLOCK', blocks: [
    { blockerId: rat.instanceId, attackerId: lane.attackerId },
    { blockerId: bear.instanceId, attackerId: lane.attackerId },
  ] });
});
await sleep(1600);
const beforeOrder = await game();
log('  double blocked:', JSON.stringify(beforeOrder.lanes));
await shot('order-blockers-bar');

/* WHAT THE NEW STRIP COVERS. Defect 6 on the standing list is that the combat
   bar lands on the opponent's identity line; this strip sits in the same band
   and is taller, so the honest thing is to measure the cost rather than to
   claim there is none. */
findings.stripOverlap = await page.evaluate(() => {
  const strip = document.querySelector('[aria-label="Order the blockers"]');
  if (!strip) return { strip: false };
  const s = strip.getBoundingClientRect();
  const hit = [];
  for (const el of document.querySelectorAll('[aria-label], img, p, span')) {
    if (strip.contains(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 30 || r.height < 12) continue;
    const ox = Math.min(s.right, r.right) - Math.max(s.left, r.left);
    const oy = Math.min(s.bottom, r.bottom) - Math.max(s.top, r.top);
    if (ox > 8 && oy > 8) hit.push({
      what: (el.getAttribute('aria-label') || el.getAttribute('alt') || (el.innerText || '')).replace(/\s+/g, ' ').slice(0, 44),
      coveredPx: Math.round(ox * oy),
    });
  }
  hit.sort((a, b) => b.coveredPx - a.coveredPx);
  return {
    strip: { x: Math.round(s.x), y: Math.round(s.y), w: Math.round(s.width), h: Math.round(s.height) },
    covers: hit.slice(0, 8),
  };
});
log('  strip covers:', JSON.stringify(findings.stripOverlap));
findings.orderBarButtons = (await buttons()).filter(b => /Probe|damage first|Deal damage/i.test(b.t + b.title));
log('  strip controls:', JSON.stringify(findings.orderBarButtons));

// Promote the Bear.
const promoted = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Assign damage to Probe Bear first/i.test(x.getAttribute('title') || ''));
  if (!b) return false; b.click(); return true;
});
await sleep(1000);
const afterOrder = await game();
log('  promoted:', promoted, '->', JSON.stringify(afterOrder.lanes));
await shot('order-blockers-promoted');
findings.orderBefore = beforeOrder.lanes;
findings.orderAfter = afterOrder.lanes;

// Deal the damage and see who died. Two presses: the strip's own button ends
// the declare-blockers step, and the combat damage step is where damage lands.
await pressText(/^Deal damage$/); await sleep(1500);
await pressTitle('Advance one step'); await sleep(2000);
await pressTitle('Advance one step'); await sleep(2000);
findings.afterDamage = await page.evaluate(() => {
  const g = window.__dmGame;
  return ['Probe Rat', 'Probe Bear', 'Probe Ogre'].map(n => {
    const c = Object.values(g.cards).find(x => x.name === n);
    return `${n}: ${c ? c.zone : 'gone'}`;
  });
});
log('  after damage:', JSON.stringify(findings.afterDamage));
await shot('after-damage');

/* --------------------------------------------------- 3. RESPOND from board */
log('\n== fix 3: answer a spell with a permanent ==');
/* A permanent of the viewer's with an instant-speed activated ability, and
   something of the opponent's on the stack for it to answer. Both go down the
   same transport a click uses. Before this fix `hasResponse` scanned hand only,
   `decisionFor` returned null and the walk pressed PASS_PRIORITY 130 ms later,
   so this window never reached a person. */
await page.evaluate(() => {
  const d = window.__dmDispatch;
  d({ type: 'CREATE_TOKEN', playerId: 'p1', token: {
    instanceId: 'probe-rod', name: 'Probe Rod', typeLine: 'Artifact',
    oracleText: '{T}: Probe Rod deals 1 damage to any target.' } });
});
await sleep(1200);
await page.evaluate(() => {
  const g = window.__dmGame; const d = window.__dmDispatch;
  const source = Object.values(g.cards).find(c => c.controllerId === 'p2' && c.zone === 'battlefield');
  d({ type: 'PUT_ABILITY_ON_STACK', controllerId: 'p2', name: 'Their ability',
      kind: 'activated', sourceInstanceId: source ? source.instanceId : undefined });
});
await sleep(900);
await page.evaluate(() => window.__dmDispatch({ type: 'PASS_PRIORITY', playerId: 'p2' }));
await sleep(1600);
findings.stackStrip = await page.evaluate(() => {
  const g = window.__dmGame;
  const rod = [...document.querySelectorAll('button')]
    .find(b => /Use an ability of Probe Rod in response/i.test(b.getAttribute('title') || ''));
  return {
    stack: (g.stack || []).length,
    priority: g.priorityPlayerId,
    rodOfferedOnTheStackStrip: !!rod,
    letItResolveStillThere: [...document.querySelectorAll('button')]
      .some(b => /Let it resolve/i.test(b.innerText || '')),
  };
});
log('  stack strip:', JSON.stringify(findings.stackStrip));
await shot('respond-with-a-permanent');

/* ------------------------------------------------------------ 1. CONCEDE */
log('\n== fix 1: concede ==');
await pressTitle('Game menu'); await sleep(1200);
await shot('game-menu-with-concede');
findings.concedeButtonPresent = await page.evaluate(() =>
  [...document.querySelectorAll('button')].some(b => /Concede the game/i.test(b.innerText || '')));
log('  concede control present:', findings.concedeButtonPresent);

await pressText(/^Concede the game$/); await sleep(900);
await shot('concede-confirm-in-place');
findings.confirmInPlace = await page.evaluate(() => {
  const text = document.body.innerText || '';
  const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]');
  return { asks: /Concede this game\?/i.test(text),
    keepPlaying: [...document.querySelectorAll('button')].some(b => /Keep playing/i.test(b.innerText || '')),
    centredModal: !!dialog };
});
log('  confirm:', JSON.stringify(findings.confirmInPlace));

await pressText(/^Concede$/); await sleep(2000);
findings.afterConcede = await game();
log('  after concede:', JSON.stringify(findings.afterConcede));
await shot('after-concede');

log('\n== console/network ==');
log('  console errors', consoleErrors.length, '| page errors', pageErrors.length, '| net failures', netFails.length);
if (consoleErrors.length) log(JSON.stringify(consoleErrors.slice(0, 5), null, 2));
if (pageErrors.length) log(JSON.stringify(pageErrors.slice(0, 5), null, 2));
if (netFails.length) log(JSON.stringify(netFails.slice(0, 5), null, 2));

fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify({ findings, consoleErrors, pageErrors, netFails }, null, 2));
log('\nwrote', `${OUT}/findings.json`);
await browser.close();
