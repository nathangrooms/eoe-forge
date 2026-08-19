/**
 * The regressions this file exists to catch.
 *
 *   node --test --experimental-strip-types src/lib/shopping/shopping.test.ts
 *
 * Three of them matter more than the rest:
 *
 *  1. Counting a card twice because two sources want it. A wishlisted card that
 *     a deck also needs is ONE card. Two decks that each need one are TWO.
 *  2. Offering to buy something already in the post, which is how a player ends
 *     up with three copies of a card they ordered once.
 *  3. An export line a shop will reject. A malformed export is the feature
 *     broken: it fails on paste, after the player has left the app.
 *
 * The card fixtures are real rows from the production `cards` table.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { cardKey, copiesNeeded } from './list.ts';
import { assembleShoppingList, waitingFor, type AssembleInput } from './assemble.ts';
import { formatExport, mergeLines } from './exportFormats.ts';
import { paidTotals, platformTotals } from './totals.ts';

/* ---------------------------------------------------------------- fixtures */

/** Real row: three prices, no foil of any kind ever made. */
const SOL_RING = {
  id: '91fdb56b-54d5-4272-8319-505ff987fe9b',
  oracle_id: '4c1f5c4f-a0a8-4a09-a7d6-9ea3b0e3a8b1',
  name: 'Sol Ring',
  set_code: 'msc',
  set_name: 'Marvel Super Heroes Commander',
  prices: { usd: '1.60', eur: '1.54', tix: '0.04', usd_foil: null, eur_foil: null, usd_etched: null },
};

/**
 * Real row, and the one that caught a bug on screen: Craterhoof Behemoth `cmm`
 * exists ONLY in etched foil. `usd`, `usd_foil` and `eur` are all null and the
 * single price is `usd_etched`. Anything that quietly falls back across
 * finishes will price a plain copy of this at $33.26, which is a price for a
 * card that was never printed.
 */
const ETCHED_ONLY = {
  id: '036f9ba6-6bd1-4be8-b584-f67308e8c60d',
  oracle_id: '8c52bd39-0586-48ca-b263-17210cf9feb6',
  name: 'Craterhoof Behemoth',
  set_code: 'cmm',
  set_name: 'Commander Masters',
  prices: { usd: null, usd_foil: null, usd_etched: '33.26', eur: null, eur_foil: null, tix: '0.81' },
  finishes: ['etched'],
};

/** Real shape: a printing we hold no price for in any shop. */
const UNPRICED = {
  id: 'unpriced-1',
  oracle_id: 'oracle-unpriced',
  name: '70,000 Light-Years From Home',
  set_code: 'unf',
  set_name: 'Unfinity',
  prices: { usd: null, eur: null, tix: null, usd_foil: null, eur_foil: null },
};

function item(overrides: Record<string, any> = {}): any {
  return {
    id: 'item-1',
    list_id: 'list-1',
    user_id: 'user-1',
    kind: 'shopping',
    card_id: SOL_RING.id,
    oracle_id: SOL_RING.oracle_id,
    card_name: 'Sol Ring',
    finish: 'nonfoil',
    quantity: 1,
    note: null,
    source: 'manual',
    source_deck_id: null,
    status: 'want',
    paid_unit: null,
    paid_currency: null,
    bought_at: null,
    arrived_at: null,
    filed_at: null,
    arrived_card_id: null,
    arrived_finish: null,
    filed_container_id: null,
    filed_deck_id: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    card: SOL_RING,
    ...overrides,
  };
}

function input(overrides: Partial<AssembleInput> = {}): AssembleInput {
  return { items: [], wishlist: [], shortfalls: [], ...overrides };
}

/* ------------------------------------------------------------ how many copies */

describe('how many copies to buy', () => {
  it('adds deck shortfalls together, because two decks need two cards', () => {
    assert.equal(copiesNeeded({ perDeck: [1, 1] }), 2);
    assert.equal(copiesNeeded({ perDeck: [2, 1, 1] }), 4);
  });

  it('does not add the wishlist to a deck need, because that is one card', () => {
    // Wishlisted once, needed by one deck once. That is one Sol Ring, not two.
    assert.equal(copiesNeeded({ wishlist: 1, perDeck: [1] }), 1);
  });

  it('takes the larger of the standing wants', () => {
    assert.equal(copiesNeeded({ explicit: 4, wishlist: 1, perDeck: [1] }), 4);
    assert.equal(copiesNeeded({ explicit: 1, wishlist: 1, perDeck: [2, 2] }), 4);
  });

  it('takes off what is already in the post', () => {
    assert.equal(copiesNeeded({ perDeck: [2], alreadyOnTheWay: 1 }), 1);
    assert.equal(copiesNeeded({ perDeck: [2], alreadyOnTheWay: 5 }), 0);
  });

  it('never returns a negative number of cards to buy', () => {
    assert.equal(copiesNeeded({ explicit: -3 }), 0);
  });
});

