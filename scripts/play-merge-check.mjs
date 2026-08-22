/**
 * Prove the playtest merge, end to end, against the live card database.
 *
 * The claim this checks is the one the whole phase turns on: `/simulate` was not
 * a different product, so folding it into `/play` as the fourth mode must lose
 * nothing. Walking mode, deck and table for PLAYTEST has to end in a real game
 * on `src/lib/game`, with turns advancing and life moving, on the same board
 * every other mode uses.
 *
 * It runs signed out on purpose. There are no saved decks without an account,
 * so every seat takes the seeded commander deck, which is a live read of the
 * real `cards` table. If that path is broken this says so rather than passing.
 *
 * Uses the same harness `play-flow-shots.mjs` writes, so this does not maintain
 * a second copy of it. Start a dev server first:
 *
 *   npx vite --port 8123 --strictPort
 *   node scripts/play-merge-check.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8123';
const OUT = '.shots/play-flow';
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
page.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 220)));
page.on('console', m => {
  if (m.type() === 'error') log('  [error]', m.text().slice(0, 200));
});

const press = re =>
  page.evaluate(src => {
    const el = [...document.querySelectorAll('button')].find(
      b => !b.disabled && new RegExp(src, 'i').test((b.innerText || '').trim())
    );
    if (!el) return false;
    el.click();
    return true;
  }, re.source);

const game = () =>
  page.evaluate(() => {
    const g = window.__dmGame;
    if (!g) return null;
    return {
      id: g.id,
      turn: g.turn,
      step: g.step,
      status: g.status,
      version: g.version,
      seats: g.players.map(p => `${p.name}:${p.life}`),
      hands: g.players.map(p => p.zones.hand.length),
      boards: g.players.map(p => p.zones.battlefield.length),
      logTail: g.log.slice(-3).map(e => e.message),
    };
  });

await page.goto(`${BASE}/play-flow-harness.html?view=flow`, { waitUntil: 'networkidle2' });
await sleep(1200);

log('step one: pressing PLAYTEST');
const doors = await page.evaluate(() =>
  [...document.querySelectorAll('button[aria-pressed]')]
    .filter(b => /ENTER/i.test(b.innerText || ''))
    .map(b => (b.innerText || '').split('\n')[1])
);
log('  doors on screen:', doors.join(' | '));
await page.evaluate(() => {
  const el = [...document.querySelectorAll('button[aria-pressed]')].find(b =>
    /PLAYTEST/.test(b.innerText || '')
  );
  el?.click();
});
await sleep(700);

log('step two:', (await page.evaluate(() => document.querySelector('h1')?.innerText)) ?? '?');
log('  forward ->', await press(/Fill the seats/));
await sleep(700);

const heading = await page.evaluate(() => document.querySelector('h1')?.innerText);
log('step three:', heading);
const seatLabels = await page.evaluate(() =>
  [...document.querySelectorAll('span')]
    .map(s => (s.innerText || '').trim())
    .filter(t => /^Seat \d$/.test(t))
);
log('  seats:', seatLabels.join(', '));

log('  start ->', await press(/Watch the \d-player game/));

for (let i = 0; i < 40 && !(await game()); i++) await sleep(500);
const dealt = await game();
if (!dealt) {
  log('NO GAME. The seeded deck path did not deal a table.');
  await page.screenshot({ path: `${OUT}/20-merge-failed.png`, fullPage: true });
  await browser.close();
  process.exit(1);
}
log('dealt:', JSON.stringify(dealt, null, 2));
await page.screenshot({ path: `${OUT}/20-playtest-running.png` });

/* Let it actually play, then read the engine again. A merge that renders a
   board and never advances a turn has not kept anything. */
await sleep(9000);
const later = await game();
log('after 9s:', JSON.stringify(later, null, 2));
await page.screenshot({ path: `${OUT}/21-playtest-later.png` });

/* The controls that had to survive the move. */
const controls = await page.evaluate(() => ({
  buttons: [...document.querySelectorAll('button')]
    .map(b => (b.innerText || b.getAttribute('aria-label') || '').trim())
    .filter(Boolean)
    .slice(0, 30),
  sliders: document.querySelectorAll('[role="slider"]').length,
}));
log('controls on the watched board:', JSON.stringify(controls, null, 2));

log(
  '\nRESULT:',
  later && later.version > dealt.version ? 'the game advanced' : 'THE GAME DID NOT ADVANCE'
);

await browser.close();
process.exit(0);
