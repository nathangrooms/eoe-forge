/**
 * The millimetres. Nothing else.
 *
 * The printed sheet is the product, so the numbers that decide how big a card
 * comes out are worth isolating from everything that fetches, resolves or draws.
 * This file imports nothing, which is the point: it runs under `node --test`, so
 * the geometry has unit tests (`proxy-geometry.test.ts`) as well as a browser
 * measurement (`scripts/proxy-sheet-measure.mjs`).
 *
 * `proxy-print.ts` re-exports every name here, so no consumer had to change.
 *
 * Three things have to agree or the card prints the wrong size: the print
 * stylesheet (`proxy-sheet.css`), the on-screen preview, and the jsPDF export.
 * All three read these functions.
 */

/* ------------------------------------------------------------------ *
 * The card
 * ------------------------------------------------------------------ */

/**
 * A Magic card is 63 x 88 mm.
 *
 * Deliberately not 2.5 x 3.5 in (63.5 x 88.9 mm), which is the sleeve and
 * card-stock rounding everyone quotes. The difference is only 0.5 mm per card,
 * but it is 1.5 mm across a 3-up row and 2.7 mm down a 3-up column, which is
 * enough to walk a cut line off the black border by the third card. Print at
 * true card size and a proxy drops into a sleeve next to a real card without
 * anyone noticing.
 */
export const CARD_W_MM = 63;
export const CARD_H_MM = 88;

/** CSS reference pixels per millimetre. CSS fixes 1in = 96px exactly. */
export const MM_TO_PX = 96 / 25.4;

/** PDF points per millimetre. PostScript fixes 1in = 72pt exactly. */
export const MM_TO_PT = 72 / 25.4;

export const PROXY_COLS = 3;
export const PROXY_ROWS = 3;
export const PROXY_PER_PAGE = PROXY_COLS * PROXY_ROWS;

/** The 3 x 3 block of cards, before any bleed. 189 x 264 mm. */
export const BLOCK_W_MM = PROXY_COLS * CARD_W_MM;
export const BLOCK_H_MM = PROXY_ROWS * CARD_H_MM;

/* ------------------------------------------------------------------ *
 * The paper
 * ------------------------------------------------------------------ */

export type PaperSize = 'a4' | 'letter';

export const PAPER: Record<PaperSize, { label: string; wMm: number; hMm: number; pdfFormat: string }> = {
  a4: { label: 'A4', wMm: 210, hMm: 297, pdfFormat: 'a4' },
  letter: { label: 'Letter', wMm: 215.9, hMm: 279.4, pdfFormat: 'letter' },
};

/**
 * Margins are derived, never authored.
 *
 * The card block is 189 x 264 mm, so it fits both sheets and the leftover is
 * split evenly. Letter is the tight one: 279.4 - 264 leaves only 7.7 mm top and
 * bottom. That is why {@link EDGE_CLEARANCE_MM} exists and why the crop marks
 * are as short as they are.
 *
 * It also means "Fit to page" in the browser's print dialog will shrink the
 * sheet to make its own margins fit, which is the single most common way a
 * correct stylesheet still prints the wrong size. {@link PRINT_DIALOG_HINT}
 * exists to tell the reader that.
 */
export function sheetMargins(paper: PaperSize) {
  const p = PAPER[paper];
  return {
    xMm: (p.wMm - BLOCK_W_MM) / 2,
    yMm: (p.hMm - BLOCK_H_MM) / 2,
  };
}

export const PRINT_DIALOG_HINT =
  'In the print dialog set Margins to "None" and Scale to 100% (turn off "Fit to page"), or cards print undersized.';

/* ------------------------------------------------------------------ *
 * Cutting
 * ------------------------------------------------------------------ */

/**
 * How wide the black band around the block is.
 *
 * WHY THERE IS A BAND AT ALL
 * --------------------------
 * The nine cards abut with no gutter, so every cut on the inside of the sheet
 * is shared by two cards. Miss one of those by half a millimetre and the sliver
 * you gain is the neighbour's black border, which nobody will ever spot. The
 * four cuts around the OUTSIDE of the block have no neighbour, so missing one
 * of those by half a millimetre leaves a white sliver down the edge of the
 * card, which everybody spots instantly and which no sleeve hides.
 *
 * So the block is printed on a black band. Cut 1.5 mm wide of the line and you
 * keep a hair of black, which reads as a slightly generous border. That is the
 * bleed, and it is the only thing on the page that is not a card.
 *
 * 1.5 mm and not more because it is solid black on every sheet: at this width
 * it is 1,368 mm2, about 2.2% of an A4 page. It is also why cut marks are a
 * setting and not a law.
 */
export const BLEED_MM = 1.5;

/** How far a crop mark runs past the bleed, onto bare paper. */
export const MARK_OUT_MM = 2;

/** Hairline. Thin enough that the cut destroys it. */
export const MARK_W_MM = 0.25;

/**
 * How close a crop mark is allowed to get to the edge of the paper.
 *
 * Consumer printers cannot print to the edge. 3.4 mm is the widest unprintable
 * margin among the common desktop machines, so a mark inside that is a mark
 * that may not come out. Letter is the binding case: 7.7 mm of margin, less
 * 1.5 mm of bleed and 2 mm of mark, leaves 4.2 mm. The test asserts it.
 */
