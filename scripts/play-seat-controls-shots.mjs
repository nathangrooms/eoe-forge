/**
 * Prove a player can change a life total, at the table, by pressing things.
 *
 * The claim being tested is not "the reducer handles LIFE_CHANGE" — it always
 * did, with passing tests, and no player could reach it. It is: start a real
 * game, press the life badge, press a button, and watch the number on the mat
 * change. Everything is read off the DOM a player is looking at.
 *
 *   node scripts/play-seat-controls-shots.mjs [port]
 */
import { mkdirSync } from 'node:fs';
import { launch, sleep, startGame, playTurns, boardCards, openCard, closePreview } from './playDrive.mjs';

const PORT = process.argv[2] || '8081';
const BASE = `http://localhost:${PORT}`;
const OUT = '.shots/seat-controls';

/** The life number drawn on the viewer's own badge. */
const lifeOnMat = page =>
  page.evaluate(() => {
    const badge = [...document.querySelectorAll('[aria-label]')].find(el =>
      /^\d+ life\. Open this seat/i.test(el.getAttribute('aria-label') || '')
    );
    if (!badge) return null;
    return Number.parseInt((badge.getAttribute('aria-label') || '').match(/^(\d+)/)?.[1] ?? '', 10);
  });

/** The poison pip drawn on the viewer's badge, read from its own tooltip. */
const poisonOnMat = page =>
  page.evaluate(() => {
    const pip = [...document.querySelectorAll('[title]')].find(el =>
      /poison counters\./i.test(el.getAttribute('title') || '')
    );
    return pip ? (pip.getAttribute('title') || '').split('.')[0] : null;
  });

/** The commander damage pip, same idea. */
const cmdrPipOnMat = page =>
  page.evaluate(() => {
    const pip = [...document.querySelectorAll('[title]')].find(el =>
      /commander damage from/i.test(el.getAttribute('title') || '')
    );
    return pip ? (pip.getAttribute('title') || '').split('.')[0] : null;
  });

const openSeatPanel = async page => {
  const ok = await page.evaluate(() => {
    const badge = [...document.querySelectorAll('button[aria-label]')].find(el =>
      /Open this seat/i.test(el.getAttribute('aria-label') || '')
    );
    if (!badge) return false;
    badge.click();
    return true;
  });
  await sleep(700);
  return ok;
};

/** Buttons in the right-hand rail, which is where the seat panel draws. */
const railButtons = page =>
  page.evaluate(() => {
    const cut = window.innerWidth * 0.62;
    return [...document.querySelectorAll('button')]
      .filter(b => b.getBoundingClientRect().left > cut && b.getBoundingClientRect().width > 16)
      .map(b => (b.innerText || '').split('\n').join(' ').trim())
      .filter(Boolean);
  });

const pressRail = (page, re) =>
  page.evaluate(src => {
    const cut = window.innerWidth * 0.62;
    const el = [...document.querySelectorAll('button')].find(
      b => !b.disabled && b.getBoundingClientRect().left > cut &&
        new RegExp(src).test((b.innerText || '').trim())
    );
    if (!el) return false;
    el.click();
    return true;
  }, re.source);

/** The last few lines of the game log, which is the honesty check. */
const feed = page =>
  page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-log-entry], li, p')]
      .map(el => (el.innerText || '').trim())
      .filter(t => t && t.length < 140);
    return rows.slice(-70);
  });

