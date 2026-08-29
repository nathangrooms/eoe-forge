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

/* WHICH DOOR, and why it matters more than it looks.
   PLAYTEST is a WATCHED table: bots take every seat, so the panel renders
   read-only and hides the manual controls entirely. Photographing it there
   showed a tidy panel and proved nothing, because the part the owner called
   confusing is the interactive part. GOLDFISH gives a seat you actually play.
     MODE=goldfish node scripts/card-panel-shot.mjs   (default)
     MODE=playtest node scripts/card-panel-shot.mjs */
const MODE = (process.env.MODE || 'goldfish').toUpperCase();
const pressedMode = await page.evaluate(mode => {
  const el = [...document.querySelectorAll('button[aria-pressed]')].find(b =>
    new RegExp(mode).test(b.innerText || '')
  );
  el?.click();
  return Boolean(el);
}, MODE);
log('  door pressed:', pressedMode, MODE);
await sleep(900);

/* WALK FORWARD GENERICALLY, because the four modes do not share a step
   sequence. Playtest goes mode, deck, seats, "Watch the N-player game".
   Goldfish goes mode, deck, "Set up your seat", and then its own start
   control. Hard-coding one mode's button names is what made this script fall
   out of the flow at step two and report that no cards existed.

   So it presses whatever forward control is on screen, up to a bounded number
   of times, and stops as soon as cards appear. Bounded rather than
   while(true): a step that never advances should fail loudly rather than spin. */
const FORWARD = /(Set up your seat|Fill the seats|Watch the \d-player game|Shuffle|Deal|Start|Begin|Play the|Keep|Continue|Next)/i;

const cardShapes = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('button, [role="button"], img')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 55 && r.width < 200 && r.height > r.width * 1.2 && r.top > 60 && r.bottom < 820;
    }).length
  );

for (let step = 0; step < 8; step++) {
  if ((await cardShapes()) > 0) break;
  const heading = await page.evaluate(() => document.querySelector('h1')?.innerText?.split('\n').join(' ') ?? '');
  const went = await press(FORWARD);
  log(`  step ${step}: ${heading.slice(0, 40)} -> forward ${went}`);
  if (!went) {
    log('    buttons:', await page.evaluate(() =>
      [...document.querySelectorAll('button')].map(b => (b.innerText || '').split('\n').join(' ').trim().slice(0, 28)).filter(Boolean).slice(0, 12).join(' | ')
    ));
  }
  await sleep(1400);
}

/* The board is read from the DOM, not from a debug hook.
   `window.__deckmatrixGame` is what scripts/play-merge-check.mjs uses and it
   is not always exposed by the time the table appears, which made this script
   report "no game" while the screenshot plainly showed Thrakkus the Butcher
   on a battlefield. What this script needs is a card it can click, and that is
   a DOM question, so it asks a DOM question. */
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
  /* A CARD, not a zone chip. The first version of this took anything with a
     card's aspect ratio and clicked the middle of the list, which on a goldfish
     table is the Exile zone box: it is tall, it is the right width, and it is
     not a card. The panel that opened said "Nothing here" and the measurement
     read a heading that belonged to something else entirely.

     A card in HAND is the reliable target. It is in the bottom strip, it always
     exists on turn one, and clicking one is exactly what the owner does when
     they say the panel is confusing. */
  const h = window.innerHeight;
  const cards = [...document.querySelectorAll('button, [role="button"]')]
    .map(el => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ el, r }) =>
      r.width > 60 && r.width < 240 &&
      r.height > r.width * 1.1 &&
      r.top > h * 0.6 &&
      !/zone|exile|graveyard|library|command|stack/i.test(
        (el.getAttribute('aria-label') || el.innerText || '')
      )
    )
    .sort((a, b) => a.r.left - b.r.left);
  if (!cards.length) return null;
  const pick = cards[Math.min(2, cards.length - 1)];
  const label = (pick.el.getAttribute('title') || pick.el.getAttribute('aria-label') || pick.el.innerText || '')
    .split('\n').join(' ').slice(0, 70);
  pick.el.click();
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
