/**
 * Drive a real game far enough that there is something to photograph.
 *
 * Shared by the stat and mark shot scripts so they cannot drift into two
 * different boards. GOLDFISH and VERSUS BOTS both hand seat one to the person
 * running this, which is the whole reason those doors are used rather than
 * PLAYTEST: playtest is a WATCHED table, its preview is read-only and the
 * by-hand controls do not render at all, so a screenshot of them there would
 * prove nothing.
 *
 * Nothing here reads a debug global. `window.__deckmatrixGame` does not exist
 * anywhere in `src` and two older scripts in this directory have been calling
 * it and reporting "no game" beside a screenshot of a board. Everything below
 * is read off the DOM a player is looking at.
 */
import puppeteer from 'puppeteer';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ width = 1600, height = 1000 } = {}) {
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 300000,
    /* --disable-lcd-text is not optional: subpixel antialiasing puts coloured
       fringes on thin type over a dark mat and reads as a styling bug that is
       not there. */
    args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 220)));
  return { browser, page };
}

export const press = (page, re) =>
  page.evaluate(src => {
    const el = [...document.querySelectorAll('button')].find(
      b => !b.disabled && new RegExp(src, 'i').test((b.innerText || '').trim())
    );
    if (!el) return false;
    el.click();
    return true;
  }, re.source);

/** Cards on the battlefield strip: a `[data-instance]` above the hand. */
export const boardCards = page =>
  page.evaluate(() => {
    const h = window.innerHeight;
    return [...document.querySelectorAll('[data-instance]')]
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 40 && r.bottom < h * 0.74 && r.top > 60;
      })
      .map(el => ({
        id: el.getAttribute('data-instance'),
        name: el.querySelector('[aria-label]')?.getAttribute('aria-label') || '',
        w: Math.round(el.getBoundingClientRect().width),
      }));
  });

/** Cards in the fanned hand along the bottom. */
const handCards = page =>
  page.evaluate(() => {
    const h = window.innerHeight;
    return [...document.querySelectorAll('[data-instance]')]
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 40 && r.top > h * 0.7;
      })
      .map(el => ({
        id: el.getAttribute('data-instance'),
        name: el.querySelector('[aria-label]')?.getAttribute('aria-label') || '',
      }));
  });

export const openCard = async (page, instanceId) => {
  const ok = await page.evaluate(id => {
    const host = document.querySelector(`[data-instance="${id}"]`);
    if (!host) return false;
    (host.querySelector('[role="button"], img, button') || host).click();
    return true;
  }, instanceId);
  await sleep(700);
  return ok;
};

export const closePreview = async page => {
  await page.evaluate(() => document.querySelector('[aria-label="Close the preview"]')?.click());
  await sleep(500);
};

/** Every action button offered on the open preview, by label. */
export const previewActions = page =>
  page.evaluate(() => {
    const panel = document.querySelector('[role="group"][aria-label]');
    if (!panel) return [];
    return [...panel.querySelectorAll('button')]
      .filter(b => !b.disabled)
      .map(b => (b.innerText || '').split('\n').join(' ').trim())
      .filter(Boolean);
  });

const pressInPreview = (page, re) =>
  page.evaluate(src => {
    const panel = document.querySelector('[role="group"][aria-label]');
    if (!panel) return false;
    const el = [...panel.querySelectorAll('button')].find(
      b => !b.disabled && new RegExp(src, 'i').test((b.innerText || '').trim())
    );
    if (!el) return false;
    el.click();
    return true;
  }, re.source);

/**
 * Walk the mode wall, the deck wall and the seat step, then keep the hand.
 *
 * KEEPING THE OPENING HAND IS NOT OPTIONAL. `CenterPreview` takes a
 * `holdReason` while the opening hand is undecided and withholds every play,
 * `ManualPanel` included, because judging seven cards is the whole decision at
 * that moment. A script that clicks a card before deciding photographs an empty
 * panel and reports a missing control that is not missing.
 */
export async function startGame(page, { base, mode = 'GOLDFISH' } = {}) {
  await page.goto(`${base}/play-flow-harness.html?view=flow`, { waitUntil: 'networkidle2' });
  await sleep(1200);

  await page.evaluate(m => {
    [...document.querySelectorAll('button[aria-pressed]')]
      .find(b => new RegExp(m).test(b.innerText || ''))
      ?.click();
  }, mode);
  await sleep(900);

  const FORWARD =
    /(Set up your seat|Fill the seats|Watch the \d-player game|Shuffle|Deal|Start|Begin|Play the|Keep|Continue|Next)/i;
  for (let step = 0; step < 8; step++) {
    if ((await page.evaluate(() => document.querySelectorAll('[data-instance]').length)) > 0) break;
    await press(page, FORWARD);
    await sleep(1400);
  }
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => document.querySelectorAll('[data-instance]').length)) break;
    await sleep(1000);
  }
  await press(page, /^KEEP THIS HAND$/);
  await sleep(1100);
}

/**
 * Play a land and cast whatever the board will let us cast, for `turns` turns.
 *
 * A stat box on an empty mat is not a measurement, so the board has to be
 * filled the way a player fills it: through the preview, one press at a time,
 * with the engine deciding what is legal. Nothing is forced into play.
 */
export async function playTurns(page, turns = 8, log = () => {}) {
  for (let turn = 0; turn < turns; turn++) {
    const hand = await handCards(page);

    // A land first, because everything else needs the mana.
    for (const card of hand) {
      await openCard(page, card.id);
      const played = await pressInPreview(page, /^(PLAY LAND|PLAY THIS LAND)$/);
      await closePreview(page);
      if (played) break;
    }

    // Then as many spells as the mana will carry.
    for (let attempt = 0; attempt < 4; attempt++) {
      const rest = await handCards(page);
      let cast = false;
      for (const card of rest) {
        await openCard(page, card.id);
        cast = await pressInPreview(page, /^(CAST|CAST FOR|SUMMON)/);
        await closePreview(page);
        if (cast) break;
      }
      if (!cast) break;
      await sleep(600);
    }

    const board = await boardCards(page);
    log(`  turn ${turn + 1}: ${board.length} permanents on the mat`);
    if (turn < turns - 1) {
      await press(page, /^END TURN$/);
      await sleep(2200);
      /* A bot seat takes its turn; wait for the board to come back to us. */
      for (let i = 0; i < 20; i++) {
        if (await press(page, /^(KEEP THIS HAND|OK|CONTINUE)$/)) await sleep(600);
        const mine = await page.evaluate(
          () => !!document.querySelector('button:not([disabled])')
        );
        if (mine) break;
        await sleep(900);
      }
    }
  }
}
