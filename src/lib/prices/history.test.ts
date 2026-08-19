import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { carryForward, seriesFor, summarise, daysBetween } from './history.ts';
import { toCents, fromCents, stagedPriceFrom, isTrackedPrinting } from './scryfall.ts';

/* ==========================================================================
 * THE CARRY-FORWARD TRAP
 *
 * Prices are stored only when they move. A day with no row means the price did
 * not change. If a chart reads that gap as a value, the chart is lying about
 * what a card was worth, and that is the one thing this product cannot do.
 *
 * These are the tests that hold the line.
 * ========================================================================== */

const obs = (d: string, usd: number | null, extra: Record<string, unknown> = {}) => ({
  d,
  usd,
  ...extra,
});

test('a gap is carried forward, never read as zero', () => {
  // Observed on the 1st at $10, nothing until the 5th at $12. The 2nd, 3rd and
  // 4th were $10. They were not $0 and they were not $11.
  const pts = carryForward([obs('2026-08-01', 1000), obs('2026-08-05', 1200)]);

  assert.equal(pts.length, 5);
  assert.deepEqual(
    pts.map((p) => p.usd),
    [1000, 1000, 1000, 1000, 1200],
  );
  // Nothing anywhere near zero, and nothing interpolated between 1000 and 1200.
  assert.ok(pts.every((p) => p.usd === 1000 || p.usd === 1200));
});

test('every point says whether it was read or carried', () => {
  const pts = carryForward([obs('2026-08-01', 1000), obs('2026-08-05', 1200)]);

  assert.deepEqual(
    pts.map((p) => p.observed),
    [true, false, false, false, true],
  );
  assert.deepEqual(
    pts.map((p) => p.observedOn),
    ['2026-08-01', '2026-08-01', '2026-08-01', '2026-08-01', '2026-08-05'],
  );
  assert.deepEqual(
    pts.map((p) => p.carriedDays),
    [0, 1, 2, 3, 0],
  );
});

test('a card with no observations gets an empty series, not a flat line at zero', () => {
  assert.deepEqual(carryForward([]), []);
  assert.deepEqual(carryForward([], { from: '2026-01-01', to: '2026-08-01' }), []);

  const s = summarise(carryForward([]));
  assert.equal(s.startsOn, null);
  assert.equal(s.observedDays, 0);
});

test('the series never begins before the first real observation', () => {
  // Asking for a year of history on a card first seen last week must not
  // back-fill the rest of the year.
  const pts = carryForward([obs('2026-08-10', 500)], {
    from: '2026-01-01',
    to: '2026-08-12',
  });

  assert.equal(pts[0].d, '2026-08-10');
  assert.equal(pts.length, 3);
});

test('a window opening mid-gap starts from the last real reading', () => {
  // Read on the 1st, not read again. A chart of the 10th to the 12th still
  // shows the $10 that was last measured, marked as carried, rather than
  // showing nothing.
  const pts = carryForward([obs('2026-08-01', 1000)], {
    from: '2026-08-10',
    to: '2026-08-12',
  });

  assert.equal(pts.length, 3);
  assert.equal(pts[0].usd, 1000);
  assert.equal(pts[0].observed, false);
  assert.equal(pts[0].observedOn, '2026-08-01');
  assert.equal(pts[0].carriedDays, 9);
});

test('carrying stops at the cutoff rather than drawing a line we cannot support', () => {
  // The sweep writes a heartbeat row every 30 days even when nothing moved, so
  // a 60 day gap means we stopped looking. The line ends; it does not run flat
  // across two months of silence.
  const pts = carryForward([obs('2026-06-01', 1000)], {
    to: '2026-08-01',
    maxCarryDays: 30,
  });

  assert.equal(pts.length, 31);
  assert.equal(pts[pts.length - 1].d, '2026-07-01');
  assert.equal(pts[pts.length - 1].carriedDays, 30);
});

test('a price that disappears becomes a break in the line, not a zero', () => {
  // Scryfall stops publishing a USD price for a printing. That is not $0.
  const pts = carryForward([obs('2026-08-01', 1000), obs('2026-08-03', null)]);
  const usd = seriesFor(pts, 'usd');

  assert.deepEqual(
    usd.map((p) => p.value),
    [10, 10, null],
  );
});

