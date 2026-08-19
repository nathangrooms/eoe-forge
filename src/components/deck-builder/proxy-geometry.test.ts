import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLEED_MM,
  BLOCK_H_MM,
  BLOCK_W_MM,
  CARD_H_MM,
  CARD_W_MM,
  EDGE_CLEARANCE_MM,
  MARK_OUT_MM,
  MARK_W_MM,
  PAPER,
  PROXY_COLS,
  PROXY_PER_PAGE,
  PROXY_ROWS,
  bleedRect,
  chunkIntoPages,
  cropMarkSegments,
  sheetMargins,
  sheetPlan,
  showSheetPlan,
  type PaperSize,
} from './proxy-geometry.ts';

const PAPERS: PaperSize[] = ['a4', 'letter'];
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

/* ------------------------------------------------------------------ *
 * The card itself
 * ------------------------------------------------------------------ */

test('a card is 63 by 88 mm, not the 2.5 by 3.5 inch rounding', () => {
  assert.equal(CARD_W_MM, 63);
  assert.equal(CARD_H_MM, 88);
  // The rounding people quote, and the drift it would cause across a 3-up row.
  assert.ok(Math.abs(2.5 * 25.4 - CARD_W_MM) > 0.4);
  assert.ok(Math.abs(3.5 * 25.4 - CARD_H_MM) > 0.8);
});

test('the block is exactly three cards by three cards', () => {
  assert.equal(BLOCK_W_MM, PROXY_COLS * CARD_W_MM);
  assert.equal(BLOCK_H_MM, PROXY_ROWS * CARD_H_MM);
  assert.equal(BLOCK_W_MM, 189);
  assert.equal(BLOCK_H_MM, 264);
  assert.equal(PROXY_PER_PAGE, 9);
});

/* ------------------------------------------------------------------ *
 * The paper
 * ------------------------------------------------------------------ */

test('the block plus its bleed fits both papers, and is centred', () => {
  for (const paper of PAPERS) {
    const { wMm, hMm } = PAPER[paper];
    const m = sheetMargins(paper);
    assert.ok(m.xMm > BLEED_MM, `${paper} has no room for bleed at the sides`);
    assert.ok(m.yMm > BLEED_MM, `${paper} has no room for bleed top and bottom`);
    // Centred means the leftover is split evenly, so both sides match.
    assert.ok(near(wMm - BLOCK_W_MM - m.xMm, m.xMm));
    assert.ok(near(hMm - BLOCK_H_MM - m.yMm, m.yMm));
  }
});

test('the margins are the ones the stylesheet has to reproduce', () => {
  assert.ok(near(sheetMargins('a4').xMm, 10.5));
  assert.ok(near(sheetMargins('a4').yMm, 16.5));
  assert.ok(near(sheetMargins('letter').xMm, 13.45, 1e-9));
  assert.ok(near(sheetMargins('letter').yMm, 7.7, 1e-9));
});

/* ------------------------------------------------------------------ *
 * Bleed
 * ------------------------------------------------------------------ */

test('the bleed band surrounds the block evenly on all four sides', () => {
  for (const paper of PAPERS) {
    const m = sheetMargins(paper);
    const b = bleedRect(paper);
    assert.ok(near(m.xMm - b.xMm, BLEED_MM));
    assert.ok(near(m.yMm - b.yMm, BLEED_MM));
    assert.ok(near(b.xMm + b.wMm - (m.xMm + BLOCK_W_MM), BLEED_MM));
    assert.ok(near(b.yMm + b.hMm - (m.yMm + BLOCK_H_MM), BLEED_MM));
  }
});

test('the band stays on the paper', () => {
  for (const paper of PAPERS) {
    const { wMm, hMm } = PAPER[paper];
    const b = bleedRect(paper);
    assert.ok(b.xMm > 0 && b.yMm > 0);
    assert.ok(b.xMm + b.wMm < wMm && b.yMm + b.hMm < hMm);
  }
});

/* ------------------------------------------------------------------ *
 * Crop marks
 * ------------------------------------------------------------------ */

test('every cut line is ticked at both ends, and nothing else is', () => {
  for (const paper of PAPERS) {
    const segs = cropMarkSegments(paper);
    // 4 vertical lines and 4 horizontal lines, 2 ends each, 2 pieces per end.
    assert.equal(segs.length, (PROXY_COLS + 1 + PROXY_ROWS + 1) * 2 * 2);
    assert.equal(segs.filter(s => s.tone === 'onBleed').length, segs.length / 2);
  }
});

