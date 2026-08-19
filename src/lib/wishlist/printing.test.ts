import test from 'node:test';
import assert from 'node:assert/strict';
import { betterPrinting, pickPrintingsByName, printingRank } from './printing.ts';

const art = { normal: 'https://example.invalid/x.jpg' };

test('the cheapest priced printing wins', () => {
  const cheap = { name: 'Sol Ring', prices: { usd: '1.18' }, image_uris: art };
  const dear = { name: 'Sol Ring', prices: { usd: '1.60' }, image_uris: art };
  assert.equal(betterPrinting(dear, cheap), cheap);
  assert.equal(betterPrinting(cheap, dear), cheap);
});

test('a priced printing always beats an unpriced one', () => {
  const priced = { name: 'Sol Ring', prices: { usd: '1.60' }, image_uris: art };
  const unpriced = { name: 'Sol Ring', prices: {}, image_uris: art };
  assert.ok(printingRank(priced) < printingRank(unpriced));
});

test('art breaks a tie between two unpriced printings', () => {
  const withArt = { name: 'X', prices: {}, image_uris: art };
  const without = { name: 'X', prices: {} };
  assert.ok(printingRank(withArt) < printingRank(without));
});

test('a priced printing with no art loses to a priced printing with art', () => {
  const blind = { name: 'X', prices: { usd: '0.10' } };
  const shown = { name: 'X', prices: { usd: '5.00' }, image_uris: art };
  assert.ok(printingRank(shown) < printingRank(blind));
});

test('a genuine zero is a price, not an absence', () => {
  const free = { name: 'X', prices: { usd: '0' }, image_uris: art };
  const unpriced = { name: 'X', prices: {}, image_uris: art };
  assert.ok(printingRank(free) < printingRank(unpriced));
});

test('one printing per name, whatever order the rows arrive in', () => {
  const rows = [
    { name: 'Sol Ring', prices: { usd: '1.60' }, image_uris: art },
    { name: 'Sol Ring', prices: { usd: '1.18' }, image_uris: art },
    { name: 'Black Lotus', prices: { usd: '7312.50' }, image_uris: art },
  ];
  const forward = pickPrintingsByName(rows);
  const backward = pickPrintingsByName([...rows].reverse());
  assert.equal(forward.get('sol ring')!.prices.usd, '1.18');
  assert.equal(backward.get('sol ring')!.prices.usd, '1.18');
  assert.equal(forward.size, 2);
});

test('rows with no name are skipped rather than keyed on undefined', () => {
  const picked = pickPrintingsByName([{ name: null, prices: { usd: '1' } } as any]);
  assert.equal(picked.size, 0);
});
