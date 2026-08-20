import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectionSummary,
  colourSpread,
  manaValueSpread,
  mostValuable,
  raritySpread,
  recentlyAdded,
  setSpread,
  type OwnedRow,
} from './spread.ts';

/**
 * A row, with only the fields a given assertion cares about spelled out.
 *
 * Every default here is deliberately boring so a test reads as the one thing it
 * changes: a colourless, common, mana-value-zero, unpriced artifact.
 */
function row(over: Partial<OwnedRow> & { card?: Partial<NonNullable<OwnedRow['card']>> }): OwnedRow {
  const { card, ...rest } = over;
  return {
    id: 'r',
    quantity: 1,
    foil: 0,
    created_at: '2026-01-01T00:00:00Z',
    set_code: 'tst',
    ...rest,
    card: {
      id: 'c',
      name: 'Test Card',
      set_code: 'tst',
      colors: [],
      cmc: 0,
      type_line: 'Artifact',
      rarity: 'common',
      prices: {},
      ...card,
    },
  };
}

test('a stack we cannot price is counted, never valued at zero', () => {
  const rows = [
    row({ card: { prices: { usd: '10.00' } } }),
    row({ id: 'r2', card: { prices: {} } }),
    // Owned non-foil, but only a foil price exists. The copies held cannot be
    // priced even though the printing carries a price. This is the exact shape
    // that put a card on screen at "$0.00 each".
    row({ id: 'r3', quantity: 2, card: { prices: { usd_foil: '1.42' } } }),
  ];

  const summary = collectionSummary(rows);
  assert.equal(summary.value, 10);
  assert.equal(summary.unpriced, 2);
  assert.equal(summary.copies, 4);
  assert.equal(summary.unique, 3);
});

test('foil copies are priced as foils and non-foil copies are not', () => {
  const rows = [row({ quantity: 2, foil: 3, card: { prices: { usd: '1.00', usd_foil: '5.00' } } })];
  const summary = collectionSummary(rows);

  assert.equal(summary.value, 2 * 1 + 3 * 5);
  assert.equal(summary.foilCopies, 3);
  assert.equal(summary.foilValue, 15);
});

test('a foil with no foil price falls back to the plain price, same as the valuation rule', () => {
  const summary = collectionSummary([row({ quantity: 0, foil: 2, card: { prices: { usd: '3.00' } } })]);
  assert.equal(summary.value, 6);
  assert.equal(summary.foilValue, 6);
});

test('rows with no card, or no copies, are not part of anything', () => {
  const rows: OwnedRow[] = [
    { id: 'a', quantity: 1, foil: 0, card: null },
    row({ id: 'b', quantity: 0, foil: 0 }),
  ];
  const summary = collectionSummary(rows);
  assert.equal(summary.copies, 0);
  assert.equal(summary.unique, 0);
  assert.deepEqual(mostValuable(rows), []);
});

test('a two-colour card counts in both of its colours and the bars over-add on purpose', () => {
  const spread = colourSpread([
    row({ quantity: 3, card: { colors: ['B', 'G'] } }),
    row({ id: 'r2', quantity: 2, card: { colors: ['G'] } }),
    row({ id: 'r3', quantity: 4, card: { colors: [] } }),
  ]);

  const by = Object.fromEntries(spread.slices.map(s => [s.key, s.copies]));
  assert.equal(by.B, 3);
  assert.equal(by.G, 5);
  assert.equal(by.C, 4);
  assert.equal(by.W, 0);
  assert.equal(spread.multicolourCopies, 3);
  assert.equal(spread.totalCopies, 9);
  // The over-add is real and the caption depends on it being visible.
  assert.equal(
    spread.slices.reduce((sum, s) => sum + s.copies, 0),
    12
  );
});

test('colour bars stay in WUBRG order whatever the collection holds', () => {
  const spread = colourSpread([row({ card: { colors: ['G'] } })]);
  assert.deepEqual(
    spread.slices.map(s => s.key),
    ['W', 'U', 'B', 'R', 'G', 'C']
  );
});

test('a colour letter that is not a real colour is ignored, not bucketed', () => {
  const spread = colourSpread([row({ quantity: 2, card: { colors: ['W', 'x', 'W'] as string[] } })]);
  const by = Object.fromEntries(spread.slices.map(s => [s.key, s.copies]));
  assert.equal(by.W, 2, 'a repeated colour must not double-count the same copies');
  assert.equal(spread.multicolourCopies, 0);
});

