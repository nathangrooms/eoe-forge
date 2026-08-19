/**
 * COMBAT, DRIVEN AND READ.
 *
 * Owner: *"attacking and blocking doesn't seem very clear at all"*,
 * *"declaring blockers etc is not ideal, should always be given the choice when
 * attacked"*.
 *
 * The mechanics were verified working in an earlier pass — the engine stops at
 * declare blockers and `isUnderAttack` is right every time. This run is about
 * the OTHER half of the report: with combat actually on the board, what can a
 * player read off the screen without working anything out?
 *
 * It drives the real step machine rather than dispatching an ATTACK into a main
 * phase, because a declaration that the step machine never saw is not what a
 * player is looking at. At each stop it records:
 *
 *   - what the engine believes, and
 *   - every string on screen that names it,
 *
 * so the two can be compared. Screens at each stop.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = process.env.OUT || '.shots/combat-read';
const BASE = process.env.BASE || 'http://127.0.0.1:8101';
const TAG = process.env.TAG || 'after';
fs.mkdirSync(OUT, { recursive: true });

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
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 1 });
page.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') log('  [error]', m.text().slice(0, 150)); });

await page.setRequestInterception(true);
page.on('request', req => {
  const url = req.url();
  if (url.includes('/@vite/client')) {
    return req.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB });
  }
  if (/supabase\.co\/rest\//.test(url)) return req.abort('failed');
  return req.continue();
});

let shotN = 0;
const shot = async name => {
  const file = `${OUT}/${TAG}-${String(shotN++).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  log('  shot ->', file);
};

const pressText = re => page.evaluate(src => {
  const el = [...document.querySelectorAll('button')]
    .find(b => !b.disabled && new RegExp(src, 'i').test((b.innerText || '').trim()));
  if (!el) return false;
  el.click();
  return true;
}, re.source);
const pressExact = text => page.evaluate(text => {
  const el = [...document.querySelectorAll('button')]
    .find(b => !b.disabled && (b.innerText || '').trim() === text);
  if (!el) return false;
  el.click();
  return true;
}, text);
const pressTitle = re => page.evaluate(src => {
  const el = [...document.querySelectorAll('button')]
    .find(b => !b.disabled && new RegExp(src, 'i').test(b.getAttribute('title') || ''));
  if (!el) return false;
  el.click();
  return el.getAttribute('title');
}, re.source);

/** Everything a player could read about combat, from the pixels. */
const read = () => page.evaluate(() => {
  const g = window.__dmGame;
  const seats = [...document.querySelectorAll('section[aria-label]')]
    .filter(n => / seat$/.test(n.getAttribute('aria-label') || ''));
  return {
    engine: {
      step: g.step,
      active: g.players.find(p => p.id === g.activePlayerId)?.name,
      attackers: g.combat.attackers.map(a => ({
        who: g.cards[a.attackerId]?.name,
        power: g.cards[a.attackerId]?.power,
        at: g.players.find(p => p.id === a.defenderPlayerId)?.name,
        blockedBy: a.blockedBy.map(id => g.cards[id]?.name),
      })),
      life: g.players.map(p => `${p.name}:${p.life}`).join(' '),
    },
    /* What each seat's band says. */
    bands: seats.map(s => {
      const band = s.querySelector('div > div > div');
      return (s.innerText || '').split('\n').slice(0, 6).join(' | ');
    }),
    /* The marks under the cards. */
    cardMarks: [...document.querySelectorAll('[data-instance]')]
      .map(el => {
        const note = [...el.querySelectorAll('span')]
          .map(n => (n.innerText || '').trim())
          .find(t => /^(hits |held by |blocks )/.test(t));
        return note ? { card: el.getAttribute('title'), note } : null;
      })
      .filter(Boolean),
    /* The strip. */
    strip: (() => {
      const el = document.querySelector('[role="group"][aria-label^="Declare"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        label: el.getAttribute('aria-label'),
        text: (el.innerText || '').replace(/\n/g, ' | '),
        box: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
      };
    })(),
    /* The chips a player can press right now. */
    chips: [...document.querySelectorAll('button[title]')]
      .map(b => b.getAttribute('title'))
      .filter(t => /attack|block/i.test(t || ''))
      .slice(0, 12),
  };
});

/** Every card box, so a combat stop can be checked for movement too. */
const boxes = () => page.evaluate(() => {
  const out = {};
  for (const el of document.querySelectorAll('[data-instance]')) {
    const id = el.getAttribute('data-instance');
    const r = el.getBoundingClientRect();
    if (!id || r.width < 20) continue;
    if (!el.closest('[aria-label]')) continue;
    out[id + '@' + Math.round(r.y / 100)] = { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1) };
  }
  return out;
});
const moved = (a, b) => {
  let n = 0, worst = 0;
  for (const k of Object.keys(a)) {
    if (!b[k]) continue;
    const d = Math.max(Math.abs(a[k].x - b[k].x), Math.abs(a[k].y - b[k].y), Math.abs(a[k].w - b[k].w));
    if (d > 1) { n += 1; worst = Math.max(worst, d); }
  }
  return { n, worst, total: Object.keys(a).length };
};

