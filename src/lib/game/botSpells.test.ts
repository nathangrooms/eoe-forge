/**
 * The bot casting instants and sorceries, and knowing when.
 *
 *   node --test --experimental-strip-types src/lib/game/botSpells.test.ts
 *
 * Owner: *"bots have all access and smart play"*.
 *
 * Twenty recorded commander games measured the gap: 650 instants and sorceries
 * dealt into eighty decks, 125 reaching a hand, and 3 ever cast — all three
 * counterspells. `bot.ts` `chooseSpell` filtered its candidates with
 * `isPermanent`, so the rest were dead cards.
 *
 * Taking that filter out is one line. Every test in this file is about the part
 * that is not one line: WHEN. An instant cast in the bot's own main phase for
 * no reason is a sorcery it paid a premium for, a removal spell aimed at its own
 * creature is worse than not casting it at all, and a counterspell cast at an
 * activated ability is a rules error the engine did not refuse.
 *
 * These are unit tests over hand-built boards, which is the right shape for a
 * policy and the WRONG shape for the question "does this make the bot better".
 * That one is a twenty game harness run and an A/B against the old policy, and
 * it lives in `scripts/playtest/run.ts --ab`. Neither substitutes for the other.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyActions, createGame } from './rules.ts';
import { nextBotMove } from './bot.ts';
import { stackOf, stackTop } from './stack.ts';
import { counterCanTarget } from './respond.ts';
import { planSpellTargets, spellNeedsATarget } from './cast-targets.ts';
import { planCastFromHand } from './moves.ts';
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

/** A land that taps for one colour, named so `manaSourcesFor` reads it. */
function land(state: GameState, owner: PlayerId, id: string, color: ManaColor): GameState {
  const names: Record<string, [string, string]> = {
    U: ['Island', 'Basic Land — Island'],
    B: ['Swamp', 'Basic Land — Swamp'],
    G: ['Forest', 'Basic Land — Forest'],
    R: ['Mountain', 'Basic Land — Mountain'],
    W: ['Plains', 'Basic Land — Plains'],
  };
  const [name, typeLine] = names[color];
  return put(state, owner, 'battlefield', {
    instanceId: id,
    name,
    typeLine,
    manaCost: '',
    cmc: 0,
    colorIdentity: [color],
    oracleText: `({T}: Add {${color}}.)`,
  });
}

function lands(state: GameState, owner: PlayerId, count: number, color: ManaColor): GameState {
  let next = state;
  for (let i = 0; i < count; i++) next = land(next, owner, `${owner}-${color}${i}`, color);
  return next;
}

function creature(
  state: GameState,
  owner: PlayerId,
  zone: Zone,
  id: string,
  name: string,
  power: number,
  toughness: number
): GameState {
  return put(state, owner, zone, {
    instanceId: id,
    name,
    typeLine: 'Creature — Ogre',
    manaCost: '{2}{B}',
    cmc: 3,
    power: String(power),
    toughness: String(toughness),
    colorIdentity: ['B'],
    summoningSick: false,
  });
}

const MURDER = {
  name: 'Murder',
  typeLine: 'Instant',
  manaCost: '{1}{B}{B}',
  cmc: 3,
  colorIdentity: ['B'] as ManaColor[],
  oracleText: 'Destroy target creature.',
};

const DIVINATION = {
  name: 'Divination',
  typeLine: 'Sorcery',
  manaCost: '{2}{U}',
  cmc: 3,
  colorIdentity: ['U'] as ManaColor[],
  oracleText: 'Draw two cards.',
};

const COUNTERSPELL = {
  name: 'Counterspell',
  typeLine: 'Instant',
  manaCost: '{U}{U}',
  cmc: 2,
  colorIdentity: ['U'] as ManaColor[],
  oracleText: 'Counter target spell.',
};

const ESSENCE_CAPTURE = {
  name: 'Essence Capture',
  typeLine: 'Instant',
  manaCost: '{U}{U}',
  cmc: 2,
  colorIdentity: ['U'] as ManaColor[],
  oracleText: 'Counter target creature spell.',
};

