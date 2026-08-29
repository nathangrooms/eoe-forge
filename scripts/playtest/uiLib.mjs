/**
 * Shared puppeteer driver for the play-mode visual work.
 *
 * Every earlier visual probe on this project re-copied the vite stub, the
 * button pressers and the unblock loop, and then drifted: one of them missed
 * the ATTACK button because it matched on `title`, another called the game
 * deadlocked four times when the deadlock was its own regex. One copy, so a
 * fix to the driver is a fix everywhere.
 *
 * Nothing in here decides anything about the app. It opens the shipped page
 * through the project's own auth-free harness and reads geometry back out.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

export const BASE = process.env.BASE || 'http://127.0.0.1:8081';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

const VITE_CLIENT_STUB = `
export function createHotContext(){return{accept(){},acceptExports(){},dispose(){},prune(){},decline(){},invalidate(){},on(){},off(){},send(){},data:{}};}
const sheets=new Map();
export function updateStyle(id,content){let s=sheets.get(id);if(!s){s=document.createElement('style');s.setAttribute('type','text/css');s.setAttribute('data-vite-dev-id',id);s.textContent=content;document.head.appendChild(s);sheets.set(id,s);}else{s.textContent=content;}}
export function removeStyle(id){const s=sheets.get(id);if(s){document.head.removeChild(s);sheets.delete(id);}}
export function injectQuery(u){return u;}`;

export async function openHarness({ width = 1600, height = 1000, page: pagePath = 'play-harness.html' } = {}) {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 300000,
    args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });

  const consoleErrors = [], pageErrors = [], netFails = [];
  page.on('pageerror', e => pageErrors.push(e.message.slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('requestfailed', r => netFails.push(`${r.failure()?.errorText} ${r.url().slice(0, 140)}`));
  page.on('response', r => { if (r.status() >= 400) netFails.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`); });

  await page.setRequestInterception(true);
  page.on('request', req => req.url().includes('/@vite/client')
    ? req.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB })
    : req.continue());

  await page.goto(`${BASE}/${pagePath}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(6000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(6000);
  return { browser, page, health: { consoleErrors, pageErrors, netFails } };
}

export const pressText = (page, re) => page.evaluate(src => {
  const el = [...document.querySelectorAll('button')]
    .find(b => !b.disabled && new RegExp(src, 'i').test((b.innerText || '').trim()));
  if (!el) return false; el.click(); return true;
}, re.source);

/**
 * The primary CTA by POSITION, not label. Chasing labels cost earlier runs.
 *
 * MUST HAVE TEXT. The top-right cluster also holds icon-only UNDO, STEP and
 * settings buttons, and an earlier version of this function sorted by width
 * and pressed UNDO every single time — so a run that looked like the game had
 * frozen at "turn 2, untap" was really this driver undoing its own END TURN on
 * a loop. `Undid the last action.` was sitting in the game log the whole time.
 * That is the fourth time a probe on this project has been mistaken for a
 * deadlock; the cost of the check is one `.length` test.
 */
export const pressPrimary = page => page.evaluate(() => {
  const vw = window.innerWidth;
  const cands = [...document.querySelectorAll('button')].filter(b => {
    if (b.disabled) return false;
    const label = (b.innerText || '').trim();
    if (label.length < 3) return false;          // icon-only: undo, step, settings
    if (/^undo$/i.test(label)) return false;
    const r = b.getBoundingClientRect();
    return r.height > 20 && r.y < 96 && (r.x + r.width) > vw * 0.72;
  });
  if (!cands.length) return null;
  const el = cands.sort((a, c) => c.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
  const label = (el.innerText || '').trim();
  el.click();
  return label;
});

/** Answer whatever prompt is blocking. Returns what it did, or null. */
export async function unblock(page) {
  const targeted = await page.evaluate(() => {
    const txt = document.body.innerText || '';
    if (!/CHOOSE A TARGET|Choose a creature|Press a card on the table/i.test(txt)) return null;
    const aim = [...document.querySelectorAll('button')]
      .find(b => !b.disabled && /^Aim /i.test(b.getAttribute('title') || ''));
    if (aim) { aim.click(); return 'aimed'; }
    const skip = [...document.querySelectorAll('button')].find(b => /Do not cast it/i.test(b.innerText || ''));
    if (skip) { skip.click(); return 'declined-cast'; }
    return 'target-prompt-stuck';
  });
  if (targeted) { await sleep(700); return targeted; }
  if (await pressText(page, /^LET IT RESOLVE$/)) return 'let-it-resolve';
  const closed = await page.evaluate(() => {
    const hasBar = [...document.querySelectorAll('button')]
      .some(b => /^(END TURN|RESPOND|NO BLOCKS|NO ATTACKS)$/i.test((b.innerText || '').trim()));
    if (hasBar) return false;
    const x = [...document.querySelectorAll('button')]
      .find(b => /Close the preview/i.test(b.getAttribute('title') || b.innerText || ''));
    if (!x) return false; x.click(); return true;
  });
  if (closed) { await sleep(500); return 'closed-preview'; }
  const primary = await pressPrimary(page);
  if (primary) return 'primary:' + primary;
  return null;
}

/** Mode wall -> deck -> seats -> shuffle. Leaves the game on the table. */
export async function startGame(page, { mode = 'VERSUS BOTS' } = {}) {
  await page.evaluate(m => {
    const b = [...document.querySelectorAll('button')].find(x => new RegExp(m, 'i').test(x.innerText || ''));
    if (b) b.click();
  }, mode);
  await sleep(1500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /seeded|Use this deck|Choose/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(1200);
  await pressText(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
  await sleep(2500);
  await pressText(page, /^Keep$/);
  await sleep(2000);
}

export const gameState = page => page.evaluate(() => {
  const g = window.__dmGame; if (!g) return null;
  const p1 = g.players.find(p => p.id === 'p1');
  return {
    turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    stack: (g.stack || []).length, hand: p1.zones.hand.length,
    bf: p1.zones.battlefield.length,
    life: g.players.map(p => `${p.name}:${p.life}`).join(' '),
  };
});

/** Advance until turn >= target, answering prompts. Never claims a deadlock. */
export async function advanceTo(page, targetTurn, maxSteps = 220) {
  for (let i = 0; i < maxSteps; i++) {
    const g = await gameState(page);
    if (!g || g.status === 'complete') return g;
    if (g.turn >= targetTurn) return g;
    await unblock(page);
    await sleep(320);
  }
  return gameState(page);
}

export const shotter = (page, dir) => {
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  return async name => {
    const f = `${dir}/${String(n++).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: f });
    return f;
  };
};
