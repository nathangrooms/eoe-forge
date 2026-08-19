/**
 * Playing a land, end to end, down the path the play page actually uses.
 *
 * The owner: *"Wouldnt even let me play a land."* That is the most basic action
 * in Magic and there was no test of any kind covering it — `moves.test.ts`
 * tests `planLandDrop` against a hand-built two-card state, which is not the
 * thing that broke. What broke was further out: the DECK had no lands in it, so
 * the opening hand had none either, so there was nothing on screen to press.
 *
 * So this test walks the same chain `/play` walks and nothing else:
 *
 *   buildTable(decks)            the table the lobby deals
 *     -> decisionFor(...)        the page's "does the player owe a decision"
 *     -> ViewerHand's own castability read (planLandDrop per hand card)
 *     -> CardInspector's own gate (`mine && isLand && zone === 'hand'`)
 *     -> planLandDrop(...)       the button's plan
 *     -> applyActions(...)       the dispatch
 *
 * Every one of those is the real function the real component calls. The
 * components themselves are `.tsx` and `node --test` cannot import them, which
 * is exactly why the gates they apply are asserted here against the same
 * helpers rather than restated: if `CardInspector` and this test disagree, one
 * of them is calling a function the other is not.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyActions,
  buildTable,
  isLand,
  planLandDrop,
  type GameState,
  type PlayCard,
  type PlayDeck,
  type PlayerId,
} from '../../lib/game/index.ts';
import { decisionFor, hasPlayableAction } from './turnFlow.ts';

/* -------------------------------------------------------------------------- */
/* A deck shaped like the ones `deckSource.ts` deals                          */
/* -------------------------------------------------------------------------- */

const FOREST: PlayCard = {
  cardId: 'forest',
  name: 'Forest',
  typeLine: 'Basic Land — Forest',
  cmc: 0,
  colorIdentity: ['G'],
  oracleText: '',
};

const GUILDGATE: PlayCard = {
  cardId: 'gate',
  name: 'Selesnya Guildgate',
  typeLine: 'Land — Gate',
  cmc: 0,
  colorIdentity: ['G', 'W'],
  oracleText: 'This land enters tapped.\n{T}: Add {G} or {W}.',
};

const BEARS: PlayCard = {
  cardId: 'bears',
  name: 'Grizzly Bears',
  typeLine: 'Creature — Bear',
  manaCost: '{1}{G}',
  cmc: 2,
  power: '2',
  toughness: '2',
  colorIdentity: ['G'],
  oracleText: '',
};

/** A deck with a real land ratio, the way a dealt one is meant to look. */
function deckOf(lands: PlayCard, spells: PlayCard, landCount = 38, spellCount = 61): PlayDeck {
  const cards: PlayCard[] = [];
  for (let i = 0; i < landCount; i++) cards.push({ ...lands });
  for (let i = 0; i < spellCount; i++) cards.push({ ...spells });
  return { id: 'd', name: 'Test deck', format: 'commander', cards, commanders: [], source: 'seeded' };
}

function tableOf(deck: PlayDeck, seed = 7): GameState {
  return buildTable({
    seed,
    now: 1,
    seats: [
      { deck, playerName: 'You', playerId: 'p1' },
      { deck, playerName: 'Bot', playerId: 'p2', isBot: true },
    ],
  }).state;
}

/** Exactly what `ViewerHand` asks of every card in the fan. */
function playableLandsInHand(state: GameState, playerId: PlayerId) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];
  return player.zones.hand
    .map(id => state.cards[id])
    .filter(card => !!card && isLand(card))
    .filter(card => planLandDrop(state, playerId, card.instanceId).ok);
}

/* -------------------------------------------------------------------------- */
/* The construction path                                                      */
/* -------------------------------------------------------------------------- */

test('a freshly dealt table gives every seat a real land count', () => {
  const state = tableOf(deckOf(FOREST, BEARS));

  for (const player of state.players) {
    const all = [...player.zones.library, ...player.zones.hand];
    const lands = all.filter(id => isLand(state.cards[id]));
    assert.equal(all.length, 99, `${player.id} was dealt ${all.length} cards, not 99`);
    assert.equal(lands.length, 38, `${player.id} holds ${lands.length} lands, not 38`);
  }
});