const GIANT_GROWTH = {
  name: 'Giant Growth',
  typeLine: 'Instant',
  manaCost: '{G}',
  cmc: 1,
  colorIdentity: ['G'] as ManaColor[],
  oracleText: 'Target creature gets +3/+3 until end of turn.',
};

function table(): GameState {
  return createGame({
    mode: 'full',
    format: 'commander',
    players: [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
    ],
  });
}

/** It is THEM's precombat main phase, stack empty. */
function theirMain(state: GameState): GameState {
  return { ...state, activePlayerId: THEM, priorityPlayerId: THEM, step: 'precombat_main' };
}

/** What the bot decided to do, or null. */
function decide(state: GameState, seat: PlayerId = THEM, options = {}) {
  return nextBotMove(state, seat, { at: 1, ...options });
}

/* -------------------------------------------------------------------------- */
/* Sorceries: the easy half                                                   */
/* -------------------------------------------------------------------------- */

test('a sorcery is cast in the main phase, onto the stack', () => {
  let state = table();
  state = lands(state, THEM, 3, 'U');
  state = put(state, THEM, 'hand', { instanceId: 'p2-div', ...DIVINATION });
  state = theirMain(state);

  const move = decide(state);
  assert.ok(move, 'the bot had nothing to do while holding a castable sorcery');
  assert.match(move.note, /Casts Divination/);

  const after = applyActions(state, move.actions);
  const top = stackTop(after);
  assert.ok(top, 'the sorcery did not reach the stack');
  assert.equal(top.name, 'Divination');
});

test('a permanent is still preferred to a sorcery of the same cost', () => {
  let state = table();
  state = lands(state, THEM, 3, 'U');
  state = put(state, THEM, 'hand', { instanceId: 'p2-div', ...DIVINATION });
  state = creature(state, THEM, 'hand', 'p2-body', 'Hill Giant', 3, 3);
  state = { ...state, cards: { ...state.cards, 'p2-body': { ...state.cards['p2-body'], manaCost: '{2}{U}', colorIdentity: ['U'] } } };
  state = theirMain(state);

  const move = decide(state);
  assert.ok(move);
  assert.match(move.note, /Casts Hill Giant/, 'the curve lost to a draw spell');
});

/* -------------------------------------------------------------------------- */
/* Instants: knowing when                                                     */
/* -------------------------------------------------------------------------- */

test('a removal instant is HELD against a creature combat can deal with', () => {
  let state = table();
  state = lands(state, THEM, 4, 'B');
  state = put(state, THEM, 'hand', { instanceId: 'p2-murder', ...MURDER });
  // A 2/2. Under the 3 power floor, and the bot's own 4/4 eats it.
  state = creature(state, ME, 'battlefield', 'p1-small', 'Grizzly Bears', 2, 2);
  state = creature(state, THEM, 'battlefield', 'p2-big', 'Hill Giant', 4, 4);
  state = theirMain(state);

  const move = decide(state);
  assert.ok(move);
  assert.doesNotMatch(move.note, /Murder/, 'a removal spell was spent on a creature combat answers');
});

test('a removal instant IS spent on a creature that outclasses the whole board', () => {
  let state = table();
  state = lands(state, THEM, 4, 'B');
  state = put(state, THEM, 'hand', { instanceId: 'p2-murder', ...MURDER });
  state = creature(state, ME, 'battlefield', 'p1-huge', 'Colossus', 7, 7);
  state = creature(state, THEM, 'battlefield', 'p2-small', 'Grizzly Bears', 2, 2);
  state = theirMain(state);

  const move = decide(state);
  assert.ok(move);
  assert.match(move.note, /Casts Murder at Colossus/);

  const after = applyActions(state, move.actions);
  const top = stackTop(after);
  assert.ok(top);
  assert.equal(top.targets.length, 1, 'Murder reached the stack with no target announced');
  assert.equal(top.targets[0].instanceId, 'p1-huge');
});

