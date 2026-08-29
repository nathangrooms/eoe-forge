/**
 * Opening a deck must not look like editing it.
 *
 * The deck page needs an account, so the symptom (a deck's "Last updated"
 * jumping from 31 January to 29 August between two reads, with nothing changed)
 * cannot be reproduced in a browser here. The decision that caused it is a pure
 * function, and this runs it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { recordWrite } from './recordWrite.ts';

const HASH = 'abc123';

describe('a read is not an edit', () => {
  it('writes nothing when nothing moved', () => {
    assert.equal(
      recordWrite({ hash: HASH, score: 5.3 }, { hash: HASH, score: 5.3 }),
      'skip',
      'opening a deck with an up to date score rewrote its row and reordered My Decks'
    );
  });

  it('refreshes the cache without stamping a date when only the engine moved', () => {
    assert.equal(
      recordWrite({ hash: HASH, score: 5.6 }, { hash: HASH, score: 5.3 }),
      'cache',
      'the decklist is identical, so nobody edited anything'
    );
  });

  it('counts a changed decklist as an edit, because it is one', () => {
    assert.equal(recordWrite({ hash: HASH, score: 5.3 }, { hash: 'different', score: 5.3 }), 'edit');
    assert.equal(recordWrite({ hash: HASH, score: 5.3 }, { hash: 'different', score: 6.1 }), 'edit');
  });

  it('a deck that has never been scored is written once, as an edit', () => {
    assert.equal(recordWrite(null, { hash: HASH, score: 5.3 }), 'edit');
    assert.equal(recordWrite({}, { hash: HASH, score: 5.3 }), 'edit');
    assert.equal(recordWrite({ score: 5.3 }, { hash: HASH, score: 5.3 }), 'edit');
  });

  it('no score means no write of any kind', () => {
    assert.equal(recordWrite({ hash: HASH, score: 5.3 }, null), 'skip');
    assert.equal(recordWrite(null, null), 'skip');
  });

  it('the common case really is the silent one', () => {
    /* Ten consecutive opens of an unchanged deck: ten skips, zero writes. */
    const stored = { hash: HASH, score: 5.3 };
    const plans = Array.from({ length: 10 }, () => recordWrite(stored, { hash: HASH, score: 5.3 }));
    assert.deepEqual(new Set(plans), new Set(['skip']));
  });
});
