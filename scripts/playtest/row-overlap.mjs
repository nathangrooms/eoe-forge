/**
 * How much of each permanent is actually visible in its row?
 *
 * The previous pass saw "the opponent's three lands drawn tightly overlapping,
 * only slivers of each visible, while 60% of the row is empty" and correctly
 * refused to act on it without a measurement, because there is no stacking
 * logic in `boardRows.ts` and the cause could have been grouping, rotation or
 * a layout squeeze. This is that measurement.
 *
 * The trap it is built to avoid: a TAPPED permanent is rotated 90 degrees, so
 * its LAYOUT box and its PAINTED box are different rectangles. Measuring gaps
 * between layout boxes says the row is fine (my own first probe reported gaps
 * of 9px and "0 overlapping"); measuring the painted boxes is what a player
 * sees. So both are reported side by side, and the difference between them IS
 * the answer.
 */
import fs from 'node:fs';
import { openHarness, startGame, advanceTo, gameState, shotter, sleep } from './uiLib.mjs';

const OUT = process.argv[2] || '.shots/row-overlap';

const probe = page => page.evaluate(() => {
  const rows = [];
  for (const el of document.querySelectorAll('[aria-label]')) {
    const lab = el.getAttribute('aria-label') || '';
    if (!/^(Creatures|Lands|Artifacts)/i.test(lab)) continue;
    const rr = el.getBoundingClientRect();

    /* One entry per permanent. The painted rect is the img's own client rect,
       which for a tapped card is the axis-aligned box of the rotated card and
       is therefore exactly what the eye sees. The layout rect is offsetWidth
       on the untransformed host. */
    const cards = [...el.querySelectorAll('img')]
      .map(img => {
        const paint = img.getBoundingClientRect();
        if (paint.width < 30) return null;
        // walk up to the element that carries the tap rotation
        let host = img, rot = 0;
        for (let i = 0; i < 6 && host && host !== el; i++) {
          const t = getComputedStyle(host).transform;
          if (t && t !== 'none') {
            const m = new DOMMatrixReadOnly(t);
            const a = Math.abs(Math.atan2(m.b, m.a) * 180 / Math.PI);
            if (a > rot) rot = a;
          }
          host = host.parentElement;
        }
        return {
          name: (img.alt || '').slice(0, 26),
          tapped: rot > 45,
          rot: Math.round(rot),
          x: paint.x, right: paint.right, w: paint.width, h: paint.height,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.x - b.x);

    if (!cards.length) { rows.push({ label: lab.slice(0, 34), rowW: Math.round(rr.width), cards: 0 }); continue; }

    /* Visible width of each card = its own width minus whatever the card drawn
       ON TOP of it (the next one along, later in paint order) covers. */
    const vis = cards.map((c, i) => {
      const next = cards[i + 1];
      const covered = next ? Math.max(0, c.right - next.x) : 0;
      return {
        name: c.name, tapped: c.tapped, rot: c.rot,
        paintedW: Math.round(c.w),
        coveredPx: Math.round(covered),
        visiblePct: Math.round(((c.w - covered) / c.w) * 100),
      };
    });

    const span = cards.at(-1).right - cards[0].x;
    rows.push({
      label: lab.slice(0, 34), rowW: Math.round(rr.width), cards: cards.length,
      tapped: cards.filter(c => c.tapped).length,
      spanPctOfRow: Math.round(span / rr.width * 100),
      emptyRowPct: Math.round((1 - span / rr.width) * 100),
      worstVisiblePct: Math.min(...vis.map(v => v.visiblePct)),
      slivers: vis.filter(v => v.visiblePct < 50).length,
      each: vis,
    });
  }
  return rows;
});

/**
 * Tap every permanent on the board, through the same dispatcher a click uses.
 *
 * A row only shows the defect when its cards are TURNED, and which cards are
 * tapped at any given moment of a bot game is luck. My first run of this script
 * landed on the upkeep of turn 8 with nothing tapped and reported every card
 * 100% visible, which is true of that instant and says nothing about the state
 * in the screenshot. `__dmDispatch` is the transport `usePlayGame` exposes for
 * exactly this, so the state is reproduced rather than waited for.
 */
const tapEverything = page => page.evaluate(() => {
  const g = window.__dmGame, d = window.__dmDispatch;
  if (!g || !d) return 0;
  const ids = [];
  for (const p of g.players) for (const id of p.zones.battlefield) {
    const c = g.cards[id];
    if (c && !c.tapped) ids.push(id);
  }
  d(ids.map(instanceId => ({ type: 'TAP', instanceId })));
  return ids.length;
});

const { browser, page, health } = await openHarness();
const shot = shotter(page, OUT);
await startGame(page);
await advanceTo(page, 8);
await sleep(800);
const tapped = await tapEverything(page);
console.log(`tapped ${tapped} permanents through __dmDispatch`);
await sleep(1200);
const g = await gameState(page);
const rows = await probe(page);
await shot('rows');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/rows.json`, JSON.stringify({ game: g, rows, health }, null, 2));

console.log(`T${g?.turn} ${g?.step}`);
for (const r of rows) {
  if (!r.cards) { console.log(`\n${r.label}: empty, row ${r.rowW}px`); continue; }
  console.log(`\n${r.label}: ${r.cards} cards (${r.tapped} tapped), row ${r.rowW}px, cards span ${r.spanPctOfRow}% -> ${r.emptyRowPct}% of the row is empty`);
  console.log(`   WORST CARD ${r.worstVisiblePct}% visible; ${r.slivers} card(s) under half covered`);
  for (const c of r.each) console.log(`     ${c.tapped ? 'TAP' : '   '} ${c.name.padEnd(26)} painted ${String(c.paintedW).padStart(4)}px, covered ${String(c.coveredPx).padStart(4)}px -> ${c.visiblePct}% visible`);
}
console.log('\nhealth: console', health.consoleErrors.length, 'page', health.pageErrors.length, 'net', health.netFails.length);
await browser.close();
