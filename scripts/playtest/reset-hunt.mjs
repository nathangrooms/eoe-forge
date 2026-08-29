/**
 * Which press throws the game away.
 *
 * A by-hand run went from seven permanents at turn 6 to turn 1 with an empty
 * mat and "You drew 7 cards" in the log. Idling for two minutes changes
 * nothing, so a press did it. This tries the candidates one at a time and
 * reports the turn number after each.
 */
import { mkdirSync } from 'node:fs';
import { launch, sleep, press, startGame, playTurns, matCards, openCard, closePreview } from './table.mjs';

const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:8081';
mkdirSync('.shots/reset-hunt', { recursive: true });

const state = page =>
  page.evaluate(() => ({
    turn: (document.body.innerText.match(/TURN\s*\n?\s*(\d+)/) || [])[1] || '?',
    life: (document.body.innerText.match(/(\d+)\s*\n?\s*LIFE/) || [])[1] || '?',
    perms: document.querySelectorAll('[data-instance]').length,
  }));

(async () => {
  const { browser, page, errors } = await launch({ width: 1600, height: 1000 });
  await startGame(page, { base, mode: 'GOLDFISH' });
  await playTurns(page, 4, s => console.log(s));
  let last = await state(page);
  console.log('after four turns:', JSON.stringify(last));

  const step = async (name, fn) => {
    await fn();
    await sleep(1200);
    const now = await state(page);
    const changed = now.turn !== last.turn && +now.turn < +last.turn;
    console.log(`  ${changed ? 'RESET  ' : 'ok     '} ${name}  ${JSON.stringify(now)}`);
    if (changed) await page.screenshot({ path: `.shots/reset-hunt/${name.replace(/\W+/g, '-')}.png` });
    last = now;
  };

  await step('press Escape', () => page.keyboard.press('Escape'));
  await step('open LIBRARY', () => press(page, /^LIBRARY/));
  await step('press Escape with the zone open', () => page.keyboard.press('Escape'));
  await step('close the zone', () =>
    page.evaluate(() => document.querySelector('[aria-label="Close the zone"]')?.click()));
  await step('open a card', async () => {
    const b = await matCards(page);
    if (b[0]) await openCard(page, b[0].id);
  });
  await step('close the preview', () => closePreview(page));
  await step('press the life badge', () =>
    page.evaluate(() => {
      [...document.querySelectorAll('button')]
        .find(x => /^\d+\s*\n?\s*LIFE$/i.test((x.innerText || '').trim()))
        ?.click();
    }));
  await step('press Escape with the seat panel open', () => page.keyboard.press('Escape'));
  await step('END TURN', () => press(page, /^END TURN$/));
  await step('END TURN again', () => press(page, /^END TURN$/));
  await step('END TURN a third time', () => press(page, /^END TURN$/));
  await step('END TURN a fourth time', () => press(page, /^END TURN$/));

  console.log('errors:', errors.length);
  for (const e of errors.slice(0, 6)) console.log('  ' + e);
  await browser.close();
})();
