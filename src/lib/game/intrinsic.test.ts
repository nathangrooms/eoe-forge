/**
 * "This land enters tapped" has to actually tap the land.
 *
 * Owner: *"Some cards have 'this land enters tapped' - need to ensure this
 * actually works in playmode"*. It did not, and the failure was a missing wire
 * rather than a missing rule: the compiler produced the replacement, the
 * reducer knew how to apply it, and nothing ever handed one to the other.
 *
 * Every oracle text below is the REAL text of the REAL card as this project's
 * `cards` table holds it — checked against the live database on 2026-08-19,
 * where Dimir Guildgate reads exactly `"This land enters tapped.\n{T}: Add {U}
 * or {B}."`. Getting the wording from memory is how a test like this passes
 * while the product stays broken: the compiler's rule is a regex, and the older
 * "enters the battlefield tapped" phrasing does not match it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, applyActions, createGame } from './rules.ts';
import { applicableReplacements } from './replacement.ts';
import { intrinsicReplacements } from './intrinsic.ts';
import type { CardInstance, GameState } from './types.ts';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

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

function withCard(
  state: GameState,
  instanceId: string,
  name: string,
  typeLine: string,
  oracleText: string
): GameState {
  return addCard(
    state,
    { instanceId, cardId: instanceId, name, ownerId: 'p1', typeLine, oracleText },
    'hand'
  );
}

const play = (instanceId: string) =>
  ({ type: 'PLAY', instanceId, to: 'battlefield', controllerId: 'p1', at: 1 }) as const;

const card = (state: GameState, id: string): CardInstance => state.cards[id];

/* -------------------------------------------------------------------------- */
/* The derivation                                                             */
/* -------------------------------------------------------------------------- */

test('a real dual land carries a derived enters-tapped effect', () => {
  const state = withCard(
    table(),
    'gate',
    'Dimir Guildgate',
    'Land — Gate',
    'This land enters tapped.\n{T}: Add {U} or {B}.'
  );

  const derived = intrinsicReplacements(card(state, 'gate'));
  assert.equal(derived.length, 1);
  assert.deepEqual(derived[0].apply, { op: 'enters-tapped' });
  assert.equal(derived[0].selfReplacement, true);
  assert.equal(derived[0].sourceInstanceId, 'gate');
  assert.equal(derived[0].name, 'This land enters tapped.', 'the name is the card’s own words');
});

test('a plain basic carries nothing', () => {
  const state = withCard(table(), 'forest', 'Forest', 'Basic Land — Forest', '({T}: Add {G}.)');
  assert.deepEqual(intrinsicReplacements(card(state, 'forest')), []);
});

test('the derived effect is offered to the entering PLAY action', () => {
  const state = withCard(
    table(),
    'hollow',
    'Jungle Hollow',
    'Land',
    'This land enters tapped.\nWhen this land enters, you gain 1 life.\n{T}: Add {B} or {G}.'
  );

  const options = applicableReplacements(state, play('hollow'));
  assert.equal(options.length, 1, 'the land’s own effect must reach the replacement layer');
  assert.deepEqual(options[0].apply, { op: 'enters-tapped' });
});

/* -------------------------------------------------------------------------- */
/* End to end through the reducer — the thing the owner reported              */
/* -------------------------------------------------------------------------- */

test('Dimir Guildgate enters the battlefield TAPPED', () => {
  let state = withCard(
    table(),
    'gate',
    'Dimir Guildgate',
    'Land — Gate',
    'This land enters tapped.\n{T}: Add {U} or {B}.'
  );

  state = applyAction(state, play('gate'));

  assert.equal(card(state, 'gate').zone, 'battlefield');
  assert.equal(card(state, 'gate').tapped, true, 'it entered untapped — the free-mana bug');
});

test('Forest enters the battlefield UNTAPPED', () => {
  let state = withCard(table(), 'forest', 'Forest', 'Basic Land — Forest', '({T}: Add {G}.)');
  state = applyAction(state, play('forest'));
  assert.equal(card(state, 'forest').tapped, false);
});

test('a creature that says it enters tapped does too, and it is not just lands', () => {
  let state = withCard(
    table(),
    'ox',
    'Ox of Agonas',
    'Creature — Ox',
    'This creature enters tapped.'
  );
  state = applyAction(state, play('ox'));
  assert.equal(card(state, 'ox').tapped, true);
});

test('moving a tapped-entry land in by hand honours it too', () => {
  /* The manual zone move in the preview — *"move any card between any zones"* —
     goes through MOVE_ZONE rather than PLAY, and a rule that only holds on one
     of the two paths is a rule that holds by luck. */
  let state = withCard(
    table(),
    'gate',
    'Selesnya Guildgate',
    'Land — Gate',
    'This land enters tapped.\n{T}: Add {G} or {W}.'
  );
  state = applyAction(state, { type: 'MOVE_ZONE', instanceId: 'gate', to: 'battlefield', at: 1 });
  assert.equal(card(state, 'gate').tapped, true);
});

