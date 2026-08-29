/**
 * Measure the play table's geometry. No opinions, only numbers.
 *
 * This exists because the standing instruction on this task is MEASURE BEFORE
 * YOU DIAGNOSE, and the defect list I was handed contains at least two claims
 * that read like they were reasoned rather than measured:
 *
 *   - "your hand is cut off by the bottom of the window" — the fan is DESIGNED
 *     to sink. `tableMetrics.HAND_REVEAL = 0.62` puts the type line on the last
 *     visible row on purpose. So the question is not "does it overflow" (it
 *     must) but "is the type line above the fold", which is what this measures.
 *   - "empty rows reserve full height" — `seatLayout.ts` makes row height a
 *     function of the BOX and never of the count, deliberately, because
 *     count-driven heights resized every card on the mat whenever a permanent
 *     arrived. So this measures the whole vertical budget instead: what the
 *     seats get, what the hand gets, and what is actually painted in each.
 *
 * Run: node scripts/playtest/ui-measure.mjs <outdir>
 */
import fs from 'node:fs';
import { openHarness, startGame, advanceTo, gameState, shotter, sleep, pressText, unblock } from './uiLib.mjs';

const OUT = process.argv[2] || '.shots/ui-before';
const CARD_AR = 488 / 680;
/** Where the type line sits down a Magic card, as a fraction of its height. */
const TYPE_LINE = 0.62;

/* --------------------------------------------------------------------------
   the probes
   -------------------------------------------------------------------------- */

/**
 * Every hand card: how far its AABB runs past the bottom of the window.
 *
 * THIS DOES NOT MEASURE WHETHER THE TYPE LINE IS VISIBLE, and an earlier
 * version of this function that tried to — by taking 62% of the axis-aligned
 * box — reported the type line hidden on 4 of 8 cards when the true figure is
 * 0 of 8. A hand card is rotated, so its AABB is taller than the card and 62%
 * down the box is not where the type line is. That measurement lives in
 * `hand-contract.mjs`, which injects a marker into the card instead, and it is
 * the only one to quote. The overflow below is real but on its own means
 * nothing: the fan is DESIGNED to sink, see `tableMetrics.HAND_REVEAL`.
 */
const handProbe = page => page.evaluate(TYPE_LINE => {
  const vh = innerHeight;
  const cards = [...document.querySelectorAll('button[title]')]
    .filter(b => (b.getAttribute('title') || '').includes('Click to preview'))
    .map(b => {
      const r = b.getBoundingClientRect();
      const visible = Math.max(0, Math.min(vh, r.bottom) - r.top);
      return {
        name: (b.getAttribute('title') || '').replace(/\. Click to preview.*/, '').slice(0, 30),
        top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
        visiblePct: Math.round((visible / r.height) * 100),
        overflowPx: Math.round(Math.max(0, r.bottom - vh)),
        /* The AABB of a rotated card is taller than the card, so the type line
           is not simply 0.62 down the measured box. Take it off the card's own
           layout height where we can see it. */
        typeLineY: Math.round(r.top + r.height * TYPE_LINE),
        typeLineVisible: r.top + r.height * TYPE_LINE < vh,
      };
    });
  return {
    vh, count: cards.length,
    aabbOverflowNote: "see hand-contract.mjs for the type-line contract",
    worstOverflow: cards.length ? Math.max(0, ...cards.map(c => c.overflowPx)) : 0,
    leastVisiblePct: cards.length ? Math.min(...cards.map(c => c.visiblePct)) : null,
    cards,
  };
}, TYPE_LINE);

/** The whole vertical budget: every band, what it reserves, what it paints. */
const budgetProbe = page => page.evaluate(() => {
  const vh = innerHeight, vw = innerWidth;
  const label = e => (e.getAttribute('aria-label') || '').slice(0, 46);
  const rows = [...document.querySelectorAll('[aria-label]')]
    .filter(e => /^(Creatures|Lands|Artifacts|Seat|Battlefield)/i.test(label(e)))
    .map(e => {
      const r = e.getBoundingClientRect();
      // cards actually painted inside this row
      const cards = [...e.querySelectorAll('img')].filter(i => i.getBoundingClientRect().width > 30);
      return {
        label: label(e), y: Math.round(r.y), h: Math.round(r.height),
        w: Math.round(r.width), pctVh: +(r.height / vh * 100).toFixed(1),
        cards: cards.length,
      };
    })
    .filter(r => r.h > 8);
  const root = document.querySelector('#root')?.getBoundingClientRect();
  return {
    vh, vw,
    rootWidth: root ? Math.round(root.width) : null,
    rootWidthPct: root ? Math.round(root.width / vw * 100) : null,
    rows,
  };
});

