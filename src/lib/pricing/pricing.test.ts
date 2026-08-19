/**
 * The regressions this file exists to catch.
 *
 *   node --test --experimental-strip-types src/lib/pricing/pricing.test.ts
 *
 * Every fixture below is a real row copied out of the production `cards` table
 * on 19 Aug 2026, not an invented shape. Sol Ring `msc` has a null `usd_foil`
 * because that printing has no foil; Black Lotus `vma` is Magic Online only and
 * has a ticket price and no money price at all; the seeded `black-lotus` row
 * has a prices blob missing the `eur` and `tix` KEYS rather than holding nulls,
 * which is a third shape the parser has to survive.
 *
 * The one rule none of these may ever break: a price we do not have must never
 * come out as 0. The minimum real price stored anywhere in that table is 0.01,
 * so a zero on screen is always fabricated.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { readPrices, primaryPrice, readAmount } from './sources.ts';
import { formatAmount, formatSource, convertedEstimate, NO_PRICE, NOT_PRINTED } from './format.ts';
import { totalPrices, describeGaps } from './totals.ts';
import { buyLinks } from './links.ts';

/* ---------------------------------------------------------------- fixtures */

/** Real row: three prices, no foil of any kind. */
const SOL_RING_MSC = {
  id: '91fdb56b-54d5-4272-8319-505ff987fe9b',
  name: 'Sol Ring',
  set_code: 'msc',
  set_name: 'Marvel Super Heroes Commander',
  prices: { eur: '1.54', tix: '0.04', usd: '1.60', eur_foil: null, usd_foil: null, usd_etched: null },
};

/** Real row: every paper and digital slot populated except etched. */
const BOLT_MSC = {
  name: 'Lightning Bolt',
  set_code: 'msc',
  prices: { eur: '1.65', tix: '0.02', usd: '0.77', eur_foil: '1.63', usd_foil: '2.79', usd_etched: null },
};

/** Real row: Magic Online only. No dollar price, no euro price, a ticket price. */
const LOTUS_VMA = {
  name: 'Black Lotus',
  set_code: 'vma',
  prices: { eur: null, tix: '32.46', usd: null, eur_foil: null, usd_foil: null, usd_etched: null },
};

/** Real seeded row: the blob is missing keys rather than holding nulls. */
const LOTUS_SEED = {
  name: 'Black Lotus',
  set_code: 'LEA',
  prices: { usd: '50000.00', usd_foil: '75000.00' },
};

/* ------------------------------------------------------------------- tests */

describe('a missing price is never zero', () => {
  it('reads a null slot as null, not 0', () => {
    assert.equal(readAmount(null), null);
    assert.equal(readAmount(undefined), null);
    assert.equal(readAmount(''), null);
    assert.equal(readAmount('not a number'), null);
  });

  it('refuses a stored zero, because the real minimum in the table is 0.01', () => {
    assert.equal(readAmount('0'), null);
    assert.equal(readAmount('0.00'), null);
    assert.equal(readAmount(0), null);
    assert.equal(readAmount('0.01'), 0.01);
  });

  it('never formats a null into a currency string', () => {
    assert.equal(formatAmount(null, 'USD'), null);
    assert.equal(formatAmount(undefined, 'EUR'), null);
  });

  it('renders Sol Ring foil as words, not $0.00', () => {
    const reading = readPrices(SOL_RING_MSC);
    const foil = reading.all.find(s => s.key === 'usd_foil');
    assert.ok(foil);
    assert.equal(foil.amount, null);
    const text = formatSource(foil);
    assert.equal(text, NO_PRICE);
    assert.ok(!text.includes('0.00'), 'a missing foil price must not render as a number');
  });

  it('renders no zero anywhere in a card whose prices are all missing', () => {
    const reading = readPrices({ prices: {} });
    assert.equal(reading.empty, true);
    for (const source of reading.all) {
      assert.equal(source.amount, null);
      assert.ok(!/\d/.test(formatSource(source)), `${source.key} rendered a digit`);
    }
  });
});

