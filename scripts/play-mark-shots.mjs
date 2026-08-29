/**
 * Photograph a player READING a creature's stats, and MARKING one by hand.
 *
 * Two claims, and only the second one is new:
 *
 *   1. power and toughness can be read at a glance on the mat. It could not
 *      be: `play-mark-occlusion.mjs` measured one stat box of six fully
 *      visible and the other five at 40%, which is exactly enough of `1/1` to
 *      show the power and hide the toughness, because the box sat in the one
 *      corner an overlapped row covers;
 *   2. a player can put a die or a marker on a permanent. They could not:
 *      nothing anywhere built a mark, and the by-hand panel offered counters
 *      the engine knows and nothing else.
 *
 * It drives the signed-out GOLDFISH door, which is the door that hands seat one
 * to a person. PLAYTEST is a WATCHED table: its preview is read-only and the
 * by-hand controls do not render at all, so photographing them there would
 * prove nothing.
 *
 *   node scripts/play-mark-shots.mjs
 *   BASE=http://127.0.0.1:8080 node scripts/play-mark-shots.mjs
 */
import fs from 'node:fs';
import {
  launch,
  sleep,
  startGame,
  playTurns,
  boardCards,
  openCard,
  closePreview,
} from './playDrive.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const OUT = process.env.SHOTS || '.shots/marks';
const TURNS = Number(process.env.TURNS || 9);
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

const { browser, page } = await launch();

const inPanel = (re) =>
  page.evaluate(src => {
    const panel = document.querySelector('[role="group"][aria-label]');
    if (!panel) return false;
    const el = [...panel.querySelectorAll('button')].find(
      b => !b.disabled && new RegExp(src, 'i').test((b.innerText || '').trim())
    );
    if (!el) return false;
    el.click();
    return true;
  }, re.source);

/** Every mark drawn on one permanent, read off the card a player is looking at. */
const marksOnCard = instanceId =>
  page.evaluate(id => {
    const host = document.querySelector(`[data-instance="${id}"]`);
    if (!host) return null;
    const hr = host.getBoundingClientRect();
    const out = [];
    for (const span of host.querySelectorAll('span')) {
      if (span.children.length) continue;
      const text = (span.textContent || '').trim();
      if (!text) continue;
      const r = span.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) continue;
      /* Only the rail: everything anchored to the bottom edge of the card. */
      if (r.bottom < hr.bottom - hr.height * 0.2) continue;
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
      out.push({
        text,
        font: parseFloat(getComputedStyle(span).fontSize),
        visible: total ? Math.round((seen / total) * 100) : 0,
        label: span.getAttribute('aria-label') || span.getAttribute('title') || '',
      });
    }
    return { cardW: Math.round(hr.width), marks: out };
  }, instanceId);

await startGame(page, { base: BASE, mode: 'GOLDFISH' });
log('playing out turns to fill the battlefield...');
await playTurns(page, TURNS, log);

await page.screenshot({ path: `${OUT}/01-mat-plain.png` });
log('saved 01-mat-plain.png');

/* Pick a creature: one carrying a stat box, so the rail has something in it. */
const cards = await boardCards(page);
let target = null;
for (const card of cards) {
  const read = await marksOnCard(card.id);
  if (read?.marks.some(m => /^-?\d+\/-?\d+$/.test(m.text))) {
    target = card;
    break;
  }
}
if (!target) {
  log('no creature with a stat box on the mat; nothing to mark');
  await browser.close();
  process.exit(1);
}
log(`\nmarking ${target.name}`);

await openCard(page, target.id);
await page.screenshot({ path: `${OUT}/02-panel-plain.png` });

const sectionHere = await page.evaluate(() =>
  [...document.querySelectorAll('span')].some(s =>
    /^dice and markers$/i.test((s.innerText || '').trim())
  )
);
log('"Dice and markers" section on screen:', sectionHere);

const diceOffered = await page.evaluate(() => {
  const panel = document.querySelector('[role="group"][aria-label]');
  return [...(panel?.querySelectorAll('button') ?? [])]
    .map(b => (b.innerText || '').trim())
    .filter(t => /^Roll d\d+$/.test(t));
});
log('dice offered:', diceOffered.join(', ') || 'NONE');

/* A +1/+1 counter, so the rail carries a rules counter beside the stat box and
   the stat box has to disagree with the printed line. */
const gotCounter = await inPanel(/^\+1\/\+1( \+1)?$/);
await sleep(500);
const gotCounter2 = await inPanel(/^\+1\/\+1( \+1)?$/);
await sleep(500);
log('+1/+1 counters added:', [gotCounter, gotCounter2].filter(Boolean).length);

/* A die. */
const rolled = await inPanel(/^Roll d20$/);
await sleep(600);
log('rolled a d20:', rolled);

/* A marker nobody could have predicted, which is the whole point of the escape
   hatch: the preset list will never be complete. */
const wroteOpen = await inPanel(/^Write a marker$/);
await sleep(400);
if (wroteOpen) {
  await page.type('input[aria-label="Marker"]', 'sac at end');
  await page.screenshot({ path: `${OUT}/03-marker-form.png` });
  await inPanel(/^Put it on$/);
  await sleep(600);
}
log('wrote a marker:', wroteOpen);

await page.screenshot({ path: `${OUT}/04-panel-marked.png` });
log('saved 04-panel-marked.png');

const panelState = await page.evaluate(() => {
  const panel = document.querySelector('[role="group"][aria-label]');
  if (!panel) return null;
  const leaves = [...panel.querySelectorAll('p, span, h3')].filter(el => !el.children.length);
  const stat = leaves.find(el => /^-?\d+\/-?\d+$/.test((el.textContent || '').trim()));
  const heading = panel.querySelector('h3');
  const chips = leaves
    .filter(el => /damage|\+\d+ |d20|sac at end|printed/i.test(el.textContent || ''))
    .map(el => `"${el.textContent.trim()}"@${parseFloat(getComputedStyle(el).fontSize)}px`);
  return {
    name: heading && { text: heading.textContent.trim(), font: parseFloat(getComputedStyle(heading).fontSize) },
    stat: stat && { text: stat.textContent.trim(), font: parseFloat(getComputedStyle(stat).fontSize) },
    chips,
  };
});
log('\npanel now reads:', JSON.stringify(panelState));

await closePreview(page);
await sleep(600);
await page.screenshot({ path: `${OUT}/05-mat-marked.png` });
log('saved 05-mat-marked.png');

const railAfter = await marksOnCard(target.id);
log(`\n=== THE RAIL ON ${target.name} (card ${railAfter?.cardW}px) ===`);
for (const m of railAfter?.marks ?? []) {
  log(`  "${m.text}"  ${m.font}px  ${m.visible}% visible   ${m.label.slice(0, 60)}`);
}

/* And the log, because project law is that nothing happens silently, and a
   storage prefix reaching the table is this project's `~` bug a second time. */
const lines = await page.evaluate(() => {
  const seen = new Set();
  for (const el of document.querySelectorAll('div, li, section')) {
    for (const line of (el.innerText || '').split('\n')) {
      const t = line.trim();
      if (/d20|sac at end|counters|mark:/i.test(t) && t.length < 90) seen.add(t);
    }
  }
  return [...seen];
});
log('\ngame log lines about the marks:');
for (const line of lines) log('   ', line);
log('\nprefix leaked onto the table:', lines.some(l => l.includes('mark:')));

await browser.close();
