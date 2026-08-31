/**
 * "You may play an additional land on each of your turns" has to let you.
 *
 * Exploration, Dryad of the Ilysian Grove, Oracle of Mul Daya, Azusa, Aesi and
 * The Gitrog Monster are eleven of the 2,000 most played cards in Commander,
 * and every one of them resolved and did nothing. Two separate halves were
 * missing and each one hid the other:
 *
 *   the compiler produced NO record at all for the sentence, so the card was
 *   marked as needing a human and nobody looked further;
 *
 *   and `moves.ts` compared `landsPlayedThisTurn >= 1` against the literal
 *   number 1, while `max-lands-per-turn` sat in the Restriction vocabulary with
 *   nothing producing it and nothing reading it.
 *
 * That is the third instance of the shape CLAUDE.md names — wired to the
 * engine, never fed — so this file tests the WHOLE path: real oracle text in,
 * a second land drop out. A test of either half alone would have passed for
 * months while the card did nothing.
 *
 *   node --test --experimental-strip-types src/lib/game/land-drops.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyActions, createGame } from './rules.ts';
import { planLandDrop } from './moves.ts';
import { landsAllowedPerTurn } from './abilities/statics.ts';
import type { GameState } from './types.ts';

function table(): GameState {
  return createGame({
    id: 'g',
    mode: 'full',
    format: 'commander',
    players: [
      { id: 'p1', name: 'You' },
      { id: 'p2', name: 'Bot' },
    ],
    seed: 1,
    now: 0,
  });
}

const withCard = (
  state: GameState,
  instanceId: string,
  name: string,
  typeLine: string,
  oracleText: string,
  zone: 'hand' | 'battlefield' = 'hand'
): GameState =>
  addCard(state, { instanceId, cardId: instanceId, name, ownerId: 'p1', typeLine, oracleText }, zone);

const forest = (state: GameState, id: string) =>
  withCard(state, id, 'Forest', 'Basic Land — Forest', '');

/* The real text, checked against the live catalogue. Getting the wording from
   memory is how a test like this passes while the product stays broken: the
   compiler's rule is a regex. */
const EXPLORATION = 'You may play an additional land on each of your turns.';
const AZUSA = 'You may play two additional lands on each of your turns.';

test('one land a turn, with nothing on the battlefield saying otherwise', () => {
  let state = forest(table(), 'f1');
  state = forest(state, 'f2');
  assert.equal(landsAllowedPerTurn(state, 'p1'), 1);

  const first = planLandDrop(state, 'p1', 'f1');
  assert.equal(first.ok, true);
  state = applyActions(state, first.actions);

  const second = planLandDrop(state, 'p1', 'f2');
  assert.equal(second.ok, false, 'the second land drop is the rule this file is about');
  assert.match(second.reason, /already played a land/);
});

test('Exploration is a second land drop, from its own printed text', () => {
  let state = withCard(table(), 'expl', 'Exploration', 'Enchantment', EXPLORATION, 'battlefield');
  state = forest(state, 'f1');
  state = forest(state, 'f2');
  state = forest(state, 'f3');

  assert.equal(landsAllowedPerTurn(state, 'p1'), 2);

  const first = planLandDrop(state, 'p1', 'f1');
  assert.equal(first.ok, true);
  state = applyActions(state, first.actions);

  const second = planLandDrop(state, 'p1', 'f2');
  assert.equal(second.ok, true, 'this is the whole card, and it did nothing until 31 Aug 2026');
  state = applyActions(state, second.actions);

  const third = planLandDrop(state, 'p1', 'f3');
  assert.equal(third.ok, false, 'and it is ONE extra, not unlimited');
  assert.match(third.reason, /2 lands/);
});

test('Azusa is three, because the card says two additional', () => {
  const state = withCard(
    table(),
    'azusa',
    'Azusa, Lost but Seeking',
    'Legendary Creature — Human Monk',
    AZUSA,
    'battlefield'
  );
  assert.equal(landsAllowedPerTurn(state, 'p1'), 3);
});

test('they stack, which is why the runtime sums rather than taking the largest', () => {
  let state = withCard(table(), 'expl', 'Exploration', 'Enchantment', EXPLORATION, 'battlefield');
  state = withCard(state, 'azusa', 'Azusa, Lost but Seeking', 'Legendary Creature — Human Monk', AZUSA, 'battlefield');
  assert.equal(
    landsAllowedPerTurn(state, 'p1'),
    4,
    'Exploration plus Azusa is four land drops; taking the maximum would say three'
  );
});

test('an opponent does not get your land drops', () => {
  const state = withCard(table(), 'expl', 'Exploration', 'Enchantment', EXPLORATION, 'battlefield');
  assert.equal(landsAllowedPerTurn(state, 'p2'), 1, '"you may play" is the controller, not the table');
});
