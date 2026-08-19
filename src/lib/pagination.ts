/**
 * The arithmetic a pager needs, with no React in it.
 *
 * It lives apart from `components/ui/pagination.tsx` for one reason: the rule
 * this file exists to enforce is worth a test, and the test runner here is
 * `node --test` over plain `.ts`, which cannot load a `.tsx` component.
 *
 * ## The rule
 *
 * **A page count is only ever computed from a total the database actually
 * returned.** `pageCountFor(null, size)` is `null`, and every caller must be
 * able to render that: "Page 3" with a next arrow, not "Page 3 of 40".
 *
 * This is not fussiness. Counting rows that match a filter over a 96,000-row
 * table is a sequential scan, and `count=exact` through PostgREST has already
 * returned 500 on this database once. Any surface that cannot afford the count
 * must be able to page without one, and the interface must not paper over the
 * gap with a plausible-looking number. A guessed page count is worse than no
 * page count: the reader clicks "last" and lands somewhere that does not exist.
 */

/**
 * Cards are big, and the standing complaint is that they render too small.
 * Twenty four fills four rows of six at the width the grids use, which is a
 * screenful and a bit rather than a wall.
 */
export const DEFAULT_PAGE_SIZE = 24;

/** Every option divides by 2, 3, 4 and 6, so no page ends in a ragged row. */
export const PAGE_SIZE_OPTIONS = [24, 48, 96] as const;

/** Pages are 1-based everywhere: in the URL, in the props, and on screen. */
export const FIRST_PAGE = 1;

/**
 * Total pages, or `null` when the total is not known.
 *
 * Never invent a number here. A caller that has no total gets `null` and must
 * show a next arrow instead of a page count.
 */
export function pageCountFor(
  total: number | null | undefined,
  pageSize: number
): number | null {
  if (total == null || !Number.isFinite(total) || total < 0) return null;
  if (!Number.isFinite(pageSize) || pageSize <= 0) return null;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Force a page into range. With no known page count, only the floor applies. */
export function clampPage(page: number, pageCount: number | null): number {
  const n = Number.isFinite(page) ? Math.floor(page) : FIRST_PAGE;
  if (n < FIRST_PAGE) return FIRST_PAGE;
  if (pageCount != null && n > pageCount) return pageCount;
  return n;
}

/** Parse `?page=` without ever throwing. Junk reads as page 1. */
export function parsePageParam(raw: string | null | undefined): number {
  if (!raw) return FIRST_PAGE;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= FIRST_PAGE ? n : FIRST_PAGE;
}

/** Zero-based index of the first row on a page. What `.range()` wants. */
export function offsetFor(page: number, pageSize: number): number {
  return (clampPage(page, null) - FIRST_PAGE) * pageSize;
}

/**
 * The inclusive zero-based row window for a page.
 *
 * Hand this straight to PostgREST: `.range(from, to)`. Both ends are inclusive,
 * which is what `.range()` means and what an off-by-one here would quietly get
 * wrong.
 */
export function rangeFor(page: number, pageSize: number): { from: number; to: number } {
  const from = offsetFor(page, pageSize);
  return { from, to: from + pageSize - 1 };
}

/**
 * What to print as "showing 25 to 48".
 *
 * `to` is the last row actually on screen, which on the final page is fewer
 * than a full page. `shown` is how many rows arrived, so the caller does not
 * have to know whether the page was short.
 */
export function rangeLabel(
  page: number,
  pageSize: number,
  shown: number
): { from: number; to: number } | null {
  if (shown <= 0) return null;
  const from = offsetFor(page, pageSize) + 1;
  return { from, to: from + shown - 1 };
}

export type PageToken = number | 'gap';

/**
 * The page numbers to draw, with gaps where numbers are skipped.
 *
 * Always shows the first page, the last page, and `span` pages either side of
 * the current one. A gap that would hide exactly one number is replaced by that
 * number: an ellipsis is the same width as a digit, so "1 … 3 4 5" hides page 2
 * behind a control that costs the same as showing it.
 */
export function pageWindow(page: number, pageCount: number, span = 1): PageToken[] {
  if (!Number.isFinite(pageCount) || pageCount < 1) return [];
  const current = clampPage(page, pageCount);

  const keep = new Set<number>([FIRST_PAGE, pageCount]);
  for (let p = current - span; p <= current + span; p++) {
    if (p >= FIRST_PAGE && p <= pageCount) keep.add(p);
  }

  const sorted = [...keep].sort((a, b) => a - b);
  const out: PageToken[] = [];
  let previous = 0;
  for (const p of sorted) {
    const missing = p - previous - 1;
    if (previous !== 0 && missing > 0) {
      if (missing === 1) out.push(previous + 1);
      else out.push('gap');
    }
    out.push(p);
    previous = p;
  }
  return out;
}