test('a removal instant is NEVER aimed at the bot’s own creature', () => {
  let state = table();
  state = lands(state, THEM, 4, 'B');
  state = put(state, THEM, 'hand', { instanceId: 'p2-murder', ...MURDER });
  // The ONLY creature on the table is the bot's own, and it is a big one, so a
  // policy that reached for "the biggest creature" would kill it.
  state = creature(state, THEM, 'battlefield', 'p2-huge', 'Colossus', 7, 7);
  state = theirMain(state);

  const move = decide(state);
  if (move) {
    assert.doesNotMatch(move.note, /Murder/, 'the bot pointed its own removal at its own board');
  }
});

test('a removal instant with no legal target is not cast', () => {
  let state = table();
  state = lands(state, THEM, 4, 'B');
  state = put(state, THEM, 'hand', { instanceId: 'p2-murder', ...MURDER });
  state = theirMain(state);

  const move = decide(state);
  // An empty board: nothing to destroy, so nothing to cast. Whatever else the
  // bot does, it must not be casting Murder at nobody.
  if (move) assert.doesNotMatch(move.note, /Murder/);
});

test('a beneficial instant goes on the bot’s own creature', () => {
  let state = table();
  state = lands(state, THEM, 2, 'G');
  state = put(state, THEM, 'hand', { instanceId: 'p2-growth', ...GIANT_GROWTH });
  state = creature(state, THEM, 'battlefield', 'p2-mine', 'Hill Giant', 3, 3);
  state = creature(state, ME, 'battlefield', 'p1-theirs', 'Colossus', 7, 7);
  state = theirMain(state);

  const move = decide(state);
  assert.ok(move);
  assert.match(move.note, /Casts Giant Growth/);

  const after = applyActions(state, move.actions);
  const top = stackTop(after);
  assert.ok(top);
  assert.equal(
    top.targets[0]?.instanceId,
    'p2-mine',
    'the bot handed an opponent a free Giant Growth'
  );
});

/* -------------------------------------------------------------------------- */
/* A counterspell is held, and mana is held with it                           */
/* -------------------------------------------------------------------------- */

test('a counterspell is not cast in the bot’s own main phase', () => {
  let state = table();
  state = lands(state, THEM, 4, 'U');
  state = put(state, THEM, 'hand', { instanceId: 'p2-cs', ...COUNTERSPELL });
  state = theirMain(state);

  const move = decide(state);
  if (move) assert.doesNotMatch(move.note, /Counterspell/);
});

test('the bot does not tap out for a permanent while holding a counterspell', () => {
  let state = table();
  state = lands(state, THEM, 4, 'U');
  state = put(state, THEM, 'hand', { instanceId: 'p2-cs', ...COUNTERSPELL });

  // A four-drop that would use every land, and a two-drop that would not.
  state = put(state, THEM, 'hand', {
    instanceId: 'p2-four',
    name: 'Air Elemental',
    typeLine: 'Creature — Elemental',
    manaCost: '{3}{U}',
    cmc: 4,
    power: '4',
    toughness: '4',
    colorIdentity: ['U'],
  });
  state = put(state, THEM, 'hand', {
    instanceId: 'p2-two',
    name: 'Wind Drake',
    typeLine: 'Creature — Drake',
    manaCost: '{1}{U}',
    cmc: 2,
    power: '2',
    toughness: '2',
    colorIdentity: ['U'],
  });
  state = theirMain(state);

  const move = decide(state);
  assert.ok(move);
  assert.match(
    move.note,
    /Casts Wind Drake/,
    'the bot tapped out for its four-drop and threw the counterspell away'
  );

  const after = applyActions(state, move.actions);
  const untapped = after.players
    .find(p => p.id === THEM)!
    .zones.battlefield.filter(id => !after.cards[id].tapped).length;
  assert.ok(untapped >= 2, `only ${untapped} lands left open, which does not pay {U}{U}`);
});

