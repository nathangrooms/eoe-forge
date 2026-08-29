/**
 * WHAT THE BOARD ACTUALLY MEASURES, so the visual pass is not done off a
 * screenshot. Every earlier confident-and-wrong diagnosis on this project came
 * from looking at a picture; this reads the boxes.
 *
 * Per seat mat it reports: the mat box, each row's box, how many cards are on
 * it, how wide they are, the PITCH between them, and therefore whether the row
 * is overlapping while it still has spare width. It also reports how much of
 * the mat is covered by anything at all, which is the "unutilised space" the
 * owner keeps naming.
 *
 * It measures the stamps too — the combat marks and the tap chip — as a
 * fraction of the card they are drawn on, because a badge that covers a third
 * of a card is why a crowded row cannot be read.
 */
import { openHarness, sleep, startGame, advanceTo, gameState } from './uiLib.mjs';
import fs from 'node:fs';

const PROBE = () => {
  const round = n => Math.round(n);
  const boxOf = el => { const r = el.getBoundingClientRect(); return { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) }; };

  const mats = [...document.querySelectorAll('[aria-label$=\" seat\"], [aria-label=\"Your seat\"]')];
  const seats = mats.map(mat => {
    const matBox = boxOf(mat);
    const rows = [...mat.querySelectorAll('[aria-label]')]
      .filter(el => /^(Creatures|Lands|Artifacts)/i.test(el.getAttribute('aria-label') || ''))
      .map(row => {
        const rb = boxOf(row);
        const cards = [...row.querySelectorAll('[data-instance]')].map(boxOf)
          .sort((a, b) => a.x - b.x);
        const pitch = cards.length > 1 ? round(cards[1].x - cards[0].x) : null;
        const cw = cards.length ? cards[0].w : null;
        const span = cards.length ? (cards.at(-1).x + cards.at(-1).w) - cards[0].x : 0;
        return {
          label: row.getAttribute('aria-label'), box: rb, count: cards.length,
          cardW: cw, pitch,
          overlapPx: cw && pitch !== null ? Math.max(0, cw - pitch) : 0,
          span: round(span),
          spareWidth: round(rb.w - span),
        };
      });

    /* How much of the mat has anything drawn on it. */
    let covered = 0;
    for (const el of mat.querySelectorAll('[data-instance]')) {
      const b = boxOf(el); covered += b.w * b.h;
    }
    return {
      matBox, rows,
      cardsOnMat: mat.querySelectorAll('[data-instance]').length,
      coveredPct: matBox.w * matBox.h ? +(100 * covered / (matBox.w * matBox.h)).toFixed(1) : 0,
    };
  });

  /* Stamps, as a fraction of the card they sit on. */
  const stamps = [];
  for (const card of document.querySelectorAll('[data-instance]')) {
    const cb = boxOf(card);
    if (cb.w < 20) continue;
    for (const el of card.querySelectorAll('button, span, div')) {
      const t = (el.textContent || '').trim();
      const b = boxOf(el);
      if (b.w < 12 || b.h < 12) continue;
      if (b.w > cb.w * 0.9 && b.h > cb.h * 0.9) continue;
      const isMark = /^(hits you|attacking|blocked|blocking|\d+\/\d+)$/i.test(t);
      const isTap = /tap|untap/i.test(el.getAttribute('title') || el.getAttribute('aria-label') || '');
      if (!isMark && !isTap) continue;
      stamps.push({ kind: isTap ? 'tap' : 'mark', text: t.slice(0, 16), w: b.w, h: b.h,
        pctOfCardW: +(100 * b.w / cb.w).toFixed(0), pctOfCardArea: +(100 * (b.w * b.h) / (cb.w * cb.h)).toFixed(0) });
    }
  }

  /* The floating log: where is it, and is it over a card? */
  const log = [...document.querySelectorAll('[aria-label="Game log"]')].map(el => {
    const b = boxOf(el);
    let overCards = 0, clipped = 0;
    for (const li of el.querySelectorAll('li')) {
      /* Two ways a line can be cut: sideways by `truncate`, or downward by
         `line-clamp`. Count both, or a change from one to the other reads
         as a fix when it is only a different amputation. */
      if (li.scrollWidth > li.clientWidth + 1 || li.scrollHeight > li.clientHeight + 1) clipped++;
      const lb = boxOf(li);
      for (const c of document.querySelectorAll('[data-instance]')) {
        const cb = boxOf(c);
        const ox = Math.max(0, Math.min(lb.x + lb.w, cb.x + cb.w) - Math.max(lb.x, cb.x));
        const oy = Math.max(0, Math.min(lb.y + lb.h, cb.y + cb.h) - Math.max(lb.y, cb.y));
        overCards += ox * oy;
      }
    }
    return { box: b, overCardsPx: Math.round(overCards), clippedLines: clipped };
  });

  /* Hand clipping against the bottom of the window. */
  const vh = window.innerHeight;
  /* A hand card is a card view that is not on anybody's mat. Selecting it by a
     wrapper class would break the moment the wrapper is renamed. */
  const onMat = new Set();
  for (const mat of mats) for (const c of mat.querySelectorAll('[data-instance]')) onMat.add(c);
  const hand = [...document.querySelectorAll('[data-instance]')].filter(el => !onMat.has(el)).map(el => {
    const r = el.getBoundingClientRect();
    const below = Math.max(0, (r.y + r.height) - vh);
    return { h: round(r.height), lostPct: r.height ? +(100 * below / r.height).toFixed(1) : 0 };
  });

  return {
    vw: window.innerWidth, vh, seats, stamps, log,
    hand: { count: hand.length, clipped: hand.filter(c => c.lostPct > 0).length,
      worstLostPct: hand.length ? Math.max(...hand.map(c => c.lostPct)) : 0 },
  };
};

