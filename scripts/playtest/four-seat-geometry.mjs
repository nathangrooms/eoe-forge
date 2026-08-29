/**
 * THE SAME GEOMETRY ON A FOUR SEAT TABLE.
 *
 * The two-seat run measured zero overlap and I nearly reported "the crowded
 * creature row does not reproduce" off it. A four-seat table quarters the mat,
 * and `seatLayout.MIN_TURNED_SLOTS` deliberately WITHHOLDS the turned pitch
 * from a row too narrow to seat six at it, so the two tables cannot be assumed
 * to behave alike. Denominator stated: this is four seats, 1600 x 1000.
 */
import { openHarness, sleep, pressText, advanceTo, gameState } from './uiLib.mjs';
import fs from 'node:fs';

const run = async () => {
  const { browser, page, health } = await openHarness({ width: 1600, height: 1000 });

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /VERSUS BOTS/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(1500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /seeded|Use this deck|Choose/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(1500);

  /* Two more chairs, so the table is four. */
  for (let i = 0; i < 2; i++) {
    const added = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Add an opponent|Add a seat/i.test(x.innerText || ''));
      if (!b) return false; b.click(); return true;
    });
    if (!added) console.log('  could not add a seat at index', i);
    await sleep(800);
  }
  const seats = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some(b => /Start 4-player/i.test(b.innerText || '')) ? 4 : 'unknown');
  console.log('table size reported by the start button:', seats);

  await pressText(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
  await sleep(2500);
  await pressText(page, /^Keep$/);
  await sleep(2000);
  await advanceTo(page, Number(process.env.TURN || 16), 300);
  await sleep(1200);

  const g = await gameState(page);
  const m = await page.evaluate(() => {
    const round = n => Math.round(n);
    const mats = [...document.querySelectorAll('[aria-label$=" seat"], [aria-label="Your seat"]')];
    return mats.map(mat => {
      const mb = mat.getBoundingClientRect();
      const rows = [...mat.querySelectorAll('[aria-label]')]
        .filter(el => /^(Creatures|Lands)/i.test(el.getAttribute('aria-label') || ''))
        .map(row => {
          const rb = row.getBoundingClientRect();
          const cards = [...row.querySelectorAll('[data-instance]')]
            .map(c => c.getBoundingClientRect()).sort((a, b) => a.x - b.x);
          const pitch = cards.length > 1 ? cards[1].x - cards[0].x : null;
          const w = cards.length ? cards[0].width : null;
          /* How much of a card its neighbour lies over, as the player sees it. */
          const coveredPct = w && pitch !== null && pitch < w ? +(100 * (1 - pitch / w)).toFixed(0) : 0;
          return { label: row.getAttribute('aria-label'), boxW: round(rb.width),
            n: cards.length, cardW: w ? round(w) : null, pitch: pitch === null ? null : round(pitch), coveredPct };
        });
      return { mat: `${round(mb.width)}x${round(mb.height)}`, rows };
    });
  });

  console.log(`game ${JSON.stringify(g)}`);
  for (const [i, s] of m.entries()) {
    console.log(`\nSEAT ${i}  mat ${s.mat}`);
    for (const r of s.rows) {
      console.log(`   ${String(r.label).slice(0, 22).padEnd(22)} rowW=${String(r.boxW).padStart(4)} n=${String(r.n).padStart(2)} cardW=${r.cardW} pitch=${r.pitch}  NEIGHBOUR COVERS ${r.coveredPct}% of each card`);
    }
  }
  fs.mkdirSync('.shots/fourseat', { recursive: true });
  await page.screenshot({ path: `.shots/fourseat/${process.env.TAG || 'now'}.png` });
  console.log(`\nhealth: pageerrors ${health.pageErrors.length} console ${health.consoleErrors.length} net ${health.netFails.length}`);
  await browser.close();
};
run().catch(e => { console.error('FAILED', e); process.exit(1); });
