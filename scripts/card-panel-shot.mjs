/**
 * Click a creature on the battlefield and photograph the panel that opens.
 *
 * The owner sent a screenshot of that panel with Atraxa selected and said
 * "Thought this would have so much more to it and look way better". There was
 * no way to see it without an account and without playing, so every change to
 * it was being made blind. This walks the signed-out playtest flow the same way
 * scripts/play-merge-check.mjs does, waits for a creature to reach a
 * battlefield, clicks it, and saves the result.
 *
 * Start a dev server first, then:
 *   node scripts/card-panel-shot.mjs
 *   BASE=http://127.0.0.1:8080 node scripts/card-panel-shot.mjs
 *
 * --disable-lcd-text is not optional: subpixel antialiasing puts coloured
 * fringes on thin type over a dark mat and reads as a styling bug that is not
 * there.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const OUT = '.shots/card-panel';
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
    const g = window.__deckmatrixGame?.();
    if (!g) return null;
    return { turn: g.turn, boards: g.players.map(p => p.zones.battlefield.length) };
  });

await page.goto(`${BASE}/play-flow-harness.html?view=flow`, { waitUntil: 'networkidle2' });
await sleep(1200);

const pressedMode = await page.evaluate(() => {
  const el = [...document.querySelectorAll('button[aria-pressed]')].find(b =>
    /PLAYTEST/.test(b.innerText || '')
  );
  el?.click();
  return Boolean(el);
});
log('  playtest door:', pressedMode);
await sleep(900);
log('  step two heading:', await page.evaluate(() => document.querySelector('h1')?.innerText));
log('  fill the seats:', await press(/Fill the seats/));
await sleep(900);
log('  step three heading:', await page.evaluate(() => document.querySelector('h1')?.innerText));
const started = await press(/Watch the \d-player game/);
log('  start:', started);
if (!started) {
  log('  buttons on screen:', await page.evaluate(() =>
    [...document.querySelectorAll('button')].map(b => (b.innerText || '').trim().slice(0, 40)).filter(Boolean).join(' | ')
  ));
}

/* The board is read from the DOM, not from a debug hook.
   `window.__deckmatrixGame` is what scripts/play-merge-check.mjs uses and it
   is not always exposed by the time the table appears, which made this script
   report "no game" while the screenshot plainly showed Thrakkus the Butcher
   on a battlefield. What this script needs is a card it can click, and that is
   a DOM question, so it asks a DOM question. */
const cardShapes = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('button, [role="button"], img')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 55 && r.width < 200 && r.height > r.width * 1.2 && r.top > 60 && r.bottom < 820;
    }).length
  );

log('waiting for a card to appear on a battlefield...');
let seen = 0;
for (let i = 0; i < 90; i++) {
  seen = await cardShapes();
  if (seen > 0) break;
  await sleep(1000);
}
log('  card-shaped elements on the board:', seen);
if (!seen) {
  await page.screenshot({ path: `${OUT}/no-cards.png` });
  log(`no cards found; saved ${OUT}/no-cards.png`);
  await browser.close();
  process.exit(1);
}

/* A few more turns so a creature is out rather than only lands. */
await sleep(6000);

await press(/^Pause$/);
await sleep(400);

const clicked = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('[data-card-instance], [role="button"], button')].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 50 && r.width < 200 && r.height > r.width && r.top > 60 && r.bottom < 820;
  });
  if (!cards.length) return null;
  const el = cards[Math.floor(cards.length / 2)];
  const label = (el.getAttribute('title') || el.getAttribute('aria-label') || el.innerText || '').slice(0, 80);
  el.click();
  return label;
});
log('clicked:', clicked ?? 'nothing matched a card shape');
await sleep(900);

await page.screenshot({ path: `${OUT}/panel.png` });
log(`saved ${OUT}/panel.png`);

/* Measure the type rather than eyeball it, because "make it bigger" is the
   kind of change that silently does not apply. */
const sizes = await page.evaluate(() => {
  const out = {};
  const grab = (label, el) => {
    if (!el) return;
    const cs = getComputedStyle(el);
    out[label] = `${cs.fontSize} / ${cs.fontWeight} / ${(el.innerText || '').slice(0, 40)}`;
  };
  /* The FIRST h3 on the page is a seat name, not the panel, which is how this
     reported the card name as 14px while the screenshot showed it at 24px.
     The panel's heading is the one that sits beside a close control. */
  const h3 = [...document.querySelectorAll('h3')].find(el =>
    el.closest('div')?.parentElement?.querySelector('[aria-label="Close the preview"]')
  ) ?? [...document.querySelectorAll('h3')].pop();
  grab('name', h3);
  const block = h3?.parentElement?.parentElement;
  if (block) {
    const ps = [...block.querySelectorAll('p')];
    grab('typeLine', ps[0]);
    grab('stats', ps[1]);
  }
  return out;
});
console.log('\ncomputed type:');
for (const [k, v] of Object.entries(sizes)) console.log(`  ${k.padEnd(10)} ${v}`);

await browser.close();
