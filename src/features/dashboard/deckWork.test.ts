/**
 * The dashboard tells you which of your decks are half-finished, and the
 * sentence it prints has to be true.
 *
 *   node --test --experimental-strip-types src/features/dashboard/deckWork.test.ts
 *
 * These cases are the nine real Commander decks on the only account in this
 * database that has any, plus the two shapes that would make the widget lie: a
 * format we hold no legal size for, and a sixty-card format where "no commander"
 * is correct rather than a fault.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deckWork, decksNeedingWork, requiredDeckSize } from './deckWork.ts';

const commander = (cardCount: number, hasCommander: boolean, scored = true) => ({
  format: 'commander',
  cardCount,
  hasCommander,
  scored,
});

test('an empty deck is reported as empty, not as ninety-nine cards short', () => {
  const work = deckWork(commander(0, false, false));
  assert.equal(work.issue, 'empty');
  assert.equal(work.label, 'No cards in it yet');
});

test('a Commander deck with no commander leads with that, not with the card count', () => {
  const work = deckWork(commander(67, false));
  assert.equal(work.issue, 'no-commander');
  assert.equal(work.label, 'No commander picked');
});

test('a short deck says how many cards short, and of what', () => {
  assert.equal(deckWork(commander(79, true)).label, '21 cards short of 100');
  assert.equal(deckWork(commander(99, true)).label, '1 card short of 100');
});

test('a full, scored deck has nothing wrong with it', () => {
  assert.equal(deckWork(commander(100, true)).issue, null);
});

test('a full deck that has never been scored says so', () => {
  assert.equal(deckWork(commander(100, true, false)).issue, 'unscored');
});

test('a sixty-card format is not asked for a commander', () => {
  const work = deckWork({ format: 'modern', cardCount: 60, hasCommander: false, scored: true });
  assert.equal(work.issue, null);
});

test('an unknown format is never called short, because we hold no legal size for it', () => {
  assert.equal(requiredDeckSize('gladiator'), null);
  const work = deckWork({ format: 'gladiator', cardCount: 12, hasCommander: false, scored: true });
  assert.equal(work.issue, null);
});

test('an unknown format with no cards is still empty', () => {
  const work = deckWork({ format: 'gladiator', cardCount: 0, hasCommander: false, scored: true });
  assert.equal(work.issue, 'empty');
});

test('the list leads with the deck closest to finished, and unstarted decks last', () => {
  // The real account's nine decks, in the order the database returns them.
  const decks = [
    { id: 'atraxa', ...commander(79, true) },
    { id: 'angels', ...commander(67, false) },
    { id: 'edgar', ...commander(86, true) },
    { id: 'test', ...commander(1, true) },
    { id: 'superfriends', ...commander(100, true) },
    { id: 'vondom2', ...commander(0, false, false) },
    { id: 'vondam', ...commander(0, false, false) },
    { id: 'cats', ...commander(64, true) },
    { id: 'vondam-full', ...commander(100, true) },
  ];

  // The hook attaches `work` when it loads the rows, so the test does too.
  const ranked = decksNeedingWork(decks.map(deck => ({ ...deck, work: deckWork(deck) })));

  // The two finished decks drop out entirely.
  assert.equal(ranked.length, 7);
  assert.deepEqual(
    ranked.map(d => d.id),
    ['edgar', 'atraxa', 'cats', 'test', 'angels', 'vondom2', 'vondam']
  );
  assert.equal(ranked[0].work.label, '14 cards short of 100');
  assert.equal(ranked[4].work.label, 'No commander picked');
  assert.equal(ranked[5].work.label, 'No cards in it yet');
});
