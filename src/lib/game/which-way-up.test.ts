/**
 * Face down, face up, turned over, goaded, mana in the pool, untap everything.
 *
 *   node --test --experimental-strip-types src/lib/game/which-way-up.test.ts
 *
 * Six things a player does at a table that this engine could not represent on
 * 29 Aug 2026, found by asking the question one level below the action census:
 * not "which action does nobody build" but "which FIELD does nothing write".
 * `scripts/playtest/state-census.mjs` asks it; `CardInstance.faceDown` and
 * `CardInstance.flipped` were the answer. Both were declared, both were
 * initialised to `false` when a card is dealt, both were carried forward on
 * every zone change, and `mana.ts::faceTypeLine` READ `flipped` to decide which
 * half of a `Name // Name` type line is in play — which decides whether a
 * permanent counts as a land, a creature or a permanent at all. Grepping the
 * whole of `src`, nothing ever set either to `true` except the network
 * projection, which uses `faceDown` for something else entirely.
 *
 * No action was missing, so the action census was silent. The STATE was.
 *
 * As in `by-hand.test.ts` and `tokens.test.ts`, nothing here constructs a
 * `GameAction` literal. Every test starts at the menu a panel renders and
 * asserts on what comes back out of `applyAction`, so deleting the control
 * fails the test rather than leaving a green suite over an unreachable rule.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, createGame } from './rules.ts';
import { manualControlsFor, playerControlsFor } from './manual.ts';
import { faceTypeLine, isLand, manaPoolOf } from './mana.ts';
import { markKey } from './marks.ts';
import type { GameAction, GameState, Zone } from './types.ts';

/* ------------------------------------------------------------------ */

function game(
  specs: Array<{
    id: string;
    name: string;
    typeLine?: string;
    zone?: Zone;
    tapped?: boolean;
  }> = []
): GameState {
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
        oracleText: '',
        power: '2',
        toughness: '2',
        tapped: spec.tapped,
      },
      spec.zone ?? 'battlefield'
    );
  }
  return state;
}

const run = (state: GameState, actions: GameAction[]): GameState =>
  actions.reduce((s, a) => applyAction(s, a), state);

/** Find one control by id on the menu a panel would render. */
function control(state: GameState, instanceId: string, id: string) {
  const card = state.cards[instanceId];
  assert.ok(card, `no card ${instanceId}`);
  const found = manualControlsFor(state, card).find(c => c.id === id);
  assert.ok(
    found,
    `no control "${id}" on ${card.name}. Offered: ` +
      manualControlsFor(state, card).map(c => c.id).join(', ')
  );
  return found;
}

/* ------------------------------------------------------------------ */
/* Face down                                                          */
/* ------------------------------------------------------------------ */

test('a permanent can be turned face down and face up again from the card menu', () => {
  let state = game([{ id: 'c1', name: 'Ainok Survivalist' }]);
  assert.equal(state.cards.c1.faceDown, false, 'starts face up');

  state = run(state, control(state, 'c1', 'face:down').actions);
  assert.equal(state.cards.c1.faceDown, true, 'the control turned it face down');

  // The same control now reads the other way and turns it back.
  const back = control(state, 'c1', 'face:down');
  assert.equal(back.label, 'Turn it face up');
  assert.equal(back.active, true);
  state = run(state, back.actions);
  assert.equal(state.cards.c1.faceDown, false);
});

test('turning a card face down does not also turn it over', () => {
  let state = game([{ id: 'c1', name: 'Delver of Secrets // Insectile Aberration', typeLine: 'Creature — Human Wizard // Creature — Human Insect' }]);
  state = run(state, control(state, 'c1', 'face:over').actions);
  assert.equal(state.cards.c1.flipped, true);

  state = run(state, control(state, 'c1', 'face:down').actions);
  assert.equal(state.cards.c1.faceDown, true);
  assert.equal(state.cards.c1.flipped, true, 'the other side was left where it was');
});

