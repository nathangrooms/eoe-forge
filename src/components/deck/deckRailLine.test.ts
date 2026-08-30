import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { deckRailLine } from './deckRailLine.ts';

/*
 * These cases moved here with the function, from
 * `src/components/tournament/deckRailCount.test.ts`. The line is drawn on three
 * surfaces now, so the test that proves it cannot lie belongs beside the one
 * copy of it rather than beside the first surface that needed it.
 */
describe('the deck rail says what is under it', () => {
  it('names the real total when every deck is on screen', () => {
    assert.equal(deckRailLine(2, 2, 'ready to register'), '2 decks in your library, ready to register');
    assert.equal(deckRailLine(1, 1, 'ready to register'), '1 deck in your library, ready to register');
  });

  it('does not claim decks it is not showing', () => {
    /* The measured case. The tournaments page read "2 DECKS IN YOUR LIBRARY"
       above exactly one card, because the second deck's commander had no image
       and was filtered out of the grid but not out of the count. */
    assert.equal(
      deckRailLine(2, 1, 'ready to register'),
      'Showing 1 of 2 decks in your library, ready to register'
    );
  });

  it('does not claim decks a tile cap is holding back', () => {
    assert.equal(
      deckRailLine(30, 12, 'ready to register'),
      'Showing 12 of 30 decks in your library, ready to register'
    );
  });

  it('says nothing is there rather than showing a zero', () => {
    assert.equal(deckRailLine(0, 0, 'ready to register'), 'No decks in your library yet');
    // A library that holds decks but can draw none of them still shows nothing,
    // and saying "0 of 3" would be a stranger sentence than saying none.
    assert.equal(deckRailLine(3, 0, 'ready to register'), 'No decks in your library yet');
  });

  it('carries whatever the decks are ready for, and works without one', () => {
    assert.equal(deckRailLine(4, 4, 'ready to print'), '4 decks in your library, ready to print');
    assert.equal(deckRailLine(4, 4), '4 decks in your library');
    assert.equal(deckRailLine(9, 4), 'Showing 4 of 9 decks in your library');
  });

  it('reads as player copy, with no em-dash and no jargon', () => {
    for (const line of [
      deckRailLine(2, 2, 'ready to register'),
      deckRailLine(2, 1, 'ready to print'),
      deckRailLine(30, 12, 'ready to register'),
      deckRailLine(4, 4),
      deckRailLine(0, 0),
    ]) {
      assert.equal(/[—–]/.test(line), false, `em-dash in: ${line}`);
      assert.equal(/engine|render|component|filter/i.test(line), false, `jargon in: ${line}`);
    }
  });
});
