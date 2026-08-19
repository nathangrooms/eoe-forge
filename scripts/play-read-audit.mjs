/**
 * What the screen SAYS: the log panel, the combat sentences, and whether any of
 * it is a modal.
 *
 * The other two scripts in this pass measure boxes. This one reads text, because
 * the claims under review are about legibility — a log whose lines were cut off
 * mid-sentence, and a combat that happened without the board mentioning it.
 *
 * Run: node scripts/play-read-audit.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = '.shots/read';
const BASE = process.env.BASE || 'http://127.0.0.1:8101';
fs.mkdirSync(OUT, { recursive: true });

let shotN = 0;
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: 'new', protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 1 });
page.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 200)));

const VITE_CLIENT_STUB = `
export function createHotContext() { return { accept(){}, acceptExports(){}, dispose(){}, prune(){}, decline(){}, invalidate(){}, on(){}, off(){}, send(){}, data:{} }; }
const sheets = new Map();
export function updateStyle(id, content) {
  let s = sheets.get(id);
  if (!s) { s = document.createElement('style'); s.setAttribute('type','text/css'); s.setAttribute('data-vite-dev-id', id); s.textContent = content; document.head.appendChild(s); sheets.set(id, s); }
  else s.textContent = content;
}
export function removeStyle(id) { const s = sheets.get(id); if (s) { document.head.removeChild(s); sheets.delete(id); } }
export function injectQuery(u) { return u; }
`;
await page.setRequestInterception(true);
page.on('request', req => {
  const u = req.url();
  if (u.includes('/@vite/client')) return req.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB });
  if (/supabase\.co\/rest\//.test(u)) return req.abort('failed');
  return req.continue();
});

const shot = async n => { const f = `${OUT}/${String(shotN++).padStart(2, '0')}-${n}.png`; await page.screenshot({ path: f }); log('  shot ->', f); };
const pressText = re => page.evaluate(src => {
  const el = [...document.querySelectorAll('button')].find(b => !b.disabled && new RegExp(src, 'i').test((b.innerText || '').trim()));
  if (!el) return false; el.click(); return true;
}, re.source);

await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000);
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(6000);
await pressText(/Versus bots/); await sleep(500);
await page.evaluate(() => {
  const el = [...document.querySelectorAll('button[aria-pressed]')].find(b => (b.innerText || '').trim() === '3');
  if (el) el.click();
});
await sleep(800);
await pressText(/Start .*game/);
await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
await sleep(3000);
await pressText(/^Keep$/);
await sleep(900);

/* Several turns of real play, so the log has something in it. */
for (let i = 0; i < 6; i++) { await pressText(/^END TURN$/); await sleep(8000); }
log('game:', JSON.stringify(await page.evaluate(() => {
  const g = window.__dmGame;
  return { turn: g.turn, step: g.step, log: g.log.length, life: g.players.map(p => p.life).join('/') };
})));

/* ------------------------------------------------------------------ log */

log('\n=== THE LOG, CLOSED ===');
log('  ' + JSON.stringify(await page.evaluate(() => {
  const b = [...document.querySelectorAll('[aria-expanded]')]
    .find(el => /log|feed|history/i.test((el.getAttribute('aria-label') || '') + (el.innerText || '')));
  if (!b) return { control: null };
  const r = b.getBoundingClientRect();
  return { control: (b.getAttribute('aria-label') || b.innerText || '').slice(0, 60), at: `${Math.round(r.x)},${Math.round(r.y)}`, expanded: b.getAttribute('aria-expanded') };
})));

const opened = await page.evaluate(() => {
  const b = [...document.querySelectorAll('[aria-expanded]')]
    .find(el => /log|feed|history/i.test((el.getAttribute('aria-label') || '') + (el.innerText || '')));
  if (!b) return false;
  b.click();
  return true;
});
log('  opened:', opened);
await sleep(1200);
await shot('log-open');

