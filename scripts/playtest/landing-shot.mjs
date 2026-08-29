/**
 * The play landing, measured: where the content ends, and whether the door
 * copy is set on artwork or on a surface.
 *
 * `deadSpacePct` is the number behind "dead space below the fold". It is the
 * share of the window below the lowest painted content, not an impression.
 */
import fs from 'node:fs';
import { openHarness, shotter, sleep } from './uiLib.mjs';

const OUT = process.argv[2] || '.shots/landing';

const measure = page => page.evaluate(() => {
  const vh = innerHeight, vw = innerWidth;
  let lowest = 0;
  for (const e of document.querySelectorAll('#root *')) {
    const r = e.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const paints = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || (e.textContent || '').trim() || e.tagName === 'IMG';
    if (paints && r.bottom > lowest) lowest = r.bottom;
  }
  const doors = [...document.querySelectorAll('button[aria-pressed]')]
    .filter(b => /ENTER/i.test(b.innerText || ''))
    .map(b => {
      const r = b.getBoundingClientRect();
      const img = b.querySelector('img');
      const ir = img?.getBoundingClientRect();
      // Is any door text painted ON TOP of the picture?
      const overArt = [...b.querySelectorAll('span')].filter(s => {
        const t = (s.textContent || '').trim();
        if (!t || s.children.length) return false;
        const sr = s.getBoundingClientRect();
        return ir && sr.top < ir.bottom - 2 && sr.bottom > ir.top + 2;
      }).length;
      return {
        title: (b.innerText || '').split('\n').slice(0, 2).join(' / ').slice(0, 34),
        w: Math.round(r.width), h: Math.round(r.height),
        art: ir ? `${Math.round(ir.width)}x${Math.round(ir.height)}` : 'none',
        textOverArt: overArt,
      };
    });
  return {
    vh, vw, lowestContentY: Math.round(lowest),
    deadSpacePct: Math.round(Math.max(0, vh - lowest) / vh * 100),
    doors,
  };
});

const { browser, page, health } = await openHarness();
const shot = shotter(page, OUT);
await sleep(1500);
const m = await measure(page);
await shot('landing');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/landing.json`, JSON.stringify({ m, health }, null, 2));
console.log(`window ${m.vw}x${m.vh}`);
console.log(`content ends at y=${m.lowestContentY} -> DEAD SPACE ${m.deadSpacePct}% of the window`);
for (const d of m.doors) console.log(`  door ${d.w}x${d.h}  art ${d.art}  text set over the art: ${d.textOverArt} runs  | ${d.title}`);
console.log('health: console', health.consoleErrors.length, 'page', health.pageErrors.length, 'net', health.netFails.length);
await browser.close();
