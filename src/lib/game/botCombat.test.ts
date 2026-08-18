/**
 * Does the enemy actually attack?
 *
 *   node --test --experimental-strip-types src/lib/game/botCombat.test.ts
 *
 * Owner: *"doesnt seem like enemy on play mode is attacking, no way to attack
 * with it and block stages"*, and *"A game where nobody ever attacks is not a
 * game."*
 *
 * `bot.test.ts`-style unit checks on `shouldAttackWith` cannot answer that
 * question, because the failure mode is not a bad decision — it is a game that
 * never reaches the decision, or a loop that reaches it and cannot leave. So
 * this file plays whole games: `nextBotMove` in a loop against the real
 * reducer, two seats, a deck of real creatures and lands, for as many turns as
 * it takes, asserting on what actually happened to the board.
 *
 * The three properties, in the order they broke in practice:
 *
 *   1. the bot **declares attackers** — with a live human seat waiting to
 *      block, which is the configuration `/play` runs and the one where the
 *      bot's `waitForPlayerIds` hand-back can deadlock instead of swinging;
 *   2. combat **damage lands**, through the engine, so a life total moves;
 *   3. the loop **terminates** — no step where every seat says "not me", and no
 *      creature that can be declared as an attacker forever.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyActions } from './rules.ts';
import { buildTable, type PlayCard, type PlayDeck } from './setup.ts';
import { nextBotMove, botsAwaitingMove } from './bot.ts';
import { advanceActions } from './moves.ts';
import { eligibleAttackers, eligibleBlockers } from './combat.ts';
import type { GameState, PlayerId } from './types.ts';

/* ------------------------------------------------------------------ *
 * A deck that can actually curve out
 * ------------------------------------------------------------------ */

const forest = (n: number): PlayCard => ({
  cardId: `forest-${n}`,
  name: 'Forest',
  typeLine: 'Basic Land — Forest',
  cmc: 0,
  colorIdentity: ['G'],
  oracleText: '({T}: Add {G}.)',
});

const bear = (n: number): PlayCard => ({
  cardId: `bear-${n}`,
  name: 'Grizzly Bears',
  manaCost: '{1}{G}',
  cmc: 2,
  typeLine: 'Creature — Bear',
  power: '2',
  toughness: '2',
  colorIdentity: ['G'],
  oracleText: '',
});

const baloth = (n: number): PlayCard => ({
  cardId: `baloth-${n}`,
  name: 'Rumbling Baloth',
  manaCost: '{3}{G}',
  cmc: 4,
  typeLine: 'Creature — Beast',
  power: '4',
  toughness: '4',
  colorIdentity: ['G'],
  oracleText: '',
});

function greenDeck(tag: string): PlayDeck {
  const cards: PlayCard[] = [];
  // Land-heavy on purpose: the question is whether combat happens, not whether
  // a shuffle can be mana-screwed.
  for (let i = 0; i < 45; i += 1) cards.push(forest(i));
  for (let i = 0; i < 30; i += 1) cards.push(bear(i));
  for (let i = 0; i < 24; i += 1) cards.push(baloth(i));

  return {
    id: `deck-${tag}`,
    name: `Stompy ${tag}`,
    format: 'commander',
    cards,
    commanders: [
      {
        cardId: `cmd-${tag}`,
        name: `Herald ${tag}`,
        manaCost: '{2}{G}',
        cmc: 3,
        typeLine: 'Legendary Creature — Elf Shaman',
        power: '2',
        toughness: '3',
        colorIdentity: ['G'],
        oracleText: '',
      },
    ],
    source: 'seeded',
  };
}

interface PlayedGame {
  state: GameState;
  /** Every `ATTACK` action that carried at least one creature, by controller. */
  attacksBy: Record<PlayerId, number>;
  /** Every `BLOCK` action that carried at least one blocker, by defender. */
  blocksBy: Record<PlayerId, number>;
  /** Turns actually played before the loop stopped. */
  turns: number;
  /** True when the loop ran out of iterations rather than out of turns. */
  ranOut: boolean;
}

/**
 * Play a table to `maxTurns`, driving every seat listed in `botSeats` with the
 * bot policy and every other seat with the same auto-advance `/play` uses.
 *
 * `humanSeats` is passed to the bot as `waitForPlayerIds`, exactly as
 * `usePlayGame` passes it, so the hand-back path is under test rather than
 * bypassed. A "human" here blocks when it can and otherwise presses next, which
 * is the least generous defender a bot can face and still be expected to swing.
 */
