import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BINDER_POCKETS,
  countBySlot,
  describeCount,
  describeFill,
  nextFreePocket,
  nextSlotName,
  orderSlots,
  pocketMap,
  slotLabel,
  subdivisionFor,
} from './subdivision.ts';

test('each container type divides the way the real object does', () => {
  assert.equal(subdivisionFor('binder').kind, 'page');
  assert.equal(subdivisionFor('box').kind, 'divider');
  assert.equal(subdivisionFor('deckbox').kind, 'divider');
  assert.equal(subdivisionFor('deck-linked').kind, 'divider');
  assert.equal(subdivisionFor('shelf').kind, 'shelf');
  assert.equal(subdivisionFor('other').kind, 'section');
  assert.equal(subdivisionFor(undefined).kind, 'section');
});

test('only a binder page carries a real capacity', () => {
  assert.equal(subdivisionFor('binder').pockets, BINDER_POCKETS);
  for (const type of ['box', 'deckbox', 'shelf', 'other', 'deck-linked']) {
    assert.equal(
      subdivisionFor(type).pockets,
      null,
      `${type} must not claim a capacity nobody set`
    );
  }
});

test('a fill is a fraction only where the capacity is real', () => {
  assert.equal(describeFill(subdivisionFor('binder'), 4), '4 of 9 pockets used');
  assert.equal(describeFill(subdivisionFor('box'), 412), '412 cards');
  assert.equal(describeFill(subdivisionFor('box'), 1), '1 card');
  // The thing this rule exists to prevent.
  assert.ok(!describeFill(subdivisionFor('box'), 412).includes('%'));
  assert.ok(!describeCount(12).includes('%'));
});

test('a count says the count and nothing else', () => {
  assert.equal(describeCount(0), 'Empty');
  assert.equal(describeCount(1), '1 card');
  assert.equal(describeCount(12), '12 cards');
  assert.equal(describeCount(0, 'Nothing filed here yet'), 'Nothing filed here yet');
});

test('binder pages are numbered by where they are, not by what they were called', () => {
  const sub = subdivisionFor('binder');
  const pages = orderSlots([
    { id: 'b', name: 'Page 2', position: 1 },
    { id: 'a', name: 'Page 1', position: 0 },
    { id: 'c', name: 'Page 3', position: 2 },
  ]);
  assert.deepEqual(pages.map(p => p.id), ['a', 'b', 'c']);
  // Pull the first page out: the rest count up from one again.
  const afterRemoval = pages.slice(1);
  assert.equal(slotLabel(sub, afterRemoval[0], 0), 'Page 1');
  assert.equal(slotLabel(sub, afterRemoval[1], 1), 'Page 2');
});

test('a renamed page keeps its name and its number', () => {
  const sub = subdivisionFor('binder');
  assert.equal(slotLabel(sub, { id: 'a', name: 'Duals', position: 0 }, 0), 'Page 1: Duals');
});

test('a divider is called what the user wrote on it', () => {
  const sub = subdivisionFor('box');
  assert.equal(slotLabel(sub, { id: 'a', name: 'White', position: 0 }, 0), 'White');
  assert.equal(slotLabel(sub, { id: 'a', name: '   ', position: 3 }, 3), 'Divider 4');
});

test('cards with no slot are named, never hidden', () => {
  assert.equal(slotLabel(subdivisionFor('binder'), null, 0), 'Not on a page');
  assert.equal(slotLabel(subdivisionFor('box'), null, 0), 'Behind no divider');
  assert.equal(slotLabel(subdivisionFor('shelf'), null, 0), 'Not on a shelf');
});

test('the next one made is numbered from what is already there', () => {
  assert.equal(nextSlotName(subdivisionFor('binder'), 2), 'Page 3');
  assert.equal(nextSlotName(subdivisionFor('box'), 0), 'Divider 1');
  assert.equal(nextSlotName(subdivisionFor('shelf'), 1), 'Shelf 2');
});

test('slot counts add up copies, not rows', () => {
  const { bySlot, loose } = countBySlot([
    { slot_id: 'p1', qty: 3, pocket: null },
    { slot_id: 'p1', qty: 1, pocket: 2 },
    { slot_id: 'p2', qty: 4, pocket: null },
    { slot_id: null, qty: 7, pocket: null },
    { qty: 2 },
  ]);
  assert.equal(bySlot.get('p1'), 4);
  assert.equal(bySlot.get('p2'), 4);
  assert.equal(loose, 9);
});

test('a page knows which pockets are taken and which is next', () => {
  const items = [
    { id: 'i1', slot_id: 'p1', pocket: 1, qty: 1 },
    { id: 'i2', slot_id: 'p1', pocket: 3, qty: 1 },
    { id: 'i3', slot_id: 'p1', pocket: null, qty: 5 },
    { id: 'i4', slot_id: 'p2', pocket: 2, qty: 1 },
  ];
  const page = pocketMap(items, 'p1');
  assert.equal(page.size, 2);
  assert.equal(page.get(1)?.id, 'i1');
  assert.equal(page.get(3)?.id, 'i2');
  // A card filed to the page without a pocket does not occupy one.
  assert.equal(nextFreePocket(page.keys()), 2);
});

test('a full page has no next pocket', () => {
  assert.equal(nextFreePocket([1, 2, 3, 4, 5, 6, 7, 8, 9]), null);
  assert.equal(nextFreePocket([]), 1);
});
