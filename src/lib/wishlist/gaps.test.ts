import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { gapLine, summariseGaps, wantedBy, type GapSourceDeck } from './gaps.ts';

const card = (
  cardId: string,
  name: string,
  missing: number,
  price: number,
  onWishlist = false
) => ({ cardId, name, missing, price, onWishlist });

describe('what your decks are short of, counted once', () => {
  it('counts a card wanted by two decks as one card and two copies', () => {
    const gaps: GapSourceDeck[] = [
      { deckId: 'a', name: 'Atraxa', cards: [card('sol', 'Sol Ring', 1, 2)] },
      { deckId: 'b', name: 'Ulamog', cards: [card('sol', 'Sol Ring', 1, 2)] },
    ];

    const summary = summariseGaps(gaps, 12);
    assert.equal(summary.picks.length, 1, 'one tile, because it is one card');
    assert.equal(summary.cards, 1);
    assert.equal(summary.copies, 2);
    assert.equal(summary.decks, 2);
    assert.equal(summary.picks[0].missing, 2);
    assert.deepEqual(summary.picks[0].decks, ['Atraxa', 'Ulamog']);
    assert.deepEqual(summary.deckNames, ['Atraxa', 'Ulamog']);
  });

  it('names only the decks that are actually short of something', () => {
    /* The screen uses this to decide whether captioning every tile with the
       deck is worth the room. With one deck it is twelve truncated copies of
       one string, so the name goes in the sentence above instead. */
    const summary = summariseGaps(
      [
        { deckId: 'a', name: 'Atraxa', cards: [card('sol', 'Sol Ring', 1, 2)] },
        { deckId: 'b', name: 'Complete deck', cards: [] },
      ],
      12
    );
    assert.deepEqual(summary.deckNames, ['Atraxa']);
    assert.equal(summary.decks, 1);
  });

  it('never prints a number bigger than the tiles beneath it', () => {
    /* The bug this file exists to stop. A naive flatten produces one ROW per
       deck per card, so three decks each missing the same two cards would put
       "6 cards" above two pictures. */
    const two = [card('sol', 'Sol Ring', 1, 2), card('cmd', 'Command Tower', 1, 1)];
    const gaps: GapSourceDeck[] = [
      { deckId: 'a', name: 'A', cards: two },
      { deckId: 'b', name: 'B', cards: two },
      { deckId: 'c', name: 'C', cards: two },
    ];

    const summary = summariseGaps(gaps, 12);
    assert.equal(summary.picks.length, 2);
    assert.equal(summary.cards, 2);
    assert.equal(gapLine(summary), '3 decks short of 2 cards');
  });

  it('says so when the grid is holding cards back', () => {
    const gaps: GapSourceDeck[] = [
      {
        deckId: 'a',
        name: 'A',
        cards: [
          card('1', 'One', 1, 50),
          card('2', 'Two', 1, 40),
          card('3', 'Three', 1, 30),
        ],
      },
    ];

    const capped = summariseGaps(gaps, 2);
    assert.equal(capped.picks.length, 2);
    assert.equal(capped.cards, 3);
    assert.equal(gapLine(capped), '1 deck short of 3 cards, and these are the 2 dearest');
  });

  it('orders by what the copies would cost, not by unit price', () => {
    const gaps: GapSourceDeck[] = [
      {
        deckId: 'a',
        name: 'A',
        cards: [card('dear', 'Dear', 1, 30), card('many', 'Many', 4, 10)],
      },
    ];

    const summary = summariseGaps(gaps, 12);
    assert.deepEqual(summary.picks.map(p => p.name), ['Many', 'Dear']);
  });

  it('keeps unpriced cards rather than dropping them, and never invents a price', () => {
    const gaps: GapSourceDeck[] = [
      {
        deckId: 'a',
        name: 'A',
        cards: [card('none', 'Unpriced', 1, 0), card('some', 'Priced', 1, 5)],
      },
    ];

    const summary = summariseGaps(gaps, 12);
    assert.equal(summary.cards, 2);
    assert.deepEqual(summary.picks.map(p => p.name), ['Priced', 'Unpriced']);
    assert.equal(summary.picks[1].price, 0, 'zero means unpriced and the tile must say so');
  });

  it('breaks ties on the card id, so a cap cannot show one card twice', () => {
    const gaps: GapSourceDeck[] = [
      {
        deckId: 'a',
        name: 'A',
        cards: [card('bbb', 'B', 1, 1), card('aaa', 'A', 1, 1), card('ccc', 'C', 1, 1)],
      },
    ];

    assert.deepEqual(summariseGaps(gaps, 3).picks.map(p => p.cardId), ['aaa', 'bbb', 'ccc']);
    assert.deepEqual(summariseGaps(gaps, 2).picks.map(p => p.cardId), ['aaa', 'bbb']);
  });

  it('says nothing at all when nothing is missing', () => {
    const summary = summariseGaps([], 12);
    assert.equal(summary.cards, 0);
    assert.equal(gapLine(summary), '');
  });

  it('names one deck and counts the rest', () => {
    assert.equal(
      wantedBy({ cardId: 'x', name: 'X', missing: 1, price: 1, onWishlist: false, decks: ['Atraxa'] }),
      'Atraxa'
    );
    assert.equal(
      wantedBy({ cardId: 'x', name: 'X', missing: 2, price: 1, onWishlist: false, decks: ['A', 'B'] }),
      '2 of your decks'
    );
  });

  it('reads as player copy, with no em-dash and no jargon', () => {
    const gaps: GapSourceDeck[] = [
      { deckId: 'a', name: 'A', cards: [card('1', 'One', 1, 5), card('2', 'Two', 1, 4)] },
    ];
    for (const line of [gapLine(summariseGaps(gaps, 12)), gapLine(summariseGaps(gaps, 1))]) {
      assert.equal(/[—–]/.test(line), false, `em-dash in: ${line}`);
      assert.equal(/engine|render|component|filter/i.test(line), false, `jargon in: ${line}`);
    }
  });
});
