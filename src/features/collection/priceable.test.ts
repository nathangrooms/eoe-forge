import test from 'node:test';
import assert from 'node:assert/strict';

import { canPriceOwnedCopies, ownedValueUSD } from './priceable.ts';

/*
 * The rule these tests really hold is the LAST one: the valuation and the
 * "could we price it" check must agree, because everywhere they disagreed the
 * interface printed a total that quietly dropped cards and a count that said
 * fewer were dropped than really were.
 */

const KRAUM = { usd: null, usd_foil: '7.32', usd_etched: null, eur: null, tix: null };
const NISSA = { usd: null, usd_foil: '1.42' };
const ARENA_ONLY = { usd: null, usd_foil: null, usd_etched: null, eur: null, tix: null };
const SOL_RING = { usd: '1.29', usd_foil: '4.50' };

test('a non-foil copy of a printing with only a foil price cannot be priced', () => {
  // Live on 2026-08-19: Kraum, Ludevic's Opus (C16), one non-foil copy owned.
  assert.equal(canPriceOwnedCopies(KRAUM, 1, 0), false);
  assert.equal(canPriceOwnedCopies(NISSA, 2, 0), false);
});

test('the same printing CAN be priced once the copy owned is a foil', () => {
  assert.equal(canPriceOwnedCopies(KRAUM, 0, 1), true);
});

test('a printing with no price in any slot cannot be priced either way', () => {
  assert.equal(canPriceOwnedCopies(ARENA_ONLY, 3, 0), false);
  assert.equal(canPriceOwnedCopies(ARENA_ONLY, 0, 3), false);
});

test('an ordinary priced printing can be priced', () => {
  assert.equal(canPriceOwnedCopies(SOL_RING, 1, 0), true);
  assert.equal(canPriceOwnedCopies(SOL_RING, 0, 1), true);
  assert.equal(canPriceOwnedCopies(SOL_RING, 2, 3), true);
});

test('foil copies fall back to the non-foil price, and the check agrees', () => {
  const foilless = { usd: '3.00', usd_foil: null };
  assert.equal(canPriceOwnedCopies(foilless, 0, 2), true);
  assert.equal(ownedValueUSD(foilless, 0, 2), 6);
});

test('holding no copies at all is not priceable', () => {
  assert.equal(canPriceOwnedCopies(SOL_RING, 0, 0), false);
});

test('a genuine zero is a price, not an absence', () => {
  assert.equal(canPriceOwnedCopies({ usd: '0.00' }, 1, 0), true);
});

test('missing, blank and unparseable prices are all absences', () => {
  assert.equal(canPriceOwnedCopies(null, 1, 0), false);
  assert.equal(canPriceOwnedCopies(undefined, 1, 0), false);
  assert.equal(canPriceOwnedCopies({}, 1, 0), false);
  assert.equal(canPriceOwnedCopies({ usd: '' }, 1, 0), false);
  assert.equal(canPriceOwnedCopies({ usd: 'n/a' }, 1, 0), false);
});

test('prices stored as a JSON string are read the same way', () => {
  assert.equal(canPriceOwnedCopies(JSON.stringify(KRAUM), 1, 0), false);
  assert.equal(canPriceOwnedCopies(JSON.stringify(SOL_RING), 1, 0), true);
  assert.equal(canPriceOwnedCopies('{ not json', 1, 0), false);
});

test('an etched-only price does not make a stack priceable', () => {
  /*
   * Because `ownedValueUSD` does not read the etched slot. The rule that does
   * read it reports "priced" and then values the stack at $0.00, which is the
   * exact defect this pair exists to prevent. The agreement test below is what
   * caught this the first time it was written the other way.
   */
  const etched = { usd: null, usd_foil: null, usd_etched: '12.00' };
  assert.equal(canPriceOwnedCopies(etched, 0, 1), false);
  assert.equal(canPriceOwnedCopies(etched, 1, 0), false);
  assert.equal(ownedValueUSD(etched, 0, 1), 0);
});

/*
 * The agreement itself. A stack that values to nothing must be a stack we could
 * not price, and a stack we could price must value to something. Break either
 * direction and a screen shows $0.00 for a card it has no price for, or leaves
 * a card out of a total without counting it.
 */
test('a stack values to nothing exactly when it cannot be priced', () => {
  const stacks: { prices: unknown; quantity: number; foil: number }[] = [
    { prices: KRAUM, quantity: 1, foil: 0 },
    { prices: KRAUM, quantity: 0, foil: 1 },
    { prices: KRAUM, quantity: 1, foil: 1 },
    { prices: NISSA, quantity: 2, foil: 0 },
    { prices: ARENA_ONLY, quantity: 4, foil: 0 },
    { prices: SOL_RING, quantity: 1, foil: 0 },
    { prices: SOL_RING, quantity: 0, foil: 2 },
    { prices: { usd: '3.00', usd_foil: null }, quantity: 0, foil: 2 },
    { prices: { usd: null, usd_foil: null, usd_etched: '12.00' }, quantity: 0, foil: 1 },
    { prices: { usd: null, usd_foil: null, usd_etched: '12.00' }, quantity: 1, foil: 0 },
  ];

  for (const { prices, quantity, foil } of stacks) {
    const value = ownedValueUSD(prices, quantity, foil);
    const priceable = canPriceOwnedCopies(prices, quantity, foil);
    assert.equal(
      value > 0,
      priceable,
      `valuation and priceability disagree for ${JSON.stringify(prices)} x${quantity}/${foil}: value ${value}, priceable ${priceable}`
    );
  }
});
