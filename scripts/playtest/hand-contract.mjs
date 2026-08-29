/**
 * Does the fan keep the promise `tableMetrics.ts` makes for it?
 *
 * The promise is written down and is not a matter of taste:
 *
 *   "at 0.62 the docked fan shows the name, the mana cost, the whole
 *    illustration and the type line of EVERY card in hand"
 *
 * So the question is not "does the hand overflow the window" — it MUST, the
 * sink is the entire design — but "is the type line of every card above the
 * fold". An earlier pass reported the overflow as the defect and concluded you
 * cannot read your own cards; the overflow on its own does not show that.
 *
 * MEASURED WITH A MARKER, NOT WITH TRIGONOMETRY. A hand card is rotated about
 * its bottom edge, so its `getBoundingClientRect` is an axis-aligned box that
 * is both taller than the card and offset from it, and 0.62 of the way down
 * THAT box is not where the type line is. Two passes have now been wrong from
 * reading rotated rects. A 1px element injected at 62% of the card's own height
 * inherits every ancestor transform, so its rect is the truth and there is no
 * arithmetic to get wrong.
 */
import fs from 'node:fs';
import { openHarness, startGame, advanceTo, gameState, shotter, sleep } from './uiLib.mjs';

const OUT = process.argv[2] || '.shots/hand-contract';
const REVEAL = 0.62;

const contract = page => page.evaluate(REVEAL => {
  const vh = innerHeight;
  const buttons = [...document.querySelectorAll('button[title]')]
    .filter(b => (b.getAttribute('title') || '').includes('Click to preview'));

  const rows = buttons.map(b => {
    // The card's own layout box: transforms do not touch offsetHeight.
    const host = b.querySelector('[style*="aspect"]') || b.firstElementChild || b;
    const h = host.offsetHeight || b.offsetHeight;
    const w = host.offsetWidth || b.offsetWidth;

    const mark = document.createElement('div');
    mark.style.cssText = `position:absolute;left:0;right:0;top:${(REVEAL * 100).toFixed(2)}%;height:1px;pointer-events:none;`;
    const anchor = host.style.position ? host : b;
    const prevPos = anchor.style.position;
    if (!getComputedStyle(anchor).position || getComputedStyle(anchor).position === 'static') anchor.style.position = 'relative';
    anchor.appendChild(mark);
    const mr = mark.getBoundingClientRect();
    mark.remove();
    anchor.style.position = prevPos;

    const aabb = b.getBoundingClientRect();
    return {
      name: (b.getAttribute('title') || '').replace(/\..*/, '').slice(0, 28),
      cardW: Math.round(w), cardH: Math.round(h),
      typeLineY: Math.round(mr.top),
      typeLineVisible: mr.top < vh,
      typeLineBelowFoldPx: Math.round(Math.max(0, mr.top - vh)),
      aabbBottom: Math.round(aabb.bottom),
    };
  });

  return {
    vh, count: rows.length,
    hidden: rows.filter(r => !r.typeLineVisible).length,
    worstBelowFold: rows.length ? Math.max(0, ...rows.map(r => r.typeLineBelowFoldPx)) : 0,
    rows,
  };
}, REVEAL);

const { browser, page, health } = await openHarness();
const shot = shotter(page, OUT);
const out = [];

await startGame(page);
for (const turn of [1, 4, 8]) {
  if (turn > 1) await advanceTo(page, turn);
  await sleep(600);
  const g = await gameState(page);
  const c = await contract(page);
  await shot(`t${turn}-hand`);
  out.push({ turn, game: g, contract: c });
  console.log(`\nT${g?.turn} ${g?.step} — ${c.count} cards in the fan, viewport ${c.vh}px`);
  console.log(`  TYPE LINE BELOW THE FOLD ON ${c.hidden} OF ${c.count}, worst ${c.worstBelowFold}px past the edge`);
  for (const r of c.rows) {
    console.log(`   ${r.typeLineVisible ? ' ok ' : 'HIDE'} ${r.name.padEnd(28)} card ${r.cardW}x${r.cardH}  typeLine y=${r.typeLineY}  ${r.typeLineBelowFoldPx ? '+' + r.typeLineBelowFoldPx + 'px past fold' : ''}`);
  }
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/contract.json`, JSON.stringify({ out, health }, null, 2));
console.log('\nhealth: console', health.consoleErrors.length, 'page', health.pageErrors.length, 'net', health.netFails.length);
await browser.close();