describe('every source we hold is read', () => {
  it('finds all three markets on Sol Ring', () => {
    const reading = readPrices(SOL_RING_MSC);
    const keys = reading.known.map(s => s.key).sort();
    assert.deepEqual(keys, ['eur', 'tix', 'usd']);
  });

  it('finds five on a printing that has foils in both markets', () => {
    const reading = readPrices(BOLT_MSC);
    assert.deepEqual(reading.known.map(s => s.key).sort(), [
      'eur',
      'eur_foil',
      'tix',
      'usd',
      'usd_foil',
    ]);
  });

  it('survives a blob with missing keys rather than nulls', () => {
    const reading = readPrices(LOTUS_SEED);
    assert.deepEqual(reading.known.map(s => s.key).sort(), ['usd', 'usd_foil']);
    const eur = reading.all.find(s => s.key === 'eur');
    assert.equal(eur?.amount, null);
    assert.equal(eur?.missing, 'no-price');
  });

  it('still shows both paper markets when only one has a price', () => {
    // A card with only a TCGplayer price must still say that Cardmarket has
    // none, otherwise the screen looks like TCGplayer is the only market.
    const visible = readPrices(LOTUS_SEED).visible.map(s => s.key);
    assert.ok(visible.includes('usd'));
    assert.ok(visible.includes('eur'));
  });
});

describe('not printed is a different fact from not priced', () => {
  it('says not printed when finishes proves the foil does not exist', () => {
    const reading = readPrices({ ...SOL_RING_MSC, finishes: ['nonfoil'] });
    const foil = reading.all.find(s => s.key === 'usd_foil');
    assert.equal(foil?.missing, 'not-printed');
    assert.equal(formatSource(foil!), NOT_PRINTED);
  });

  it('says no price when finishes is absent, which it is on 82% of rows', () => {
    const foil = readPrices(SOL_RING_MSC).all.find(s => s.key === 'usd_foil');
    assert.equal(foil?.missing, 'no-price');
  });

  it('hides a foil row that is neither priced nor offered', () => {
    const visible = readPrices({ ...SOL_RING_MSC, finishes: ['nonfoil'] }).visible.map(s => s.key);
    assert.ok(!visible.includes('usd_foil'));
    assert.ok(!visible.includes('usd_etched'));
  });

  it('shows an offered foil even with no price, so the gap is visible', () => {
    const visible = readPrices({ ...SOL_RING_MSC, finishes: ['nonfoil', 'foil'] }).visible.map(
      s => s.key
    );
    assert.ok(visible.includes('usd_foil'));
  });
});

describe('currencies are never mixed', () => {
  it('only calls something cheapest within one currency', () => {
    const reading = readPrices(BOLT_MSC);
    // usd 0.77 beats usd_foil 2.79; eur 1.65 beats eur_foil 1.63? no, foil is
    // cheaper in euros, and that asymmetry is exactly why cross currency
    // "cheapest" would be nonsense.
    assert.equal(reading.cheapestIn.USD, 'usd');
    assert.equal(reading.cheapestIn.EUR, 'eur_foil');
  });

  it('names no cheapest when a currency has only one price', () => {
    const reading = readPrices(SOL_RING_MSC);
    assert.equal(reading.cheapestIn.USD, undefined);
    assert.equal(reading.cheapestIn.EUR, undefined);
    assert.equal(reading.cheapestIn.TIX, undefined);
  });

  it('never returns a euro price when asked for dollars', () => {
    const source = primaryPrice({ prices: { eur: '3.00' } }, { currency: 'USD' });
    assert.equal(source, null);
  });

  it('refuses to convert without a rate and a date', () => {
    assert.equal(convertedEstimate(1.6, 'USD', 'EUR', null), null);
    assert.equal(convertedEstimate(1.6, 'USD', 'EUR'), null);
    const withRate = convertedEstimate(1.6, 'USD', 'EUR', { value: 0.92, asOf: '2026-08-19' });
    assert.ok(withRate);
    assert.match(withRate.disclosure, /Estimate/);
    assert.match(withRate.disclosure, /2026-08-19/);
  });
});

describe('tickets are labelled as tickets', () => {
  it('never puts a currency symbol on tix', () => {
    const text = formatAmount(0.04, 'TIX');
    assert.equal(text, '0.04 tix');
    assert.ok(!text.includes('$'));
    assert.ok(!text.includes('€'));
  });

  it('reads a Magic Online only printing without inventing a paper price', () => {
    const reading = readPrices(LOTUS_VMA);
    assert.deepEqual(reading.known.map(s => s.key), ['tix']);
    assert.equal(reading.all.find(s => s.key === 'usd')?.amount, null);
  });
});