describe('grouping one card across sources', () => {
  it('groups on the oracle id, so two printings are one shopping decision', () => {
    assert.equal(
      cardKey({ oracle_id: 'abc', card_name: 'Sol Ring' }),
      cardKey({ oracle_id: 'abc', card_name: 'SOL RING' })
    );
  });

  it('falls back to the name for rows with no oracle id', () => {
    assert.equal(cardKey({ card_name: 'Sol Ring' }), cardKey({ name: '  sol ring ' }));
  });

  it('does not confuse two different cards', () => {
    assert.notEqual(cardKey({ card_name: 'Sol Ring' }), cardKey({ card_name: 'Solemn Simulacrum' }));
  });
});

/* -------------------------------------------------------------- the merge */

describe('assembling the list', () => {
  it('shows why a card is on the list', () => {
    const list = assembleShoppingList(
      input({
        wishlist: [
          { id: 'w1', card_id: SOL_RING.id, card_name: 'Sol Ring', quantity: 1, card: SOL_RING },
        ],
        shortfalls: [
          { deckId: 'd1', deckName: 'Krenko', card_id: SOL_RING.id, card_name: 'Sol Ring', missing: 1, card: SOL_RING },
          { deckId: 'd2', deckName: 'Atraxa', card_id: SOL_RING.id, card_name: 'Sol Ring', missing: 1, card: SOL_RING },
        ],
      })
    );
    assert.equal(list.toBuy.length, 1);
    const entry = list.toBuy[0];
    // Two decks need one each, so two copies, and the wishlist does not add a third.
    assert.equal(entry.quantity, 2);
    assert.deepEqual(
      entry.reasons.map(r => r.label),
      ['On your wishlist', 'Needed by Krenko', 'Needed by Atraxa']
    );
  });

  it('does not offer to buy a copy already on the way', () => {
    const list = assembleShoppingList(
      input({
        items: [item({ id: 'bought', status: 'bought', quantity: 1, bought_at: '2026-08-10T00:00:00Z' })],
        shortfalls: [
          { deckId: 'd1', deckName: 'Krenko', card_id: SOL_RING.id, card_name: 'Sol Ring', missing: 1, card: SOL_RING },
        ],
      })
    );
    assert.equal(list.toBuy.length, 0, 'the deck need is already satisfied by the parcel');
    assert.equal(list.arriving.length, 1);
  });

  it('still offers the second copy when only one was bought', () => {
    const list = assembleShoppingList(
      input({
        items: [item({ id: 'bought', status: 'bought', quantity: 1, bought_at: '2026-08-10T00:00:00Z' })],
        shortfalls: [
          { deckId: 'd1', deckName: 'Krenko', card_id: SOL_RING.id, card_name: 'Sol Ring', missing: 1, card: SOL_RING },
          { deckId: 'd2', deckName: 'Atraxa', card_id: SOL_RING.id, card_name: 'Sol Ring', missing: 1, card: SOL_RING },
        ],
      })
    );
    assert.equal(list.toBuy.length, 1);
    assert.equal(list.toBuy[0].quantity, 1);
    assert.equal(list.toBuy[0].onTheWay, 1);
  });

  it('keeps the printing the player actually chose', () => {
    const list = assembleShoppingList(
      input({
        items: [item({ card_id: 'chosen-printing', finish: 'foil' })],
        shortfalls: [
          { deckId: 'd1', deckName: 'Krenko', card_id: 'some-other-printing', card_name: 'Sol Ring', missing: 1, card: SOL_RING },
        ],
      })
    );
    assert.equal(list.toBuy[0].cardId, 'chosen-printing');
    assert.equal(list.toBuy[0].finish, 'foil');
  });

  it('separates what is on the way, what has landed and what was filed', () => {
    const list = assembleShoppingList(
      input({
        items: [
          item({ id: 'a', status: 'bought', bought_at: '2026-08-01T00:00:00Z' }),
          item({ id: 'b', status: 'arrived', bought_at: '2026-07-01T00:00:00Z', arrived_at: '2026-08-02T00:00:00Z' }),
          item({
            id: 'c',
            status: 'filed',
            bought_at: '2026-06-01T00:00:00Z',
            arrived_at: '2026-06-05T00:00:00Z',
            filed_at: '2026-06-06T00:00:00Z',
          }),
        ],
      })
    );
    assert.deepEqual(list.arriving.map(i => i.id), ['a']);
    assert.deepEqual(list.arrived.map(i => i.id), ['b']);
    assert.deepEqual(list.filed.map(i => i.id), ['c']);
  });

  it('says how long a parcel has been out, in plain words and no dashes', () => {
    const now = new Date('2026-08-19T00:00:00Z');
    assert.equal(waitingFor('2026-08-19T00:00:00Z', now), 'Bought today');
    assert.equal(waitingFor('2026-08-18T00:00:00Z', now), 'Bought yesterday');
    assert.equal(waitingFor('2026-08-14T00:00:00Z', now), 'Bought 5 days ago');
    assert.equal(waitingFor('2026-07-01T00:00:00Z', now), 'Bought 49 days ago, still not here');
    assert.equal(waitingFor(null, now), null);
    for (const iso of ['2026-08-19T00:00:00Z', '2026-07-01T00:00:00Z']) {
      assert.ok(!(waitingFor(iso, now) ?? '').includes('—'), 'no em-dashes in user-facing copy');
    }
  });
});