test('a series does not start before the field itself has a value', () => {
  // The card had a EUR price for two days before it ever had a USD one. The USD
  // line starts on the third day.
  const pts = carryForward([
    obs('2026-08-01', null, { eur: 800 }),
    obs('2026-08-03', 1000, { eur: 850 }),
  ]);

  assert.deepEqual(
    seriesFor(pts, 'usd').map((p) => p.d),
    ['2026-08-03'],
  );
  assert.equal(seriesFor(pts, 'eur').length, 3);
});

test('the summary reports what the record actually holds', () => {
  const s = summarise(
    carryForward([obs('2026-08-01', 1000, { tix: 30 }), obs('2026-08-05', 1200, { tix: 30 })]),
  );

  assert.equal(s.startsOn, '2026-08-01');
  assert.equal(s.lastReadOn, '2026-08-05');
  assert.equal(s.observedDays, 2);
  assert.equal(s.carriedDays, 3);
  assert.deepEqual(s.fields, ['usd', 'tix']);
});

test('rows out of order and repeated dates do not corrupt the series', () => {
  const pts = carryForward([
    obs('2026-08-05', 1200),
    obs('2026-08-01', 999),
    obs('2026-08-01', 1000), // later row for the same date wins
  ]);

  assert.equal(pts.length, 5);
  assert.equal(pts[0].usd, 1000);
});

test('days are counted across a month boundary', () => {
  assert.equal(daysBetween('2026-07-30', '2026-08-02'), 3);
  assert.equal(daysBetween('2026-02-27', '2026-03-01'), 2); // 2026 is not a leap year
});

/* ==========================================================================
 * Quantisation. Storage is hundredths as int4, so these must round the way the
 * database does, or the change gate fires on a rounding difference.
 * ========================================================================== */

test('prices convert to hundredths the way the database stores them', () => {
  assert.equal(toCents('0.02'), 2);
  assert.equal(toCents('12.99'), 1299);
  assert.equal(toCents('1234.567'), 123457);
  assert.equal(toCents(19.99), 1999);
  assert.equal(fromCents(1299), 12.99);
});

test('a missing price is null, never zero', () => {
  for (const v of [null, undefined, '', 'n/a', NaN, -1]) {
    assert.equal(toCents(v), null, `${String(v)} should be null`);
  }
  assert.equal(fromCents(null), null);
  assert.equal(toCents('0'), 0, 'a genuine zero price is still zero');
});

/* ==========================================================================
 * What gets swept.
 * ========================================================================== */

test('digital only printings are not tracked', () => {
  assert.equal(isTrackedPrinting({ digital: true, games: ['arena'] }), false);
  assert.equal(isTrackedPrinting({ digital: false, games: ['mtgo'] }), false);
  assert.equal(isTrackedPrinting({ digital: false, games: ['paper', 'mtgo'] }), true);
});

test('every price key is captured, including the two the old job dropped', () => {
  const row = stagedPriceFrom({
    id: 'abc',
    games: ['paper'],
    prices: { usd: '1.00', usd_foil: null, usd_etched: '0.73', eur: '0.90', eur_foil: null, tix: '0.02' },
  });

  assert.deepEqual(row, {
    card_id: 'abc',
    usd: 100,
    usd_foil: null,
    usd_etched: 73,
    eur: 90,
    eur_foil: null,
    tix: 2,
  });
});

test('a printing with no price at all is not staged', () => {
  assert.equal(
    stagedPriceFrom({ id: 'abc', games: ['paper'], prices: { usd: null, eur: null } }),
    null,
  );
});

/* ==========================================================================
 * The Deno copy of the extractor must not drift from this one.
 * ========================================================================== */

test('the edge function copy of scryfall.ts is identical to the source', () => {
  const a = readFileSync(new URL('./scryfall.ts', import.meta.url), 'utf8');
  const b = readFileSync(
    new URL('../../../supabase/functions/price-bulk-sync/scryfall.ts', import.meta.url),
    'utf8',
  );
  assert.equal(
    b.replace(/\r\n/g, '\n'),
    a.replace(/\r\n/g, '\n'),
    'supabase/functions/price-bulk-sync/scryfall.ts has drifted from src/lib/prices/scryfall.ts',
  );
});
