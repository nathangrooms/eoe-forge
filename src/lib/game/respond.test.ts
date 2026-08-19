/**
 * Priority, and the counterspell that could never be cast.
 *
 *   node --test --experimental-strip-types src/lib/game/respond.test.ts
 *
 * Owner: *"no opportunity to use instants to counter a spell either?"* and
 * *"Counter spells dont work at all, should detect if you can counter a cast
 * from opponent."*
 *
 * `stack.test.ts` already proves the stack resolves, fizzles, counters and
 * passes priority correctly, and it did before any of this was written. What it
 * cannot prove is that a game ever REACHES those code paths: every one of its
 * tests builds a `CAST_SPELL` by hand, and until now nothing outside the engine
 * ever did. This file tests the other half — given a board, does the surface
 * offer the response, does the bot take it, and does the round terminate.
 *
 * The last of those is the one that would hurt most if it broke. A spell left on
 * a stack whose priority round nobody completes is a hung game, which is worse
 * than the immediate cast it replaced.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyActions, createGame } from './rules.ts';
import { planCastFromHand } from './moves.ts';
import { nextBotMove } from './bot.ts';
import { stackOf, stackTop } from './stack.ts';
import {
  castTiming,
  countersSpells,
  hasResponse,
  isInstantSpeed,
  responseOptions,
  spellToAnswer,
} from './respond.ts';
import type { CardInstance, GameState, ManaColor, PlayerId, Zone } from './types.ts';

const ME: PlayerId = 'p1';
const THEM: PlayerId = 'p2';

function put(
  state: GameState,
  owner: PlayerId,
  zone: Zone,
  card: Partial<CardInstance> & { instanceId: string; name: string }
): GameState {
  return addCard(
    state,
    {
      cardId: card.instanceId,
      ownerId: owner,
      controllerId: owner,
      typeLine: 'Creature — Bear',
      counters: {},
      tapped: false,
      summoningSick: false,
      oracleText: '',
      ...card,
    },
    zone
  );
}

function island(state: GameState, owner: PlayerId, id: string): GameState {
  return put(state, owner, 'battlefield', {
    instanceId: id,
    name: 'Island',
    typeLine: 'Basic Land — Island',
    manaCost: '',
    cmc: 0,
    colorIdentity: ['U'],
    oracleText: '({T}: Add {U}.)',
  });
}

const COUNTERSPELL = {
  name: 'Counterspell',
  typeLine: 'Instant',
  manaCost: '{U}{U}',
  cmc: 2,
  colorIdentity: ['U'] as ManaColor[],
  oracleText: 'Counter target spell.',
};

const BEAR = {
  name: 'Grizzly Bears',
  typeLine: 'Creature — Bear',
  manaCost: '{1}{G}',
  cmc: 2,
  power: '2',
  toughness: '2',
  colorIdentity: ['G'] as ManaColor[],
  oracleText: '',
};

/** A board where p2 is about to cast a creature and p1 may or may not answer. */
function board(options: { myLands?: number; myCounters?: number } = {}): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    players: [
      { id: 'p1', name: 'You' },
      { id: 'p2', name: 'Bot' },
    ],
  });

  for (let i = 0; i < (options.myLands ?? 2); i++) state = island(state, ME, `p1-land${i}`);
  for (let i = 0; i < (options.myCounters ?? 1); i++) {
    state = put(state, ME, 'hand', { instanceId: `p1-cs${i}`, ...COUNTERSPELL });
  }

  for (let i = 0; i < 3; i++) state = island(state, THEM, `p2-land${i}`);
  state = put(state, THEM, 'hand', {
    instanceId: 'p2-drake',
    name: 'Wind Drake',
    typeLine: 'Creature — Drake',
    manaCost: '{2}{U}',
    cmc: 3,
    power: '2',
    toughness: '2',
    colorIdentity: ['U'],
    keywords: ['flying'],
  });

  return state;
}

/** p2 announces its creature onto the stack. */
function theyCast(state: GameState): GameState {
  const plan = planCastFromHand(state, THEM, 'p2-drake', { viaStack: true, at: 1 });
  assert.equal(plan.ok, true, plan.reason);
  return applyActions(state, plan.actions);
}