/* -------------------------------------------------------------- the exports */

describe('exports a shop will accept', () => {
  const lines = [
    { name: 'Sol Ring', quantity: 1, setName: 'Marvel Super Heroes Commander' },
    { name: 'Lightning Bolt', quantity: 4, setName: 'Modern Masters' },
  ];

  it('writes quantity then name, one card per line', () => {
    assert.equal(formatExport(lines, 'tcgplayer'), '4 Lightning Bolt\n1 Sol Ring');
    assert.equal(formatExport(lines, 'cardkingdom'), '4 Lightning Bolt\n1 Sol Ring');
    assert.equal(formatExport(lines, 'text'), '4 Lightning Bolt\n1 Sol Ring');
  });

  it('names the set only for Cardmarket, whose syntax for it is documented', () => {
    assert.equal(
      formatExport(lines, 'cardmarket', { includeSet: true }),
      '4 Lightning Bolt (Modern Masters)\n1 Sol Ring (Marvel Super Heroes Commander)'
    );
    // The same option changes nothing for the other two, because their set
    // syntax uses a code namespace that is not ours.
    assert.equal(formatExport(lines, 'tcgplayer', { includeSet: true }), '4 Lightning Bolt\n1 Sol Ring');
  });

  it('merges two printings of one card into one line', () => {
    const merged = mergeLines([
      { name: 'Sol Ring', quantity: 1, setName: 'Commander 2021' },
      { name: 'Sol Ring', quantity: 2, setName: 'Marvel Super Heroes Commander' },
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].quantity, 3);
    // Two printings cannot both be named, so neither is claimed.
    assert.equal(merged[0].setName, null);
  });

  it('drops nothing-lines rather than writing "0 Sol Ring"', () => {
    assert.equal(formatExport([{ name: 'Sol Ring', quantity: 0 }], 'text'), '');
    assert.equal(formatExport([{ name: '   ', quantity: 2 }], 'text'), '');
  });
});

/* --------------------------------------------------------------- the totals */

describe('what the list costs', () => {
  it('totals each shop in its own money and never mixes them', () => {
    const totals = platformTotals([{ card: SOL_RING, quantity: 2, finish: 'nonfoil' }]);
    const tcg = totals.find(t => t.id === 'tcgplayer')!;
    const cm = totals.find(t => t.id === 'cardmarket')!;
    assert.equal(tcg.amount, 3.2);
    assert.equal(tcg.currency, 'USD');
    assert.equal(cm.amount, 3.08);
    assert.equal(cm.currency, 'EUR');
  });

  it('counts an unpriced card rather than adding it as zero', () => {
    const totals = platformTotals([
      { card: SOL_RING, quantity: 1, finish: 'nonfoil' },
      { card: UNPRICED, quantity: 3, finish: 'nonfoil' },
    ]);
    const tcg = totals.find(t => t.id === 'tcgplayer')!;
    assert.equal(tcg.amount, 1.6, 'the unpriced card contributes nothing, not zero dollars of value');
    assert.equal(tcg.unpricedCopies, 3);
    assert.equal(tcg.unpricedCards, 1);
    assert.equal(tcg.complete, false);
  });

  it('does not borrow the plain price for a foil we cannot price', () => {
    // Sol Ring msc was never printed in foil, so a foil want has no price here.
    const totals = platformTotals([{ card: SOL_RING, quantity: 1, finish: 'foil' }]);
    const tcg = totals.find(t => t.id === 'tcgplayer')!;
    assert.equal(tcg.amount, 0);
    assert.equal(tcg.pricedCopies, 0);
    assert.equal(tcg.unpricedCopies, 1);
  });

  it('will not price a plain copy of an etched only printing', () => {
    const plain = platformTotals([{ card: ETCHED_ONLY, quantity: 1, finish: 'nonfoil' }]);
    const tcg = plain.find(t => t.id === 'tcgplayer')!;
    assert.equal(tcg.amount, 0);
    assert.equal(tcg.unpricedCopies, 1, 'the etched price must not stand in for a plain copy');

    // Asked for what the printing actually is, the price is there.
    const etched = platformTotals([{ card: ETCHED_ONLY, quantity: 1, finish: 'etched' }]);
    assert.equal(etched.find(t => t.id === 'tcgplayer')!.amount, 33.26);
  });

  it('keeps what was paid apart from what it is worth, and by currency', () => {
    const { totals, copiesWithNoPrice } = paidTotals([
      { paid_unit: 1.4, paid_currency: 'USD', quantity: 2 },
      { paid_unit: 1.2, paid_currency: 'EUR', quantity: 1 },
      { paid_unit: null, paid_currency: null, quantity: 3 },
    ]);
    assert.deepEqual(
      totals.map(t => [t.currency, t.amount, t.copies]),
      [['USD', 2.8, 2], ['EUR', 1.2, 1]]
    );
    assert.equal(copiesWithNoPrice, 3, 'a bundle with no per card price is unknown, not free');
  });
});