test('holding a counterspell is worth a cheaper spell, not a whole turn', () => {
  /*
   * The concession that makes the reserve safe. With four lands, a counterspell
   * and NOTHING cheap enough to cast around it, the bot casts its four-drop
   * rather than sitting on its hands. A bot that held up mana it never spent
   * would show in the harness as games that never end.
   */
  let state = table();
  state = lands(state, THEM, 4, 'U');
  state = put(state, THEM, 'hand', { instanceId: 'p2-cs', ...COUNTERSPELL });
  state = put(state, THEM, 'hand', {
    instanceId: 'p2-four',
    name: 'Air Elemental',
    typeLine: 'Creature — Elemental',
    manaCost: '{3}{U}',
    cmc: 4,
    power: '4',
    toughness: '4',
    colorIdentity: ['U'],
  });
  state = theirMain(state);

  const move = decide(state);
  assert.ok(move);
  assert.match(move.note, /Casts Air Elemental/);
});

/* -------------------------------------------------------------------------- */
/* CR 111.1 — a counterspell is cast at a SPELL                               */
/* -------------------------------------------------------------------------- */

test('"counter target creature spell" refuses an activated ability', () => {
  let state = table();
  state = put(state, ME, 'hand', { instanceId: 'p1-ec', ...ESSENCE_CAPTURE });
  const ability = {
    stackId: 's1',
    kind: 'activated' as const,
    name: 'Blinding Mage',
    controllerId: THEM,
    sourceInstanceId: 'p2-mage',
    abilityId: 'a0',
    targets: [],
    effects: [],
    turn: 1,
  };
  assert.equal(counterCanTarget(state, state.cards['p1-ec'], ability), false);
});

test('"counter target creature spell" accepts a creature spell and refuses an instant', () => {
  let state = table();
  state = put(state, ME, 'hand', { instanceId: 'p1-ec', ...ESSENCE_CAPTURE });
  state = creature(state, THEM, 'stack', 'p2-body', 'Hill Giant', 3, 3);
  state = put(state, THEM, 'stack', { instanceId: 'p2-bolt', ...MURDER });

  const spellObject = (cardInstanceId: string) => ({
    stackId: 's1',
    kind: 'spell' as const,
    name: state.cards[cardInstanceId].name,
    controllerId: THEM,
    cardInstanceId,
    targets: [],
    effects: [],
    turn: 1,
  });

  assert.equal(counterCanTarget(state, state.cards['p1-ec'], spellObject('p2-body')), true);
  assert.equal(counterCanTarget(state, state.cards['p1-ec'], spellObject('p2-bolt')), false);
  // A plain "counter target spell" takes either.
  state = put(state, ME, 'hand', { instanceId: 'p1-cs', ...COUNTERSPELL });
  assert.equal(counterCanTarget(state, state.cards['p1-cs'], spellObject('p2-bolt')), true);
});

/* -------------------------------------------------------------------------- */
/* The other window: being attacked                                           */
/* -------------------------------------------------------------------------- */

test('a defender kills an attacker no block can answer', () => {
  let state = table();
  state = lands(state, ME, 4, 'B');
  state = put(state, ME, 'hand', { instanceId: 'p1-murder', ...MURDER });
  // A 6/6 attacking into a lone 2/2: the block is a chump block and nothing else.
  state = creature(state, THEM, 'battlefield', 'p2-attacker', 'Colossus', 6, 6);
  state = creature(state, ME, 'battlefield', 'p1-chump', 'Grizzly Bears', 2, 2);

  state = {
    ...state,
    activePlayerId: THEM,
    priorityPlayerId: THEM,
    step: 'declare_blockers',
    combat: {
      ...state.combat,
      attackers: [{ attackerId: 'p2-attacker', defenderPlayerId: ME, blockedBy: [] }],
    },
  };

  const move = decide(state, ME);
  assert.ok(move, 'the defender did nothing while being run over');
  assert.match(move.note, /Casts Murder at Colossus/);

  const after = applyActions(state, move.actions);
  assert.equal(stackTop(after)?.targets[0]?.instanceId, 'p2-attacker');
});

