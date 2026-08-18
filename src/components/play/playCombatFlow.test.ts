/**
 * The player's own swing, driven exactly the way `/play` drives it.
 *
 *   node --test --experimental-strip-types src/components/play/playCombatFlow.test.ts
 *
 * `botCombat.test.ts` answers "does the enemy attack, and does its damage
 * land". This is the mirror: **does mine**. It matters separately because the
 * two use different code to get to the same step. The bot walks its own turn
 * through `advanceActions`; the player's turn is walked by the page's
 * auto-advance effect, which only presses next when `turnFlow.decisionFor`
 * says no decision is owed — and the confirm on the combat bar is a bare
 * `ADVANCE_STEP`, deliberately, because confirming a declaration is not the
 * same act as resolving damage.
 *
 * That is the shape of the bug this guards against. `advanceActions` is the
 * only thing that turns the combat damage step into actual damage:
 *
 *     if (state.step === 'combat_damage' && state.combat.attackers.length > 0)
 *       return resolveCombatAndAdvance(state, at).actions;
 *
 * Anything that walks past `combat_damage` with a plain `ADVANCE_STEP` — a new
 * confirm button, a "skip to end of turn", a step-forward control wired to the
 * reducer instead of to `moves.ts` — silently deletes the whole swing. The
 * board still shows the attack, the combat bar still promises the damage, and
 * the opponent's life simply never moves. So this drives the real sequence and
 * asserts on the life total, not on the step.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyActions, createGame } from '../../lib/game/rules.ts';
import { advanceActions } from '../../lib/game/moves.ts';
import { tapsToAttack } from '../../lib/game/combat.ts';
import type { GameState, PlayerId } from '../../lib/game/types.ts';
import { decisionFor } from './turnFlow.ts';
import { cardCombatFor, combatStageFor } from './combatUi.ts';

const HUMAN: PlayerId = 'p1';

interface Body {
  id: string;
  owner: PlayerId;
  power?: string;
  toughness?: string;
  keywords?: string[];
  typeLine?: string;
}

function board(bodies: Body[]): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    startingLife: 40,
    players: [
      { id: 'p1', name: 'You' },
      { id: 'p2', name: 'Surrak' },
    ],
  });

  for (const body of bodies) {
    state = addCard(
      state,
      {
        instanceId: body.id,
        cardId: body.id,
        name: body.id,
        ownerId: body.owner,
        controllerId: body.owner,
        typeLine: body.typeLine ?? 'Creature — Test',
        power: body.power ?? '2',
        toughness: body.toughness ?? '2',
        keywords: body.keywords ?? [],
        oracleText: '',
        counters: {},
        tapped: false,
        summoningSick: false,
      },
      'battlefield'
    );
  }

  return { ...state, status: 'playing', activePlayerId: HUMAN, step: 'declare_attackers' };
}

/**
 * The page's auto-advance loop: press next for as long as this seat holds the
 * game up and owes no decision. `blocksWith` stands in for the opponent, human
 * or bot, declaring blocks at the one step where that is legal.
 */
function runFlow(
  state: GameState,
  options: { blocksWith?: Array<{ blockerId: string; attackerId: string }> } = {}
): GameState {
  let current = state;
  let blocked = false;

  for (let i = 0; i < 40; i += 1) {
    if (current.status !== 'playing') break;
    if (current.step === 'end') break;

    if (current.step === 'declare_blockers' && options.blocksWith && !blocked) {
      current = applyActions(current, [{ type: 'BLOCK', blocks: options.blocksWith, at: 1 }]);
      blocked = true;
      continue;
    }

    // The page never advances over a decision it owes.
    if (decisionFor(current, HUMAN) !== null) break;

    const next = applyActions(current, advanceActions(current, 1));
    if (next === current) break;
    current = next;
  }

  return current;
}

const lifeOf = (state: GameState, id: PlayerId) =>
  state.players.find(p => p.id === id)?.life ?? 0;

/** Declare an attack the way the sword chip does: replace the whole declaration. */
function swing(state: GameState, attackerIds: string[], defender: PlayerId = 'p2'): GameState {
  return applyActions(state, [
    {
      type: 'ATTACK',
      at: 1,
      attackers: attackerIds.map(attackerId => ({
        attackerId,
        defenderPlayerId: defender,
        tap: tapsToAttack(state, state.cards[attackerId]),
      })),
    },
  ]);
}

/* ------------------------------------------------------------------ */

