/**
 * What an owned stack is worth, and whether we could work it out at all.
 *
 * Two rules that have to agree with each other, in one module that imports
 * nothing.
 *
 * ## Why they live together
 *
 * They are a pair. `ownedValueUSD` answers "how much", and its answer of 0 is
 * ambiguous between a card worth nothing and a card we hold no price for. No
 * card in `cards` is stored at $0.00, so a stack that values to nothing is
 * always a stack we could not price, and `canPriceOwnedCopies` is how a caller
 * asks which it is. Every screen that shows a total is expected to show that
 * count beside it.
 *
 * When the two rules disagreed, the interface lied. `canPriceOwnedCopies` asks
 * about the COPIES someone holds; the dashboard used to ask the wider question,
 * "does this printing carry any USD price at all". Kraum, Ludevic's Opus in C16
 * has usd_foil 7.32 and no usd, the owner holds one non-foil copy, so the
 * printing is priced and the stack is not. The dashboard counted it as priced,
 * contributed $0 for it, told the reader "3 cards have no price yet" when four
 * were missing from the total, and listed Kraum under "Your best cards" at
 * $0.00. `/collection` asked the narrow question and reported four. One
 * collection, two screens, two numbers.
 *
 * ## Why it imports nothing
 *
 * The test runner is `node --test --experimental-strip-types` over plain `.ts`
 * and does not resolve the `@/` alias, so a rule worth a test has to sit in a
 * module with no imports. `src/lib/homepage/precision.ts` was split out for the
 * same reason. `value.ts` re-exports both of these, so no caller changes.
 */

/**
 * THE valuation rule for an owned stack, and the only one allowed to ship.
 *
 * Non-foil copies are priced at `cards.prices->>'usd'`, foil copies at
 * `usd_foil` falling back to `usd`. It takes the raw `prices` jsonb rather than
 * a typed `Card` so every caller can use it: the dashboard selects
 * `user_collections(quantity, foil, cards(prices))`, the collection page holds
 * whole `Card` objects, the admin user detail holds neither.
 *
 * It exists because the same 51 rows were reported as $345.90 on /collection and
 * $237.01 on the dashboard. The dashboard was summing the denormalised
 * `user_collections.price_usd` snapshot, which is null on most rows and stale on
 * the rest; `Collection.tsx` states outright that that column "is never read for
 * display". The front page therefore understated the owner's collection by
 * $108.89, 31.5%. One accessor, one rule, no second opinion.
 */
export function ownedValueUSD(prices: unknown, quantity: number, foil: number): number {
  const parsed = (typeof prices === 'string' ? safeParse(prices) : prices) as
    | { usd?: string | null; usd_foil?: string | null }
    | null
    | undefined;
  const nonFoil = toNumber(parsed?.usd);
  const foilPrice = toNumber(parsed?.usd_foil) || nonFoil;
  return toCount(quantity) * nonFoil + toCount(foil) * foilPrice;
}

/**
 * Whether the copies somebody actually owns can be priced.
 *
 * The question is about the copies, not the printing. See the module note above
 * for the bug that distinction was hiding.
 *
 * Foil copies take `usd_foil` and fall back to `usd`, matching
 * {@link ownedValueUSD} exactly, slot for slot.
 *
 * `usd_etched` is deliberately NOT read here, and that is the interesting part.
 * The version this replaced consulted it, and the agreement test in
 * `priceable.test.ts` failed at once: `ownedValueUSD` has never priced an
 * etched slot, so an etched-only printing held as a foil came back "priceable"
 * and valued at $0.00 — the very bug this function exists to close, reopened
 * one slot along. Either both rules read etched or neither does. Neither, for
 * now, because changing what a collection is worth is a bigger decision than
 * changing what it admits it does not know.
 */
export function canPriceOwnedCopies(prices: unknown, quantity: number, foil: number): boolean {
  const parsed = (typeof prices === 'string' ? safeParse(prices) : prices) as
    | Record<string, unknown>
    | null
    | undefined;
  if (!parsed || typeof parsed !== 'object') return false;

  const read = (key: string): number | null => {
    const raw = parsed[key];
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const plain = read('usd');
  const foilPrice = read('usd_foil') ?? plain;

  if (toCount(quantity) > 0 && plain !== null) return true;
  if (toCount(foil) > 0 && foilPrice !== null) return true;
  return false;
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toNumber(value: unknown): number {
  const parsed = parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
