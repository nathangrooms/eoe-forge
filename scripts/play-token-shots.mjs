/**
 * Photograph a player MAKING A TOKEN by hand, spending it, and raising an army.
 *
 * `CREATE_TOKEN` has been in the engine the whole time: validated, reduced,
 * firing enters-the-battlefield triggers, cleaned up under CR 704.5d, with
 * passing tests. Nothing outside ability resolution had ever built one, so no
 * player could make a Treasure. `src/lib/game/tokens.test.ts` proves the
 * control now exists and that the state it produces is right. This proves the
 * other half, which a test cannot: that a person can see it and press it.
 *
 * Start a dev server first, then:
 *   node scripts/play-token-shots.mjs
 *   BASE=http://127.0.0.1:8080 node scripts/play-token-shots.mjs
 *
 * It walks the signed-out GOLDFISH door, the same route
 * scripts/card-panel-shot.mjs takes and for the same reason written there:
 * playtest is a WATCHED table, so its panel is read-only and the manual
 * controls do not render at all. Photographing the by-hand controls on a table
 * nobody may act at would prove nothing.
 *
 * --disable-lcd-text is not optional: subpixel antialiasing puts coloured
 * fringes on thin type over a dark mat and reads as a styling bug that is not
 * there.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const OUT = '.shots/tokens';
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

/** Press the first enabled button whose text matches. */
const press = re =>
  page.evaluate(src => {
    const el = [...document.querySelectorAll('button')].find(
      b => !b.disabled && new RegExp(src, 'i').test((b.innerText || '').trim())
    );
    if (!el) return false;
    el.click();
    return true;
  }, re.source);

/**
 * The board, read from the DOM.
 *
 * NOT from `window.__deckmatrixGame`. Two older scripts in this directory call
 * that hook and it does not exist anywhere in `src` — grepped, zero hits — so
 * they have been reading `null` and reporting "no game" while the screenshot
 * beside them plainly showed a board. Nothing is added to app code to make a
 * screenshot easier: a debug global shipped to players to prove a button works
 * would be its own small version of the problem this task is about.
 *
 * `GameCardView` puts `aria-label={card.name}` on every card, so a Treasure on
 * a battlefield is findable by the name a player reads on it.
 */
const TOKEN_NAMES = /^(Treasure|Clue|Food|Blood|Soldier|Spirit|Cat|Zombie|Goblin|Elemental|Saproling|Insect|Plant|Wolf|Beast|Servo|Thopter|Angel|Dragon)$/i;

const boardState = () =>
  page.evaluate(pattern => {
    const re = new RegExp(pattern, 'i');
    const h = window.innerHeight;
    /* The battlefield is everything above the hand strip along the bottom.
       Cards in hand carry the same aria-label, so a Soldier held in hand would
       otherwise be counted as a Soldier in play. */
    const onBoard = [...document.querySelectorAll('[aria-label]')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 30 && r.height > 30 && r.bottom < h * 0.72;
    });
    const names = onBoard
      .map(el => (el.getAttribute('aria-label') || '').trim())
      .filter(n => re.test(n));
    return { tokensOnBoard: names.length, tokenNames: names.sort() };
  }, TOKEN_NAMES.source);

/**
 * The game log, which is the honest signal.
 *
 * Project law is that the engine never silently does nothing, so a token that
 * was really created writes a line saying so. A card-shaped rectangle
 * appearing is weaker evidence than the game itself reporting the act.
 */
const logLines = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .filter(el => el.children.length === 0)
      .map(el => (el.textContent || '').trim())
      .filter(t => /\bcreated\b.*\btokens?\b/i.test(t))
  );

await page.goto(`${BASE}/play-flow-harness.html?view=flow`, { waitUntil: 'networkidle2' });
await sleep(1200);

const pressedMode = await page.evaluate(() => {
  const el = [...document.querySelectorAll('button[aria-pressed]')].find(b =>
    /GOLDFISH/.test(b.innerText || '')
  );
  el?.click();
  return Boolean(el);
});
log('goldfish door pressed:', pressedMode);
await sleep(900);

const FORWARD =
  /(Set up your seat|Fill the seats|Watch the \d-player game|Shuffle|Deal|Start|Begin|Play the|Keep|Continue|Next)/i;

const cardShapes = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('button, [role="button"], img')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 55 && r.width < 200 && r.height > r.width * 1.2 && r.top > 60 && r.bottom < 820;
    }).length
  );

for (let step = 0; step < 8; step++) {
  if ((await cardShapes()) > 0) break;
  const went = await press(FORWARD);
  log(`  step ${step}: forward ${went}`);
  await sleep(1400);
}

log('waiting for a card to appear...');
let seen = 0;
for (let i = 0; i < 90; i++) {
  seen = await cardShapes();
  if (seen > 0) break;
  await sleep(1000);
}
if (!seen) {
  await page.screenshot({ path: `${OUT}/00-no-cards.png` });
  log('no cards found; saved 00-no-cards.png');
  await browser.close();
  process.exit(1);
}

/*
 * KEEP THE OPENING HAND FIRST.
 *
 * Found by running this and reading the screenshot rather than by reasoning:
 * the first attempt clicked a card while the mulligan decision was still open
 * and reported "token buttons offered: NONE". That was CORRECT behaviour, not
 * a missing control. `CenterPreview` takes a `holdReason` while an opening
 * hand is undecided and withholds every play, `ManualPanel` included, because
 * judging seven cards is the whole decision at that moment. So the script has
 * to make the decision a player makes before it can photograph the controls.
 */
const kept = await press(/^KEEP THIS HAND$/);
log('kept the opening hand:', kept);
await sleep(1200);

// Let a turn or two run, then stop the clock so the shots are not a moving target.
await sleep(5000);
await press(/^Pause$/);
await sleep(500);

