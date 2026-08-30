import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { recentDecksCount, showingFirst } from './railCount.ts';

describe('a dashboard rail heading counts what is on the rail', () => {
  it('says nothing when the rail is showing everything', () => {
    assert.equal(showingFirst(6, 6), '');
    assert.equal(showingFirst(9, 6), '', 'more on screen than counted is not a cap');
    assert.equal(showingFirst(0, 6), '', 'an empty rail draws its own empty panel');
  });

  it('discloses the cap when the rail is holding some back', () => {
    /* The measured case: "Wanted next" printed 94 above a rail of 18 tiles. */
    assert.equal(showingFirst(18, 94), ' · showing the first 18');
    assert.equal(showingFirst(24, 1200), ' · showing the first 24');
  });

  it('does not keep the library total while the Starred filter is on', () => {
    /* Pressing Starred used to leave "9 decks" above two tiles. */
    assert.equal(recentDecksCount(9, 2, true), '2 starred');
    assert.equal(recentDecksCount(9, 9, false), '9 decks');
  });

  it('discloses the deck window above twenty four', () => {
    assert.equal(recentDecksCount(30, 24, false), '30 decks · showing the first 24');
  });

  it('gets the singular right and says nothing when there is nothing', () => {
    assert.equal(recentDecksCount(1, 1, false), '1 deck');
    assert.equal(recentDecksCount(0, 0, false), undefined);
    assert.equal(recentDecksCount(9, 0, true), undefined, 'the starred empty panel speaks instead');
  });

  it('reads as player copy, with no em-dash and no jargon', () => {
    for (const line of [
      showingFirst(18, 94),
      recentDecksCount(30, 24, false) ?? '',
      recentDecksCount(9, 2, true) ?? '',
    ]) {
      assert.equal(/[—–]/.test(line), false, `em-dash in: ${line}`);
      assert.equal(/render|component|filter|slice/i.test(line), false, `jargon in: ${line}`);
    }
  });
});