test('lands are out of the mana curve and reported separately', () => {
  const { slices, landCopies } = manaValueSpread([
    row({ quantity: 5, card: { type_line: 'Basic Land — Forest', cmc: 0 } }),
    row({ id: 'r2', quantity: 2, card: { type_line: 'Creature — Elf', cmc: 1 } }),
    row({ id: 'r3', quantity: 1, card: { type_line: 'Land // Creature', cmc: 3 } }),
  ]);

  assert.equal(landCopies, 6);
  assert.equal(slices[0].copies, 0, 'no land may reach the zero column');
  assert.equal(slices[1].copies, 2);
});

test('everything from seven up shares the last column', () => {
  const { slices } = manaValueSpread([
    row({ card: { type_line: 'Creature', cmc: 7 } }),
    row({ id: 'r2', card: { type_line: 'Creature', cmc: 12 } }),
    row({ id: 'r3', card: { type_line: 'Creature', cmc: 6 } }),
  ]);

  const last = slices[slices.length - 1];
  assert.equal(last.label, '7+');
  assert.equal(last.copies, 2);
  assert.equal(slices[6].copies, 1);
});

test('a fractional mana value floors into its column', () => {
  const { slices } = manaValueSpread([row({ card: { type_line: 'Creature', cmc: 1.5 } })]);
  assert.equal(slices[1].copies, 1);
});

test('only rarities actually held get a bar, in scarcity order', () => {
  const slices = raritySpread([
    row({ quantity: 4, card: { rarity: 'mythic' } }),
    row({ id: 'r2', quantity: 9, card: { rarity: 'common' } }),
    row({ id: 'r3', quantity: 1, card: { rarity: 'nonsense' } }),
  ]);

  assert.deepEqual(
    slices.map(s => s.key),
    ['common', 'mythic']
  );
  assert.equal(slices[0].copies, 9);
});

test('the set tail folds into one bar that names how many sets it holds', () => {
  const rows = Array.from({ length: 10 }, (_, i) =>
    row({ id: `r${i}`, quantity: 10 - i, card: { set_code: `s${i}` } })
  );
  const slices = setSpread(rows, 3);

  assert.equal(slices.length, 4);
  assert.deepEqual(
    slices.slice(0, 3).map(s => s.label),
    ['S0', 'S1', 'S2']
  );
  assert.equal(slices[3].label, '7 more');
  // 7+6+5+4+3+2+1 — the tail keeps the collection whole.
  assert.equal(slices[3].copies, 28);
});

test('the most valuable rail is ordered by what the copies are worth, not unit price', () => {
  const ranked = mostValuable([
    row({ id: 'one', quantity: 1, card: { name: 'Single Expensive', prices: { usd: '50.00' } } }),
    row({ id: 'many', quantity: 40, card: { name: 'Cheap Pile', prices: { usd: '2.00' } } }),
    row({ id: 'none', quantity: 3, card: { name: 'Unpriced', prices: {} } }),
  ]);

  assert.deepEqual(
    ranked.map(r => r.name),
    ['Cheap Pile', 'Single Expensive']
  );
  assert.equal(ranked[0].value, 80);
  assert.ok(
    !ranked.some(r => r.name === 'Unpriced'),
    'an unpriceable stack must not be ranked at the bottom of a value list'
  );
});

test('the most valuable rail honours its limit', () => {
  const rows = Array.from({ length: 30 }, (_, i) =>
    row({ id: `r${i}`, card: { name: `Card ${i}`, prices: { usd: String(i + 1) } } })
  );
  assert.equal(mostValuable(rows, 12).length, 12);
});

test('recently added is newest first', () => {
  const ordered = recentlyAdded([
    row({ id: 'old', created_at: '2026-01-01T00:00:00Z' }),
    row({ id: 'new', created_at: '2026-08-01T00:00:00Z' }),
    row({ id: 'mid', created_at: '2026-04-01T00:00:00Z' }),
  ]);

  assert.deepEqual(ordered.map(r => r.id), ['new', 'mid', 'old']);
});

test('the average mana value ignores lands, and every measure survives an empty collection', () => {
  const summary = collectionSummary([
    row({ quantity: 1, card: { type_line: 'Creature', cmc: 2 } }),
    row({ id: 'r2', quantity: 3, card: { type_line: 'Creature', cmc: 4 } }),
    row({ id: 'r3', quantity: 50, card: { type_line: 'Basic Land — Island', cmc: 0 } }),
  ]);
  assert.equal(summary.avgManaValue, 3.5);

  const empty = collectionSummary([]);
  assert.equal(empty.avgManaValue, 0);
  assert.equal(empty.value, 0);
  assert.equal(empty.sets, 0);
  assert.deepEqual(setSpread([]), []);
  assert.deepEqual(raritySpread([]), []);
  assert.equal(colourSpread([]).totalCopies, 0);
  assert.equal(manaValueSpread([]).landCopies, 0);
});
