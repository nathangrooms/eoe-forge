import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD,
  METRIC_TILE,
  SEGMENTED,
  TOOLBAR,
  SURFACE,
  SEARCH_DEBOUNCE_MS,
  listingViewPayload,
  matchedLabel,
  readListingView,
  resolveMode,
  resultSentence,
  totalActiveFilters,
  writeListingView,
  type ListingViewState,
} from './listing-view.ts';

/* ------------------------------------------------------------------ *
 * A fake storage, so the persistence rules can be checked without a
 * browser. `readListingView` reaches for `window.localStorage` and is
 * expected to survive its absence, which is the first thing tested.
 * ------------------------------------------------------------------ */

function withStorage(seed: Record<string, string>, run: () => void) {
  const store = new Map(Object.entries(seed));
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  try {
    run();
  } finally {
    delete (globalThis as any).window;
  }
  return store;
}

const MODES = ['grid', 'list', 'table'];
const FALLBACK: ListingViewState = { mode: 'grid', sortKey: 'name', sortDir: 'asc' };

/* ------------------------------------------------------------------ *
 * Borderless is the law, and it has to be enforceable
 * ------------------------------------------------------------------ */

test('no skin in the vocabulary draws a hairline', () => {
  for (const skin of [FIELD, SEGMENTED, TOOLBAR, SURFACE, ...Object.values(METRIC_TILE)]) {
    // `border-0` is the opt-out and is allowed; a bare `border` or a
    // `border-<colour>` is the thing the owner has banned outright.
    const offending = skin
      .split(/\s+/)
      .filter(token => /^border(-(?!0$)[a-z]|$)/.test(token));
    assert.deepEqual(offending, [], `${skin} draws a border`);
  }
});

test('the segmented shell is the opaque one, not the tinted one', () => {
  /*
   * This is the 1.09:1 measurement, guarded. `bg-muted/40` under a
   * `variant="secondary"` chip is what made the selected view mode invisible on
   * three surfaces; the shell has to stay opaque so the inverted selected chip
   * has something to be inverted against.
   */
  assert.ok(SEGMENTED.includes('bg-muted'), 'segmented shell lost its ground');
  assert.ok(!SEGMENTED.includes('bg-muted/'), 'segmented shell is tinted again');
});

test('one debounce, and it is the measured majority', () => {
  assert.equal(SEARCH_DEBOUNCE_MS, 250);
});

test('a metric tile has exactly two grounds and neither of them is smaller', () => {
  /*
   * The complaint that started this work was a row of figures shrunk to fit
   * around a menu: *"my decks has proper metric tiles, when on my collection
   * page we dont have these and they are much smaller"*. Two of the six metric
   * rows the audit counted carried a size prop, and both used it to shrink.
   * Adding a third ground called `sm`, `compact` or `dense` is that coming
   * back, so the count is pinned.
   */
  assert.deepEqual(Object.keys(METRIC_TILE).sort(), ['card', 'page']);
  for (const skin of Object.values(METRIC_TILE)) {
    assert.ok(!/text-(xs|sm|base|lg|xl)\b/.test(skin), `${skin} sets the type size`);
  }
});

test('a recessed tile does not also cast a shadow', () => {
  /*
   * `Card` ships `shadow-lg shadow-black/20`. A tile tinted down to sit inside
   * a raised panel has to put that out, or it reads as a raised tile somebody
   * tinted by mistake.
   */
  assert.ok(METRIC_TILE.card.includes('bg-muted/30'), 'the recessed ground lost its tint');
  assert.ok(METRIC_TILE.card.includes('shadow-none'), 'a recessed tile is still casting a shadow');
});

/* ------------------------------------------------------------------ *
 * Remembering a view
 * ------------------------------------------------------------------ */

test('no storage at all is a default, not a failure', () => {
  assert.deepEqual(readListingView('any.key', MODES, FALLBACK), FALLBACK);
});

test('a stored mode this surface does not offer falls back to its first', () => {
  withStorage({ 'a.view': JSON.stringify({ mode: 'table' }) }, () => {
    // Somebody who last used a table lands on the grid when they reach a
    // surface with no table, rather than on a blank panel.
    const read = readListingView('a.view', ['grid', 'list'], FALLBACK);
    assert.equal(read.mode, 'grid');
  });
});

test('the collection key written by the old browser is still honoured', () => {
  /*
   * `CollectionBrowser` has been writing `{ view, sortKey, sortDir }` under
   * `deckmatrix.collection.view` on real accounts. Reading only `mode` would
   * quietly reset every one of them to the grid.
   */
  withStorage(
    {
      'deckmatrix.collection.view': JSON.stringify({
        view: 'table',
        sortKey: 'value',
        sortDir: 'desc',
      }),
    },
    () => {
      const read = readListingView('deckmatrix.collection.view', MODES, FALLBACK);
      assert.deepEqual(read, { mode: 'table', sortKey: 'value', sortDir: 'desc' });
    }
  );
});

test('the newer field wins when both are present', () => {
  withStorage({ 'a.view': JSON.stringify({ mode: 'list', view: 'table' }) }, () => {
    assert.equal(readListingView('a.view', MODES, FALLBACK).mode, 'list');
  });
});

test('what is written can be read back by the old code as well as the new', () => {
  const payload = listingViewPayload({ mode: 'table', sortKey: 'value', sortDir: 'desc' });
  assert.equal(payload.mode, 'table');
  assert.equal(payload.view, 'table', 'an older build reading `view` would see the grid');
});

