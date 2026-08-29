/**
 * Does the combat note still read, now that the mark rail is in that corner?
 *
 * Both used to be anchored to the card's bottom left, and nothing noticed while
 * power and toughness still sat bottom right. They are stacked now, the note
 * above the rail, so this checks the two boxes do not overlap on a real board
 * in real combat, and that the note is not covered by the next card.
 *
 * VERSUS BOTS, because goldfish says on its own door: *"1 seat. Nothing blocks
 * and nothing attacks back."* There is no combat to photograph there.
 *
 *   BASE=http://127.0.0.1:8080 node scripts/play-combat-rail-check.mjs
 */
import fs from 'node:fs';
import { launch, sleep, startGame, playTurns, press } from './playDrive.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const OUT = process.env.SHOTS || '.shots/combat-rail';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

const { browser, page } = await launch();
await startGame(page, { base: BASE, mode: 'VERSUS BOTS' });
await playTurns(page, Number(process.env.TURNS || 7), log);

/* Swing with everything the board will let us swing with. */
for (let round = 0; round < 6; round++) {
  await press(page, /^ATTACK$/);
  await sleep(800);
  const swung = await page.evaluate(() => {
    let n = 0;
    for (const b of document.querySelectorAll('button[aria-label]')) {
      if (/^(Attack with|Declare)/i.test(b.getAttribute('aria-label') || '') && !b.disabled) {
        b.click();
        n++;
      }
    }
    return n;
  });
  await sleep(900);
  const inCombat = await page.evaluate(() =>
    [...document.querySelectorAll('*')].some(el =>
      /hits |blocks |held by /i.test(el.childElementCount ? '' : el.textContent || '')
    )
  );
  log(`  round ${round + 1}: armed ${swung}, combat marks on screen: ${inCombat}`);
  if (inCombat) break;
  await press(page, /^(CONFIRM|CONTINUE|NEXT STEP|DONE)$/);
  await sleep(700);
  await press(page, /^END TURN$/);
  await sleep(2500);
}

await page.screenshot({ path: `${OUT}/combat.png` });

const overlaps = await page.evaluate(() => {
  const out = [];
  for (const host of document.querySelectorAll('[data-instance]')) {
    const hr = host.getBoundingClientRect();
    if (hr.width < 40) continue;
    const leaves = [...host.querySelectorAll('span')].filter(s => !s.children.length);
    const note = leaves.find(s => /^(hits |blocks |held by )/i.test((s.textContent || '').trim()));
    const stat = leaves.find(s => /^-?\d+\/-?\d+$/.test((s.textContent || '').trim()));
    if (!note || !stat) continue;
    const a = note.getBoundingClientRect();
    const b = stat.getBoundingClientRect();
    const hit = !(a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left);
    const covered = (el) => {
      const r = el.getBoundingClientRect();
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
      return total ? Math.round((seen / total) * 100) : 0;
    };
    out.push({
      name: host.querySelector('[aria-label]')?.getAttribute('aria-label') || '',
      note: note.textContent.trim(),
      stat: stat.textContent.trim(),
      overlapping: hit,
      noteVisible: covered(note),
      statVisible: covered(stat),
    });
  }
  return out;
});

log('\n=== COMBAT: THE NOTE AND THE STAT BOX ON THE SAME CARD ===');
if (!overlaps.length) log('  no creature carried both a combat note and a stat box');
for (const row of overlaps) {
  log(
    `  ${row.name.slice(0, 24).padEnd(25)} "${row.note}" ${row.noteVisible}% visible over ` +
      `"${row.stat}" ${row.statVisible}% visible  ${row.overlapping ? 'OVERLAPPING' : 'clear'}`
  );
}
log(`\n  overlapping pairs: ${overlaps.filter(r => r.overlapping).length} of ${overlaps.length}`);

await browser.close();