/* -------------------------------------------------------------------------- */
/* Reading a card                                                             */
/* -------------------------------------------------------------------------- */

test('an instant is instant speed and a creature is not', () => {
  const state = board();
  assert.equal(isInstantSpeed(state.cards['p1-cs0']), true);
  assert.equal(isInstantSpeed(state.cards['p2-drake']), false);
});

test('flash makes a creature instant speed', () => {
  let state = board();
  state = put(state, ME, 'hand', {
    instanceId: 'flashy',
    name: 'Ambush Viper',
    typeLine: 'Creature — Snake',
    oracleText: 'Flash\nDeathtouch',
  });
  assert.equal(isInstantSpeed(state.cards.flashy), true);
});

test('countering is read from the card, not from its name', () => {
  const state = board();
  assert.equal(countersSpells(state.cards['p1-cs0']), true);
  assert.equal(countersSpells(state.cards['p2-drake']), false);
});

/* -------------------------------------------------------------------------- */
/* The two-part test: is there a question worth asking                        */
/* -------------------------------------------------------------------------- */

test('a cast puts the spell on the stack rather than into play', () => {
  const state = theyCast(board());
  assert.equal(stackOf(state).length, 1);
  assert.equal(stackTop(state)?.name, 'Wind Drake');
  assert.equal(state.cards['p2-drake'].zone, 'stack');
  assert.equal(state.priorityPlayerId, THEM, 'the caster holds priority first');
});

test('the player is offered a response when they hold one and can pay', () => {
  let state = theyCast(board({ myLands: 2, myCounters: 1 }));
  // The caster passes; priority reaches the other seat.
  state = applyActions(state, [{ type: 'PASS_PRIORITY', playerId: THEM, at: 2 }]);

  assert.equal(state.priorityPlayerId, ME);
  assert.equal(spellToAnswer(state, ME)?.name, 'Wind Drake');
  const options = responseOptions(state, ME);
  assert.equal(options.length, 1);
  assert.equal(options[0].counters, true);
  assert.equal(hasResponse(state, ME), true);
});

test('no prompt when the answer is in hand but cannot be paid for', () => {
  let state = theyCast(board({ myLands: 1, myCounters: 1 }));
  state = applyActions(state, [{ type: 'PASS_PRIORITY', playerId: THEM, at: 2 }]);
  assert.equal(
    hasResponse(state, ME),
    false,
    'one Island does not cast Counterspell, so there is nothing to ask'
  );
});

test('no prompt when the hand holds nothing playable at instant speed', () => {
  let state = board({ myLands: 5, myCounters: 0 });
  state = put(state, ME, 'hand', { instanceId: 'p1-bear', ...BEAR });
  state = theyCast(state);
  state = applyActions(state, [{ type: 'PASS_PRIORITY', playerId: THEM, at: 2 }]);
  assert.equal(hasResponse(state, ME), false, 'a creature is not a response');
});

test('no prompt for your own spell', () => {
  let state = board({ myLands: 4, myCounters: 1 });
  state = put(state, ME, 'hand', {
    instanceId: 'p1-drake',
    name: 'Wind Drake',
    typeLine: 'Creature — Drake',
    manaCost: '{2}{U}',
    cmc: 3,
    colorIdentity: ['U'],
  });
  const plan = planCastFromHand(state, ME, 'p1-drake', { viaStack: true, at: 1 });
  assert.equal(plan.ok, true, plan.reason);
  state = applyActions(state, plan.actions);

  assert.equal(state.priorityPlayerId, ME, 'the caster holds priority');
  assert.equal(
    spellToAnswer(state, ME),
    null,
    'holding priority to answer your own spell is legal Magic and is not modelled'
  );
  assert.equal(hasResponse(state, ME), false, 'so there is no prompt');
});

/* -------------------------------------------------------------------------- */
/* The counter actually counters                                              */
/* -------------------------------------------------------------------------- */

