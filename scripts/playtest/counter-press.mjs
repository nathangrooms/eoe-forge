/**
 * Three presses of "+1/+1 +1" put three counters on. Do they?
 *
 * The engine does: `manualControlsFor` -> `applyAction` three times leaves
 * `{"+1/+1":3}` and a 5/5 (checked as a unit test). On a real board the same
 * three presses left the card reading 3/3, so something between the button and
 * the reducer is dropping two of them. This reports what the panel and the card
 * say after EACH press, so the answer is a sequence rather than a guess.
 */
import { mkdirSync } from 'node:fs';
import { launch, sleep, startGame, playTurns, openCard, previewMenu, pressInPreview, previewPanel } from './table.mjs';

const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:8081';
mkdirSync('.shots/counter-press', { recursive: true });

(async () => {
  const { browser, page, errors } = await launch({ width: 1600, height: 1000 });
  await startGame(page, { base, mode: 'GOLDFISH' });
  await playTurns(page, 6, s => console.log(s));

  const target = await page.evaluate(sel => {
    const panel = document.querySelector(sel);
    const cards = [...document.querySelectorAll('[data-instance]')].filter(
      el => (!panel || !panel.contains(el)) && el.getBoundingClientRect().width > 150 &&
        el.getBoundingClientRect().bottom < window.innerHeight * 0.8
    );
    return cards[0]?.getAttribute('data-instance');
  }, previewPanel);
  console.log('target', target);
  await openCard(page, target);
  await sleep(600);

  /** Whose card is the open preview about right now. */
  const panelSubject = () =>
    page.evaluate(sel => document.querySelector(sel)?.getAttribute('aria-label') ?? null, previewPanel);

  const read = () =>
    page.evaluate(
      (id, sel) => {
        const panel = document.querySelector(sel);
        const mat = [...document.querySelectorAll(`[data-instance="${id}"]`)].find(
          el => !panel || !panel.contains(el)
        );
        const buttons = panel
          ? [...panel.querySelectorAll('button')]
              .map(b => (b.innerText || '').split('\n').join(' ').trim())
              .filter(t => /\+1\/\+1|−1\/−1/.test(t))
          : [];
        const pt = panel
          ? [...panel.querySelectorAll('*')]
              .filter(x => !x.children.length && /^\d+\s*\/\s*\d+$/.test((x.innerText || '').trim()))
              .map(x => x.innerText.trim())
          : [];
        return { mat: mat ? (mat.innerText || '').split('\n').join(' · ') : null, buttons, pt };
      },
      target,
      previewPanel
    );

  // Reproduce the failing sequence: make tokens and a copy first, exactly as
  // the nine-task probe does, then press the counter three times.
  if (process.argv.includes('--tokens-first')) {
    await pressInPreview(page, '^Treasure$');
    await sleep(700);
    await pressInPreview(page, '^15 more$');
    await sleep(400);
    for (let i = 0; i < 3; i++) { await pressInPreview(page, '^Soldier'); await sleep(500); }
    await pressInPreview(page, '^Cop(y|ies)');
    await sleep(800);
    console.log('after the token steps, the panel is about:', await panelSubject());
  }

  console.log('before   ', JSON.stringify(await read()));
  for (let i = 1; i <= 3; i++) {
    const ok = await pressInPreview(page, '^\\+1/\\+1 \\+1');
    await sleep(700);
    console.log(`press ${i} ${ok ? 'hit' : 'MISSED'} on "${await panelSubject()}"`, JSON.stringify(await read()));
    await page.screenshot({ path: `.shots/counter-press/press-${i}.png` });
  }

  const log = await page.evaluate(() => {
    const lines = [...document.querySelectorAll('*')]
      .filter(el => !el.children.length)
      .map(el => (el.innerText || '').trim())
      .filter(t => /\+1\/\+1 counter/i.test(t));
    return [...new Set(lines)];
  });
  console.log('log lines mentioning counters:', JSON.stringify(log));
  console.log('errors', errors.length, errors.slice(0, 4));
  await browser.close();
})();
