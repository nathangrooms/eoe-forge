/**
 * Making a token BY HAND, through the path a player actually presses.
 *
 *   node --test --experimental-strip-types src/lib/game/tokens.test.ts
 *
 * `CREATE_TOKEN` was implemented, validated, reduced, firing enters-the-
 * battlefield triggers and cleaned up under CR 704.5d, with passing tests
 * across `effects.test.ts`, `replacement.test.ts`, `watch.test.ts` and the
 * XMage suite. Every one of them built the action by hand and fed it to the
 * reducer. Nothing in the app had ever built one outside ability resolution,
 * so no player could make a Treasure.
 *
 * That is the exact shape of the `ATTACH` failure this project has already
 * been caught by, and `reachability.test.ts` did not catch it. Measured, by
 * replaying that file's own logic against the tree as it was before this
 * change: `offeredToAPlayer('CREATE_TOKEN')` returned **true** while **zero**
 * files outside `src/lib/game` built the action. Five engine exports vouched
 * for it, and four of them are the ability-resolution path:
 *
 *   runEffects         abilities/to-actions.ts   a compiled ability resolving
 *   actionsForTrigger  effects.ts                a trigger resolving
 *   willFizzle         stack.ts                  a spell resolving
 *   makeToken          xmage/objects.ts          a ported XMage effect
 *   createToken        manual.ts                 THIS, the player's path
 *
 * So this is not a hole to be patched. It is the limitation that file's own
 * header admits to in writing: "it accepts any producer, so an action the
 * engine builds during resolution counts as reachable even when the
 * player-initiated path is missing." A card making a Treasure was proof that
 * a Treasure could be made, and it was accepted as proof that a PLAYER could
 * make one. Those are different claims, which is this project's oldest lesson.
 *
 * There is a second, smaller hazard alongside it, worth knowing before someone
 * relies on that ratchet again: `manual.ts` exports `createToken`, and so does
 * the entirely unrelated and completely unimported
 * `src/lib/simulation/tokenGenerator.ts`. The ratchet seeds itself on whether
 * an engine export's NAME appears anywhere outside `src/lib/game`, so a dead
 * module's import line vouches for a live engine function of the same name. It
 * was not the operative cause here, because the four resolution producers
 * above would have vouched for `CREATE_TOKEN` on their own, but it is a real
 * way for a future gap to hide and it costs nothing to know about.
 *
 * Hence these tests. They deliberately do NOT construct a `GameAction`
 * literal, because that is the thing that cannot tell the two claims apart.
 * Every one starts at `manualControlsFor` — the menu `ManualPanel` renders —
 * or at the `manual.ts` builder the panel calls, and asserts on the state that
 * comes out of `applyAction`. If the control disappears from the menu these
 * fail, which is the property that matters and the one a reducer test and a
 * grep-based ratchet both miss.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, createGame } from './rules.ts';
import {
  copyAsToken,
  createToken,
  manualControlsFor,
  moveTo,
  TOKEN_PRESETS,
  tokensNamedBy,
} from './manual.ts';
import type { CardInstance, GameAction, GameState, Zone } from './types.ts';

/* ------------------------------------------------------------------ *
 * Helpers                                                            *
 * ------------------------------------------------------------------ */

interface Spec {
  id: string;
  name: string;
  typeLine?: string;
  oracleText?: string;
  power?: string;
  toughness?: string;
  zone?: Zone;
}

function game(specs: Spec[] = []): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    startingLife: 40,
    players: [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
    ],
  });

  for (const spec of specs) {
    state = addCard(
      state,
      {
        instanceId: spec.id,
        cardId: spec.id,
        name: spec.name,
        ownerId: 'p1',
        controllerId: 'p1',
        typeLine: spec.typeLine ?? 'Creature — Test',
        oracleText: spec.oracleText ?? '',
        power: spec.power ?? '2',
        toughness: spec.toughness ?? '2',
      },
      spec.zone ?? 'battlefield'
    );
  }
  return state;
}

/** Dispatch a control's batch exactly the way `ManualPanel` does. */
function press(state: GameState, actions: GameAction[]): GameState {
  let next = state;
  for (const action of actions) next = applyAction(next, action);
  return next;
}

/** The battlefield permanents a player controls, tokens included. */
function board(state: GameState, playerId = 'p1'): CardInstance[] {
  return Object.values(state.cards).filter(
    card => card.zone === 'battlefield' && card.controllerId === playerId && !card.removedFromGame
  );
}

