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

import { addCard, applyActionTraced, applyActions, createGame } from './rules.ts';
import { planCastFromHand } from './moves.ts';
import { nextBotMove } from './bot.ts';
import { stackOf, stackTop } from './stack.ts';
import {
  abilityResponses,
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

/* -------------------------------------------------------------------------- *
 * What the engine ran, which is not what anybody proposed
 * -------------------------------------------------------------------------- */

/**
 * `applyActionTraced` exists because the playtest harness was reading its
 * findings off the action a bot PROPOSED, and reported "a spell was countered:
 * 0 times" over twenty games in which three spells were countered.
 *
 * Nobody ever proposes a `COUNTER_SPELL`. A player casts a counterspell, the
 * table passes, the counterspell resolves, and the engine derives the counter
 * inside that last pass. These two tests are the ratchet on that: one proves
 * the nested action is visible, the other proves the trace does not change the
 * game it is watching.
 */
test('the trace sees a COUNTER_SPELL nobody proposed', () => {
  let state = theyCast(board({ myLands: 2, myCounters: 1 }));
  const answering = stackTop(state);
  assert.ok(answering, 'nothing to answer');

  state = applyActions(state, [{ type: 'PASS_PRIORITY', playerId: THEM, at: 2 }]);
  const counter = planCastFromHand(state, ME, 'p1-cs0', {
    viaStack: true,
    counterStackId: answering.stackId,
    at: 3,
  });
  assert.equal(counter.ok, true, counter.reason);
  state = applyActions(state, counter.actions);

  /* One priority round finishes it. The LAST pass is the only action anybody
     proposes, and everything the counter does hangs off it. */
  state = applyActions(state, [{ type: 'PASS_PRIORITY', playerId: ME, at: 4 }]);
  const last = applyActionTraced(state, { type: 'PASS_PRIORITY', playerId: THEM, at: 5 });

  const types = last.applied.map(action => action.type);
  assert.equal(types[0], 'PASS_PRIORITY', 'the proposed action comes first');
  assert.ok(
    types.includes('COUNTER_SPELL'),
    `no COUNTER_SPELL in what the engine ran: ${types.join(', ')}`
  );
  assert.ok(types.includes('RESOLVE_STACK'), 'the counterspell itself never resolved');
  assert.equal(stackOf(last.state).length, 0, 'the stack did not empty');
  assert.equal(last.state.cards['p2-drake'].zone, 'graveyard');

  // And the countered card is not in the trace as something that resolved: it
  // was moved by the counter, which is the distinction the harness needs.
  assert.ok(
    !last.applied.some(action => action.type === 'PLAY' && action.instanceId === 'p2-drake'),
    'a countered spell must never be played onto the battlefield'
  );
});

test('tracing an action changes nothing about the action', () => {
  const state = theyCast(board({ myLands: 2, myCounters: 1 }));
  const pass = { type: 'PASS_PRIORITY' as const, playerId: THEM, at: 2 };

  const plain = applyActions(state, [pass]);
  const traced = applyActionTraced(state, pass);

  assert.deepEqual(traced.state, plain, 'a traced apply produced a different state');
  assert.equal(traced.state.version, plain.version);
  assert.equal(traced.state.log.length, plain.log.length);
});

test('a refused action traces to nothing at all', () => {
  const state = board();
  // p2 does not hold priority, so this is refused and the state comes straight
  // back. An empty trace is the cheap way to ask "did anything happen".
  const traced = applyActionTraced(state, {
    type: 'COUNTER_SPELL',
    stackId: 'no-such-object',
    at: 1,
  });
  assert.equal(traced.state, state, 'a refused action must return the same reference');
  assert.deepEqual(traced.applied, []);
});

/* -------------------------------------------------------------------------- *
 * A bot's spell is an object the table can answer
 * -------------------------------------------------------------------------- */

/**
 * The measurement these four tests are the ratchet on.
 *
 * Twenty recorded four-seat games, seeds 9000 to 9019, with the bot casting
 * straight to the destination: 3 spells reached the stack in the whole run, and
 * all three were counterspells cast from the one branch that asked for the
 * stack by name. Nothing a bot cast for its own text was ever an object anybody
 * could respond to. The same twenty seeds with the stack on put 872 spells
 * there.
 *
 * `bot.ts` now casts through the stack unless a caller says otherwise, so the
 * question each of these asks is whether that survived.
 */

/** p2's own main phase, holding priority, with mana up. */
function theirMain(state: GameState): GameState {
  return {
    ...state,
    activePlayerId: THEM,
    priorityPlayerId: THEM,
    step: 'precombat_main',
  };
}

test('a bot asked for nothing in particular casts onto the stack', () => {
  const state = theirMain(board());

  const move = nextBotMove(state, THEM, { at: 1 });
  assert.ok(move, 'the bot had no move on its own main phase with a castable creature');
  assert.ok(
    move.actions.some(action => action.type === 'CAST_SPELL'),
    `the bot did not announce anything: ${move.actions.map(a => a.type).join(', ')}`
  );
  assert.ok(
    !move.actions.some(action => action.type === 'PLAY' && action.instanceId === 'p2-drake'),
    'the creature went straight into play, so nobody could have answered it'
  );

  const after = applyActions(state, move.actions);
  assert.equal(after.cards['p2-drake'].zone, 'stack');
  assert.equal(stackOf(after).length, 1);
  assert.equal(
    spellToAnswer(after, ME),
    null,
    'the caster holds priority first, so the other seat is not asked yet'
  );

  const passed = applyActions(after, [{ type: 'PASS_PRIORITY', playerId: THEM, at: 2 }]);
  assert.equal(
    spellToAnswer(passed, ME)?.name,
    'Wind Drake',
    'the other seat was never offered the spell'
  );
});

test('a land drop is not a spell and never touches the stack', () => {
  let state = theirMain(board());
  state = put(state, THEM, 'hand', {
    instanceId: 'p2-island-hand',
    name: 'Island',
    typeLine: 'Basic Land — Island',
    manaCost: '',
    cmc: 0,
    colorIdentity: ['U'],
    oracleText: '({T}: Add {U}.)',
  });

  /* CR 305.1: playing a land uses no stack and cannot be responded to. The land
     drop is taken before the cast on a precombat main, so this is the move. */
  const move = nextBotMove(state, THEM, { at: 1 });
  assert.ok(move);
  assert.match(move.note, /Plays Island/);
  assert.deepEqual(
    move.actions.map(action => action.type),
    ['PLAY'],
    'a land drop must be one PLAY and nothing else'
  );

  const after = applyActions(state, move.actions);
  assert.equal(stackOf(after).length, 0, 'a land reached the stack');
  assert.equal(after.cards['p2-island-hand'].zone, 'battlefield');
});

test('useStack false still casts straight into play, which is what /simulate wants', () => {
  const state = theirMain(board());

  const move = nextBotMove(state, THEM, { useStack: false, at: 1 });
  assert.ok(move);
  assert.ok(
    move.actions.some(action => action.type === 'PLAY' && action.instanceId === 'p2-drake'),
    'the opt-out no longer opts out'
  );
  assert.ok(!move.actions.some(action => action.type === 'CAST_SPELL'));

  const after = applyActions(state, move.actions);
  assert.equal(stackOf(after).length, 0);
  assert.equal(after.cards['p2-drake'].zone, 'battlefield');
});

test('two bots cast, pass and resolve without either of them stalling', () => {
  /*
   * The failure mode this whole change had to be designed against: a bot that
   * will not pass priority freezes the table, and the playtest harness records
   * that as a stalled game rather than a bug.
   *
   * So this drives BOTH seats off `nextBotMove` alone, with nothing else
   * pushing the game along, and requires that the spell announced at the start
   * has resolved by the end.
   */
  let state = theirMain(board({ myLands: 2, myCounters: 0 }));

  for (let step = 0; step < 20; step++) {
    if (state.cards['p2-drake'].zone === 'battlefield') break;
    const mover = [THEM, ME].find(seat => nextBotMove(state, seat, { at: step }) !== null);
    assert.ok(mover, `nobody had a move at step ${step}, which is the deadlock`);
    const move = nextBotMove(state, mover, { at: step });
    assert.ok(move);
    const next = applyActions(state, move.actions);
    assert.notEqual(next, state, `the move by ${mover} changed nothing: ${move.note}`);
    state = next;
  }

  assert.equal(
    state.cards['p2-drake'].zone,
    'battlefield',
    'the spell never resolved, so the priority round never completed'
  );
  assert.equal(stackOf(state).length, 0);
});

/* -------------------------------------------------------------------------- */
/* The whole point: a PERSON answering a BOT's spell                          */
/* -------------------------------------------------------------------------- */

/**
 * Every test above drives one half of this. `theyCast` builds the opponent's
 * cast by hand, and `the bot counters when it is holding an answer` has the bot
 * doing the answering. Neither is the thing the feature exists for, which is a
 * bot DECIDING to cast something and a person at the table answering it.
 *
 * That distinction is this project's own law: the engine supporting a thing and
 * a player reaching it are different claims. So this test uses the bot's own
 * decision for the cast and, for the answer, the exact calls `/play` makes:
 * `usePlayGame` iterates the bot seats only, `Play.tsx` reads `responseOptions`
 * to draw the buttons and `handleRespond` builds the counter with
 * `planCastFromHand(..., { viaStack: true, counterStackId })`.
 */
test('a person answers a spell the BOT decided to cast, through the calls /play makes', () => {
  let state = theirMain(board({ myLands: 2, myCounters: 1 }));

  /* 1. The bot's own decision puts something on the stack. `waitForPlayerIds`
        is what `usePlayGame` passes, so this is the shipping configuration. */
  const cast = nextBotMove(state, THEM, { at: 1, waitForPlayerIds: [ME] });
  assert.ok(cast, 'the bot had nothing to do holding a castable creature');
  assert.match(cast.note, /Casts Wind Drake/);
  state = applyActions(state, cast.actions);
  assert.equal(stackTop(state)?.name, 'Wind Drake');

  /* 2. The bot passes its own priority. Nothing else may move until it does. */
  const pass = nextBotMove(state, THEM, { at: 2, waitForPlayerIds: [ME] });
  assert.ok(pass);
  assert.deepEqual(
    pass.actions.map(action => action.type),
    ['PASS_PRIORITY']
  );
  state = applyActions(state, pass.actions);

  /* 3. The table is now waiting for the person, and says so. This is the
        negative half: a bot that kept moving here would resolve its own spell
        out from under the reader. */
  assert.equal(nextBotMove(state, THEM, { at: 3, waitForPlayerIds: [ME] }), null);
  assert.equal(state.priorityPlayerId, ME);

  const answering = spellToAnswer(state, ME);
  assert.ok(answering, 'the person was not offered the bot spell to answer');
  assert.equal(hasResponse(state, ME), true, 'no Respond control would be drawn');

  const offered = responseOptions(state, ME);
  assert.equal(offered.length, 1);
  assert.equal(offered[0].card.name, 'Counterspell');
  assert.equal(offered[0].counters, true, 'the counter was not offered as a counter');

  /* 4. `handleRespond`, line for line. */
  const answer = planCastFromHand(state, ME, offered[0].card.instanceId, {
    viaStack: true,
    counterStackId: answering.stackId,
    at: 4,
  });
  assert.equal(answer.ok, true, answer.reason);
  state = applyActions(state, answer.actions);

  /* 5. `flowActions` on a non-empty stack is one `PASS_PRIORITY`, and the bot
        seat passes through `nextBotMove` as it does in the app. */
  for (let step = 5; step < 20 && stackOf(state).length > 0; step++) {
    if (state.priorityPlayerId === ME) {
      state = applyActions(state, [{ type: 'PASS_PRIORITY', playerId: ME, at: step }]);
      continue;
    }
    const move = nextBotMove(state, THEM, { at: step, waitForPlayerIds: [ME] });
    assert.ok(move, `the bot froze at step ${step} with a spell on the stack`);
    state = applyActions(state, move.actions);
  }

  assert.equal(
    state.cards['p2-drake'].zone,
    'graveyard',
    'the bot spell resolved anyway, so the person could not actually answer it'
  );
  assert.equal(state.cards['p1-cs0'].zone, 'graveyard');
  assert.equal(stackOf(state).length, 0);
});

/* -------------------------------------------------------------------------- */
/* The battlefield half of a response                                         */
/* -------------------------------------------------------------------------- */

/**
 * THE WINDOW THE SURFACE USED TO PASS THROUGH.
 *
 * `responseOptions` scans the hand only, so `hasResponse` answered "can I
 * answer this from hand" while calling itself "is there a question worth
 * putting on screen". A seat whose only answer was a permanent got no stop at
 * all: `turnFlow.decisionFor` returned null and `/play` pressed PASS_PRIORITY
 * 130 ms later.
 *
 * Measured before the fix by `scripts/playtest/reach-census.ts` over six games
 * and 6,656 applied actions: 856 response windows, 29 answerable from hand, and
 * 10 more where the hand was empty of answers and the battlefield was not.
 */
test('a permanent with an instant-speed ability is a response, and mana is not', () => {
  // No counterspell in hand at all: the hand cannot be the reason this passes.
  let state = board({ myLands: 3, myCounters: 0 });
  state = put(state, ME, 'battlefield', {
    instanceId: 'p1-rod',
    name: 'Rod of Ruin',
    typeLine: 'Artifact',
    manaCost: '{4}',
    cmc: 4,
    oracleText: '{3}, {T}: Rod of Ruin deals 1 damage to any target.',
  });
  state = theyCast(state);
  // The caster keeps priority on announcement; it reaches this seat when they pass.
  state = applyActions(state, [{ type: 'PASS_PRIORITY', playerId: THEM, at: 2 }]);

  assert.ok(spellToAnswer(state, ME), 'their spell is on the stack and it is answerable');
  assert.equal(responseOptions(state, ME).length, 0, 'nothing in hand answers it');
  assert.deepEqual(
    abilityResponses(state, ME).map(card => card.name),
    ['Rod of Ruin']
  );
  assert.equal(hasResponse(state, ME), true, 'the surface must stop for this');
});

test('an untapped land alone is not a response', () => {
  /* Mana abilities are excluded on purpose. CR 605.3a keeps them off the stack,
     making mana is not answering anything, and counting them would stop the
     game on every cast anybody ever made — three Islands is every board. */
  let state = theyCast(board({ myLands: 3, myCounters: 0 }));
  state = applyActions(state, [{ type: 'PASS_PRIORITY', playerId: THEM, at: 2 }]);
  assert.ok(spellToAnswer(state, ME));
  assert.deepEqual(abilityResponses(state, ME), []);
  assert.equal(hasResponse(state, ME), false);
});
