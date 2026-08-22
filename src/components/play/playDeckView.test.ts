/**
 * What a deck tile says, and which modes will deal it.
 *
 * The rule under test that is easiest to get wrong: an empty deck is a seeded
 * deck everywhere except online, where the database refuses the seat. Getting
 * that backwards either wastes nine of this account's decks or lets somebody
 * sit down opposite a person with nothing to play.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cardCountLine,
  deckIntent,
  deckPlayability,
  faceRank,
  firstChoosableDeck,
  formatLabel,
  reconcileDeck,
  usdPrice,
  type PlayableDeck,
} from './playDeckView.ts';

const deck = (over: Partial<PlayableDeck> = {}): PlayableDeck => ({
  id: 'd1',
  name: 'Atraxa',
  format: 'commander',
  formatLabel: 'Commander',
  colors: ['W', 'U', 'B', 'G'],
  cardCount: 100,
  commanderName: 'Atraxa, Praetors Voice',
  faceCard: null,
  power: null,
  ...over,
});

test('a deck with cards is playable everywhere, and says nothing extra', () => {
  for (const mode of ['online', 'bots', 'goldfish', 'playtest'] as const) {
    const verdict = deckPlayability(deck(), mode);
    assert.equal(verdict.playable, true, mode);
    assert.equal(verdict.note, null, mode);
  }
});

test('an empty deck is refused online, and says why on its own tile', () => {
  const verdict = deckPlayability(deck({ cardCount: 0 }), 'online');
  assert.equal(verdict.playable, false);
  assert.equal(
    verdict.note,
    'No cards in it yet. Online needs a real list, because somebody is sitting opposite.'
  );
});

test('an empty deck becomes a seeded one in the three offline modes', () => {
  for (const mode of ['bots', 'goldfish', 'playtest'] as const) {
    const verdict = deckPlayability(deck({ cardCount: 0 }), mode);
    assert.equal(verdict.playable, true, mode);
    assert.equal(
      verdict.note,
      'No cards in it yet, so a seeded commander deck stands in for this seat.',
      mode
    );
  }
});

test('the card count is words, and one card is not "1 cards"', () => {
  assert.equal(cardCountLine(deck({ cardCount: 0 })), 'No cards recorded');
  assert.equal(cardCountLine(deck({ cardCount: 1 })), '1 card');
  assert.equal(cardCountLine(deck({ cardCount: 100 })), '100 cards');
});

test('what a deck does comes from the engine, or it is not said at all', () => {
  assert.equal(deckIntent(deck()), null);
  assert.equal(
    deckIntent(
      deck({
        power: { score: 7, band: 'high', bracket: 4, drivers: ['Speed: turn 4 kill', 'Tutors: 9'] },
      })
    ),
    'Speed: turn 4 kill. Tutors: 9'
  );
});

test('online skips past an empty deck when choosing a default, and the others do not', () => {
  const decks = [deck({ id: 'empty', cardCount: 0 }), deck({ id: 'full' })];
  assert.equal(firstChoosableDeck(decks, 'online')?.id, 'full');
  assert.equal(firstChoosableDeck(decks, 'bots')?.id, 'empty');
  assert.equal(firstChoosableDeck([], 'bots'), null);
});

test('a chosen deck survives a mode change when the new mode can deal it', () => {
  const decks = [deck({ id: 'empty', cardCount: 0 }), deck({ id: 'full' })];
  assert.equal(reconcileDeck(decks, 'online', 'full'), 'full');
  assert.equal(reconcileDeck(decks, 'goldfish', 'empty'), 'empty');
});

test('a chosen deck the new mode cannot deal moves rather than failing later', () => {
  const decks = [deck({ id: 'empty', cardCount: 0 }), deck({ id: 'full' })];
  assert.equal(reconcileDeck(decks, 'online', 'empty'), 'full');
});

test('a deck id that is no longer in the list does not stick', () => {
  const decks = [deck({ id: 'full' })];
  assert.equal(reconcileDeck(decks, 'bots', 'deleted'), 'full');
  assert.equal(reconcileDeck([], 'bots', 'deleted'), null);
});

test('the stand-in face prefers a legend, then a creature, then anything', () => {
  assert.equal(faceRank('Legendary Creature - Angel', true), 3);
  assert.equal(faceRank('Creature - Bear', false), 2);
  assert.equal(faceRank('Planeswalker - Jace', false), 2);
  assert.equal(faceRank('Instant', false), 1);
  assert.equal(faceRank(null, null), 1);
});

test('a price that is not a price is zero, not NaN', () => {
  assert.equal(usdPrice({ usd: '4.50' }), 4.5);
  assert.equal(usdPrice('{"usd":"2.00"}'), 2);
  assert.equal(usdPrice('not json'), 0);
  assert.equal(usdPrice(null), 0);
  assert.equal(usdPrice({ usd: null }), 0);
});

test('a deck with no saved format reads as Custom rather than as nothing', () => {
  assert.equal(formatLabel('commander'), 'Commander');
  assert.equal(formatLabel(''), 'Custom');
  assert.equal(formatLabel(null), 'Custom');
});