/* ==================================================================== run */

await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000);
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(6000);

await pressText(/Versus bots/); await sleep(700);
await pressExact('1'); await sleep(700);
log('start:', await pressText(/Start 2-player game/));
await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
await sleep(3500);
await pressText(/^Keep$/);
await sleep(1200);

/* Free cast so a board arrives in a few turns. */
await pressTitle(/Game menu/); await sleep(1200);
await pressTitle(/ignore mana entirely/); await sleep(600);
await pressTitle(/Close the menu/); await sleep(600);

const handTitles = () => page.evaluate(() =>
  [...document.querySelectorAll('button[title]')]
    .map(e => e.getAttribute('title'))
    .filter(t => t && t.includes('Click to preview')));
const clickHand = t => page.evaluate(t => {
  const el = [...document.querySelectorAll('button[title]')].find(e => e.getAttribute('title') === t);
  if (!el) return false;
  el.click();
  return true;
}, t);

const state = () => page.evaluate(() => {
  const g = window.__dmGame;
  return { turn: g.turn, step: g.step, active: g.activePlayerId, attackers: g.combat.attackers.length };
});

/* Build a board on both sides, then let the turns run until a real combat
   stop arrives. Nothing here dispatches an ATTACK: the bot declares its own,
   and the human's swords come from the step machine. */
let sawAttackers = false;
let sawBlockers = false;

for (let turn = 0; turn < 14 && !(sawAttackers && sawBlockers); turn++) {
  const titles = await handTitles();
  const land = titles.find(t => t.includes('land drop'));
  if (land) { await clickHand(land); await sleep(350); await pressText(/^Play land$/); await sleep(500); }
  for (const t of titles.filter(x => !x.includes('land drop')).slice(0, 3)) {
    await clickHand(t); await sleep(320);
    if (await pressText(/^Cast$/)) await sleep(500);
  }
  await page.evaluate(() => document.body.click());
  await sleep(250);

  await pressText(/^END TURN$/);

  /* Poll for a stop rather than sleeping through it: the stop is the thing
     being measured, and sleeping past it is how a previous run concluded that
     the pause did not exist. */
  for (let tick = 0; tick < 40; tick++) {
    await sleep(400);
    const s = await state();

    if (s.step === 'declare_attackers' && s.active === 'p1' && !sawAttackers) {
      sawAttackers = true;
      log(`\n=== STOP: DECLARE ATTACKERS (turn ${s.turn}) ===`);
      await shot('declare-attackers-empty');
      log('  ' + JSON.stringify(await read(), null, 1));

      /* Swing with everything the board offers. */
      const before = await boxes();
      let swung = 0;
      for (let i = 0; i < 6; i++) {
        const pressed = await pressTitle(/^Attack with /);
        if (!pressed) break;
        swung += 1;
        await sleep(320);
      }
      log(`  pressed ${swung} swords`);
      await sleep(900);
      log('  MOVEMENT while declaring: ' + JSON.stringify(moved(before, await boxes())));
      await shot('declare-attackers-declared');
      log('  ' + JSON.stringify(await read(), null, 1));
      await pressText(/^Attack with \d+$/);
      await sleep(1200);
      break;
    }

    if (s.step === 'declare_blockers' && s.attackers > 0 && !sawBlockers) {
      sawBlockers = true;
      log(`\n=== STOP: DECLARE BLOCKERS (turn ${s.turn}) ===`);
      await shot('under-attack');
      const first = await read();
      log('  ' + JSON.stringify(first, null, 1));

      /* Arm a blocker and put it in front of something. */
      const before = await boxes();
      const armed = await pressTitle(/^Block with /);
      log('  armed:', armed);
      await sleep(500);
      await shot('blocker-armed');
      const target = await pressTitle(/in front of|blocks? /i);
      log('  assigned to:', target);
      await sleep(900);
      log('  MOVEMENT while blocking: ' + JSON.stringify(moved(before, await boxes())));
      await shot('block-assigned');
      log('  ' + JSON.stringify(await read(), null, 1));
      break;
    }

    if (s.step === 'untap' && s.active === 'p1') break;
  }
}

log('\nsaw declare attackers:', sawAttackers, ' saw declare blockers:', sawBlockers);
await shot('final');
await browser.close();
process.exit(0);