test('a defender that can block profitably does not spend removal', () => {
  let state = table();
  state = lands(state, ME, 4, 'B');
  state = put(state, ME, 'hand', { instanceId: 'p1-murder', ...MURDER });
  state = creature(state, THEM, 'battlefield', 'p2-attacker', 'Grizzly Bears', 2, 2);
  state = creature(state, ME, 'battlefield', 'p1-wall', 'Colossus', 6, 6);

  state = {
    ...state,
    activePlayerId: THEM,
    priorityPlayerId: THEM,
    step: 'declare_blockers',
    combat: {
      ...state.combat,
      attackers: [{ attackerId: 'p2-attacker', defenderPlayerId: ME, blockedBy: [] }],
    },
  };

  const move = decide(state, ME);
  assert.ok(move, 'the defender neither blocked nor answered');
  assert.doesNotMatch(move.note, /Murder/);
  assert.match(move.note, /Blocks/);
});

/* -------------------------------------------------------------------------- */
/* The two switches that must keep working                                    */
/* -------------------------------------------------------------------------- */

test('useStack false casts no instant and no sorcery at all', () => {
  /*
   * On that path `planCastFromHand` builds a bare `PLAY` to the resolution
   * zone, and `compiledSpellActions` only ever runs from `stack.ts`. So an
   * instant cast without the stack moves hand to graveyard having done nothing,
   * which is strictly worse than the dead card this whole pass removes.
   */
  let state = table();
  state = lands(state, THEM, 4, 'U');
  state = put(state, THEM, 'hand', { instanceId: 'p2-div', ...DIVINATION });
  state = theirMain(state);

  const move = decide(state, THEM, { useStack: false });
  if (move) assert.doesNotMatch(move.note, /Divination/);
});

test('the control arm casts permanents only, which is what makes the A/B an A/B', () => {
  let state = table();
  state = lands(state, THEM, 3, 'U');
  state = put(state, THEM, 'hand', { instanceId: 'p2-div', ...DIVINATION });
  state = theirMain(state);

  assert.match(decide(state)!.note, /Casts Divination/);
  // The control arm has nothing else to do, so it advances the step instead.
  assert.doesNotMatch(decide(state, THEM, { castingPolicy: 'permanents-only' })!.note, /Divination/);
});

/* -------------------------------------------------------------------------- */
/* The asker itself                                                           */
/* -------------------------------------------------------------------------- */

test('a spell that names a target says so, and one that does not says that', () => {
  let state = table();
  state = put(state, THEM, 'hand', { instanceId: 'p2-murder', ...MURDER });
  state = put(state, THEM, 'hand', { instanceId: 'p2-div', ...DIVINATION });

  assert.equal(spellNeedsATarget(state.cards['p2-murder']), true);
  assert.equal(spellNeedsATarget(state.cards['p2-div']), false);
});

test('CR 601.2c — a spell with no legal target refuses rather than asking', () => {
  let state = table();
  state = put(state, THEM, 'hand', { instanceId: 'p2-murder', ...MURDER });

  const aim = planSpellTargets(state, THEM, state.cards['p2-murder']);
  assert.notEqual(aim.reason, '', 'an empty board offered a legal target');
  assert.equal(aim.pending.length, 0, 'it asked a question nobody can answer');
});

test('one legal target is taken without asking, because a forced choice is not a choice', () => {
  let state = table();
  state = put(state, THEM, 'hand', { instanceId: 'p2-murder', ...MURDER });
  state = creature(state, ME, 'battlefield', 'p1-only', 'Grizzly Bears', 2, 2);

  const aim = planSpellTargets(state, THEM, state.cards['p2-murder']);
  assert.equal(aim.reason, '', aim.reason);
  assert.equal(aim.targets[0]?.instanceId, 'p1-only');
});

