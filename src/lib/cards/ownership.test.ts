import test from 'node:test';
import assert from 'node:assert/strict';
import { ownedByCardId, ownedByOracle, spendOwned } from './ownership.ts';

/*
 * Two printings of Sol Ring, one printing of Forest. `c1` and `c2` are the same
 * card; the whole file is about that.
 */
const ORACLE = new Map<string, string>([
  ['c1', 'sol-ring'],
  ['c2', 'sol-ring'],
  ['f1', 'forest'],
]);

test('a card you own counts however it was printed', () => {
  const owned = [{ card_id: 'c2', quantity: 1, foil: 0 }];
  const byCard = ownedByCardId(owned, ORACLE, ['c1', 'c2']);
  assert.equal(byCard.get('c1'), 1, 'the deck lists c1 and the shelf holds c2; that is one Sol Ring');
  assert.equal(byCard.get('c2'), 1);
});

test('foils are copies', () => {
  const owned = [{ card_id: 'c1', quantity: 2, foil: 3 }];
  assert.equal(ownedByOracle(owned, ORACLE).get('sol-ring'), 5);
});

test('copies of one card add up across its printings', () => {
  const owned = [
    { card_id: 'c1', quantity: 1, foil: 0 },
    { card_id: 'c2', quantity: 2, foil: 0 },
  ];
  assert.equal(ownedByCardId(owned, ORACLE, ['c1']).get('c1'), 3);
});

test('a printing the index does not know is counted, not dropped', () => {
  const owned = [{ card_id: 'unknown-printing', quantity: 4, foil: 0 }];
  const byCard = ownedByCardId(owned, ORACLE, ['unknown-printing']);
  assert.equal(
    byCard.get('unknown-printing'),
    4,
    'losing a row understates what somebody owns, which is the bug this file exists to stop'
  );
});

test('an id nobody owns is zero, not absent', () => {
  const byCard = ownedByCardId([], ORACLE, ['c1']);
  assert.equal(byCard.get('c1'), 0);
});

test('negative or fractional quantities cannot manufacture copies', () => {
  const owned = [{ card_id: 'c1', quantity: -5, foil: 2.7 }];
  assert.equal(ownedByOracle(owned, ORACLE).get('sol-ring'), 2);
});

test('a null quantity is nothing owned rather than NaN', () => {
  const owned = [{ card_id: 'c1', quantity: null, foil: null }];
  assert.equal(ownedByOracle(owned, ORACLE).get('sol-ring'), 0);
});

test('one copy does not cover the ten a deck asks for', () => {
  const owned = ownedByCardId([{ card_id: 'f1', quantity: 1 }], ORACLE, ['f1']);
  const [line] = spendOwned([{ card_id: 'f1', quantity: 10 }], owned, ORACLE);
  assert.deepEqual(line, { card_id: 'f1', required: 10, owned: 1, missing: 9 });
});

test('two lines for two printings of one card do not both claim the same copy', () => {
  const owned = ownedByCardId([{ card_id: 'c1', quantity: 1 }], ORACLE, ['c1', 'c2']);
  const lines = spendOwned(
    [
      { card_id: 'c1', quantity: 1 },
      { card_id: 'c2', quantity: 1 },
    ],
    owned,
    ORACLE
  );
  assert.equal(lines[0].missing, 0, 'the first line spends the Sol Ring');
  assert.equal(lines[1].missing, 1, 'and the second one is genuinely short');
});

test('spare copies never push a line past owning what it needs', () => {
  const owned = ownedByCardId([{ card_id: 'c1', quantity: 9 }], ORACLE, ['c1']);
  const [line] = spendOwned([{ card_id: 'c1', quantity: 1 }], owned, ORACLE);
  assert.equal(line.owned, 1, 'a spare box of Sol Rings is not 900% of one deck slot');
  assert.equal(line.missing, 0);
});
