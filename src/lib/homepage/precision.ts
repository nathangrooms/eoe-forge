/**
 * How a count taken last night is allowed to be printed today.
 *
 * The homepage's figures come from `src/data/homepage-snapshot.json`, which is
 * regenerated once a night after the card sync. Every one of them was exact at
 * the moment it was taken and none of them is exact now.
 *
 * Kept apart from `snapshot.ts` so it can be tested: `snapshot.ts` imports the
 * data file through the `@/` alias, which the test runner does not resolve.
 * This module imports nothing.
 */

/**
 * A count at the precision it has earned.
 *
 * Rounded DOWN, to three significant figures.
 *
 * Down, not to nearest, and that is the whole argument. Every count on the
 * homepage comes from a table the nightly sync only ever adds to, so a figure
 * rounded down cannot become an overstatement however stale the file gets. It
 * can only drift into being an understatement, which is the direction a claim
 * about your own product is allowed to be wrong in. Rounding to nearest would
 * put the number above the truth half the time.
 *
 * The alternative on the table was the exact figure plus the date it was taken:
 * "33,037 cards, counted 19 August". Accurate, but it hangs a timestamp off a
 * marketing line and still leaves a reader unable to tell how wrong it now is.
 * Three significant figures says how much precision is real without anybody
 * having to read a date.
 *
 * Below a thousand the number is left alone. A set's card count is a fixed fact
 * about a printed product, and rounding 321 down to 300 would be less true, not
 * more.
 */
export function approx(n: number): number {
  if (!Number.isFinite(n) || n < 1000) return n;
  const magnitude = 10 ** (Math.floor(Math.log10(n)) - 2);
  return Math.floor(n / magnitude) * magnitude;
}

/**
 * `approx`, written the way it appears on screen: "33,000+".
 *
 * Null for anything that is not a real positive count, so a caller can never
 * accidentally print a zero. That distinction is not academic: this page once
 * told visitors there were ZERO cards you can search, because a count that had
 * timed out came back null and was read as `?? 0`.
 */
export function approxLabel(n: number | null | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  const rounded = approx(n);
  return rounded < 1000 ? rounded.toLocaleString() : `${rounded.toLocaleString()}+`;
}