const readLog = () => page.evaluate(() => {
  const b = [...document.querySelectorAll('[aria-expanded="true"]')]
    .find(el => /log|feed|history/i.test((el.getAttribute('aria-label') || '') + (el.innerText || '')));
  const panel = b ? b.closest('div').parentElement : null;
  const root = panel || document.body;
  const lines = [...root.querySelectorAll('li, p, span')]
    .filter(el => el.children.length === 0 && (el.textContent || '').trim().length > 3);
  let truncated = 0, widest = 0;
  const texts = [];
  for (const el of lines) {
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 4) continue;
    widest = Math.max(widest, r.width);
    if (el.scrollWidth > el.clientWidth + 1) truncated++;
    texts.push((el.textContent || '').trim().slice(0, 70));
  }
  const pr = root.getBoundingClientRect();
  return { panelWidth: Math.round(pr.width), lines: texts.length, truncated, widest: Math.round(widest), sample: texts.slice(-14) };
});
log('\n=== THE LOG, OPEN ===');
log('  ' + JSON.stringify(await readLog(), null, 1));

/* --------------------------------------------------------------- combat */

log('\n=== COMBAT, WHAT THE BOARD SAYS ===');
const before = await page.evaluate(() => document.body.innerText);
const declared = await page.evaluate(() => {
  const g = window.__dmGame, d = window.__dmDispatch;
  const p1 = g.players.find(p => p.id === 'p1');
  /* Put four creatures on the board and swing them, so there is something to
     describe. Through the same transport a click uses. */
  let n = 0;
  for (const id of [...p1.zones.library]) {
    if (n >= 4) break;
    if (/Creature/.test(g.cards[id].typeLine || '')) { d({ type: 'MOVE_ZONE', instanceId: id, to: 'battlefield' }); n++; }
  }
  return n;
});
await sleep(2000);
const swung = await page.evaluate(() => {
  const g = window.__dmGame, d = window.__dmDispatch;
  const p1 = g.players.find(p => p.id === 'p1');
  const ids = p1.zones.battlefield.filter(i => /Creature/.test(g.cards[i].typeLine || '')).slice(0, 4);
  d({ type: 'PHASE_CHANGE', step: 'declare_attackers' });
  d({ type: 'ATTACK', attackers: ids.map(id => ({ attackerId: id, defenderPlayerId: 'p2' })) });
  return ids.length;
});
log(`  put ${declared} creatures down, declared ${swung} attackers at p2`);
await sleep(2500);
await shot('attacking');

log('  what changed on screen:');
const after = await page.evaluate(() => document.body.innerText);
const bl = new Set(before.split('\n').map(s => s.trim()).filter(Boolean));
for (const line of [...new Set(after.split('\n').map(s => s.trim()).filter(Boolean))]) {
  if (!bl.has(line)) log('     + ' + line.slice(0, 90));
}

/* The seat bands specifically. */
log('\n  seat band text:');
log('  ' + JSON.stringify(await page.evaluate(() =>
  [...document.querySelectorAll('[aria-label$="\'s seat"]')].map(s => {
    const t = (s.innerText || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 6);
    return { seat: s.getAttribute('aria-label'), head: t };
  }), null, 1)));

/* And is anything a modal? */
log('\n=== MODAL CHECK (during combat, with the log open) ===');
log('  ' + JSON.stringify(await page.evaluate(() => ({
  dialogs: document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length,
  portalsOutsideRoot: [...document.body.children].filter(c => c.id !== 'root' && c.querySelector('[data-instance], button')).length,
  fullScreenDimmers: [...document.querySelectorAll('div')].filter(d => {
    const cs = getComputedStyle(d), r = d.getBoundingClientRect();
    if (r.width < window.innerWidth - 4 || r.height < window.innerHeight - 4) return false;
    return cs.backdropFilter !== 'none' || /rgba\(0, 0, 0, 0\.[1-9]/.test(cs.backgroundColor);
  }).length,
  seatsStillDrawn: document.querySelectorAll('[aria-label$="\'s seat"]').length,
}))));

await browser.close();
process.exit(0);