/* -------------------------------------------------------------------------- */
/* The honesty rule on the stack path                                         */
/* -------------------------------------------------------------------------- */

/** A sorcery whose rules box the compiler makes nothing at all of. */
const UNREADABLE = {
  name: 'Unreadable Ritual',
  typeLine: 'Sorcery',
  manaCost: '{2}{R}',
  cmc: 3,
  colorIdentity: ['R'] as ManaColor[],
  oracleText: 'Whenever the moon is gibbous, the loudest player at the table wins an argument.',
};

test('a spell the engine cannot run says so instead of going quietly to the graveyard', () => {
  /*
   * This hole was unreachable until the bot started casting sorceries. CR
   * 608.2m always adds the move to the graveyard, so `resolutionActionsFor`'s
   * "did this produce nothing at all" check could never fire for an instant or
   * a sorcery, and 48 of them across twenty games resolved silently — the one
   * verdict the audit says must stay at zero.
   *
   * Cast here the way `Play.tsx` casts, rather than through the bot, because
   * the bot no longer casts a card like this at all. The note is for the seat a
   * person is playing, and a person may still put one on the stack. The test
   * below is the bot's half of the same fact.
   */
  let state = table();
  state = lands(state, THEM, 3, 'R');
  state = put(state, THEM, 'hand', { instanceId: 'p2-weird', ...UNREADABLE });
  state = theirMain(state);

  const plan = planCastFromHand(state, THEM, 'p2-weird', { viaStack: true, at: 0 });
  assert.ok(plan.ok, plan.reason);
  state = applyActions(state, plan.actions);

  for (let step = 0; step < 12 && stackOf(state).length > 0; step++) {
    const seat = [THEM, ME].find(id => nextBotMove(state, id, { at: step }) !== null);
    assert.ok(seat, 'the priority round deadlocked');
    state = applyActions(state, nextBotMove(state, seat, { at: step })!.actions);
  }

  assert.equal(state.cards['p2-weird'].zone, 'graveyard', 'the spell never resolved');
  const notes = state.log.filter(
    entry => entry.type === 'NOTE' && entry.message.includes('Unreadable Ritual')
  );
  assert.ok(
    notes.length > 0,
    'the spell resolved, did nothing, and the log never said so — silent-untold'
  );
});

test('the bot HOLDS a spell the engine cannot run rather than binning it', () => {
  /*
   * Measured on the twenty recorded games: 65 of the 113 instants and sorceries
   * the bot cast were cards with no compiled spell text at all, and 63 of those
   * 65 resolved having changed nothing. Casting one spends the mana and the
   * card to produce the event this project's own law calls a serious bug. See
   * `engineCanRunSpell`.
   */
  let state = table();
  state = lands(state, THEM, 3, 'R');
  state = put(state, THEM, 'hand', { instanceId: 'p2-weird', ...UNREADABLE });
  state = theirMain(state);

  const move = decide(state);
  assert.ok(move);
  assert.doesNotMatch(move.note, /Casts Unreadable Ritual/, 'the bot threw the card away');
  assert.equal(state.cards['p2-weird'].zone, 'hand');
});

test('the bot does not cast a spell whose printed extra cost nothing charges', () => {
  /*
   * CR 601.2f-h: an additional cost is not optional. `planCastFromHand` prices
   * the mana cost and nothing else, so a bot casting one of these plays a
   * stronger card than the one printed. Six casts across the twenty recorded
   * games did exactly that, including a free +4/+2 from Wicked Reward, whose
   * printed cost is sacrificing a creature.
   */
  let state = table();
  state = lands(state, THEM, 3, 'B');
  state = put(state, THEM, 'hand', {
    instanceId: 'p2-reward',
    name: 'Test Reward',
    typeLine: 'Instant',
    manaCost: '{1}{B}',
    cmc: 2,
    colorIdentity: ['B'],
    oracleText:
      'As an additional cost to cast this spell, sacrifice a creature.\nTarget creature gets +4/+2 until end of turn.',
  });
  state = creature(state, THEM, 'battlefield', 'p2-body', 'Grizzly Bears', 2, 2);
  state = theirMain(state);

  const move = decide(state);
  assert.ok(move);
  assert.doesNotMatch(move.note, /Casts Test Reward/, 'the bot skipped a printed cost');
});

