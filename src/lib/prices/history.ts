/**
 * Reading price history, and the one trap in it.
 *
 * Prices are stored only on the days they moved. That is what makes tracking
 * every printing every day affordable: measured on real data, only 14.92% of
 * card-days carry a change worth recording, so the table is a seventh of the
 * size for identical coverage.
 *
 * It also creates exactly one way to lie. A day with no row means the price DID
 * NOT MOVE. It does not mean the card was worthless. A chart drawn straight
 * from the stored rows shows a hole, and a reader sees a crash that never
 * happened. Interpolating across the hole would be worse still, because then we
 * would be drawing numbers nobody ever measured.
 *
 * So the rule, and it is not negotiable:
 *
 *   1. Gaps are filled by CARRYING THE LAST OBSERVED VALUE FORWARD. Never by
 *      averaging, never by interpolating, never by zero.
 *   2. Every point says which it is. `observed: true` means we read that price
 *      on that date. `observed: false` means the price had not changed since the
 *      date in `observedOn`.
 *   3. Before the first observation there is nothing. A card we have never
 *      priced gets no line and the interface says when the record starts.
 *
 * history.test.ts is the guard on all three.
 */

import { PRICE_KEYS, type PriceKey } from './scryfall.ts';

/** A row as stored: one card, one date, prices in hundredths. */
export interface PriceObservation {
  /** ISO date, `YYYY-MM-DD`. */
  d: string;
  usd?: number | null;
  usd_foil?: number | null;
  usd_etched?: number | null;
  eur?: number | null;
  eur_foil?: number | null;
  tix?: number | null;
  /** Where the observation came from. See PRICE_SOURCES. */
  src?: number | null;
}

/** A point on a chart: dense, daily, and honest about which it is. */
export interface PricePoint extends PriceObservation {
  /** True when this exact date was read. False when the value is carried. */
  observed: boolean;
  /** The date the value in this point was actually read on. */
  observedOn: string;
  /** Whole days since that reading. 0 on an observed point. */
  carriedDays: number;
}

/** Where a stored point came from. Matches card_price_point.src in the database. */
export const PRICE_SOURCES: Record<number, string> = {
  1: 'Scryfall daily file',
  2: 'Scryfall, through our card table',
  3: 'our earlier per card capture',
  10: 'MTGJSON, Cardmarket series',
  11: 'MTGJSON, TCGplayer series',
};

const DAY_MS = 86_400_000;

function toUTC(iso: string): number {
  return Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  );
}

function toISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b`, both ISO dates. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

export interface CarryForwardOptions {
  /** Last day of the series. Defaults to the last observation. */
  to?: string;
  /** First day of the series. Clamped so it never precedes the first observation. */
  from?: string;
  /**
   * Stop carrying a value after this many days and end the line instead.
   * The sweep writes a heartbeat row every 30 days even when nothing moved, so
   * a gap longer than that means we stopped looking rather than the price
   * standing still. Drawing a flat line through it would be a claim we cannot
   * support. 0 disables the cutoff.
   */
  maxCarryDays?: number;
}

/**
 * Turn stored observations into a dense daily series.
 *
 * Input may be in any order and may contain duplicate dates; the last row for a
 * date wins. Output is one point per day, ascending, from the first observation
 * (or `from`, whichever is later) to `to`.
 *
 * Returns an empty array when there are no observations. That is the correct
 * answer for a card we have never priced, and the caller must render it as
 * "no record yet" rather than as a flat line at zero.
 */
export function carryForward(
  rows: readonly PriceObservation[],
  options: CarryForwardOptions = {},
): PricePoint[] {
  if (rows.length === 0) return [];

  const byDate = new Map<string, PriceObservation>();
  for (const r of rows) {
    if (r && typeof r.d === 'string' && r.d.length >= 10) byDate.set(r.d.slice(0, 10), r);
  }
  if (byDate.size === 0) return [];

  const dates = [...byDate.keys()].sort();
  const firstObs = dates[0];
  const lastObs = dates[dates.length - 1];

  const from = options.from && options.from > firstObs ? options.from : firstObs;
  const to = options.to ?? lastObs;
  if (to < from) return [];

  const maxCarry = options.maxCarryDays ?? 0;

  // The last observation at or before `from`, so a window opening on a quiet
  // stretch starts from a real number instead of empty.
  let held: PriceObservation | undefined;
  let heldOn = '';
  for (const dt of dates) {
    if (dt > from) break;
    held = byDate.get(dt);
    heldOn = dt;
  }

  const out: PricePoint[] = [];
  const end = toUTC(to);
  for (let t = toUTC(from); t <= end; t += DAY_MS) {
    const day = toISO(t);
    const obs = byDate.get(day);
    if (obs) {
      held = obs;
      heldOn = day;
    }
    if (!held) continue;

    const carriedDays = daysBetween(heldOn, day);
    if (maxCarry > 0 && carriedDays > maxCarry) continue;

    out.push({
      ...held,
      d: day,
      observed: carriedDays === 0,
      observedOn: heldOn,
      carriedDays,
    });
  }
  return out;
}

/** One price field pulled off a dense series, ready for a chart. */
export interface SeriesPoint {
  d: string;
  /** Currency units, not hundredths. Null where the card had no price that day. */
  value: number | null;
  observed: boolean;
  observedOn: string;
  carriedDays: number;
}

/**
 * Pick one price field out of a dense series and convert to currency units.
 *
 * Leading days where the field is null are dropped, because a card that had no
 * USD price until March should not draw a line before March. Nulls in the
 * middle are kept as nulls so the chart breaks the line there rather than
 * bridging a period when the price genuinely did not exist.
 */
export function seriesFor(points: readonly PricePoint[], key: PriceKey): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  let started = false;
  for (const p of points) {
    const cents = p[key];
    const value = cents === null || cents === undefined ? null : cents / 100;
    if (!started) {
      if (value === null) continue;
      started = true;
    }
    out.push({ d: p.d, value, observed: p.observed, observedOn: p.observedOn, carriedDays: p.carriedDays });
  }
  return out;
}

/** What the record actually contains, so the interface can say it plainly. */
export interface RecordSummary {
  /** First day we have any price for. Null when we have none. */
  startsOn: string | null;
  /** Most recent day we read a price on. */
  lastReadOn: string | null;
  /** Days on the chart that were read, not carried. */
  observedDays: number;
  /** Days on the chart whose value was carried forward from an earlier reading. */
  carriedDays: number;
  /** Which price fields the card has ever had a value for. */
  fields: PriceKey[];
}

export function summarise(points: readonly PricePoint[]): RecordSummary {
  if (points.length === 0) {
    return { startsOn: null, lastReadOn: null, observedDays: 0, carriedDays: 0, fields: [] };
  }
  let observed = 0;
  let lastReadOn = points[0].observedOn;
  const fields = new Set<PriceKey>();
  for (const p of points) {
    if (p.observed) observed++;
    if (p.observedOn > lastReadOn) lastReadOn = p.observedOn;
    for (const k of PRICE_KEYS) {
      const v = p[k];
      if (v !== null && v !== undefined) fields.add(k);
    }
  }
  return {
    startsOn: points[0].d,
    lastReadOn,
    observedDays: observed,
    carriedDays: points.length - observed,
    fields: PRICE_KEYS.filter((k) => fields.has(k)),
  };
}
