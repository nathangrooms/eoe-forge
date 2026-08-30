import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { containerCountLine } from './containerCount.ts';

describe('a container never invites a subtraction that does not work', () => {
  it('states both figures when copies and different cards differ', () => {
    /* The measured case: 1,200 copies across 400 different cards, five on the
       picture, used to read "1,200 cards · 395 more inside". */
    assert.equal(containerCountLine(1200, 400, 5), '1,200 cards · 400 different');
  });

  it('offers the subtraction only when it is arithmetically true', () => {
    // 400 copies, 400 different, 5 drawn. 400 - 5 = 395, and the reader can
    // check it against the headline.
    assert.equal(containerCountLine(400, 400, 5), '400 cards · 395 more inside');
  });

  it('says nothing extra when the picture is showing everything', () => {
    assert.equal(containerCountLine(5, 5, 5), '5 cards');
    assert.equal(containerCountLine(3, 3, 9), '3 cards');
  });

  it('gets the singular right', () => {
    assert.equal(containerCountLine(1, 1, 1), '1 card');
  });

  it('reads as player copy, with no em-dash and no jargon', () => {
    for (const line of [
      containerCountLine(1200, 400, 5),
      containerCountLine(400, 400, 5),
      containerCountLine(5, 5, 5),
    ]) {
      assert.equal(/[—–]/.test(line), false, `em-dash in: ${line}`);
      assert.equal(/row|unique|distinct/i.test(line), false, `jargon in: ${line}`);
    }
  });
});