test('an answer that cannot remove the creature is held, not spent', () => {
  /*
   * Seed 9003 of the recorded run: the bot cast Moment of Craving, "target
   * creature gets -2/-2 until end of turn", at a 3/3 in its OWN precombat main
   * because the 3/3 outclassed its board. The creature was a 1/1 until end of
   * turn and a 3/3 again before it ever attacked. See `answerRemoves`.
   */
  let state = table();
  state = lands(state, THEM, 3, 'B');
  state = put(state, THEM, 'hand', {
    instanceId: 'p2-shrink',
    name: 'Passing Weakness',
    typeLine: 'Instant',
    manaCost: '{1}{B}',
    cmc: 2,
    colorIdentity: ['B'],
    oracleText: 'Target creature gets -2/-2 until end of turn.',
  });
  // Bigger than anything this seat controls, which is what opens the window.
  state = creature(state, ME, 'battlefield', 'p1-big', 'Colossus', 4, 4);
  state = theirMain(state);

  const move = decide(state);
  assert.ok(move);
  assert.doesNotMatch(move.note, /Casts Passing Weakness/, 'a -2/-2 was spent on a 4/4');
  assert.equal(state.cards['p2-shrink'].zone, 'hand');
});

test('an answer that DOES remove the creature is still spent, with nothing else on the board', () => {
  /*
   * The other half, because a policy that only ever declines is not judgement.
   *
   * ONE creature on the whole battlefield, on purpose. `chooseTargetsFor` takes
   * a forced choice without asking, so the decider `chooseAnswer` passes in was
   * never called and `aimedAt` stayed null: the bot held its removal in the
   * commonest position in the game. See the note in `chooseAnswer`.
   */
  let state = table();
  state = lands(state, THEM, 4, 'B');
  state = put(state, THEM, 'hand', { instanceId: 'p2-murder', ...MURDER });
  state = creature(state, ME, 'battlefield', 'p1-big', 'Colossus', 4, 4);
  state = theirMain(state);

  const move = decide(state);
  assert.ok(move);
  assert.match(move.note, /Casts Murder at Colossus/);
});

test('a card that counters "target spell or ability" is offered against both', () => {
  /*
   * Four of the 426 cards printing "counter target" in the card snapshot read
   * "spell or ability". Reading the word ability first refused every spell for
   * all four of them, which is the counterspell restriction overshooting.
   */
  let state = table();
  state = put(state, ME, 'hand', {
    instanceId: 'p1-escort',
    name: 'Test Escort',
    typeLine: 'Instant',
    manaCost: '{1}{U}',
    cmc: 2,
    colorIdentity: ['U'],
    oracleText: 'Counter target spell or ability.',
  });
  state = lands(state, THEM, 3, 'U');
  state = put(state, THEM, 'hand', { instanceId: 'p2-div', ...DIVINATION });
  state = theirMain(state);

  const cast = decide(state);
  assert.ok(cast);
  state = applyActions(state, cast.actions);
  const top = stackTop(state);
  assert.ok(top);
  assert.equal(top.kind, 'spell');

  assert.equal(
    counterCanTarget(state, state.cards['p1-escort'], top),
    true,
    'a card that counters a spell OR an ability refused the spell'
  );
});

test('a card that counters only an ability is still refused against a spell', () => {
  let state = table();
  state = put(state, ME, 'hand', {
    instanceId: 'p1-stifle',
    name: 'Test Stifle',
    typeLine: 'Instant',
    manaCost: '{U}',
    cmc: 1,
    colorIdentity: ['U'],
    oracleText: 'Counter target activated or triggered ability.',
  });
  state = lands(state, THEM, 3, 'U');
  state = put(state, THEM, 'hand', { instanceId: 'p2-div', ...DIVINATION });
  state = theirMain(state);

  const cast = decide(state);
  assert.ok(cast);
  state = applyActions(state, cast.actions);
  const top = stackTop(state);
  assert.ok(top);
  assert.equal(counterCanTarget(state, state.cards['p1-stifle'], top), false);
});