test('countering sends the spell to the graveyard and never to the battlefield', () => {
  let state = theyCast(board({ myLands: 2, myCounters: 1 }));
  state = applyActions(state, [{ type: 'PASS_PRIORITY', playerId: THEM, at: 2 }]);

  const target = spellToAnswer(state, ME);
  assert.ok(target);
  const plan = planCastFromHand(state, ME, 'p1-cs0', {
    viaStack: true,
    counterStackId: target.stackId,
    at: 3,
  });
  assert.equal(plan.ok, true, plan.reason);
  state = applyActions(state, plan.actions);
  assert.equal(stackOf(state).length, 2, 'the counter is on top of the spell');

  // Everybody passes twice: once to resolve the counter, once for the empty
  // stack that leaves behind.
  state = applyActions(state, [
    { type: 'PASS_PRIORITY', playerId: ME, at: 4 },
    { type: 'PASS_PRIORITY', playerId: THEM, at: 5 },
  ]);

  assert.equal(
    state.cards['p2-drake'].zone,
    'graveyard',
    'a countered spell goes to the graveyard, not into play'
  );
  assert.equal(state.cards['p1-cs0'].zone, 'graveyard', 'and so does the counterspell');
  assert.equal(stackOf(state).length, 0);
});

test('an uncountered spell resolves onto the battlefield', () => {
  let state = theyCast(board({ myLands: 2, myCounters: 0 }));
  state = applyActions(state, [
    { type: 'PASS_PRIORITY', playerId: THEM, at: 2 },
    { type: 'PASS_PRIORITY', playerId: ME, at: 3 },
  ]);
  assert.equal(state.cards['p2-drake'].zone, 'battlefield');
  assert.equal(stackOf(state).length, 0);
});

/* -------------------------------------------------------------------------- */
/* The bot                                                                    */
/* -------------------------------------------------------------------------- */

test('the bot counters when it is holding an answer it can pay for', () => {
  // Mirror of the board above: the human casts, the bot answers.
  let state = createGame({
    mode: 'full',
    format: 'commander',
    players: [
      { id: 'p1', name: 'You' },
      { id: 'p2', name: 'Bot' },
    ],
  });
  for (let i = 0; i < 3; i++) state = island(state, ME, `p1-land${i}`);
  for (let i = 0; i < 2; i++) state = island(state, THEM, `p2-land${i}`);
  state = put(state, THEM, 'hand', { instanceId: 'p2-cs', ...COUNTERSPELL });
  state = put(state, ME, 'hand', {
    instanceId: 'p1-drake',
    name: 'Wind Drake',
    typeLine: 'Creature — Drake',
    manaCost: '{2}{U}',
    cmc: 3,
    colorIdentity: ['U'],
  });

  const cast = planCastFromHand(state, ME, 'p1-drake', { viaStack: true, at: 1 });
  assert.equal(cast.ok, true, cast.reason);
  state = applyActions(state, cast.actions);
  state = applyActions(state, [{ type: 'PASS_PRIORITY', playerId: ME, at: 2 }]);

  const move = nextBotMove(state, THEM, { useStack: true, at: 3 });
  assert.ok(move, 'the bot must have something to say while a spell is on the stack');
  assert.match(move.note, /Counters/);

  state = applyActions(state, move.actions);
  state = applyActions(state, [
    { type: 'PASS_PRIORITY', playerId: THEM, at: 4 },
    { type: 'PASS_PRIORITY', playerId: ME, at: 5 },
  ]);
  assert.equal(state.cards['p1-drake'].zone, 'graveyard');
});

test('the bot passes rather than freezing when it holds nothing', () => {
  let state = theyCast(board({ myLands: 2, myCounters: 0 }));
  const move = nextBotMove(state, THEM, { useStack: true, at: 2 });
  assert.ok(move);
  assert.deepEqual(
    move.actions.map(action => action.type),
    ['PASS_PRIORITY'],
    'a bot with no answer must still pass, or the stack never resolves'
  );
});

test('a bot without priority says nothing, so the human is not raced', () => {
  let state = theyCast(board({ myLands: 2, myCounters: 1 }));
  state = applyActions(state, [{ type: 'PASS_PRIORITY', playerId: THEM, at: 2 }]);
  assert.equal(state.priorityPlayerId, ME);
  assert.equal(nextBotMove(state, THEM, { useStack: true, at: 3 }), null);
});

/* -------------------------------------------------------------------------- */
/* Termination                                                                */
/* -------------------------------------------------------------------------- */