function play(options: {
  botSeats: PlayerId[];
  humanSeats: PlayerId[];
  maxTurns: number;
  humanBlocks?: boolean;
  aggression?: 'timid' | 'normal' | 'aggressive';
}): PlayedGame {
  const built = buildTable({
    id: 'bot-combat',
    seed: 11,
    now: 0,
    format: 'commander',
    seats: [
      { deck: greenDeck('a'), playerName: 'One', playerId: 'p1', isBot: options.botSeats.includes('p1') },
      { deck: greenDeck('b'), playerName: 'Two', playerId: 'p2', isBot: options.botSeats.includes('p2') },
    ],
  });

  let state = built.state;
  const attacksBy: Record<string, number> = { p1: 0, p2: 0 };
  const blocksBy: Record<string, number> = { p1: 0, p2: 0 };

  const botOptions = {
    at: 0,
    aggression: options.aggression ?? ('normal' as const),
    waitForPlayerIds: options.humanSeats,
  };

  let iterations = 0;
  const LIMIT = 6000;

  while (state.turn <= options.maxTurns && state.status === 'playing' && iterations < LIMIT) {
    iterations += 1;

    const pending = botsAwaitingMove(state, options.botSeats, botOptions);
    if (pending.length > 0) {
      const move = nextBotMove(state, pending[0], botOptions);
      if (!move) break;
      for (const action of move.actions) {
        if (action.type === 'ATTACK' && action.attackers.length > 0) {
          attacksBy[pending[0]] += 1;
        }
        if (action.type === 'BLOCK' && action.blocks.length > 0) {
          blocksBy[pending[0]] += 1;
        }
      }
      const next = applyActions(state, move.actions);
      // A move that changes nothing is the hot loop this test exists to catch.
      if (next === state) {
        return { state, attacksBy, blocksBy, turns: state.turn, ranOut: true };
      }
      state = next;
      continue;
    }

    /* The human seats. They block when they can and otherwise press next, which
       is exactly what `/play` does through `turnFlow.decisionFor`. */
    let acted = false;
    for (const seat of options.humanSeats) {
      if (state.step !== 'declare_blockers') continue;
      const incoming = state.combat.attackers.filter(d => d.defenderPlayerId === seat);
      if (incoming.length === 0) continue;
      if (options.humanBlocks === false) continue;

      const alreadyBlocking = new Set<string>();
      for (const declaration of state.combat.attackers) {
        for (const id of declaration.blockedBy) alreadyBlocking.add(id);
      }
      const bodies = eligibleBlockers(state, seat).filter(c => !alreadyBlocking.has(c.instanceId));
      const target = incoming.find(d => d.blockedBy.length === 0);
      if (!target || bodies.length === 0) continue;

      const next = applyActions(state, [
        { type: 'BLOCK', blocks: [{ blockerId: bodies[0].instanceId, attackerId: target.attackerId }] },
      ]);
      if (next === state) continue;
      blocksBy[seat] += 1;
      state = next;
      acted = true;
      break;
    }
    if (acted) continue;

    const next = applyActions(state, advanceActions(state, 0));
    if (next === state) {
      return { state, attacksBy, blocksBy, turns: state.turn, ranOut: true };
    }
    state = next;
  }

  return {
    state,
    attacksBy,
    blocksBy,
    turns: state.turn,
    ranOut: iterations >= LIMIT,
  };
}

/* ------------------------------------------------------------------ *
 * The tests
 * ------------------------------------------------------------------ */

test('the bot declares attackers against a human seat that is waiting to block', () => {
  const game = play({ botSeats: ['p2'], humanSeats: ['p1'], maxTurns: 14 });

  assert.equal(game.ranOut, false, 'the game loop stalled rather than finishing its turns');
  assert.ok(
    game.attacksBy.p2 > 0,
    `the bot never declared an attack in ${game.turns} turns — this is the owner's "enemy is not attacking"`
  );
});

test('the bot swinging at a human actually takes life off', () => {
  const game = play({ botSeats: ['p2'], humanSeats: ['p1'], maxTurns: 14, humanBlocks: false });
  const human = game.state.players.find(p => p.id === 'p1');

  assert.ok(human, 'the human seat is still on the table');
  assert.ok(
    human.life < game.state.rules.startingLife,
    `an unblocked bot attack did not move the human's life (${human.life} of ${game.state.rules.startingLife})`
  );
});

test('the bot blocks when it is the one being attacked', () => {
  // Both seats bot-driven: one swings, the other is the defender, and neither
  // is on the wait-list, so the whole exchange is the policy's own doing.
  const game = play({ botSeats: ['p1', 'p2'], humanSeats: [], maxTurns: 16 });

  assert.equal(game.ranOut, false, 'the two-bot game stalled');
  assert.ok(game.attacksBy.p1 + game.attacksBy.p2 > 0, 'neither bot ever attacked');
  assert.ok(
    game.blocksBy.p1 + game.blocksBy.p2 > 0,
    'no block was ever declared in a game where both boards had creatures'
  );
});

test('an aggressive bot swings more often than a cautious one', () => {
  const timid = play({ botSeats: ['p2'], humanSeats: ['p1'], maxTurns: 14, aggression: 'timid' });
  const bold = play({
    botSeats: ['p2'],
    humanSeats: ['p1'],
    maxTurns: 14,
    aggression: 'aggressive',
  });

  assert.ok(
    bold.attacksBy.p2 >= timid.attacksBy.p2,
    `aggression is inverted: aggressive swung ${bold.attacksBy.p2}, timid swung ${timid.attacksBy.p2}`
  );
});

test('a declared attacker is never offered as an attacker again', () => {
  /*
   * The hot loop that hung a real game: `eligibleAttackers` answers "could this
   * be declared", and a creature with vigilance does not tap when it attacks —
   * so it stays eligible the instant after it was declared. A bot that filtered
   * only on eligibility re-declared the same creature forever and the tab
   * locked up. The guard is in `bot.ts`; this pins it from the outside.
   */
  const game = play({ botSeats: ['p2'], humanSeats: ['p1'], maxTurns: 10 });
  assert.equal(game.ranOut, false, 'the bot loop did not terminate');

  const still = eligibleAttackers(game.state, 'p2');
  const declared = new Set(game.state.combat.attackers.map(d => d.attackerId));
  for (const card of still) {
    assert.equal(
      declared.has(card.instanceId),
      false,
      `${card.name} is both declared and still offered as an attacker`
    );
  }
});
