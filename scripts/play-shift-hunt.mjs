/**
 * Which ancestor moved?
 *
 * `play-combat-read.mjs` measured 30 of 31 card boxes moving by 8px the moment
 * a blocker was armed. A card cannot move 8px on its own — the arming is a
 * transform on an inner element — so something ABOVE the cards changed size.
 *
 * This walks the ancestor chain of one card and records every box before and
 * after, which names the element rather than leaving it to a guess. Every
 * previous layout answer in this neighbourhood that was guessed turned out to
 * be wrong.
 */
import puppeteer from 'puppeteer';

const BASE = process.env.BASE || 'http://127.0.0.1:8101';
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const VITE_CLIENT_STUB = `
export function createHotContext() {
  return { accept() {}, acceptExports() {}, dispose() {}, prune() {}, decline() {},
    invalidate() {}, on() {}, off() {}, send() {}, data: {} };
}
const sheets = new Map();
export function updateStyle(id, content) {
  let style = sheets.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheets.set(id, style);
  } else { style.textContent = content; }
}
export function removeStyle(id) {
  const style = sheets.get(id);
  if (style) { document.head.removeChild(style); sheets.delete(id); }
}
export function injectQuery(url) { return url; }
`;

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 1 });
page.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 200)));

await page.setRequestInterception(true);
page.on('request', req => {
  const url = req.url();
  if (url.includes('/@vite/client')) {
    return req.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB });
  }
  if (/supabase\.co\/rest\//.test(url)) return req.abort('failed');
  return req.continue();
});

const pressText = re => page.evaluate(src => {
  const el = [...document.querySelectorAll('button')]
    .find(b => !b.disabled && new RegExp(src, 'i').test((b.innerText || '').trim()));
  if (!el) return false;
  el.click();
  return true;
}, re.source);
const pressExact = t => page.evaluate(t => {
  const el = [...document.querySelectorAll('button')].find(b => !b.disabled && (b.innerText || '').trim() === t);
  if (!el) return false;
  el.click();
  return true;
}, t);
const pressTitle = re => page.evaluate(src => {
  const el = [...document.querySelectorAll('button')]
    .find(b => !b.disabled && new RegExp(src, 'i').test(b.getAttribute('title') || ''));
  if (!el) return false;
  el.click();
  return el.getAttribute('title');
}, re.source);

/** The whole ancestor chain of the first battlefield card, described. */
const chain = () => page.evaluate(() => {
  const card = document.querySelector('[aria-label^="Creatures"] [data-instance], [aria-label^="Lands"] [data-instance]');
  if (!card) return null;
  const out = [];
  let node = card;
  while (node && node !== document.documentElement) {
    const r = node.getBoundingClientRect();
    out.push({
      tag: node.tagName + (node.getAttribute('aria-label') ? `[${node.getAttribute('aria-label').slice(0, 24)}]` : ''),
      cls: (node.className || '').toString().slice(0, 70),
      box: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
    });
    node = node.parentElement;
  }
  return out;
});

await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000);
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(6000);
await pressText(/Versus bots/); await sleep(600);
await pressExact('1'); await sleep(600);
await pressText(/Start 2-player game/);
await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
await sleep(3500);
await pressText(/^Keep$/);
await sleep(1000);

/* A board on both sides, then an attack pointed at the viewer. */
await page.evaluate(() => {
  const g = window.__dmGame;
  for (const p of g.players) {
    const creatures = p.zones.library
      .filter(i => /Creature/.test(g.cards[i].typeLine || '') && !/Land/.test(g.cards[i].typeLine || ''))
      .slice(0, 5);
    const lands = p.zones.library.filter(i => /Land/.test(g.cards[i].typeLine || '')).slice(0, 5);
    for (const id of [...creatures, ...lands]) {
      window.__dmDispatch({ type: 'MOVE_ZONE', instanceId: id, to: 'battlefield' });
    }
  }
});
await sleep(2000);
await page.evaluate(() => {
  const g = window.__dmGame;
  for (const id of g.players[0].zones.battlefield) window.__dmDispatch({ type: 'UNTAP', instanceId: id });
  const attackers = g.players[1].zones.battlefield
    .filter(i => /Creature/.test(g.cards[i].typeLine || '') && !/Land/.test(g.cards[i].typeLine || ''))
    .slice(0, 3);
  window.__dmDispatch({ type: 'SET_STEP', step: 'declare_blockers' });
  window.__dmDispatch({
    type: 'ATTACK',
    attackers: attackers.map(id => ({ attackerId: id, defenderPlayerId: 'p1', tap: false })),
  });
});
await sleep(2500);

log('=== BEFORE ARMING ===');
const before = await chain();
for (const n of before || []) log(' ', n.box.padEnd(24), n.tag, n.cls);

const armed = await pressTitle(/^Block with /);
log('\narmed:', armed);
await sleep(1500);

log('\n=== AFTER ARMING ===');
const after = await chain();
for (let i = 0; i < (after || []).length; i += 1) {
  const b = before && before[i];
  const a = after[i];
  const flag = b && b.box !== a.box ? `  <<< MOVED (was ${b.box})` : '';
  log(' ', a.box.padEnd(24), a.tag, a.cls, flag);
}

await browser.close();
process.exit(0);
