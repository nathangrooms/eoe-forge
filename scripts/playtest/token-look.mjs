/**
 * What a hand-made token looks like on the mat, before and after.
 *
 * Tokens have no art in the card database and never will, so `TypographicFace`
 * IS a token's permanent face rather than a loading state. It was deciding how
 * much of the card to draw from the `size` TOKEN, which defaults to `'sm'` and
 * which the battlefield never sets — it passes `width`. So a 200px Soldier was
 * judged compact exactly as a 58px rail thumbnail is and dropped its type line,
 * its mana cost and its rules text: a black rectangle with a name on it.
 *
 * This makes four tokens and photographs one, close up, with the pixels
 * measured rather than described.
 */
import { mkdirSync } from 'node:fs';
import { launch, sleep, startGame, playTurns, openCard, closePreview, pressInPreview, previewPanel } from './table.mjs';

const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:8081';
const OUT = '.shots/token-look';
mkdirSync(OUT, { recursive: true });

(async () => {
  const { browser, page, errors } = await launch({ width: 1600, height: 1000 });
  await startGame(page, { base, mode: 'GOLDFISH' });
  await playTurns(page, 6, s => console.log(s));

  const first = await page.evaluate(sel => {
    const panel = document.querySelector(sel);
    return [...document.querySelectorAll('[data-instance]')]
      .filter(el => (!panel || !panel.contains(el)) && el.getBoundingClientRect().width > 150 &&
        el.getBoundingClientRect().bottom < window.innerHeight * 0.8)
      .map(el => el.getAttribute('data-instance'))[0];
  }, previewPanel);
  await openCard(page, first);
  await sleep(500);
  await pressInPreview(page, '^Treasure$');
  await sleep(700);
  await pressInPreview(page, '^15 more$');
  await sleep(400);
  for (let i = 0; i < 2; i++) { await pressInPreview(page, '^Soldier'); await sleep(500); }
  await closePreview(page);
  await sleep(700);

  const tokens = await page.evaluate(() =>
    [...document.querySelectorAll('[data-instance]')]
      .filter(el => /^p1-tk/.test(el.getAttribute('data-instance') || ''))
      .map(el => {
        const r = el.getBoundingClientRect();
        return {
          id: el.getAttribute('data-instance'),
          w: Math.round(r.width),
          h: Math.round(r.height),
          x: Math.round(r.left),
          y: Math.round(r.top),
          text: (el.innerText || '').split('\n').filter(Boolean),
        };
      })
  );
  console.log('\nTOKENS ON THE MAT');
  for (const t of tokens) {
    console.log(`  ${t.id} ${t.w}x${t.h} at ${t.x},${t.y}  reads: ${JSON.stringify(t.text)}`);
  }

  await page.screenshot({ path: `${OUT}/board.png` });
  const shot = tokens[0];
  if (shot) {
    await page.screenshot({
      path: `${OUT}/one-token.png`,
      clip: { x: Math.max(0, shot.x - 8), y: Math.max(0, shot.y - 8), width: shot.w + 16, height: shot.h + 60 },
    });
  }
  console.log(`\nerrors: ${errors.length}`);
  await browser.close();
})();