test('landsPlayedThisTurn is a number, not undefined, on a freshly created game', () => {
  /* Reported from a live probe as `undefined`, which would make the `>= 1`
     check below it read as false and mask a different failure. It is a number
     on this path; the test is here so a future construction path that forgets
     it fails loudly instead of quietly changing what a land drop means. */
  const state = tableOf(deckOf(FOREST, BEARS));
  for (const player of state.players) {
    assert.equal(typeof player.landsPlayedThisTurn, 'number', `${player.id}`);
    assert.equal(player.landsPlayedThisTurn, 0);
  }
});

/* -------------------------------------------------------------------------- */
/* The click path                                                             */
/* -------------------------------------------------------------------------- */

test('the player can play a land, end to end, through the surface path', () => {
  let state = tableOf(deckOf(FOREST, BEARS));

  /* 1. The page walks the turn to a stop. `decisionFor` is what stops it. */
  while (state.step !== 'precombat_main') {
    assert.equal(state.activePlayerId, 'p1', 'the walk left our own turn before the main phase');
    state = applyActions(state, [{ type: 'ADVANCE_STEP', at: 1 }]);
  }
  assert.equal(decisionFor(state, 'p1'), 'main', 'the page must stop in the main phase');
  assert.ok(hasPlayableAction(state, 'p1'), 'a hand with lands in it has a legal play');

  /* 2. The fan offers at least one land. This is the step that was failing on
        the live board: a landless deck offered none, so there was nothing to
        click and the bug read as "it would not let me". */
  const offered = playableLandsInHand(state, 'p1');
  assert.ok(offered.length > 0, 'the opening hand offered no playable land');

  const land = offered[0];

  /* 3. The inspector's own gate, restated with the same three reads it makes. */
  assert.equal(land.controllerId, 'p1', 'a card in your hand is yours to play');
  assert.equal(land.zone, 'hand');
  assert.ok(isLand(land));

  /* 4. The button's plan, and the dispatch. */
  const plan = planLandDrop(state, 'p1', land.instanceId);
  assert.ok(plan.ok, `planLandDrop refused: ${plan.reason}`);
  state = applyActions(state, plan.actions);

  /* 5. It is on the battlefield, it left the hand, and it counted. */
  assert.equal(state.cards[land.instanceId].zone, 'battlefield');
  const me = state.players.find(p => p.id === 'p1')!;
  assert.equal(me.zones.hand.indexOf(land.instanceId), -1, 'the land is still in hand');
  assert.equal(me.landsPlayedThisTurn, 1);

  /* 6. And the second land drop of the turn is refused, with a reason. */
  const second = playableLandsInHand(state, 'p1');
  assert.equal(second.length, 0, 'a second land was still offered this turn');
  const remaining = me.zones.hand.map(id => state.cards[id]).find(card => isLand(card));
  if (remaining) {
    const refusal = planLandDrop(state, 'p1', remaining.instanceId);
    assert.equal(refusal.ok, false);
    assert.match(refusal.reason, /already played a land/i);
  }
});

test('a deck with no lands in it is the failure, and it is visible', () => {
  /* The exact shape of the live bug: a dealt deck of 99 spells. Nothing here
     throws — the engine is perfectly happy — which is why the guard has to live
     in `deckSource.ts` where the deck is built. This test pins the symptom so
     the difference between the two states is on the record. */
  const state = tableOf(deckOf(FOREST, BEARS, 0, 99));
  assert.equal(playableLandsInHand(state, 'p1').length, 0);
  assert.equal(decisionFor(state, 'p1'), null, 'nothing to do, so nothing stops the walk');
});

test('a land drop is refused off-turn, and says so', () => {
  const state = tableOf(deckOf(FOREST, BEARS));
  const opponentLand = state.players
    .find(p => p.id === 'p2')!
    .zones.hand.map(id => state.cards[id])
    .find(card => isLand(card));

  assert.ok(opponentLand, 'the bot was dealt no land either');
  const plan = planLandDrop(state, 'p2', opponentLand.instanceId);
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /your own turn/i);
});
