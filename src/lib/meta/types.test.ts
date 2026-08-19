/**
 * The regression this file exists to catch.
 *
 *   node --test --experimental-strip-types src/lib/meta/types.test.ts
 *
 * A percentage rendered without the count behind it. "Played in 62% of decks" reads as a claim
 * about Commander; "62% of ingested commander decks (118 of 190)" is what we can actually
 * defend. The two look almost identical in a component and are entirely different assertions,
 * and the first one is the failure the whole meta pipeline exists to avoid.
 *
 * The second is rendering "0%" where the answer is "we have no evidence". Zero is a factual
 * claim. Absent is the truth.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_SCOPE_DECKS,
  describeInclusion,
  isReportableScope,
  labelComboPopularity,
  type MetaInclusion,
} from './types.ts';

const row = (containing: number, inScope: number): MetaInclusion => ({
  scope_kind: 'format',
  scope_key: 'commander',
  decks_containing: containing,
  decks_in_scope: inScope,
  inclusion_rate: inScope > 0 ? containing / inScope : 0,
});

describe('describeInclusion', () => {
  it('always shows the sample the percentage came from', () => {
    const text = describeInclusion(row(118, 190))!;
    assert.match(text, /62%/);
    assert.match(text, /118 of 190/, 'the raw counts must travel with the percentage');
  });

  it('names the corpus as ingested decks, not as Commander at large', () => {
    const text = describeInclusion(row(1, 2))!;
    assert.match(text, /ingested/, 'never imply the figure describes the whole format');
  });

  it('returns null rather than 0% when there is no evidence', () => {
    assert.equal(describeInclusion(null), null);
    assert.equal(describeInclusion(undefined), null);
    assert.equal(describeInclusion(row(0, 0)), null, 'an empty corpus is absent, not zero');
  });

  it('reports a genuine zero only when the corpus is real', () => {
    // Nobody plays it, across 190 decks, is a real finding and must survive.
    const text = describeInclusion(row(0, 190))!;
    assert.match(text, /0%/);
    assert.match(text, /0 of 190/);
  });

  it('refuses malformed rows instead of dividing by them', () => {
    assert.equal(describeInclusion(row(5, -1)), null);
    assert.equal(describeInclusion({ ...row(5, 10), decks_containing: NaN }), null);
  });
});

describe('isReportableScope', () => {
  it('draws the line where the database draws it', () => {
    assert.equal(MIN_SCOPE_DECKS, 30, 'must mirror public.meta_min_scope_decks()');
    assert.equal(isReportableScope(30), true);
    assert.equal(isReportableScope(29), false);
    assert.equal(isReportableScope(2), false, 'two precons is not an inclusion rate');
  });
});

describe('labelComboPopularity', () => {
  it('attributes the figure to whoever actually computed it', () => {
    const text = labelComboPopularity({
      combo_id: 'x', identity: 'U', produces: [], popularity: 339926,
      bracket_tag: 'E', piece_count: 2,
    })!;
    assert.match(text, /Commander Spellbook/,
      'their corpus count must never be presented as ours');
    assert.match(text, /339,926/);
  });

  it('says nothing when there is no figure', () => {
    assert.equal(labelComboPopularity({
      combo_id: 'x', identity: null, produces: [], popularity: null,
      bracket_tag: null, piece_count: 2,
    }), null);
  });
});
