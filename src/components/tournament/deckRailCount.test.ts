import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { deckRailCount } from './deckRailCount.ts';

describe('the deck rail says what is under it', () => {
  it('names the real total when every deck is on screen', () => {
    assert.equal(deckRailCount(2, 2), '2 decks in your library, ready to register');
    assert.equal(deckRailCount(1, 1), '1 deck in your library, ready to register');
  });

  it('does not claim decks it is not showing', () => {
    /* The measured case. The tournaments page read "2 DECKS IN YOUR LIBRARY"
       above exactly one card, because the second deck's commander had no image
       and was filtered out of the grid but not out of the count. */
    assert.equal(
      deckRailCount(2, 1),
      'Showing 1 of 2 decks in your library, ready to register'
    );
  });

  it('does not claim decks the twelve-tile cap is holding back', () => {
    assert.equal(
      deckRailCount(30, 12),
      'Showing 12 of 30 decks in your library, ready to register'
    );
  });

  it('says nothing is there rather than showing a zero', () => {
    assert.equal(deckRailCount(0, 0), 'No decks in your library yet');
    // A library that holds decks but can draw none of them still shows nothing,
    // and saying "0 of 3" would be a stranger sentence than saying none.
    assert.equal(deckRailCount(3, 0), 'No decks in your library yet');
  });

  it('reads as player copy, with no em-dash and no jargon', () => {
    for (const line of [
      deckRailCount(2, 2),
      deckRailCount(2, 1),
      deckRailCount(30, 12),
      deckRailCount(0, 0),
    ]) {
      assert.equal(/[—–]/.test(line), false, `em-dash in: ${line}`);
      assert.equal(/engine|render|component|filter/i.test(line), false, `jargon in: ${line}`);
    }
  });
});
