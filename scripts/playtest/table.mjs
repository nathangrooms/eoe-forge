/**
 * Reading and pressing the real table, from outside the app.
 *
 * `scripts/playDrive.mjs` picks battlefield cards with a height filter, and on
 * this layout that filter also catches the graveyard and command-zone TILES in
 * the seat's zone rail — they are `GameCardView`s too, at 119px instead of
 * 200px, and clicking one opens a zone panel rather than the card. A probe that
 * clicked one reported "the preview offers 0 controls", which is true of the
 * thing it clicked and says nothing about the card preview.
 *
 * So the rule here is the one the mat itself uses: a permanent is drawn at the
 * board's card width and a zone tile is drawn at the smaller tile width. Take
 * the widest cluster above the hand and nothing else.
 */
import puppeteer from 'puppeteer';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ width = 1600, height = 1000 } = {}) {
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 300000,
    args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 240)));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 240));
  });
  page.errorsSeen = errors;
  return { browser, page, errors };
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

/** Permanents on the mat: the widest `[data-instance]` cluster above the hand. */
export const matCards = page =>
  page.evaluate(() => {
    const h = window.innerHeight;
    const rows = [...document.querySelectorAll('[data-instance]')].map(el => {
      const r = el.getBoundingClientRect();
      return {
        el,
        id: el.getAttribute('data-instance'),
        name: el.querySelector('[aria-label]')?.getAttribute('aria-label') || '',
        w: Math.round(r.width),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
      };
    });
    const above = rows.filter(r => r.bottom < h * 0.8 && r.top > 40 && r.w > 40);
    if (!above.length) return [];
    const widest = Math.max(...above.map(r => r.w));
    return above
      .filter(r => r.w >= widest - 6)
      .map(({ el, ...rest }) => rest);
  });

export const handCards = page =>
  page.evaluate(() => {
    const h = window.innerHeight;
    return [...document.querySelectorAll('[data-instance]')]
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 40 && r.top > h * 0.72;
      })
      .map(el => ({
        id: el.getAttribute('data-instance'),
        name: el.querySelector('[aria-label]')?.getAttribute('aria-label') || '',
      }));
  });

/** The card preview panel: `CenterPreview`'s `role="group"`. */
export const previewPanel = 'div[role="group"][aria-label]';

export const openCard = async (page, instanceId) => {
  await page.evaluate(id => {
    const host = document.querySelector(`[data-instance="${id}"]`);
    if (!host) return;
    const target = host.querySelector('[role="button"], img, button') || host;
    target.click();
  }, instanceId);
  await sleep(750);
  return page.evaluate(sel => !!document.querySelector(sel), previewPanel);
};

export const closePreview = async page => {
  await page.evaluate(() => document.querySelector('[aria-label="Close the preview"]')?.click());
  await sleep(450);
};

/** Every control the open preview offers, tagged with the heading above it. */
export const previewMenu = page =>
  page.evaluate(sel => {
    const panel = document.querySelector(sel);
    if (!panel) return null;
    const out = [];
    let heading = '(top)';
    const walk = el => {
      for (const child of el.children) {
        if (child.tagName === 'BUTTON') {
          out.push({
            heading,
            label: (child.innerText || '').split('\n').join(' ').trim(),
            disabled: child.disabled,
          });
          continue;
        }
        const text = (child.innerText || '').trim();
        if (
          child.children.length === 0 &&
          text &&
          text.length < 48 &&
          text === text.toUpperCase() &&
          /[A-Z]/.test(text)
        ) {
          heading = text;
          continue;
        }
        walk(child);
      }
    };
    walk(panel);
    return out;
  }, previewPanel);

export const pressInPreview = (page, src) =>
  page.evaluate(
    (s, sel) => {
      const panel = document.querySelector(sel);
      if (!panel) return false;
      const el = [...panel.querySelectorAll('button')].find(
        b => !b.disabled && new RegExp(s, 'i').test((b.innerText || '').trim())
      );
      if (!el) return false;
      el.click();
      return true;
    },
    src,
    previewPanel
  );

/** What one permanent says on the mat, as a player reads it. */
export const cardText = (page, id) =>
  page.evaluate(i => {
    const host = document.querySelector(`[data-instance="${i}"]`);
    return host ? (host.innerText || '').split('\n').join(' · ').trim() : null;
  }, id);

/** The newest lines of the game log. */
export const logLines = page =>
  page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[data-log], [data-feed], li, p')];
    const hits = nodes
      .map(n => (n.innerText || '').trim())
      .filter(t => t && t.length < 160);
    return hits.slice(-40);
  });

/** Zone counts read off the seat rail: LIBRARY 87, GRAVEYARD 2, EXILE 0. */
export const zoneCounts = page =>
  page.evaluate(() => {
    const out = {};
    for (const b of document.querySelectorAll('button')) {
      const t = (b.innerText || '').trim();
      const m = t.match(/^(LIBRARY|GRAVEYARD|EXILE|COMMAND)\s*\n?\s*(\d+)$/i);
      if (m) out[m[1].toUpperCase()] = +m[2];
    }
    return out;
  });

export const lifeShown = page =>
  page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x =>
      /^\d+\s*\n?\s*LIFE$/i.test((x.innerText || '').trim())
    );
    return b ? +(b.innerText.match(/\d+/) || [0])[0] : null;
  });

/**
 * Walk the mode wall, the deck wall and the seat step, then keep the hand.
 *
 * Keeping the opening hand is not optional: `CenterPreview` withholds every
 * play while the opening hand is undecided, so a script that clicks a card
 * first photographs an empty panel and reports a control that is not missing.
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
    /(Set up your seat|Choose opponents|Fill the seats|Watch the \d-player game|Start \d-player game|Shuffle|Deal|Start|Begin|Play the|Keep|Continue|Next)/i;
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

/** Play a land and cast what the mana allows, for `turns` turns. */
export async function playTurns(page, turns = 6, log = () => {}) {
  for (let turn = 0; turn < turns; turn++) {
    const hand = await handCards(page);
    for (const card of hand) {
      await openCard(page, card.id);
      const played = await pressInPreview(page, '^(PLAY LAND|PLAY THIS LAND)$');
      await closePreview(page);
      if (played) break;
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const rest = await handCards(page);
      let cast = false;
      for (const card of rest) {
        await openCard(page, card.id);
        cast = await pressInPreview(page, '^(CAST|CAST FOR|SUMMON)');
        await closePreview(page);
        if (cast) break;
      }
      if (!cast) break;
      await sleep(600);
    }
    const board = await matCards(page);
    log(`  turn ${turn + 1}: ${board.length} permanents on the mat`);
    if (turn < turns - 1) {
      await press(page, /^END TURN$/);
      await sleep(2200);
      for (let i = 0; i < 20; i++) {
        if (await press(page, /^(KEEP THIS HAND|OK|CONTINUE)$/)) await sleep(600);
        if (await page.evaluate(() => !!document.querySelector('button:not([disabled])'))) break;
        await sleep(900);
      }
    }
  }
}