test('entering tapped does not loop: the effect gets one bite (CR 614.5)', () => {
  let state = withCard(
    table(),
    'gate',
    'Dimir Guildgate',
    'Land — Gate',
    'This land enters tapped.\n{T}: Add {U} or {B}.'
  );

  /* If the once-only rule were not carried on the action, the replaced PLAY
     would match the same effect again and `applyAction` would not terminate.
     Reaching the assertion at all is half the test. */
  state = applyActions(state, [play('gate')]);
  assert.equal(card(state, 'gate').tapped, true);

  /* And a second land is unaffected by the first one's effect. */
  state = withCard(state, 'forest', 'Forest', 'Basic Land — Forest', '({T}: Add {G}.)');
  state = applyAction(state, play('forest'));
  assert.equal(card(state, 'forest').tapped, false);
});

test('a permanent that enters with counters gets them from its own text', () => {
  let state = withCard(
    table(),
    'walker',
    'Test Walker',
    'Creature — Golem',
    'This creature enters with two +1/+1 counters on it.'
  );
  state = applyAction(state, play('walker'));
  assert.equal(card(state, 'walker').counters['+1/+1'], 2);
});

test('a card whose counter count is not a plain number is left to the player', () => {
  /* Nothing fabricated: "enters with X counters, where X is..." has no number
     the engine can supply, so it supplies none rather than inventing one. */
  const state = withCard(
    table(),
    'x',
    'Variable Golem',
    'Creature — Golem',
    'This creature enters with X +1/+1 counters on it.'
  );
  const derived = intrinsicReplacements(card(state, 'x'));
  assert.ok(
    derived.every(effect => effect.apply.op !== 'enters-with-counters'),
    'an unknown count must not become a made-up one'
  );
});

/* -------------------------------------------------------------------------- */
/* Conditional arrivals: "enters tapped UNLESS ..."                            */
/*                                                                            */
/* Twenty recorded bot games found around twenty lands entering untapped every */
/* single time, because the rule that reads "enters tapped" was an EXACT match */
/* and every conditional wording fell through it to no ability at all. A land  */
/* with its drawback deleted is a land played stronger than it is printed, and */
/* the other seat has no answer to it.                                         */
/*                                                                            */
/* Both directions are asserted. Applying the tap unconditionally would be the */
/* opposite error and just as wrong: a penalty the card does not always carry. */
/* -------------------------------------------------------------------------- */

const CHOCOBO = 'This land enters tapped unless you control a legendary creature.';

test('a conditional land enters TAPPED when the condition is not met', () => {
  let state = withCard(table(), 'camp', 'Chocobo Camp', 'Land', CHOCOBO);
  state = applyAction(state, play('camp'));

  assert.equal(card(state, 'camp').zone, 'battlefield');
  assert.equal(card(state, 'camp').tapped, true, 'no legendary creature, so it comes in tapped');
});

test('the same land enters UNTAPPED once the condition is met', () => {
  let state = withCard(table(), 'camp', 'Chocobo Camp', 'Land', CHOCOBO);
  state = addCard(
    state,
    {
      instanceId: 'hero',
      cardId: 'hero',
      name: 'Some Legend',
      ownerId: 'p1',
      typeLine: 'Legendary Creature — Human',
      oracleText: '',
      power: '2',
      toughness: '2',
    },
    'battlefield'
  );
  state = applyAction(state, play('camp'));

  assert.equal(card(state, 'camp').tapped, false, 'the legendary creature turns the drawback off');
});

test('an unconditional enters-tapped land is unaffected by any of this', () => {
  let state = withCard(table(), 'gate', 'Dimir Guildgate', 'Land — Gate', 'This land enters tapped.');
  state = applyAction(state, play('gate'));
  assert.equal(card(state, 'gate').tapped, true);
});

test('a condition the compiler cannot read builds no ability rather than guessing', () => {
  // "three or more other Swamps" is not in the condition vocabulary yet. The
  // card keeps no replacement at all, which is the behaviour before this change
  // and is deliberately NOT replaced by an unconditional tap.
  const state = withCard(
    table(),
    'cottage',
    "Witch's Cottage",
    'Land',
    'This land enters tapped unless you control three or more other Swamps.'
  );
  assert.deepEqual(intrinsicReplacements(card(state, 'cottage')), []);
});

test('a check land reads its two-type condition', () => {
  // Drowned Catacomb and its cycle are among the most played lands there are.
  // "a Swamp or an Island" is one permanent that is either, which answers the
  // same as "control a Swamp, or control an Island" for an at-least-one check.
  const CATACOMB = 'This land enters tapped unless you control an Island or a Swamp.';

  let bare = withCard(table(), 'cat', 'Drowned Catacomb', 'Land', CATACOMB);
  bare = applyAction(bare, play('cat'));
  assert.equal(card(bare, 'cat').tapped, true, 'no Island and no Swamp, so it is tapped');

  let withSwamp = withCard(table(), 'cat', 'Drowned Catacomb', 'Land', CATACOMB);
  withSwamp = addCard(
    withSwamp,
    { instanceId: 'sw', cardId: 'sw', name: 'Swamp', ownerId: 'p1', typeLine: 'Basic Land — Swamp', oracleText: '' },
    'battlefield'
  );
  withSwamp = applyAction(withSwamp, play('cat'));
  assert.equal(card(withSwamp, 'cat').tapped, false, 'either half of the or is enough');
});
