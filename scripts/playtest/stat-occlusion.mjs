/**
 * What is standing on the power and toughness, named rather than counted.
 *
 * A percentage on its own is not actionable and can be an artefact: a
 * `pointer-events: none` scrim is skipped by `elementFromPoint`, and a
 * transparent `<button>` laid over a card is NOT, so a number that is
 * perfectly readable can measure as covered. So this reports the element that
 * comes back on top, with its size and its own background, and lets the reader
 * judge whether it is paint or a hit target.
 *
 *   node scripts/playtest/stat-occlusion.mjs --base http://localhost:8081
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, startGame, playTurns } from './table.mjs';

const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:8081';
mkdirSync('.shots/stat-occlusion', { recursive: true });

(async () => {
  const { browser, page, errors } = await launch({ width: 1600, height: 1000 });
  await startGame(page, { base, mode: 'GOLDFISH' });
  await playTurns(page, 7, s => console.log(s));
  await page.screenshot({ path: '.shots/stat-occlusion/board.png' });

  const rows = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      if (el.children.length) continue;
      const text = (el.innerText || '').trim();
      if (!/^\d+\s*\/\s*\d+$/.test(text)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 6) continue;
      const covers = new Map();
      let seen = 0;
      let total = 0;
      for (let x = r.left + 2; x < r.right - 2; x += 4) {
        for (let y = r.top + 2; y < r.bottom - 2; y += 4) {
          total++;
          const top = document.elementFromPoint(x, y);
          if (top && (top === el || el.contains(top) || top.contains(el))) {
            seen++;
          } else if (top) {
            const cs = getComputedStyle(top);
            const key = `${top.tagName}.${(top.className || '').toString().split(' ').slice(0, 3).join('.')} bg=${cs.backgroundColor} op=${cs.opacity}`;
            covers.set(key, (covers.get(key) || 0) + 1);
          }
        }
      }
      out.push({
        text,
        card: el.closest('[data-instance]')?.getAttribute('data-instance'),
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        visible: total ? Math.round((seen / total) * 100) : 0,
        covers: [...covers].sort((a, b) => b[1] - a[1]).slice(0, 3),
      });
    }
    return out;
  });

  for (const row of rows) {
    console.log(`\n${row.text}  on ${row.card}  ${row.visible}% visible  at ${row.rect.join(',')}`);
    for (const [what, n] of row.covers) console.log(`    covered by ${n} samples: ${what}`);
  }
  writeFileSync('.shots/stat-occlusion/rows.json', JSON.stringify(rows, null, 2));

  // And a crop of one card so the number can be judged by eye.
  if (rows[0]) {
    const [x, y] = rows[0].rect;
    await page.screenshot({
      path: '.shots/stat-occlusion/one-stat.png',
      clip: { x: Math.max(0, x - 190), y: Math.max(0, y - 250), width: 420, height: 330 },
    });
  }
  console.log(`\nerrors: ${errors.length}`);
  await browser.close();
})();