export const EDGE_CLEARANCE_MM = 3.4;

export interface SheetRect {
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
}

/** The black band, measured from the top left of the paper. */
export function bleedRect(paper: PaperSize): SheetRect {
  const { xMm, yMm } = sheetMargins(paper);
  return {
    xMm: xMm - BLEED_MM,
    yMm: yMm - BLEED_MM,
    wMm: BLOCK_W_MM + BLEED_MM * 2,
    hMm: BLOCK_H_MM + BLEED_MM * 2,
  };
}

/**
 * Crop marks, already broken into the pieces that get drawn.
 *
 * WHY THE MARKS ARE NOT ON THE CARDS
 * ----------------------------------
 * They used to be. Every slot carried a 0.2 mm grey outline pulled just inside
 * its own edge, which put a grey hairline on the outermost 0.2 mm of the card
 * itself. On a black-bordered card that is invisible and the cut removes it
 * anyway. On a borderless or full-art card, which is exactly the kind of proxy
 * people want most, it is a grey line across the art, and it survives any cut
 * that lands even slightly inside the line.
 *
 * So the marks moved off the card entirely. Every cut line gets a tick at both
 * ends, in the margin, and a ruler laid across a pair of them is the cut.
 *
 * Each mark is returned as two rectangles because it crosses two backgrounds:
 * the part over the black bleed has to be white to be seen, and the part on
 * bare paper has to be grey. Returning the pieces rather than a direction keeps
 * the CSS and the PDF from having to work it out twice and disagree.
 */
export type MarkTone = 'onBleed' | 'onPaper';

export function cropMarkSegments(paper: PaperSize): (SheetRect & { tone: MarkTone })[] {
  const { xMm, yMm } = sheetMargins(paper);
  const out: (SheetRect & { tone: MarkTone })[] = [];
  const half = MARK_W_MM / 2;

  // The four vertical cut lines, ticked above and below the block.
  for (let col = 0; col <= PROXY_COLS; col++) {
    const x = xMm + col * CARD_W_MM - half;
    out.push({ xMm: x, yMm: yMm - BLEED_MM, wMm: MARK_W_MM, hMm: BLEED_MM, tone: 'onBleed' });
    out.push({ xMm: x, yMm: yMm - BLEED_MM - MARK_OUT_MM, wMm: MARK_W_MM, hMm: MARK_OUT_MM, tone: 'onPaper' });
    out.push({ xMm: x, yMm: yMm + BLOCK_H_MM, wMm: MARK_W_MM, hMm: BLEED_MM, tone: 'onBleed' });
    out.push({ xMm: x, yMm: yMm + BLOCK_H_MM + BLEED_MM, wMm: MARK_W_MM, hMm: MARK_OUT_MM, tone: 'onPaper' });
  }

  // The four horizontal cut lines, ticked left and right of the block.
  for (let row = 0; row <= PROXY_ROWS; row++) {
    const y = yMm + row * CARD_H_MM - half;
    out.push({ xMm: xMm - BLEED_MM, yMm: y, wMm: BLEED_MM, hMm: MARK_W_MM, tone: 'onBleed' });
    out.push({ xMm: xMm - BLEED_MM - MARK_OUT_MM, yMm: y, wMm: MARK_OUT_MM, hMm: MARK_W_MM, tone: 'onPaper' });
    out.push({ xMm: xMm + BLOCK_W_MM, yMm: y, wMm: BLEED_MM, hMm: MARK_W_MM, tone: 'onBleed' });
    out.push({ xMm: xMm + BLOCK_W_MM + BLEED_MM, yMm: y, wMm: MARK_OUT_MM, hMm: MARK_W_MM, tone: 'onPaper' });
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Counting, before anybody spends paper
 * ------------------------------------------------------------------ */

export interface SheetPlan {
  /** Physical cards. A double faced card is two of these, not one. */
  cards: number;
  sheets: number;
  /** How many cards land on the last sheet. */
  onLast: number;
}

export function sheetPlan(cardCount: number, perPage = PROXY_PER_PAGE): SheetPlan {
  const cards = Math.max(0, Math.floor(cardCount));
  const sheets = Math.ceil(cards / perPage);
  return {
    cards,
    sheets,
    onLast: cards === 0 ? 0 : cards - (sheets - 1) * perPage,
  };
}

/**
 * The plan in words, for the button and the line above it.
 *
 * The last sheet is named only when it is short, because that is the only time
 * the number tells you anything: a sheet with two cards on it is the sheet you
 * might rather fill first.
 */
export function showSheetPlan(plan: SheetPlan, perPage = PROXY_PER_PAGE): string {
  if (plan.cards === 0) return 'Nothing to print yet';
  const cards = `${plan.cards} ${plan.cards === 1 ? 'card' : 'cards'}`;
  const sheets = `${plan.sheets} ${plan.sheets === 1 ? 'sheet' : 'sheets'}`;
  if (plan.sheets > 1 && plan.onLast < perPage) {
    return `${cards} on ${sheets}, ${plan.onLast} on the last one`;
  }
  return `${cards} on ${sheets}`;
}

export function chunkIntoPages<T>(slots: T[], perPage = PROXY_PER_PAGE): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < slots.length; i += perPage) pages.push(slots.slice(i, i + perPage));
  return pages;
}