/** Do any two floating surfaces overlap, and by how much. */
const panelProbe = page => page.evaluate(() => {
  const cand = [...document.querySelectorAll('div,section,aside')].filter(e => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    if (r.width < 220 || r.height < 120) return false;
    if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
    if (cs.visibility === 'hidden' || cs.opacity === '0') return false;
    return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backdropFilter !== 'none';
  });
  const tops = cand.filter(e => !cand.some(o => o !== e && o.contains(e)));
  const boxes = tops.map(e => {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return {
      text: (e.innerText || '').replace(/\s+/g, ' ').slice(0, 50), z: cs.zIndex,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
    };
  });
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    if (ox * oy > 1200) overlaps.push({ a: a.text.slice(0, 26), b: b.text.slice(0, 26), px: ox * oy });
  }
  return { openPanels: boxes.length, boxes, overlaps };
});

/** Does the log strip sit under a hand card? Real intersection, in px. */
const logProbe = page => page.evaluate(() => {
  const feed = [...document.querySelectorAll('[aria-label]')]
    .find(e => /log|feed/i.test(e.getAttribute('aria-label') || ''));
  if (!feed) return { found: false };
  const f = feed.getBoundingClientRect();
  const hand = [...document.querySelectorAll('button[title]')]
    .filter(b => (b.getAttribute('title') || '').includes('Click to preview'));
  let worst = 0, who = null;
  for (const b of hand) {
    const r = b.getBoundingClientRect();
    const ox = Math.max(0, Math.min(f.right, r.right) - Math.max(f.left, r.left));
    const oy = Math.max(0, Math.min(f.bottom, r.bottom) - Math.max(f.top, r.top));
    if (ox * oy > worst) { worst = ox * oy; who = (b.getAttribute('title') || '').slice(0, 26); }
  }
  /* And what else does it land on? Moving it out of the hand's band is only an
     improvement if it did not simply land on something else that matters. */
  let onCards = 0, onCardNames = [];
  for (const img of document.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    if (r.width < 40) continue;
    const ox = Math.max(0, Math.min(f.right, r.right) - Math.max(f.left, r.left));
    const oy = Math.max(0, Math.min(f.bottom, r.bottom) - Math.max(f.top, r.top));
    if (ox * oy > 200) { onCards += ox * oy; onCardNames.push(`${(img.alt || '?').slice(0, 22)} ${Math.round(ox * oy)}px`); }
  }
  return {
    found: true, feed: { x: Math.round(f.x), y: Math.round(f.y), w: Math.round(f.width), h: Math.round(f.height) },
    coveredByHandPx: Math.round(worst), worstCard: who,
    coversCardsPx: Math.round(onCards), coversCards: onCardNames.slice(0, 4),
  };
});

/** Row geometry: where each card sits, so "tightly overlapping" is a number. */
const rowGeometryProbe = page => page.evaluate(() => {
  const out = [];
  for (const e of document.querySelectorAll('[aria-label]')) {
    const lab = e.getAttribute('aria-label') || '';
    if (!/^(Creatures|Lands|Artifacts)/i.test(lab)) continue;
    const r = e.getBoundingClientRect();
    const cards = [...e.querySelectorAll('img')]
      .map(i => i.getBoundingClientRect())
      .filter(b => b.width > 30)
      .sort((a, b) => a.x - b.x);
    if (!cards.length) { out.push({ label: lab.slice(0, 40), rowW: Math.round(r.width), cards: 0 }); continue; }
    const gaps = cards.slice(1).map((c, i) => Math.round(c.x - (cards[i].x + cards[i].width)));
    const span = Math.round(cards.at(-1).right - cards[0].x);
    out.push({
      label: lab.slice(0, 40), rowW: Math.round(r.width), cards: cards.length,
      cardW: Math.round(cards[0].width), gaps,
      spanPctOfRow: Math.round(span / r.width * 100),
      leftPad: Math.round(cards[0].x - r.x), rightPad: Math.round(r.right - cards.at(-1).right),
      overlapping: gaps.filter(g => g < 0).length,
    });
  }
  return out;
});

/** Where is the primary action bar, top half or bottom half. */
const actionBarProbe = page => page.evaluate(() => {
  const vh = innerHeight;
  const words = /^(END TURN|RESPOND|NEXT|Keep|Mulligan|ATTACK|BLOCK|NO ATTACKS|NO BLOCKS|DECLARE ATTACKERS|DECLARE BLOCKERS|LET IT RESOLVE|CONCEDE)$/i;
  return [...document.querySelectorAll('button')]
    .map(b => ({ b, t: (b.innerText || '').trim() }))
    .filter(x => words.test(x.t))
    .map(x => {
      const r = x.b.getBoundingClientRect();
      if (!r.width && !r.height) return null;
      return { text: x.t, cy: Math.round(r.y + r.height / 2), half: (r.y + r.height / 2) < vh / 2 ? 'TOP' : 'BOTTOM' };
    }).filter(Boolean);
});