test('a corrupt or half-written value does not take the page down', () => {
  withStorage({ 'a.view': '{not json' }, () => {
    assert.deepEqual(readListingView('a.view', MODES, FALLBACK), FALLBACK);
  });
  withStorage({ 'a.view': JSON.stringify({ sortDir: 'sideways' }) }, () => {
    assert.equal(readListingView('a.view', MODES, FALLBACK).sortDir, 'asc');
  });
});

test('a round trip through storage keeps every field', () => {
  const state: ListingViewState = { mode: 'list', sortKey: 'added', sortDir: 'desc' };
  withStorage({}, () => {
    writeListingView('a.view', state);
    assert.deepEqual(readListingView('a.view', MODES, FALLBACK), state);
  });
});

test('no surface key means nothing is remembered and nothing throws', () => {
  const store = withStorage({}, () => {
    writeListingView(undefined, FALLBACK);
    assert.deepEqual(readListingView(undefined, MODES, FALLBACK), FALLBACK);
  });
  assert.equal(store.size, 0);
});

test('resolveMode prefers the asked-for fallback over the first mode', () => {
  assert.equal(resolveMode(undefined, MODES, 'table'), 'table');
  assert.equal(resolveMode(undefined, MODES, 'nonsense'), 'grid');
  assert.equal(resolveMode(42, MODES), 'grid');
});

/* ------------------------------------------------------------------ *
 * Saying how many results there are
 * ------------------------------------------------------------------ */

test('an unnarrowed list states one number, not the same number twice', () => {
  assert.deepEqual(matchedLabel(9, 9, 'deck'), { value: '9', label: 'decks' });
});

test('a narrowed list says what it was narrowed out of', () => {
  assert.deepEqual(matchedLabel(3, 9, 'deck'), { value: '3 of 9', label: 'decks' });
});

test('one of a thing is singular, and thousands carry separators', () => {
  assert.deepEqual(matchedLabel(1, 1, 'deck'), { value: '1', label: 'deck' });
  assert.equal(matchedLabel(24, 1204, 'card').value, '24 of 1,204');
});

test('an irregular plural is stated rather than guessed', () => {
  assert.equal(matchedLabel(2, 5, 'entry', 'entries').label, 'entries');
});

test('the count line is one sentence, and an absent figure drops out', () => {
  const sentence = resultSentence([
    matchedLabel(240, 240, 'entry', 'entries'),
    { value: '445', label: 'cards' },
    { value: '$10,898.67' },
    false,
    null,
  ]);
  assert.equal(sentence, '240 entries · 445 cards · $10,898.67');
});

test('a figure with no label prints alone', () => {
  assert.equal(resultSentence([{ value: '$12.00' }]), '$12.00');
  assert.equal(resultSentence([]), '');
});

/* ------------------------------------------------------------------ *
 * The filter count
 * ------------------------------------------------------------------ */

test("a page's own facets are counted alongside the shared filter", () => {
  // The collection's condition and foil chips live outside `CardSearchState`.
  // Under-reporting them leaves a reader looking at a short grid with a badge
  // saying nothing is on.
  assert.equal(totalActiveFilters(3, 2), 5);
  assert.equal(totalActiveFilters(3, undefined), 3);
  assert.equal(totalActiveFilters(), 0);
  assert.equal(totalActiveFilters(1, Number.NaN), 1);
});

/* ------------------------------------------------------------------ *
 * The keys the deck and discovery side already carried
 * ------------------------------------------------------------------ */

test('the bare word card search wrote as its view mode is still honoured', () => {
  /*
   * `EnhancedUniversalCardSearch` wrote `localStorage.setItem(
   * 'dm.cardSearch.view', viewMode)` — the literal word, with no object around
   * it — and that one key is shared by all five mounts of the component, so it
   * sits on more accounts than any other view key in the product.
   * `JSON.parse('table')` throws, and the catch would have turned every one of
   * those readers back to the grid.
   */
  withStorage({ 'dm.cardSearch.view': 'table' }, () => {
    assert.equal(readListingView('dm.cardSearch.view', MODES, FALLBACK).mode, 'table');
  });
});

test('precons kept its density because it was written the same way', () => {
  withStorage({ 'deckmatrix.precons.density': 'compact' }, () => {
    const read = readListingView(
      'deckmatrix.precons.density',
      ['large', 'compact'],
      { mode: 'large', sortKey: 'released', sortDir: 'desc' }
    );
    assert.equal(read.mode, 'compact');
  });
});

test('a bare word this surface does not offer still falls back', () => {
  withStorage({ 'a.view': 'compact' }, () => {
    // `compact` is card search's text list. A surface without one must not
    // render a blank panel because somebody used a different page.
    assert.deepEqual(readListingView('a.view', MODES, FALLBACK), FALLBACK);
  });
});

test('a bare word is read as a mode, and a bare number is not', () => {
  /*
   * The check is `startsWith('{')` rather than a failed `JSON.parse`, because
   * `null`, `12` and `"true"` are all valid JSON and none of them is a mode.
   * Whatever an older build left behind, the sort keys must not come out of it.
   */
  withStorage({ 'a.view': '12' }, () => {
    assert.deepEqual(readListingView('a.view', MODES, FALLBACK), FALLBACK);
  });
  withStorage({ 'a.view': 'null' }, () => {
    assert.deepEqual(readListingView('a.view', MODES, FALLBACK), FALLBACK);
  });
});

test('a bare word is upgraded to the full payload once it is written back', () => {
  const store = withStorage({ 'dm.cardSearch.view': 'list' }, () => {
    const read = readListingView('dm.cardSearch.view', MODES, FALLBACK);
    writeListingView('dm.cardSearch.view', read);
  });
  const written = JSON.parse(store.get('dm.cardSearch.view') as string);
  assert.equal(written.mode, 'list');
  assert.equal(written.view, 'list', 'an older build reading `view` would see the grid');
});
