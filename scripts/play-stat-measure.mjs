/**
 * How big is a power and toughness box, actually, in pixels, on a real board?
 *
 * Written because the brief said power and toughness are drawn at 9 to 12
 * pixels and pointed at `GameCardView.tsx` line 274. That line is inside
 * `TypographicFace`, the fallback face a card gets when it has NO ART: a token,
 * or a card whose image has not arrived. It is not the box on an ordinary
 * permanent. This project has three confident wrong diagnoses on record, so the
 * number is measured off the running app rather than read off a line number.
 *
 * It plays a real game through the signed-out GOLDFISH door until there are
 * permanents on the mat, measures every stat box, counter and player mark on
 * the battlefield, then opens the preview on one of them and measures the same
 * things there.
 *
 * Start a dev server first, then:
 *   BASE=http://127.0.0.1:8080 SHOTS=.shots/stats-before LABEL=BEFORE \
 *     node scripts/play-stat-measure.mjs
 */
import fs from 'node:fs';
import {
  launch,
  sleep,
  startGame,
  playTurns,
  boardCards,
  openCard,
} from './playDrive.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const OUT = process.env.SHOTS || '.shots/stats';
const LABEL = process.env.LABEL || OUT.split(/[\\/]/).pop();
const TURNS = Number(process.env.TURNS || 9);
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

const { browser, page } = await launch();
await startGame(page, { base: BASE, mode: 'GOLDFISH' });
log('playing out turns to fill the battlefield...');
await playTurns(page, TURNS, log);

/**
 * Every stat box on the battlefield, with the card it belongs to.
 *
 * Found by shape rather than by a test hook added for the camera: a `span`
 * whose whole text is `N/N`, inside a `[data-instance]`. `getComputedStyle`
 * reports the font size the browser actually used and `getBoundingClientRect`
 * the box it actually drew, so neither number is read off a class name.
 */
const measureBoard = () =>
  page.evaluate(() => {
    const h = window.innerHeight;
    const out = [];
    for (const host of document.querySelectorAll('[data-instance]')) {
      const hr = host.getBoundingClientRect();
      if (hr.width < 40 || hr.bottom > h * 0.74 || hr.top < 60) continue;
      const name = host.querySelector('[aria-label]')?.getAttribute('aria-label') || '';
      const spans = [...host.querySelectorAll('span')];
      const stat = spans.find(s => /^-?\d+\/-?\d+$/.test((s.textContent || '').trim()));
      const measure = el => {
        const r = el.getBoundingClientRect();
        return {
          text: (el.textContent || '').trim(),
          font: parseFloat(getComputedStyle(el).fontSize),
          w: +r.width.toFixed(1),
          h: +r.height.toFixed(1),
        };
      };
      const marks = spans
        .filter(s => s !== stat && s.children.length === 0)
        .filter(s => /^[+-]?\d+$|^\S.{0,18}\s\d+$/.test((s.textContent || '').trim()))
        .map(measure);
      out.push({
        name,
        cardW: +hr.width.toFixed(1),
        cardH: +hr.height.toFixed(1),
        stat: stat ? { ...measure(stat), shareOfCardW: +(stat.getBoundingClientRect().width / hr.width).toFixed(3) } : null,
        marks,
      });
    }
    return out;
  });

const board = await measureBoard();
await page.screenshot({ path: `${OUT}/01-mat.png` });

log(`\n=== ${LABEL}: THE MAT, 1600x1000, ${board.length} permanents ===`);
for (const row of board) {
  const s = row.stat
    ? `stat "${row.stat.text}" font ${row.stat.font}px box ${row.stat.w}x${row.stat.h} (${Math.round(row.stat.shareOfCardW * 100)}% of card width)`
    : 'no stat box';
  const m = row.marks.length ? `  marks ${row.marks.map(x => `"${x.text}"@${x.font}px`).join(' ')}` : '';
  log(`  ${row.name.slice(0, 26).padEnd(27)} card ${String(row.cardW).padEnd(7)} ${s}${m}`);
}
const withStat = board.filter(r => r.stat);
if (withStat.length) {
  const fonts = withStat.map(r => r.stat.font);
  log(
    `  -> ${withStat.length} stat boxes, font ${Math.min(...fonts)}px to ${Math.max(...fonts)}px on cards ` +
      `${Math.min(...withStat.map(r => r.cardW))} to ${Math.max(...withStat.map(r => r.cardW))}px wide`
  );
} else {
  log('  -> NO STAT BOX ON THE MAT AT ALL');
}

/* The preview is a separate claim and needs its own measurement: readable on
   the mat and unmissable in the preview are two different requirements. */
const cards = await boardCards(page);
const creature = board.find(r => r.stat) ?? board[0];
const pick = cards.find(c => c.name === creature?.name) ?? cards[0];
if (pick) {
  await openCard(page, pick.id);
  await sleep(500);
  await page.screenshot({ path: `${OUT}/02-preview.png` });

  const preview = await page.evaluate(() => {
    const panel = document.querySelector('[role="group"][aria-label]');
    if (!panel) return null;
    const measure = el => {
      const r = el.getBoundingClientRect();
      return {
        text: (el.textContent || '').trim().slice(0, 40),
        font: parseFloat(getComputedStyle(el).fontSize),
        w: +r.width.toFixed(1),
        h: +r.height.toFixed(1),
      };
    };
    const leaves = [...panel.querySelectorAll('p, span, h3, div')].filter(el => el.children.length === 0);
    const heading = panel.querySelector('h3');
    const stat = leaves.find(el => /^-?\d+\/-?\d+$/.test((el.textContent || '').trim()));
    return {
      panelW: +panel.getBoundingClientRect().width.toFixed(1),
      panelH: +panel.getBoundingClientRect().height.toFixed(1),
      name: heading ? measure(heading) : null,
      stat: stat ? measure(stat) : null,
      sections: [...panel.querySelectorAll('span')]
        .filter(s => /^[A-Z][A-Za-z ]+$/.test((s.textContent || '').trim()) && parseFloat(getComputedStyle(s).letterSpacing) > 1)
        .map(s => s.textContent.trim()),
    };
  });
  log(`\n=== ${LABEL}: THE PREVIEW (${pick.name}) ===`);
  log('  ' + JSON.stringify(preview));
}

log(`\nshots in ${OUT}/`);
await browser.close();
