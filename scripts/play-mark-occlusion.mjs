/**
 * Is the power and toughness box actually VISIBLE, or is the next card on it?
 *
 * Reading `.shots/stats-before/01-mat.png` rather than the code: six creatures
 * in a row, and five of them print "1", "1", "2", "2", "1" where the DOM says
 * "1/1", "1/1", "2/1", "2/2", "1/1". Only the last card in the run shows both
 * numbers. So the box is not too small. It is CUT IN HALF, and the half that
 * survives is the power.
 *
 * `Battlefield.tsx` line 125 gives every permanent `zIndex: index` and a
 * negative `marginLeft` once the row is crowded, so card k+1 lies over the
 * right edge of card k. The stat badge is anchored `right: 4%`, which is the
 * printed-card corner and therefore the one corner in an overlapped row that is
 * guaranteed to be underneath something. The same file already records this for
 * the combat note: *"a crowded row hides the RIGHT of every card under the one
 * after it and the only strip that stays visible is the left edge."*
 *
 * This measures it rather than reading it off a picture: for each mark, sample
 * a grid of points and ask the document what is actually on top at each one.
 *
 *   BASE=http://127.0.0.1:8080 LABEL=BEFORE node scripts/play-mark-occlusion.mjs
 */
import fs from 'node:fs';
import { launch, startGame, playTurns } from './playDrive.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const LABEL = process.env.LABEL || 'run';
const OUT = process.env.SHOTS || '.shots/occlusion';
const TURNS = Number(process.env.TURNS || 9);
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

const { browser, page } = await launch({
  width: Number(process.env.W || 1600),
  height: Number(process.env.H || 1000),
});
await startGame(page, { base: BASE, mode: process.env.MODE || 'GOLDFISH' });
await playTurns(page, TURNS, log);

const report = await page.evaluate(() => {
  const h = window.innerHeight;
  const rows = [];
  for (const host of document.querySelectorAll('[data-instance]')) {
    const hr = host.getBoundingClientRect();
    if (hr.width < 40 || hr.bottom > h * 0.74 || hr.top < 60) continue;
    const name = host.querySelector('[aria-label]')?.getAttribute('aria-label') || '';

    /* How much of the card itself is uncovered. Sampled along its own vertical
       midline so a mark's position can be compared against it. */
    let visibleRight = hr.left;
    for (let x = hr.left + 1; x < hr.right - 1; x += 2) {
      const top = document.elementFromPoint(x, hr.top + hr.height * 0.5);
      if (top && host.contains(top)) visibleRight = x;
    }

    const marks = [];
    for (const span of host.querySelectorAll('span')) {
      const text = (span.textContent || '').trim();
      if (!text || span.children.length) continue;
      if (!/^-?\d+\/-?\d+$|^[+-]?\d+$/.test(text)) continue;
      const r = span.getBoundingClientRect();
      if (r.width < 6) continue;
      /* ASK WHICH CARD IS ON TOP, NOT WHETHER THE BADGE IS.
         Every mark carries `pointer-events-none`, so `elementFromPoint` looks
         straight through it and the first attempt reported 0% visible for all
         six boxes including the one plainly legible in the screenshot. What is
         actually being asked is whether a DIFFERENT permanent is lying over
         this point: if the top element belongs to this card (its own art) or to
         nothing at all (the bare mat), the mark is on top of it and readable. */
      let seen = 0;
      let total = 0;
      for (let x = r.left + 2; x < r.right - 2; x += 2) {
        for (let y = r.top + 2; y < r.bottom - 2; y += 4) {
          total++;
          const top = document.elementFromPoint(x, y);
          const owner = top?.closest?.('[data-instance]') ?? null;
          if (!owner || owner === host) seen++;
        }
      }
      marks.push({
        text,
        kind: /\//.test(text) ? 'stat' : 'counter',
        w: +r.width.toFixed(1),
        visible: total ? +((seen / total) * 100).toFixed(0) : 0,
      });
    }
    rows.push({
      name,
      cardW: Math.round(hr.width),
      visibleW: Math.round(visibleRight - hr.left),
      marks,
    });
  }
  return rows;
});

await page.screenshot({ path: `${OUT}/${LABEL}-mat.png` });

log(`\n=== ${LABEL}: WHAT A PLAYER CAN ACTUALLY SEE ===`);
let statsTotal = 0;
let statsFull = 0;
for (const row of report) {
  const strip = Math.round((row.visibleW / row.cardW) * 100);
  const marks = row.marks
    .map(m => `${m.kind} "${m.text}" ${m.visible}% visible`)
    .join('; ');
  log(
    `  ${row.name.slice(0, 26).padEnd(27)} card ${String(row.cardW).padEnd(5)} uncovered strip ${String(row.visibleW).padEnd(5)} (${strip}%)  ${marks || 'no marks'}`
  );
  for (const m of row.marks) {
    if (m.kind !== 'stat') continue;
    statsTotal++;
    if (m.visible >= 99) statsFull++;
  }
}
log(`\n  stat boxes fully visible: ${statsFull} of ${statsTotal}`);
console.log(JSON.stringify({ label: LABEL, statsFull, statsTotal, rows: report }, null, 0));

await browser.close();
