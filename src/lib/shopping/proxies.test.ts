import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countProxyCopies,
  proxyCandidatesFromItems,
  proxyCandidatesFromShopping,
  proxyCandidatesFromWishlist,
  showListItemCount,
} from './proxies.ts';
import type { ShoppingEntry } from './assemble.ts';
import type { CardListItem } from './list.ts';

const SOL_RING = '6ad8011d-3471-4369-9d68-b264cc027487';

function entry(over: Partial<ShoppingEntry> = {}): ShoppingEntry {
  return {
    key: 'k',
    cardId: 'card-1',
    cardName: 'Sol Ring',
    finish: 'nonfoil',
    quantity: 1,
    reasons: [],
    item: null,
    onTheWay: 0,
    ...over,
  };
}

function wish(over: Record<string, any> = {}) {
  return { id: 'w1', card_id: 'card-1', card_name: 'Sol Ring', quantity: 1, ...over };
}

test('a shopping entry becomes one proxy candidate carrying its printing', () => {
  const [row] = proxyCandidatesFromShopping([
    entry({ card: { id: 'card-1', oracle_id: SOL_RING, name: 'Sol Ring' }, quantity: 2 }),
  ]);
  assert.equal(row.cardId, 'card-1');
  assert.equal(row.cardName, 'Sol Ring');
  assert.equal(row.oracleId, SOL_RING);
  assert.equal(row.quantity, 2);
});

test('two rows for one card fold into one, at the larger quantity', () => {
  // Two printings of Sol Ring on a wishlist are two ways of saying the same
  // want. Summing them would print three Sol Rings for a player who asked for
  // two.
  const rows = proxyCandidatesFromWishlist([
    wish({ id: 'a', card_id: 'ltc-284', quantity: 2, card: { id: 'ltc-284', oracle_id: SOL_RING, name: 'Sol Ring' } }),
    wish({ id: 'b', card_id: 'c21-263', quantity: 1, card: { id: 'c21-263', oracle_id: SOL_RING, name: 'Sol Ring' } }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 2);
  // The first row seen is the one the source page is showing.
  assert.equal(rows[0].cardId, 'ltc-284');
});

test('a name-only row and an oracle row for one card are still one card', () => {
  // The production case from `oracleIdsByName`: an old wishlist row whose
  // card_id is the literal text `sol-ring`, beside a real one.
  const rows = proxyCandidatesFromWishlist([
    wish({ id: 'a', card_id: 'sol-ring', quantity: 1 }),
    wish({ id: 'b', card_id: 'ltc-284', quantity: 1, card: { id: 'ltc-284', oracle_id: SOL_RING, name: 'Sol Ring' } }),
  ]);
  assert.equal(rows.length, 1);
  // The duplicate supplied the art the first row could not.
  assert.equal(rows[0].card?.id, 'ltc-284');
  assert.equal(rows[0].cardId, 'ltc-284');
});

test('different cards stay separate', () => {
  const rows = proxyCandidatesFromWishlist([
    wish({ id: 'a', card_id: 'x', card_name: 'Sol Ring' }),
    wish({ id: 'b', card_id: 'y', card_name: 'Arcane Signet' }),
  ]);
  assert.equal(rows.length, 2);
});

test('a row with no name or no card id is dropped rather than half added', () => {
  const rows = proxyCandidatesFromWishlist([
    wish({ id: 'a', card_name: '   ' }),
    wish({ id: 'b', card_id: '' }),
    wish({ id: 'c', card_id: 'ok', card_name: 'Lightning Bolt' }),
  ]);
  assert.deepEqual(rows.map(r => r.cardName), ['Lightning Bolt']);
});

test('a missing or zero quantity prints one copy, never none', () => {
  const rows = proxyCandidatesFromWishlist([
    wish({ id: 'a', quantity: null }),
    wish({ id: 'b', card_id: 'z', card_name: 'Counterspell', quantity: 0 }),
  ]);
  assert.deepEqual(rows.map(r => r.quantity), [1, 1]);
});

test('list rows convert too, keeping their own oracle id', () => {
  const items = [
    { id: 'i1', card_id: 'card-1', card_name: 'Sol Ring', oracle_id: SOL_RING, quantity: 3 },
  ] as unknown as CardListItem[];
  const [row] = proxyCandidatesFromItems(items);
  assert.equal(row.oracleId, SOL_RING);
  assert.equal(row.quantity, 3);
});

test('the count on the button is copies, not lines', () => {
  const rows = proxyCandidatesFromWishlist([
    wish({ id: 'a', card_id: 'x', card_name: 'Sol Ring', quantity: 1 }),
    wish({ id: 'b', card_id: 'y', card_name: 'Lightning Bolt', quantity: 4 }),
  ]);
  assert.equal(countProxyCopies(rows), 5);
});

test('one card is singular, everything else is plural', () => {
  assert.equal(showListItemCount(1), '1 card');
  assert.equal(showListItemCount(0), '0 cards');
  assert.equal(showListItemCount(40), '40 cards');
});