test('a mark is centred on the cut line it marks', () => {
  for (const paper of PAPERS) {
    const m = sheetMargins(paper);
    const segs = cropMarkSegments(paper);
    const verticals = segs.filter(s => near(s.wMm, MARK_W_MM));
    const centres = [...new Set(verticals.map(s => s.xMm + s.wMm / 2))].sort((a, b) => a - b);
    assert.deepEqual(
      centres.map(v => Math.round(v * 1000) / 1000),
      [0, 1, 2, 3].map(i => Math.round((m.xMm + i * CARD_W_MM) * 1000) / 1000)
    );
  }
});

test('no mark touches a card', () => {
  for (const paper of PAPERS) {
    const m = sheetMargins(paper);
    for (const s of cropMarkSegments(paper)) {
      const insideX = s.xMm > m.xMm && s.xMm + s.wMm < m.xMm + BLOCK_W_MM;
      const insideY = s.yMm > m.yMm && s.yMm + s.hMm < m.yMm + BLOCK_H_MM;
      assert.ok(!(insideX && insideY), `a mark landed inside the card block on ${paper}`);
    }
  }
});

test('no mark strays into the part of the page a desktop printer cannot reach', () => {
  for (const paper of PAPERS) {
    const { wMm, hMm } = PAPER[paper];
    for (const s of cropMarkSegments(paper)) {
      assert.ok(s.xMm >= EDGE_CLEARANCE_MM, `${paper}: mark ${s.xMm.toFixed(2)} mm from the left edge`);
      assert.ok(s.yMm >= EDGE_CLEARANCE_MM, `${paper}: mark ${s.yMm.toFixed(2)} mm from the top edge`);
      assert.ok(wMm - (s.xMm + s.wMm) >= EDGE_CLEARANCE_MM);
      assert.ok(hMm - (s.yMm + s.hMm) >= EDGE_CLEARANCE_MM);
    }
  }
});

test('the two halves of a mark meet exactly at the edge of the bleed', () => {
  for (const paper of PAPERS) {
    const b = bleedRect(paper);
    for (const s of cropMarkSegments(paper).filter(x => x.tone === 'onPaper')) {
      const meetsTop = near(s.yMm + s.hMm, b.yMm);
      const meetsBottom = near(s.yMm, b.yMm + b.hMm);
      const meetsLeft = near(s.xMm + s.wMm, b.xMm);
      const meetsRight = near(s.xMm, b.xMm + b.wMm);
      assert.ok(meetsTop || meetsBottom || meetsLeft || meetsRight);
      assert.ok(near(Math.max(s.wMm, s.hMm), MARK_OUT_MM));
    }
  }
});

/* ------------------------------------------------------------------ *
 * Counting before anybody spends paper
 * ------------------------------------------------------------------ */

test('the plan counts sheets the way a printer does', () => {
  assert.deepEqual(sheetPlan(0), { cards: 0, sheets: 0, onLast: 0 });
  assert.deepEqual(sheetPlan(1), { cards: 1, sheets: 1, onLast: 1 });
  assert.deepEqual(sheetPlan(9), { cards: 9, sheets: 1, onLast: 9 });
  assert.deepEqual(sheetPlan(10), { cards: 10, sheets: 2, onLast: 1 });
  assert.deepEqual(sheetPlan(99), { cards: 99, sheets: 11, onLast: 9 });
  assert.deepEqual(sheetPlan(100), { cards: 100, sheets: 12, onLast: 1 });
});

test('the words say cards and sheets, and only mention a short last sheet', () => {
  assert.equal(showSheetPlan(sheetPlan(0)), 'Nothing to print yet');
  assert.equal(showSheetPlan(sheetPlan(1)), '1 card on 1 sheet');
  assert.equal(showSheetPlan(sheetPlan(9)), '9 cards on 1 sheet');
  assert.equal(showSheetPlan(sheetPlan(10)), '10 cards on 2 sheets, 1 on the last one');
  assert.equal(showSheetPlan(sheetPlan(18)), '18 cards on 2 sheets');
  assert.equal(showSheetPlan(sheetPlan(100)), '100 cards on 12 sheets, 1 on the last one');
});

test('no copy from this file carries an em-dash', () => {
  for (const n of [0, 1, 9, 10, 18, 100]) {
    assert.ok(!showSheetPlan(sheetPlan(n)).includes('—'));
  }
});

/* ------------------------------------------------------------------ *
 * Paging
 * ------------------------------------------------------------------ */

test('pages hold nine and the remainder rides on the last one', () => {
  const pages = chunkIntoPages(Array.from({ length: 13 }, (_, i) => i));
  assert.equal(pages.length, 2);
  assert.equal(pages[0].length, 9);
  assert.equal(pages[1].length, 4);
  assert.equal(chunkIntoPages([]).length, 0);
});