/** Chips on a seat band: TURN, MONARCH, and so on. */
const seatChips = page =>
  page.evaluate(() =>
    [...document.querySelectorAll('span')]
      .map(el => (el.innerText || '').trim())
      .filter(t => /^(MONARCH|INITIATIVE|TURN|OUT|BOT|WATCHING)$/i.test(t))
  );

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { browser, page } = await launch({ width: 1600, height: 1000 });
  page.setDefaultNavigationTimeout(120000);
  const say = (label, value) => console.log(`  ${label.padEnd(38)} ${value}`);

  try {
    await startGame(page, { base: BASE, mode: 'GOLDFISH' });
    await playTurns(page, 3, m => console.log(m));

    console.log('\n--- BEFORE ---');
    say('life on the mat', await lifeOnMat(page));
    await page.screenshot({ path: `${OUT}/01-before.png` });

    const opened = await openSeatPanel(page);
    say('life badge opened the panel', opened);
    const buttons = await railButtons(page);
    console.log('\n  seat panel buttons:');
    console.log('    ' + buttons.join(' · '));
    await page.screenshot({ path: `${OUT}/02-panel.png` });

    /* ---------------- life ---------------- */
    await pressRail(page, /^-5$/);
    await sleep(500);
    await pressRail(page, /^-1$/);
    await sleep(500);
    say('life after -5 then -1', await lifeOnMat(page));
    await pressRail(page, /^\+5$/);
    await sleep(600);
    say('life after +5', await lifeOnMat(page));
    await page.screenshot({ path: `${OUT}/03-life-moved.png` });

    /* ---------------- an exact total ---------------- */
    await page.evaluate(() => {
      const input = [...document.querySelectorAll('input')].find(
        i => /exact number/i.test(i.getAttribute('aria-label') || '')
      );
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '17');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(300);
    await pressRail(page, /^Set$/);
    await sleep(600);
    say('life after typing 17 and Set', await lifeOnMat(page));

    /* ---------------- poison, counters, commander damage ---------------- */
    say('log right after the life presses', JSON.stringify(
      (await feed(page)).filter(l => /life/i.test(l)).slice(-3)));

    await pressRail(page, /^Poison \+1$/);
    await sleep(500);
    say('poison shown on the badge', await poisonOnMat(page));
    await pressRail(page, /^Energy \+1$/);
    await sleep(500);

    /* The commander damage row is labelled with the commander's own name, so it
       is found by asking the panel which row that is rather than by guessing. */
    const commanderName = await page.evaluate(() => {
      const cut = window.innerWidth * 0.62;
      const heading = [...document.querySelectorAll('span')].find(
        s => /^COMMANDER DAMAGE$/i.test((s.innerText || '').trim())
      );
      const row = heading?.parentElement?.parentElement?.querySelectorAll('button');
      return row && row[0] ? (row[0].innerText || '').split(/\s+/).slice(0, 4).join(' ').trim() : null;
    });
    say('commander damage row found', commanderName);
    const lifeBeforeCmdr = await lifeOnMat(page);
    if (commanderName) {
      await page.evaluate(name => {
        const cut = window.innerWidth * 0.62;
        [...document.querySelectorAll('button')]
          .find(b => b.getBoundingClientRect().left > cut && (b.innerText || '').trim().startsWith(name))
          ?.click();
      }, commanderName);
      await sleep(700);
    }
    say('life before / after commander damage', `${lifeBeforeCmdr} -> ${await lifeOnMat(page)}`);
    say('commander damage pip on the badge', await cmdrPipOnMat(page));
    say('log right after', JSON.stringify(
      (await feed(page)).filter(l => /poison|energy|commander damage/i.test(l)).slice(-4)));
    await page.screenshot({ path: `${OUT}/04-counters.png` });

    /* ---------------- the crown ---------------- */
    say('seat chips before the crown', JSON.stringify(await seatChips(page)));
    await pressRail(page, /^Take the crown$/);
    await sleep(700);
    say('seat chips after the crown', JSON.stringify(await seatChips(page)));
    await pressRail(page, /^Take the initiative$/);
    await sleep(700);
    say('seat chips after the initiative', JSON.stringify(await seatChips(page)));
    await page.screenshot({ path: `${OUT}/05-roles.png` });

    /* ---------------- the log ---------------- */
    const lines = await feed(page);
    const interesting = lines.filter(l =>
      /life|poison|energy|commander damage|monarch|initiative/i.test(l)
    );
    console.log('\n  log lines this produced:');
    for (const line of interesting.slice(-12)) console.log('    ' + line);
    console.log('\n  storage prefix leaked onto the table:',
      lines.some(l => /mark:|counter:/.test(l)));

    /* ---------------- the library has two ends ---------------- */
    const board = await boardCards(page);
    if (board[0]) {
      await openCard(page, board[0].id);
      const moves = await page.evaluate(() => {
        const el = document.querySelector('[role="group"][aria-label]');
        return el
          ? [...el.querySelectorAll('button')].map(b => (b.innerText || '').trim()).filter(t => /library/i.test(t))
          : [];
      });
      console.log('\n  library controls on a permanent:', JSON.stringify(moves));
      await page.screenshot({ path: `${OUT}/06-library-ends.png` });
      await closePreview(page);
    }
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