function preset(name: string) {
  const found = TOKEN_PRESETS.find(entry => entry.name === name);
  assert.ok(found, `${name} is missing from TOKEN_PRESETS`);
  return found;
}

function control(state: GameState, card: CardInstance, id: string) {
  const found = manualControlsFor(state, card).find(entry => entry.id === id);
  assert.ok(
    found,
    `no control with id ${id}. The panel renders this menu, so a missing id is a missing button.`
  );
  return found;
}

/* ------------------------------------------------------------------ *
 * The gap this closes                                                *
 * ------------------------------------------------------------------ */

test('the by-hand menu offers a token, so a control exists that builds CREATE_TOKEN', () => {
  const state = game([{ id: 'rock', name: 'Sol Ring', typeLine: 'Artifact' }]);
  const tokens = manualControlsFor(state, state.cards.rock).filter(
    entry => entry.group === 'tokens'
  );

  assert.ok(
    tokens.length > 0,
    'no control in the whole menu produces a token. That is the state this file was written about.'
  );
  assert.ok(
    tokens.every(entry => entry.actions.some(action => action.type === 'CREATE_TOKEN')),
    'a token control that does not build CREATE_TOKEN would be a button that does nothing'
  );
});

test('a player presses Treasure and a Treasure is on the battlefield', () => {
  const state = game([{ id: 'rock', name: 'Sol Ring', typeLine: 'Artifact' }]);
  const before = board(state).length;

  const next = press(state, createToken('p1', preset('Treasure'), 1));

  assert.equal(board(next).length, before + 1, 'exactly one permanent arrived');
  const made = board(next).find(card => card.isToken);
  assert.ok(made, 'the new permanent is a token');
  assert.equal(made.name, 'Treasure');
  assert.equal(made.controllerId, 'p1');
  assert.match(made.typeLine ?? '', /Treasure/);
});

test('a 1/1 army: pressing Soldier three times leaves three separate creatures', () => {
  let state = game();
  for (let i = 0; i < 3; i++) state = press(state, createToken('p1', preset('Soldier'), 1));

  const army = board(state).filter(card => card.isToken);
  assert.equal(army.length, 3, 'three presses, three tokens');
  assert.equal(new Set(army.map(card => card.instanceId)).size, 3, 'each has its own id');
  for (const soldier of army) {
    assert.equal(soldier.power, '1');
    assert.equal(soldier.toughness, '1');
    assert.equal(soldier.summoningSick, true, 'a token that entered this turn is summoning sick');
  }
});

test('one press can make several at once, and each gets its own id', () => {
  const state = press(game(), createToken('p1', preset('Soldier'), 5));
  const army = board(state).filter(card => card.isToken);
  assert.equal(army.length, 5);
  assert.equal(new Set(army.map(card => card.instanceId)).size, 5);
});

/* ------------------------------------------------------------------ *
 * Spending one                                                       *
 * ------------------------------------------------------------------ */

test('CR 704.5d — a Treasure sacrificed for mana ceases to exist', () => {
  let state = press(game(), createToken('p1', preset('Treasure'), 1));
  const made = board(state).find(card => card.isToken);
  assert.ok(made);

  // Spending a Treasure is sacrificing it: it goes to the graveyard, and the
  // state-based action then removes it from the game entirely.
  state = press(state, moveTo(made.instanceId, 'graveyard'));

  assert.equal(
    state.cards[made.instanceId].removedFromGame,
    true,
    'a token that left the battlefield must be gone, not sitting in the graveyard forever'
  );
  assert.equal(board(state).length, 0, 'the board is empty again');
});

test('a token that dies in combat also ceases to exist', () => {
  let state = press(game(), createToken('p1', preset('Soldier'), 1));
  const soldier = board(state).find(card => card.isToken);
  assert.ok(soldier);

  state = press(state, moveTo(soldier.instanceId, 'graveyard'));
  assert.equal(state.cards[soldier.instanceId].removedFromGame, true);
  assert.equal(
    Object.values(state.cards).filter(card => card.zone === 'graveyard' && !card.removedFromGame)
      .length,
    0,
    'no token is left lying in a graveyard'
  );
});

/* ------------------------------------------------------------------ *
 * Copying a permanent                                                *
 * ------------------------------------------------------------------ */