const run = async () => {
  const { browser, page, health } = await openHarness({ width: 1600, height: 1000 });
  await startGame(page);
  const target = Number(process.env.TURN || 12);
  await advanceTo(page, target);
  await sleep(1200);
  const g = await gameState(page);
  const m = await page.evaluate(PROBE);
  const tag = process.env.TAG || 'now';
  fs.mkdirSync('.shots/geometry', { recursive: true });
  await page.screenshot({ path: `.shots/geometry/${tag}.png` });

  console.log(`game: ${JSON.stringify(g)}`);
  console.log(`viewport ${m.vw}x${m.vh}`);
  for (const [i, s] of m.seats.entries()) {
    console.log(`\nSEAT ${i}  mat ${s.matBox.w}x${s.matBox.h} @${s.matBox.x},${s.matBox.y}  cards ${s.cardsOnMat}  mat covered ${s.coveredPct}%`);
    for (const r of s.rows) {
      console.log(`   ${String(r.label).slice(0, 26).padEnd(26)} box ${String(r.box.w).padStart(4)}x${String(r.box.h).padStart(3)}  n=${String(r.count).padStart(2)}  cardW=${r.cardW}  pitch=${r.pitch}  OVERLAP=${r.overlapPx}px  span=${r.span}  spare=${r.spareWidth}`);
    }
  }
  const byKind = {};
  for (const s of m.stamps) {
    const k = `${s.kind}:${s.text}`;
    if (!byKind[k]) byKind[k] = s;
  }
  console.log('\nSTAMPS ON CARDS (size as % of the card they cover)');
  for (const s of Object.values(byKind)) console.log(`   ${s.kind.padEnd(5)} "${s.text}" ${s.w}x${s.h}  = ${s.pctOfCardW}% of card width, ${s.pctOfCardArea}% of its area`);
  console.log('\nLOG  ' + JSON.stringify(m.log));
  console.log('HAND ' + JSON.stringify(m.hand));
  console.log(`\nhealth: pageerrors ${health.pageErrors.length} console ${health.consoleErrors.length} net ${health.netFails.length}`);
  fs.writeFileSync(`.shots/geometry/${tag}.json`, JSON.stringify({ g, ...m }, null, 2));
  await browser.close();
};
run().catch(e => { console.error('FAILED', e); process.exit(1); });