test("the player's unblocked swing takes life off, through the page's own flow", () => {
  let state = board([{ id: 'elder', owner: HUMAN, power: '2', toughness: '2' }]);

  assert.equal(combatStageFor(state, HUMAN), 'attackers', 'the sword step is ours');
  assert.equal(
    cardCombatFor(state, HUMAN, state.cards.elder, 'attackers').chip,
    'attack',
    'the creature offers a sword before any of this means anything'
  );

  state = swing(state, ['elder']);
  assert.equal(state.combat.attackers.length, 1);

  /* The combat bar's confirm: a bare ADVANCE_STEP. It hands the step back; it
     does not resolve anything, and it must not have to. */
  state = applyActions(state, [{ type: 'ADVANCE_STEP', at: 1 }]);
  assert.equal(state.step, 'declare_blockers');

  const after = runFlow(state);
  assert.equal(
    lifeOf(after, 'p2'),
    38,
    'the swing was declared, confirmed and walked past — and never dealt its damage'
  );
});

test('an alpha strike deals the sum of its power', () => {
  let state = board([
    { id: 'a', owner: HUMAN, power: '2', toughness: '2' },
    { id: 'b', owner: HUMAN, power: '3', toughness: '3' },
    { id: 'c', owner: HUMAN, power: '1', toughness: '1' },
  ]);

  state = swing(state, ['a', 'b', 'c']);
  state = applyActions(state, [{ type: 'ADVANCE_STEP', at: 1 }]);

  assert.equal(lifeOf(runFlow(state), 'p2'), 34);
});

test('a blocker stops exactly its own lane and nothing else', () => {
  let state = board([
    { id: 'a', owner: HUMAN, power: '2', toughness: '2' },
    { id: 'b', owner: HUMAN, power: '3', toughness: '3' },
    { id: 'wall', owner: 'p2', power: '0', toughness: '3' },
  ]);

  state = swing(state, ['a', 'b']);
  state = applyActions(state, [{ type: 'ADVANCE_STEP', at: 1 }]);

  const after = runFlow(state, { blocksWith: [{ blockerId: 'wall', attackerId: 'a' }] });

  /* The real game this was written from: a 2/2 into a 0/3 Wall of Wood deals
     two damage to a wall that survives it, and nothing reaches the player. The
     3/3 beside it is untouched by that and still connects. */
  assert.equal(lifeOf(after, 'p2'), 37, 'only the unblocked attacker should have got through');
  assert.equal(after.cards.wall.zone, 'battlefield', 'a 0/3 survives two damage');
});

test('trample spills over the blocker, and the flow delivers the spill', () => {
  let state = board([
    { id: 'beast', owner: HUMAN, power: '5', toughness: '5', keywords: ['trample'] },
    { id: 'chump', owner: 'p2', power: '1', toughness: '1' },
  ]);

  state = swing(state, ['beast']);
  state = applyActions(state, [{ type: 'ADVANCE_STEP', at: 1 }]);

  const after = runFlow(state, { blocksWith: [{ blockerId: 'chump', attackerId: 'beast' }] });
  assert.equal(lifeOf(after, 'p2'), 36, 'one point kills the chump, four should trample through');
});

test('lifelink on the swing moves the attacker life total too', () => {
  let state = board([
    { id: 'saint', owner: HUMAN, power: '3', toughness: '3', keywords: ['lifelink'] },
  ]);

  state = swing(state, ['saint']);
  state = applyActions(state, [{ type: 'ADVANCE_STEP', at: 1 }]);

  const after = runFlow(state);
  assert.equal(lifeOf(after, 'p2'), 37);
  assert.equal(lifeOf(after, HUMAN), 43, 'lifelink is part of combat damage, not a separate step');
});

test('the flow stops at declare blockers when the swing is pointed at this seat', () => {
  /*
   * The auto-advance must never walk through a decision it owes. Turn the board
   * around: p2 is attacking, this seat has a body, so `decisionFor` owes
   * "blockers" and the loop has to stop rather than resolving damage on the
   * defender's behalf.
   */
  let state = board([
    { id: 'ogre', owner: 'p2', power: '4', toughness: '4' },
    { id: 'bears', owner: HUMAN, power: '2', toughness: '2' },
  ]);
  state = { ...state, activePlayerId: 'p2' };
  state = swing(state, ['ogre'], HUMAN);
  state = applyActions(state, [{ type: 'ADVANCE_STEP', at: 1 }]);

  assert.equal(state.step, 'declare_blockers');
  assert.equal(decisionFor(state, HUMAN), 'blockers');
  assert.equal(combatStageFor(state, HUMAN), 'blockers');

  const after = runFlow(state);
  assert.equal(after.step, 'declare_blockers', 'the page resolved a block it was owed a say in');
  assert.equal(lifeOf(after, HUMAN), 40, 'and took the damage before the player could answer');
});