test('a card with one face is not offered a turn-over control', () => {
  const state = game([{ id: 'c1', name: 'Grizzly Bears' }]);
  const ids = manualControlsFor(state, state.cards.c1).map(c => c.id);
  assert.ok(!ids.includes('face:over'), 'a control that would do nothing is not offered');
  assert.ok(ids.includes('face:down'), 'but a permanent can always be turned face down');
});

test('turning a two-faced card over changes which face the rules read', () => {
  // `faceTypeLine` has read `flipped` since it was written and nothing could
  // set it, so this branch had never once been taken by the app.
  let state = game([
    {
      id: 'c1',
      name: 'Bala Ged Recovery // Bala Ged Sanctuary',
      typeLine: 'Sorcery // Land',
    },
  ]);
  assert.equal(faceTypeLine(state.cards.c1), 'sorcery');
  assert.equal(isLand(state.cards.c1), true, 'the whole type line still says land');

  state = run(state, control(state, 'c1', 'face:over').actions);
  assert.equal(faceTypeLine(state.cards.c1), 'land', 'the back face is the one in play now');
});

test('exile face down is one move, so the table never reads the card', () => {
  let state = game([{ id: 'c1', name: 'Praetor Grasped' }]);
  const exile = control(state, 'c1', 'zone:exile-face-down');

  // The batch must put the card down BEFORE it moves, or there is a state in
  // between where the card is in exile face up.
  const faceIndex = exile.actions.findIndex(a => a.type === 'SET_FACE');
  const moveIndex = exile.actions.findIndex(a => a.type === 'MOVE_ZONE');
  assert.ok(faceIndex >= 0 && moveIndex >= 0);
  assert.ok(faceIndex < moveIndex, 'face down first, then the move');

  state = run(state, exile.actions);
  assert.equal(state.cards.c1.zone, 'exile');
  assert.equal(state.cards.c1.faceDown, true);
});

test('a face-down card that leaves for the graveyard is revealed', () => {
  // CR 701.36e. `moveCard` already carried `faceDown` into the battlefield and
  // exile and cleared it everywhere else; nothing had ever set it, so the rule
  // had never run.
  let state = game([{ id: 'c1', name: 'Ainok Survivalist' }]);
  state = run(state, control(state, 'c1', 'face:down').actions);
  state = run(state, control(state, 'c1', 'zone:graveyard').actions);
  assert.equal(state.cards.c1.zone, 'graveyard');
  assert.equal(state.cards.c1.faceDown, false, 'it goes to the graveyard face up');
});

test('a SET_FACE that says nothing is refused rather than logged as a change', () => {
  const state = game([{ id: 'c1', name: 'Ainok Survivalist' }]);
  const before = state.version;
  const after = applyAction(state, { type: 'SET_FACE', instanceId: 'c1' });
  assert.equal(after.version, before, 'nothing was applied');
});

test('the log names a card going down and withholds it coming back up', () => {
  let state = game([{ id: 'c1', name: 'Willbender' }]);
  state = run(state, control(state, 'c1', 'face:down').actions);
  const down = state.log[state.log.length - 1].message ?? '';
  assert.ok(down.includes('Willbender'), `down: ${down}`);
  assert.ok(down.includes('face down'), `down: ${down}`);

  state = run(state, control(state, 'c1', 'face:down').actions);
  const up = state.log[state.log.length - 1].message ?? '';
  assert.ok(!up.includes('Willbender'), `turning up must not name the card first: ${up}`);
  assert.ok(up.includes('face up'), `up: ${up}`);
});

/* ------------------------------------------------------------------ */
/* Goaded, and the rest of the table states                           */
/* ------------------------------------------------------------------ */