describe('totals say what they could not price', () => {
  it('counts unpriced copies instead of adding them as zero', () => {
    const total = totalPrices(
      [
        { prices: SOL_RING_MSC.prices, quantity: 2, foil: 0 },
        { prices: LOTUS_VMA.prices, quantity: 1, foil: 0 },
        { prices: BOLT_MSC.prices, quantity: 1, foil: 1 },
      ],
      'USD'
    );
    assert.equal(total.amount, 1.6 * 2 + 0.77 + 2.79);
    assert.equal(total.pricedCopies, 4);
    assert.equal(total.unpricedCopies, 1);
    assert.equal(total.unpricedLines, 1);
    assert.equal(total.complete, false);
    assert.match(describeGaps(total)!, /1 card in this total had no price/);
  });

  it('does not price a foil at the non foil number', () => {
    // Sol Ring msc has no foil price. One foil copy is unpriced, not $1.60.
    const total = totalPrices([{ prices: SOL_RING_MSC.prices, quantity: 0, foil: 1 }], 'USD');
    assert.equal(total.amount, 0);
    assert.equal(total.pricedCopies, 0);
    assert.equal(total.unpricedCopies, 1);
  });

  it('reports a complete total as complete and says nothing extra', () => {
    const total = totalPrices([{ prices: BOLT_MSC.prices, quantity: 1, foil: 1 }], 'USD');
    assert.equal(total.complete, true);
    assert.equal(describeGaps(total), null);
  });

  it('totals euros from the euro slots only', () => {
    const total = totalPrices([{ prices: BOLT_MSC.prices, quantity: 1, foil: 1 }], 'EUR');
    assert.equal(total.amount, 1.65 + 1.63);
    assert.equal(total.currency, 'EUR');
  });

  it('has no total at all when nothing could be priced', () => {
    const total = totalPrices([{ prices: LOTUS_VMA.prices, quantity: 3, foil: 0 }], 'USD');
    assert.equal(total.pricedCopies, 0);
    assert.match(describeGaps(total)!, /no prices for these 3 cards/);
  });
});

describe('buy links are honest about what they open', () => {
  it('marks a constructed search as a search, because cards has no purchase_uris', () => {
    const links = buyLinks(
      { name: SOL_RING_MSC.name, setName: SOL_RING_MSC.set_name },
      readPrices(SOL_RING_MSC)
    );
    const tcg = links.find(l => l.market === 'tcgplayer');
    assert.equal(tcg?.exact, false);
    assert.match(tcg!.note, /Searches/);
  });

  it('uses and marks an exact link when Scryfall supplies one', () => {
    const links = buyLinks(
      {
        name: SOL_RING_MSC.name,
        purchaseUris: { tcgplayer: 'https://www.tcgplayer.com/product/1234' },
      },
      readPrices(SOL_RING_MSC)
    );
    const tcg = links.find(l => l.market === 'tcgplayer');
    assert.equal(tcg?.exact, true);
    assert.equal(tcg?.url, 'https://www.tcgplayer.com/product/1234');
  });

  it('quotes each market its own price', () => {
    const links = buyLinks({ name: BOLT_MSC.name }, readPrices(BOLT_MSC));
    assert.equal(links.find(l => l.market === 'tcgplayer')?.price, '$0.77');
    assert.equal(links.find(l => l.market === 'cardmarket')?.price, '€1.65');
    assert.equal(links.find(l => l.market === 'mtgo')?.price, '0.02 tix');
  });

  it('offers no Magic Online link for a card with no ticket price', () => {
    const links = buyLinks({ name: 'Whatever' }, readPrices(LOTUS_SEED));
    assert.equal(links.find(l => l.market === 'mtgo'), undefined);
  });

  it('shows no price beside a link rather than a zero', () => {
    const links = buyLinks({ name: 'Whatever' }, readPrices(LOTUS_SEED));
    assert.equal(links.find(l => l.market === 'cardmarket')?.price, null);
  });
});
