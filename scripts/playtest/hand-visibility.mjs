/**
 * HOW MUCH OF EACH CARD IN YOUR HAND IS ACTUALLY ON SCREEN?
 *
 * The fan is SUNK on purpose: `tableMetrics.ts` reserves 62% of a card above
 * the table edge and lets the rest hang below the bottom of the window, so a
 * large hand stops lying across the player's own permanents. That trade is
 * right during a turn, when the board is the thing being decided.
 *
 * It is wrong at the MULLIGAN, where the whole decision is the seven cards and
 * there is no board yet to protect. This measures both moments so the two can
 * be told apart with numbers rather than with an opinion.
 *
 *   BASE=http://127.0.0.1:8080 node scripts/playtest/hand-visibility.mjs
 */
import fs from 'node:fs';
import { openHarness, sleep, pressText, unblock, gameState } from './uiLib.mjs';

const OUT = '.shots/hand-visibility';

/** Fraction of each hand card's painted box that is below the window. */
const measure = page => page.evaluate(() => {
  const vh = window.innerHeight;
  const cards = [];
  for (const img of document.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    if (r.width < 60 || r.height < 60) continue;
    // The fan is the only thing that reaches the bottom edge of the window.
    if (r.bottom < vh * 0.55) continue;
    const below = Math.max(0, r.bottom - vh);
    cards.push({
      alt: (img.getAttribute('alt') || '').slice(0, 30),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      h: Math.round(r.height),
      clipped: r.height ? +(below / r.height).toFixed(3) : 0,
    });
  }
  cards.sort((a, b) => b.clipped - a.clipped);
  return {
    vh,
    count: cards.length,
    worst: cards.length ? cards[0].clipped : 0,
    anyClipped: cards.filter(c => c.clipped > 0.02).length,
    cards: cards.slice(0, 10),
  };
});

const main = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page } = await openHarness({ width: 1600, height: 1000 });

  // Mode wall -> deck -> seats -> shuffle, stopping AT the mulligan.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /VERSUS BOTS/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(1500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /seeded|Use this deck|Choose/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(1200);
  await pressText(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
  await sleep(3500);

  const atMulligan = await measure(page);
  const mulliganOnScreen = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some(b => /^(keep|mulligan)$/i.test((b.innerText || '').trim()))
  );
  await page.screenshot({ path: `${OUT}/mulligan.png` });

  await pressText(page, /^Keep$/);
  await sleep(2500);

  for (let i = 0; i < 90; i++) {
    const g = await gameState(page);
    if (!g || g.status === 'complete' || g.turn >= 5) break;
    await unblock(page);
    await sleep(300);
  }
  const inGame = await measure(page);
  await page.screenshot({ path: `${OUT}/in-game.png` });

  console.log(JSON.stringify({ mulliganBarOnScreen: mulliganOnScreen, atMulligan, inGame }, null, 2));
  await browser.close();
};

main();