test('"counter target creature or planeswalker spell" reaches a planeswalker', () => {
  /*
   * 22 of the 426 name more than one type. Reading only the first one refused
   * counters the card plainly allows.
   */
  let state = table();
  state = put(state, ME, 'hand', {
    instanceId: 'p1-anti',
    name: 'Test Anticognition',
    typeLine: 'Instant',
    manaCost: '{1}{U}',
    cmc: 2,
    colorIdentity: ['U'],
    oracleText: 'Counter target creature or planeswalker spell.',
  });
  state = lands(state, THEM, 4, 'U');
  state = put(state, THEM, 'hand', {
    instanceId: 'p2-pw',
    name: 'Test Walker',
    typeLine: 'Legendary Planeswalker — Test',
    manaCost: '{2}{U}',
    cmc: 3,
    colorIdentity: ['U'],
  });
  state = theirMain(state);

  const cast = decide(state);
  assert.ok(cast);
  state = applyActions(state, cast.actions);
  const top = stackTop(state);
  assert.ok(top);
  assert.equal(counterCanTarget(state, state.cards['p1-anti'], top), true);
});

/* -------------------------------------------------------------------------- */
/* A mana filter must not become an infinite turn                              */
/* -------------------------------------------------------------------------- */

/**
 * Measured in a browser on 29 Aug 2026, four-player table, turn 11, reproduced
 * twice on the same seed: a bot holding Initiates of the Ebon Hand ("{1}: Add
 * {B}") produced SPEND_MANA / ADD_MANA / NOTE without end and the table never
 * reached turn 12. A filter converts mana instead of making it, so the pool is
 * never empty and never grows, and `chooseActivation` re-offered the same
 * ability on every pass. The seat's own MAX_ACTIVATIONS_PER_TURN guard is blind
 * to it, because `state.abilityUses` is written only by PUT_ABILITY_ON_STACK
 * and CR 605.3a keeps a mana ability off the stack.
 *
 * `/play` asks `nextBotMove` on a timer and dispatches what it gets, so this
 * hung the game with nothing on screen able to move it.
 */
test('a bot with nothing to cast does not activate a mana filter for ever', () => {
  let state = table();
  state = lands(state, THEM, 3, 'B');
  state = put(state, THEM, 'battlefield', {
    instanceId: 'initiates',
    name: 'Initiates of the Ebon Hand',
    typeLine: 'Creature — Human Cleric',
    manaCost: '{B}',
    cmc: 1,
    colorIdentity: ['B'],
    oracleText: '{1}: Add {B}. If this ability has been activated four or more times this turn, sacrifice this creature at the beginning of the next end step.',
    summoningSick: false,
  });
  state = theirMain(state);

  /* Nothing in hand, so `chooseSpell` returns null and the old code fell into
     the filter. Ask fifty times and apply what comes back; the seat must reach
     a move that is not another activation of the same ability. */
  let current = state;
  let manaActivations = 0;
  let movedOn = false;
  for (let i = 0; i < 50; i += 1) {
    const move = nextBotMove(current, THEM, { at: i + 1 });
    if (!move) { movedOn = true; break; }
    if (/Initiates of the Ebon Hand/.test(move.note ?? '')) {
      manaActivations += 1;
    } else {
      movedOn = true;
      break;
    }
    const next = applyActions(current, move.actions);
    if (next === current) break;
    current = next;
  }

  assert.equal(
    manaActivations,
    0,
    'a mana ability is activated to PAY for something, never for its own sake'
  );
  assert.ok(movedOn, 'the seat must reach a move that is not the filter');
});
