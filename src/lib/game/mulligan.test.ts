/**
 * The London mulligan, and the bot's own opening hand.
 *
 *   node --test --experimental-strip-types src/lib/game/mulligan.test.ts
 *
 * Owner: *"No way to mulligan the first hand."* `mulliganActions` existed and
 * had one caller, buried in a settings menu, and it implemented the Paris rule
 * — draw one fewer each time — which has not been how Magic works since 2019.
 * Both halves are pinned here: you always draw a full hand, and keeping costs
 * you one card to the bottom per mulligan taken.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyActions } from './rules.ts';
import {
  botBottomChoice,
  botMulliganActions,
  bottomActions,
  buildTable,
  cardsToBottom,
  mulliganActions,
  shouldBotMulligan,
  type PlayCard,
  type PlayDeck,
} from './setup.ts';
import type { GameState, PlayerId } from './types.ts';

const ME: PlayerId = 'p1';

function card(index: number, land: boolean): PlayCard {
  return land
    ? {
        cardId: `land${index}`,
        name: 'Forest',
        typeLine: 'Basic Land — Forest',
        manaCost: '',
        cmc: 0,
        colorIdentity: ['G'],
        oracleText: '({T}: Add {G}.)',
      }
    : {
        cardId: `spell${index}`,
        name: `Spell ${index}`,
        typeLine: 'Creature — Bear',
        manaCost: '{1}{G}',
        cmc: 2,
        power: '2',
        toughness: '2',
        colorIdentity: ['G'],
        oracleText: '',
      };
}

/**
 * A deck whose top cards are known.
 *
 * `buildTable` shuffles through the seeded reducer, so the opening hand cannot
 * be dictated by ordering the list. Every test below therefore asserts on
 * COUNTS and on where cards ended up, never on which specific card was drawn.
 */
function deck(landCount: number, spellCount: number): PlayDeck {
  const cards: PlayCard[] = [];
  for (let i = 0; i < landCount; i++) cards.push(card(i, true));
  for (let i = 0; i < spellCount; i++) cards.push(card(i, false));
  return {
    id: 'd',
    name: 'Test deck',
    format: 'commander',
    cards,
    commanders: [],
    source: 'seeded',
  };
}

function table(mine: PlayDeck, theirs = mine): { state: GameState; bots: PlayerId[] } {
  const built = buildTable({
    id: 't',
    seed: 3,
    now: 0,
    format: 'commander',
    seats: [
      { deck: mine, playerName: 'You', playerId: 'p1' },
      { deck: theirs, playerName: 'Bot', playerId: 'p2', isBot: true },
    ],
  });
  return { state: built.state, bots: built.botPlayerIds };
}

const handOf = (state: GameState, id: PlayerId) =>
  state.players.find(p => p.id === id)!.zones.hand;
const libraryOf = (state: GameState, id: PlayerId) =>
  state.players.find(p => p.id === id)!.zones.library;

/* -------------------------------------------------------------------------- */

test('a mulligan draws a full hand again, not one fewer', () => {
  const { state } = table(deck(40, 59));
  const opening = handOf(state, ME).length;
  assert.equal(opening, state.rules.startingHandSize);

  const after = applyActions(state, mulliganActions(state, ME, 1));
  assert.equal(
    handOf(after, ME).length,
    opening,
    'London: you always look at seven. The Paris rule dealt six here.'
  );
});

test('a second mulligan still draws a full hand', () => {
  const { state } = table(deck(40, 59));
  let next = applyActions(state, mulliganActions(state, ME, 1));
  next = applyActions(next, mulliganActions(next, ME, 2));
  assert.equal(handOf(next, ME).length, state.rules.startingHandSize);
});

test('the library is whole again after a mulligan', () => {
  const { state } = table(deck(40, 59));
  const before = handOf(state, ME).length + libraryOf(state, ME).length;
  const after = applyActions(state, mulliganActions(state, ME, 1));
  assert.equal(handOf(after, ME).length + libraryOf(after, ME).length, before);
});

test('keeping costs one card to the bottom per mulligan taken', () => {
  assert.equal(cardsToBottom(0, 7), 0);
  assert.equal(cardsToBottom(1, 7), 1);
  assert.equal(cardsToBottom(3, 7), 3);
  // Never more than the hand holds.
  assert.equal(cardsToBottom(9, 7), 7);
});

test('bottoming puts the chosen cards under the library, and only those', () => {
  const { state } = table(deck(40, 59));
  const hand = handOf(state, ME);
  const chosen = [hand[0], hand[3]];

  const after = applyActions(state, bottomActions(chosen, 1));
  assert.equal(handOf(after, ME).length, hand.length - 2);
  for (const id of chosen) {
    assert.equal(handOf(after, ME).includes(id), false, 'left the hand');
    assert.equal(after.cards[id].zone, 'library', 'and went to the library');
  }
  const library = libraryOf(after, ME);
  assert.deepEqual(
    library.slice(-2),
    chosen,
    'the BOTTOM of the library, in the order chosen, not the top'
  );
});

/* -------------------------------------------------------------------------- */
/* The bot's own hand                                                         */
/* -------------------------------------------------------------------------- */

test('the bot keeps a hand with two to five lands and ships anything else', () => {
  // A deck of nothing but spells can only ever deal a nought-land hand.
  const { state: noLands } = table(deck(0, 99));
  assert.equal(shouldBotMulligan(noLands, ME, 0), true, 'nought lands is a mulligan');

  // A deck of nothing but lands can only ever deal a seven-land hand.
  const { state: allLands } = table(deck(99, 0));
  assert.equal(shouldBotMulligan(allLands, ME, 0), true, 'seven lands is a mulligan too');
});

test('the bot stops mulliganing after two, whatever it drew', () => {
  const { state } = table(deck(0, 99));
  assert.equal(shouldBotMulligan(state, ME, 2), false);
  assert.equal(shouldBotMulligan(state, ME, 5), false);
});

test('the bot bottoms spare lands before it bottoms spells', () => {
  const { state } = table(deck(99, 0));
  const chosen = botBottomChoice(state, ME, 2);
  assert.equal(chosen.length, 2);
  for (const id of chosen) {
    assert.match(state.cards[id].typeLine ?? '', /Land/);
  }
});

test('the bot never asks for more cards than it was told to bottom', () => {
  const { state } = table(deck(40, 59));
  assert.equal(botBottomChoice(state, ME, 0).length, 0);
  assert.equal(botBottomChoice(state, ME, 3).length, 3);
});

test('running the bots opening hands leaves every bot with a legal hand', () => {
  const { state, bots } = table(deck(0, 99));
  const after = applyActions(state, botMulliganActions(state, bots, 1));

  for (const id of bots) {
    const hand = handOf(after, id).length;
    // Two mulligans at most, so seven minus at most two.
    assert.ok(
      hand >= state.rules.startingHandSize - 2 && hand <= state.rules.startingHandSize,
      `bot ${id} kept ${hand} cards`
    );
  }
  assert.equal(
    handOf(after, ME).length,
    state.rules.startingHandSize,
    'and the human seat is untouched, because it has not decided yet'
  );
});

test('a bot that keeps its first hand costs nothing', () => {
  // Roughly half lands: whatever the shuffle deals, the band is wide enough
  // that this deck can keep, and a keep with no mulligans bottoms nothing.
  const { state, bots } = table(deck(45, 54));
  const actions = botMulliganActions(state, bots, 1);
  if (!shouldBotMulligan(state, bots[0], 0)) {
    assert.deepEqual(actions, [], 'no mulligan means no actions at all');
  }
});
