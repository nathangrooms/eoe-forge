/**
 * Does a game in progress throw itself away?
 *
 * Two by-hand runs lost the board mid-run: seven permanents at turn 6, then
 * turn 1 with an empty mat and "You drew 7 cards" in the log, with no control
 * pressed that could restart anything. This watches a started game and does
 * NOTHING to it, so whatever happens is the app's own doing.
 */
import { mkdirSync } from 'node:fs';
import { launch, sleep, startGame, playTurns } from './table.mjs';

const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:8081';
mkdirSync('.shots/reset-watch', { recursive: true });

(async () => {
  const { browser, page, errors } = await launch({ width: 1600, height: 1000 });
  const reloads = [];
  page.on('framenavigated', f => { if (f === page.mainFrame()) reloads.push(Date.now()); });

  await startGame(page, { base, mode: 'GOLDFISH' });
  await playTurns(page, 4, s => console.log(s));

  const read = () =>
    page.evaluate(() => {
      const turn = (document.body.innerText.match(/TURN\s*\n?\s*(\d+)/) || [])[1] || '?';
      const life = (document.body.innerText.match(/(\d+)\s*\n?\s*LIFE/) || [])[1] || '?';
      const perms = [...document.querySelectorAll('[data-instance]')].length;
      return { turn, life, perms };
    });

  console.log('\nnow doing NOTHING for 120 seconds:');
  let prev = JSON.stringify(await read());
  console.log('  t=0  ' + prev);
  for (let t = 3; t <= 120; t += 3) {
    await sleep(3000);
    const now = JSON.stringify(await read());
    if (now !== prev) {
      console.log(`  t=${t}s  CHANGED  ${prev} -> ${now}`);
      await page.screenshot({ path: `.shots/reset-watch/change-${t}s.png` });
      prev = now;
    }
  }
  console.log(`  end  ${prev}`);
  console.log(`main-frame navigations after start: ${reloads.length}`);
  console.log(`errors: ${errors.length}`);
  for (const e of errors.slice(0, 6)) console.log('  ' + e);
  await browser.close();
})();