/*
 * Click a card in HAND. It is the reliable target for the same reason
 * card-panel-shot.mjs gives: it always exists, it is in the bottom strip, and
 * it is controlled by the viewer, which is what makes `ManualPanel` render.
 * The token controls hang off a card because that is how it happens at a
 * table: a card told you to make the token.
 */
const clicked = await page.evaluate(() => {
  const h = window.innerHeight;
  const cards = [...document.querySelectorAll('button, [role="button"]')]
    .map(el => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ el, r }) =>
      r.width > 60 && r.width < 240 &&
      r.height > r.width * 1.1 &&
      r.top > h * 0.6 &&
      !/zone|exile|graveyard|library|command|stack/i.test(
        el.getAttribute('aria-label') || el.innerText || ''
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
log('clicked:', clicked ?? 'nothing matched');
await sleep(900);

const before = await boardState();
log('\nbefore:', JSON.stringify(before));
await page.screenshot({ path: `${OUT}/01-panel.png` });
log('saved 01-panel.png  (the panel, with Make a token on it)');

/* Is the section even on screen? Asked of the DOM, because "I added a button"
   and "a player can see a button" are different claims and this project has
   confused them before. */
const sectionVisible = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('span')].filter(s =>
    /^make a token$/i.test((s.innerText || '').trim())
  );
  if (!heads.length) return null;
  const r = heads[0].getBoundingClientRect();
  return { onScreen: r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight, top: Math.round(r.top) };
});
log('"Make a token" heading:', JSON.stringify(sectionVisible));

const tokenButtons = await page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .filter(b => /^Create a .* token/i.test(b.getAttribute('title') || ''))
    .map(b => (b.innerText || '').split('\n').join(' ').trim())
);
log('token buttons offered:', tokenButtons.join(' | ') || 'NONE');

/* ------------------------------------------------------------------ *
 * 1. Make a Treasure                                                 *
 * ------------------------------------------------------------------ */
const madeTreasure = await page.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find(b =>
    /^Create a Treasure token$/i.test(b.getAttribute('title') || '')
  );
  if (!el) return false;
  el.click();
  return true;
});
await sleep(700);
const afterTreasure = await boardState();
log('\npressed Treasure:', madeTreasure, '->', JSON.stringify(afterTreasure));
await page.screenshot({ path: `${OUT}/02-treasure-made.png` });
log('saved 02-treasure-made.png');

/* ------------------------------------------------------------------ *
 * 2. Spend it. A Treasure is sacrificed, and CR 704.5d then removes  *
 *    it from the game rather than leaving it in a graveyard.         *
 * ------------------------------------------------------------------ */
const openedTreasure = await page.evaluate(() => {
  const el = [...document.querySelectorAll('button, [role="button"]')].find(b =>
    /treasure/i.test(b.getAttribute('aria-label') || b.getAttribute('title') || b.innerText || '')
  );
  if (!el) return false;
  el.click();
  return true;
});
await sleep(800);
await page.screenshot({ path: `${OUT}/03-treasure-selected.png` });

const spent = await press(/^To graveyard$/);
await sleep(800);
const afterSpend = await boardState();
log('\nopened the Treasure:', openedTreasure, ' spent it:', spent, '->', JSON.stringify(afterSpend));
await page.screenshot({ path: `${OUT}/04-treasure-spent.png` });
log('saved 04-treasure-spent.png');

/* ------------------------------------------------------------------ *
 * 3. A 1/1 army                                                      *
 * ------------------------------------------------------------------ */
await page.evaluate(() => {
  const h = window.innerHeight;
  const cards = [...document.querySelectorAll('button, [role="button"]')]
    .map(el => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 60 && r.width < 240 && r.height > r.width * 1.1 && r.top > h * 0.6);
  cards[Math.min(2, cards.length - 1)]?.el.click();
});
await sleep(800);

// Soldier is behind the "more" disclosure, so open it first.
await page.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find(b => /\d+ more/i.test(b.innerText || ''));
  el?.click();
});
await sleep(400);

let army = 0;
for (let i = 0; i < 3; i++) {
  const hit = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(b =>
      /^Create a 1\/1 Soldier token$/i.test(b.getAttribute('title') || '')
    );
    if (!el) return false;
    el.click();
    return true;
  });
  if (hit) army++;
  await sleep(450);
}
const afterArmy = await boardState();
log('\nSoldier presses that landed:', army, '->', JSON.stringify(afterArmy));
await page.screenshot({ path: `${OUT}/05-army-panel.png` });
log('saved 05-army-panel.png');

/* Close the preview so the army is photographed on the MAT rather than behind
   the panel that made it. The point being proved is three creatures a player
   can attack with, not three log lines. */
await page.evaluate(() => {
  document.querySelector('[aria-label="Close the preview"]')?.click();
});
await sleep(900);
await page.screenshot({ path: `${OUT}/06-army-on-board.png` });
log('saved 06-army-on-board.png');

const lines = await logLines();
log('\ngame log lines about tokens:');
for (const line of lines) log('   ', line);

/* ------------------------------------------------------------------ *
 * The verdict, printed rather than left to the eye                   *
 * ------------------------------------------------------------------ */
console.log('\n================ RESULT ================');
console.log('token controls on screen  :', tokenButtons.length);
console.log('tokens before             :', before?.tokensOnBoard);
console.log('after pressing Treasure   :', afterTreasure?.tokensOnBoard, afterTreasure?.tokenNames?.join(', '));
console.log('after spending it         :', afterSpend?.tokensOnBoard);
console.log('after three Soldiers      :', afterArmy?.tokensOnBoard, afterArmy?.tokenNames?.join(', '));

await browser.close();