/**
 * Card-art law: cropping and desaturation, anywhere on screen.
 *
 * Measured on `offsetWidth`/`offsetHeight`, which are LAYOUT dimensions and
 * ignore transforms entirely. `getBoundingClientRect` returns the axis-aligned
 * box of a ROTATED element, and a hand card leaning 15 degrees has an AABB
 * a long way off card aspect while the card itself is exact. Two passes on this
 * project have now reported "6-9 cropped cards" off that artifact, mine
 * included on the first run of this very script. There is no rotation maths
 * here on purpose: the trap is reintroduced the moment a rect is used.
 */
const artProbe = page => page.evaluate(() => {
  let cropped = 0, desat = 0, total = 0;
  const bad = [];
  for (const i of document.querySelectorAll('img')) {
    if (i.getBoundingClientRect().width < 40 || !i.naturalWidth) continue;
    total++;
    const cs = getComputedStyle(i);
    const natAR = i.naturalWidth / i.naturalHeight;
    const host = i.offsetWidth > 10 ? i : (i.parentElement || i);
    const boxAR = host.offsetWidth / host.offsetHeight;
    const drift = Math.abs(boxAR - natAR) / natAR;
    const isCropped = cs.objectFit === 'cover' && drift > 0.03;
    const isDesat = /grayscale|saturate\(0/.test(cs.filter);
    if (isCropped) { cropped++; bad.push({ alt: (i.alt || '').slice(0, 28), box: `${host.offsetWidth}x${host.offsetHeight}`, boxAR: +boxAR.toFixed(3), natAR: +natAR.toFixed(3), driftPct: +(drift * 100).toFixed(1) }); }
    if (isDesat) { desat++; bad.push({ alt: (i.alt || '').slice(0, 28), filter: cs.filter }); }
  }
  return { total, cropped, desat, bad: bad.slice(0, 8) };
});

/* --------------------------------------------------------------------------
   run
   -------------------------------------------------------------------------- */
const { browser, page, health } = await openHarness();
const shot = shotter(page, OUT);
const records = [];

const capture = async name => {
  const file = await shot(name);
  const rec = {
    screen: name, file,
    game: await gameState(page),
    hand: await handProbe(page),
    budget: await budgetProbe(page),
    panels: await panelProbe(page),
    log: await logProbe(page),
    rowGeometry: await rowGeometryProbe(page),
    actionBar: await actionBarProbe(page),
    art: await artProbe(page),
  };
  records.push(rec);
  const h = rec.hand, b = rec.budget;
  console.log(`\n== ${name} == ${rec.game ? `T${rec.game.turn} ${rec.game.step}` : 'no game'}`);
  console.log(`   width ${b.rootWidth}/${b.vw} = ${b.rootWidthPct}%`);
  console.log(`   hand ${h.count} cards | worst AABB overflow ${h.worstOverflow}px | least visible ${h.leastVisiblePct}%`);
  console.log(`   rows: ${b.rows.map(r => `${r.label}[${r.cards}] ${r.h}px/${r.pctVh}%`).join('  ')}`);
  console.log(`   panels open ${rec.panels.openPanels}, overlaps ${rec.panels.overlaps.length}${rec.panels.overlaps.length ? ' -> ' + JSON.stringify(rec.panels.overlaps.slice(0, 2)) : ''}`);
  console.log(`   log covered by hand: ${rec.log.found ? rec.log.coveredByHandPx + 'px (' + rec.log.worstCard + ')' : 'no feed found'}`);
  if (rec.log.found) console.log(`   log covers cards: ${rec.log.coversCardsPx}px ${JSON.stringify(rec.log.coversCards)}`);
  console.log(`   art: ${rec.art.total} imgs, cropped ${rec.art.cropped}, desat ${rec.art.desat}`);
  console.log(`   bar: ${rec.actionBar.map(a => a.text + '@' + a.cy + ':' + a.half).join(', ') || 'none'}`);
  for (const r of rec.rowGeometry) console.log(`   geom ${r.label}: ${r.cards} cards, span ${r.spanPctOfRow ?? '-'}% of ${r.rowW}px, gaps ${JSON.stringify(r.gaps ?? [])}, overlapping ${r.overlapping ?? 0}`);
  return rec;
};

// screen one: the mode wall
await capture('landing');

await startGame(page);
await capture('turn-one');

await advanceTo(page, 4);
await capture('midgame');

await advanceTo(page, 8);
await capture('later');

fs.writeFileSync(`${OUT}/measure.json`, JSON.stringify({ records, health }, null, 2));
console.log('\n--- health ---');
console.log('console errors', health.consoleErrors.length, '| page errors', health.pageErrors.length, '| net fails', health.netFails.length);
if (health.pageErrors.length) console.log(health.pageErrors.slice(0, 3));
await browser.close();
