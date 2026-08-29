/**
 * Can you tell which land is which when they are tapped?
 *
 * A card turns ninety degrees when it taps, exactly as it does in paper, and
 * the rotation is a CSS transform so the layout box does not change. That is
 * right. What it means on a crowded row is that the card's NAME, which sits
 * along its top edge, swings to the RIGHT edge of the rotated card — and the
 * row overlaps its cards left over right, so the name lands underneath the
 * neighbour.
 *
 * This crops the row and reports, per land, how much of the rotated card is
 * uncovered and where the name ends up.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, startGame, playTurns } from './table.mjs';

const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:8081';
mkdirSync('.shots/tapped-read', { recursive: true });

(async () => {
  const { browser, page } = await launch({ width: 1600, height: 1000 });
  await startGame(page, { base, mode: 'GOLDFISH' });
  await playTurns(page, 7, s => console.log(s));

  const rows = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-instance]')].map(el => {
      const r = el.getBoundingClientRect();
      const inner = el.querySelector('[data-tapped], .origin-center') || el;
      const ir = inner.getBoundingClientRect();
      return {
        id: el.getAttribute('data-instance'),
        tapped: el.getAttribute('data-tapped') === 'true',
        name: el.querySelector('img')?.alt || el.querySelector('[aria-label]')?.getAttribute('aria-label') || '',
        box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        drawn: [Math.round(ir.left), Math.round(ir.top), Math.round(ir.width), Math.round(ir.height)],
      };
    });
    // How much of each card's DRAWN rectangle is not under a later sibling.
    const sorted = cards.slice();
    for (const c of sorted) {
      const [x, y, w, h] = c.drawn;
      let covered = 0;
      for (const o of sorted) {
        if (o === c) continue;
        const [ox, oy, ow, oh] = o.drawn;
        const ix = Math.max(0, Math.min(x + w, ox + ow) - Math.max(x, ox));
        const iy = Math.max(0, Math.min(y + h, oy + oh) - Math.max(y, oy));
        // Only count a card that is drawn LATER (higher in the row order).
        if (ix > 0 && iy > 0 && sorted.indexOf(o) > sorted.indexOf(c)) covered += ix * iy;
      }
      c.uncovered = Math.max(0, Math.round((1 - covered / (w * h)) * 100));
    }
    return cards;
  });

  const tapped = rows.filter(r => r.tapped);
  console.log(`\n${rows.length} cards, ${tapped.length} tapped`);
  for (const r of rows) {
    if (r.box[2] < 100) continue;
    console.log(
      `  ${r.tapped ? 'TAPPED  ' : 'untapped'} ${String(r.name).padEnd(24)} box ${r.box.join('x')} drawn ${r.drawn.join('x')} ~${r.uncovered}% uncovered`
    );
  }

  // Crop the whole lands band, wide enough to see every rotated card whole.
  const band = rows.filter(r => r.tapped && r.box[2] > 100);
  if (band.length) {
    const left = Math.min(...band.map(b => b.drawn[0]));
    const top = Math.min(...band.map(b => b.drawn[1]));
    const right = Math.max(...band.map(b => b.drawn[0] + b.drawn[2]));
    const bottom = Math.max(...band.map(b => b.drawn[1] + b.drawn[3]));
    await page.screenshot({
      path: '.shots/tapped-read/lands-row.png',
      clip: { x: Math.max(0, left - 10), y: Math.max(0, top - 10), width: right - left + 20, height: bottom - top + 20 },
    });
    console.log(`\ncropped the lands row to ${right - left + 20}x${bottom - top + 20}`);
  }
  await page.screenshot({ path: '.shots/tapped-read/board.png' });
  writeFileSync('.shots/tapped-read/rows.json', JSON.stringify(rows, null, 2));
  await browser.close();
})();