test('copying a permanent puts a second one on the board', () => {
  const state = game([
    { id: 'angel', name: 'Serra Angel', typeLine: 'Creature — Angel', power: '4', toughness: '4' },
  ]);
  const next = press(state, control(state, state.cards.angel, 'token:copy').actions);

  const copy = board(next).find(card => card.isToken);
  assert.ok(copy, 'the copy is a token');
  assert.equal(copy.name, 'Serra Angel');
  assert.equal(copy.power, '4');
  assert.equal(copy.toughness, '4');
  assert.ok(!next.cards.angel.isToken, 'the original is untouched and is not a token');
});

test('CR 707.2 — a copy takes printed values, so counters are NOT copied', () => {
  let state = game([
    { id: 'bear', name: 'Grizzly Bears', typeLine: 'Creature — Bear', power: '2', toughness: '2' },
  ]);
  // Four +1/+1 counters. On the board this is a 6/6.
  state = applyAction(state, {
    type: 'CARD_COUNTER',
    instanceId: 'bear',
    counter: '+1/+1',
    delta: 4,
  });
  assert.equal(state.cards.bear.counters['+1/+1'], 4);

  const next = press(state, copyAsToken(state.cards.bear, 'p1'));
  const copy = board(next).find(card => card.isToken);
  assert.ok(copy);
  assert.equal(copy.power, '2', 'a copy of a 2/2 carrying counters is a 2/2, not a 6/6');
  assert.equal(copy.toughness, '2');
  assert.deepEqual(copy.counters, {}, 'counters are not copiable values');
});

test('copying a token does not produce a "Token Token" type line', () => {
  const state = press(game(), createToken('p1', preset('Treasure'), 1));
  const made = board(state).find(card => card.isToken);
  assert.ok(made);

  const next = press(state, copyAsToken(made, 'p1'));
  const copy = board(next).find(card => card.instanceId !== made.instanceId);
  assert.ok(copy);
  assert.doesNotMatch(copy.typeLine ?? '', /token\s+token/i);
  assert.match(copy.typeLine ?? '', /^Token /);
});

/* ------------------------------------------------------------------ *
 * Pointing at the ability rather than reprinting it                  *
 * ------------------------------------------------------------------ */

test('a card that makes Soldiers offers a Soldier first', () => {
  const state = game([
    {
      id: 'captain',
      name: 'Captain',
      oracleText: 'Whenever this creature attacks, create a 1/1 white Soldier creature token.',
    },
  ]);
  assert.deepEqual(
    tokensNamedBy(state.cards.captain).map(spec => spec.name),
    ['Soldier'],
    'the token the card names is the one press that should be offered'
  );
  assert.ok(
    manualControlsFor(state, state.cards.captain).some(
      entry => entry.id === 'token-named:Soldier'
    )
  );
});

test('a Dragon tribal lord that makes no tokens offers no Dragon token', () => {
  const state = game([
    {
      id: 'lord',
      name: 'Dragon Lord',
      typeLine: 'Creature — Dragon',
      oracleText: 'Other Dragons you control get +1/+1.',
    },
  ]);
  assert.deepEqual(
    tokensNamedBy(state.cards.lord),
    [],
    'naming a creature type is not the same as making a token of it'
  );
});

test('a card with no oracle text names nothing rather than guessing', () => {
  const state = game([{ id: 'vanilla', name: 'Scathe Zombies', oracleText: '' }]);
  assert.deepEqual(tokensNamedBy(state.cards.vanilla), []);
});

/* ------------------------------------------------------------------ *
 * The list itself                                                    *
 * ------------------------------------------------------------------ */

test('every preset is a token the reducer accepts and puts on the battlefield', () => {
  for (const entry of TOKEN_PRESETS) {
    const state = press(game(), createToken('p1', entry, 1));
    const made = board(state).find(card => card.isToken);
    assert.ok(made, `${entry.name} produced no permanent`);
    assert.equal(made.name, entry.name);
    // A creature token has a body; an artifact token deliberately does not.
    if (/creature/i.test(entry.typeLine ?? '')) {
      assert.ok(made.power !== undefined, `${entry.name} is a creature with no power`);
      assert.ok(made.toughness !== undefined, `${entry.name} is a creature with no toughness`);
    }
  }
});

test('the presets asked for are all present', () => {
  const asked = [
    'Treasure', 'Clue', 'Food', 'Blood', 'Soldier', 'Goblin', 'Zombie', 'Saproling',
    'Servo', 'Thopter', 'Beast', 'Angel', 'Dragon', 'Elemental', 'Insect', 'Spirit',
    'Cat', 'Wolf', 'Plant',
  ];
  const have = new Set(TOKEN_PRESETS.map(entry => entry.name));
  assert.deepEqual(asked.filter(name => !have.has(name)), []);
});
