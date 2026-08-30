import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { listingCopies, listingsSubtext } from './listingCounts.ts';

describe('the marketplace counts listings and cards separately', () => {
  it('counts copies, not rows', () => {
    assert.equal(listingCopies([{ qty: 4 }]), 4);
    assert.equal(listingCopies([{ qty: 4 }, { qty: 1 }, { qty: 2 }]), 7);
    assert.equal(listingCopies([]), 0);
  });

  it('treats a listing with no quantity as one card, never as none', () => {
    assert.equal(listingCopies([{}, { qty: null }, { qty: 0 }]), 3);
  });

  it('says how many cards the listings hold when that differs from the rows', () => {
    /* The measured case: one listing of four Sol Rings showed "Listings 1 /
       Cards you have for sale" beside "Listing value $8.00". */
    assert.equal(listingsSubtext(1, 4), '4 cards across them');
    assert.equal(listingsSubtext(3, 12), '12 cards across them');
  });

  it('stays quiet when every listing is a single card', () => {
    assert.equal(listingsSubtext(3, 3), 'Cards you have for sale');
    assert.equal(listingsSubtext(1, 1), 'Cards you have for sale');
  });

  it('says nothing is listed rather than printing a zero', () => {
    assert.equal(listingsSubtext(0, 0), 'Nothing listed yet');
  });

  it('reads as player copy, with no em-dash and no jargon', () => {
    for (const line of [listingsSubtext(1, 4), listingsSubtext(3, 3), listingsSubtext(0, 0)]) {
      assert.equal(/[—–]/.test(line), false, `em-dash in: ${line}`);
      assert.equal(/row|record|entity/i.test(line), false, `jargon in: ${line}`);
    }
  });
});