test('a priority round always ends', () => {
  let state = theyCast(board({ myLands: 2, myCounters: 1 }));
  for (let i = 0; i < 12 && stackOf(state).length > 0; i++) {
    state = applyActions(state, [
      { type: 'PASS_PRIORITY', playerId: state.priorityPlayerId, at: 10 + i },
    ]);
  }
  assert.equal(stackOf(state).length, 0, 'passing in turn must always empty the stack');
});

/* -------------------------------------------------------------------------- */
/* WHEN, not just whether                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The rule that was missing entirely, and it was missing at the surface rather
 * than here: `planCastFromHand` never checked the step, and neither did the
 * thing that draws the buttons. Measured by playing `/play` on 2026-08-19, the
 * centre preview offered Cast on a sorcery-speed creature on six out of six
 * opponent steps, and pressing it resolved the creature onto the battlefield.
 */

/** p1's own precombat main, empty stack — the one moment a creature is legal. */
function myMain(state: GameState): GameState {
  return { ...state, activePlayerId: ME, step: 'precombat_main', priorityPlayerId: ME };
}

test('a creature is castable in your own main phase with an empty stack', () => {
  const state = myMain(board());
  assert.equal(castTiming(state, ME, state.cards['p2-drake']).ok, true);
});

test('a creature is refused on every step of your own turn but the two mains', () => {
  const base = myMain(board());
  for (const step of ['untap', 'upkeep', 'draw', 'begin_combat', 'declare_attackers',
    'declare_blockers', 'combat_damage', 'end_combat', 'end', 'cleanup'] as const) {
    const verdict = castTiming({ ...base, step }, ME, base.cards['p2-drake']);
    assert.equal(verdict.ok, false, `${step} let a creature through`);
    assert.match(verdict.reason, /main phase/);
  }
  assert.equal(castTiming({ ...base, step: 'postcombat_main' }, ME, base.cards['p2-drake']).ok, true);
});

test('a creature is refused on somebody else\'s turn, which is what /play offered', () => {
  const base = board();
  for (const step of ['untap', 'upkeep', 'draw', 'precombat_main'] as const) {
    const state = { ...base, activePlayerId: THEM, step, priorityPlayerId: ME };
    const verdict = castTiming(state, ME, base.cards['p2-drake']);
    assert.equal(verdict.ok, false, `${step} let a creature through on their turn`);
    assert.match(verdict.reason, /not your turn/);
  }
});

test('an instant is castable on their turn, and a creature with flash is too', () => {
  let base = board();
  base = put(base, ME, 'hand', {
    instanceId: 'viper',
    name: 'Ambush Viper',
    typeLine: 'Creature — Snake',
    oracleText: 'Flash\nDeathtouch',
  });
  const state = { ...base, activePlayerId: THEM, step: 'upkeep' as const, priorityPlayerId: ME };
  assert.equal(castTiming(state, ME, state.cards['p1-cs0']).ok, true);
  assert.equal(castTiming(state, ME, state.cards.viper).ok, true);
});

test('a creature is refused while anything is on the stack, an instant is not', () => {
  let state = theyCast(myMain(board()));
  state = applyActions(state, [{ type: 'PASS_PRIORITY', playerId: THEM, at: 2 }]);
  assert.equal(state.priorityPlayerId, ME);

  const creature = castTiming(state, ME, state.cards['p1-cs0']);
  assert.equal(creature.ok, true, 'the counterspell itself must stay castable');

  state = put(state, ME, 'hand', { instanceId: 'bear', ...BEAR });
  const sorcerySpeed = castTiming(state, ME, state.cards.bear);
  assert.equal(sorcerySpeed.ok, false);
  assert.match(sorcerySpeed.reason, /on the stack/);
});

test('nothing is castable without priority while the stack is loaded', () => {
  const state = theyCast(myMain(board()));
  assert.equal(state.priorityPlayerId, THEM, 'the caster holds it');
  const verdict = castTiming(state, ME, state.cards['p1-cs0']);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /priority/);
});

test('a finished game is castable in no sense at all', () => {
  const state = { ...myMain(board()), status: 'complete' as const };
  assert.equal(castTiming(state, ME, state.cards['p2-drake']).ok, false);
});