test('a creature can be goaded from the card menu, and un-goaded', () => {
  let state = game([{ id: 'c1', name: 'Grizzly Bears' }]);
  const goad = control(state, 'c1', 'state:Goaded');
  assert.equal(goad.label, 'Goaded');
  assert.equal(goad.active, false);

  state = run(state, goad.actions);
  assert.equal(state.cards.c1.counters[markKey('Goaded')], 1);
  assert.ok(
    (state.log[state.log.length - 1].message ?? '').includes('Goaded'),
    'the table can see it in the log'
  );

  const off = control(state, 'c1', 'state:Goaded');
  assert.equal(off.active, true, 'the control knows it is on');
  state = run(state, off.actions);
  assert.equal(state.cards.c1.counters[markKey('Goaded')] ?? 0, 0);
});

test('a table state is a mark, so it never leaks its fence into the log', () => {
  let state = game([{ id: 'c1', name: 'Grizzly Bears' }]);
  state = run(state, control(state, 'c1', 'state:Phased out').actions);
  const line = state.log[state.log.length - 1].message ?? '';
  assert.ok(!line.includes('mark:'), `the prefix must never reach a player: ${line}`);
});

test('table states are only offered on the battlefield', () => {
  const state = game([{ id: 'c1', name: 'Grizzly Bears', zone: 'graveyard' }]);
  const ids = manualControlsFor(state, state.cards.c1).map(c => c.id);
  assert.ok(!ids.some(id => id.startsWith('state:')), 'a card in a graveyard is not goaded');
});

/* ------------------------------------------------------------------ */
/* Mana, and untapping                                                */
/* ------------------------------------------------------------------ */

function seatControl(state: GameState, playerId: string, id: string) {
  const found = playerControlsFor(state, playerId).find(c => c.id === id);
  assert.ok(
    found,
    `no seat control "${id}". Offered: ` +
      playerControlsFor(state, playerId).map(c => c.id).join(', ')
  );
  return found;
}

test('mana can be put into a pool by hand, in every colour and colourless', () => {
  let state = game();
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) {
    state = run(state, seatControl(state, 'p1', `mana:${color}`).actions);
  }
  const pool = manaPoolOf(state, 'p1');
  assert.equal(pool.length, 6);
  assert.deepEqual(
    pool.map(unit => unit.color).sort(),
    ['B', 'C', 'G', 'R', 'U', 'W']
  );
});

test('the log says a seat added mana, in the tense every other line uses', () => {
  // "You adds {G} from By hand." was on screen the first time this control was
  // pressed: present tense against a subject called "You", and a source name
  // dropped into a sentence template that reads ` from ${name}`.
  let state = game();
  state = run(state, seatControl(state, 'p1', 'mana:G').actions);
  const line = state.log[state.log.length - 1].message ?? '';
  assert.equal(line, 'One added {G}.');
  assert.ok(!/ adds /.test(line), 'past tense, like every other line in the log');
  assert.ok(!/by hand/i.test(line), 'no source, because nothing on the table produced it');
});

test('the mana control reports what is already floating', () => {
  let state = game();
  state = run(state, seatControl(state, 'p1', 'mana:R').actions);
  state = run(state, seatControl(state, 'p1', 'mana:R').actions);
  assert.equal(seatControl(state, 'p1', 'mana:R').count, 2);
  assert.equal(seatControl(state, 'p1', 'mana:G').count, 0);
});

test('untap everything untaps this seat and leaves the other seat alone', () => {
  let state = game([
    { id: 'a', name: 'Mine one', tapped: true },
    { id: 'b', name: 'Mine two', tapped: true },
  ]);
  state = addCard(
    state,
    {
      instanceId: 'c',
      cardId: 'c',
      name: 'Theirs',
      ownerId: 'p2',
      controllerId: 'p2',
      typeLine: 'Creature — Test',
      oracleText: '',
      power: '2',
      toughness: '2',
      tapped: true,
    },
    'battlefield'
  );

  const untap = seatControl(state, 'p1', 'untap:all');
  assert.equal(untap.count, 2, 'the control says how many are tapped');
  state = run(state, untap.actions);
  assert.equal(state.cards.a.tapped, false);
  assert.equal(state.cards.b.tapped, false);
  assert.equal(state.cards.c.tapped, true, "another seat's permanent is not yours to untap");
});
