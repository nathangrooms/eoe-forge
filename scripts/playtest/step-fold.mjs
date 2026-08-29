/**
 * IS THE CONTROL THAT MOVES YOU FORWARD ON SCREEN, AT EACH STEP OF /play?
 *
 * `StepChrome` puts back bottom-left and next bottom-right. A step taller than
 * the window puts BOTH below the fold, and a player who cannot see the way on
 * is a player who is stuck even though nothing is broken.
 */
import fs from 'node:fs';
import { openHarness, sleep } from './uiLib.mjs';
const OUT = '.shots/step-fold';
fs.mkdirSync(OUT, { recursive: true });

const press = (page, src) => page.evaluate(s => {
  const rx = new RegExp(s, 'i');
  const el = [...document.querySelectorAll('button')].find(b => !b.disabled && rx.test((b.innerText || '').trim()));
  if (!el) return null; el.click(); return (el.innerText || '').trim().slice(0, 40);
}, src.source);

const fold = page => page.evaluate(() => {
  const vh = innerHeight;
  const FWD = /^(Start .*game|Continue|Next|Choose|Use this deck|Shuffle up|Sit down)/i;
  const fwd = [...document.querySelectorAll('button')]
    .filter(b => FWD.test((b.innerText || '').trim()))
    .map(b => { const r = b.getBoundingClientRect(); return { label: (b.innerText || '').trim().slice(0, 34), y: Math.round(r.y), bottom: Math.round(r.bottom), belowFold: r.top >= vh }; });
  return { pageH: document.documentElement.scrollHeight, vh, scrolledPast: Math.max(0, document.documentElement.scrollHeight - vh), fwd };
});

const sizes = [[1600, 1000], [1440, 900], [1920, 1080], [1366, 768]];
for (const [w, h] of sizes) {
  const { browser, page } = await openHarness({ width: w, height: h });
  const out = [];
  out.push(['mode wall', await fold(page)]);
  await press(page, /VERSUS BOTS/); await sleep(1500);
  out.push(['deck step', await fold(page)]);
  await press(page, /Choose opponents|seeded|Use this deck/); await sleep(1700);
  out.push(['seat step', await fold(page)]);
  await page.screenshot({ path: `${OUT}/seat-${w}x${h}.png` });
  console.log(`\n=== ${w} x ${h} ===`);
  for (const [name, f] of out) {
    const hidden = f.fwd.filter(b => b.belowFold);
    console.log(`  ${name.padEnd(10)} page ${f.pageH}px, window ${f.vh}px, ${f.scrolledPast ? `scrolls ${f.scrolledPast}px past` : 'fits'}` +
      `  |  way forward: ${f.fwd.length ? JSON.stringify(f.fwd.map(b => `${b.label}@y${b.y}${b.belowFold ? ' BELOW THE FOLD' : ''}`)) : 'none found'}`);
    if (hidden.length) console.log(`      ${hidden.length} forward control(s) OFF SCREEN until the player scrolls.`);
  }
  await browser.close();
}
