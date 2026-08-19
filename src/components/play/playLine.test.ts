/**
 * A watched game has to say what it just did.
 *
 * Owner, about the playtest: *"cant see the users hand and how they are
 * casting"*. These tests pin the three things that answer the second half of
 * that sentence: what was played, where it came from, and what paid for it.
 *
 * The sentences are asserted as whole sentences on purpose. They are
 * user-facing copy, so the copy rules apply: plain words, no em-dashes, and a
 * verb that agrees with a seat called "You".
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { addCard, createGame, planCastFromHand, planLandDrop } from '../../lib/game/index.ts';
import type { ManaColor, GameState, PlayerId, Zone } from '../../lib/game/index.ts';
import { describePlay, joinNames } from './playLine.ts';

function table(): GameState {
  return createGame({
    id: 'g',
    mode: 'full',
    format: 'commander',
    players: [
      { id: 'p1', name: 'You' },
      { id: 'p2', name: 'Surrak' },
    ],
    seed: 1,
    now: 0,
  });
}

function put(
  state: GameState,
  instanceId: string,
  fields: {
    name: string;
    typeLine: string;
    ownerId?: PlayerId;
    manaCost?: string;
    power?: string;
    toughness?: string;
    colorIdentity?: ManaColor[];
  },
  zone: Zone
): GameState {
  return addCard(
    state,
    {
      instanceId,
      cardId: instanceId,
      ownerId: fields.ownerId ?? 'p1',
      name: fields.name,
      typeLine: fields.typeLine,
      manaCost: fields.manaCost,
      power: fields.power,
      toughness: fields.toughness,
      colorIdentity: fields.colorIdentity,
      oracleText: '',
    },
    zone
  );
}

const FOREST = { name: 'Forest', typeLine: 'Basic Land — Forest', colorIdentity: ['G' as ManaColor] };
const BEARS = {
  name: 'Grizzly Bears',
  typeLine: 'Creature — Bear',
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
};

/* -------------------------------------------------------------------------- */
/* The list                                                                   */
/* -------------------------------------------------------------------------- */

test('a list of names reads the way a person would say it', () => {
  assert.equal(joinNames([]), '');
  assert.equal(joinNames(['Forest']), 'Forest');
  assert.equal(joinNames(['Forest', 'Island']), 'Forest and Island');
  assert.equal(joinNames(['Forest', 'Island', 'Swamp']), 'Forest, Island and Swamp');
});

/* -------------------------------------------------------------------------- */
/* Casting                                                                    */
/* -------------------------------------------------------------------------- */

test('a real cast names the card, the zone it left, and every land it tapped', () => {
  let state = put(table(), 'f1', FOREST, 'battlefield');
  state = put(state, 'f2', FOREST, 'battlefield');
  state = put(state, 'bears', BEARS, 'hand');

  const plan = planCastFromHand(state, 'p1', 'bears');
  assert.equal(plan.ok, true, plan.reason);

  const line = describePlay(state, 'p1', plan.actions);
  assert.ok(line);
  assert.equal(line.kind, 'cast');
  assert.equal(line.instanceId, 'bears');
  assert.equal(line.from, 'hand');
  assert.deepEqual(line.paidWith, ['Forest', 'Forest']);
  assert.equal(line.text, 'You casts Grizzly Bears from hand, tapping Forest and Forest.');
});

test('the reader’s own seat gets a verb that agrees with it', () => {
  let state = put(table(), 'f1', FOREST, 'battlefield');
  state = put(state, 'f2', FOREST, 'battlefield');
  state = put(state, 'bears', BEARS, 'hand');

  const plan = planCastFromHand(state, 'p1', 'bears');
  const line = describePlay(state, 'p1', plan.actions, { viewerPlayerId: 'p1' });
  assert.ok(line);
  assert.equal(line.text, 'You cast Grizzly Bears from hand, tapping Forest and Forest.');
});

test('payment is read off the batch, so it can never be attributed to the wrong spell', () => {
  let state = put(table(), 'f1', FOREST, 'battlefield');
  state = put(state, 'f2', FOREST, 'battlefield');
  state = put(state, 'bears', BEARS, 'hand');

  const plan = planCastFromHand(state, 'p1', 'bears');
  // A tap AFTER the play is not payment for it. Reading the whole batch would
  // invent a third Forest that nothing was spent on.
  const line = describePlay(state, 'p1', [...plan.actions, { type: 'TAP', instanceId: 'f1' }]);
  assert.ok(line);
  assert.equal(line.paidWith.length, 2);
});

test('a spell cast with nothing tapped says so rather than looking paid for', () => {
  const state = put(
    table(),
    'bolt',
    { name: 'Lightning Bolt', typeLine: 'Instant', manaCost: '{R}' },
    'hand'
  );
  const line = describePlay(state, 'p1', [
    { type: 'PLAY', instanceId: 'bolt', to: 'graveyard', controllerId: 'p1' },
  ]);
  assert.ok(line);
  assert.match(line.text, /paying nothing/);
});

test('a commander cast says it came from the command zone', () => {
  const state = put(
    table(),
    'cmd',
    {
      name: 'Surrak Dragonclaw',
      typeLine: 'Legendary Creature — Human Warrior',
      manaCost: '{2}{G}{U}{R}',
    },
    'command'
  );
  const line = describePlay(state, 'p1', [
    { type: 'PLAY', instanceId: 'cmd', to: 'battlefield', controllerId: 'p1' },
  ]);
  assert.ok(line);
  assert.equal(line.from, 'command');
  assert.match(line.text, /from the command zone/);
});

/* -------------------------------------------------------------------------- */
/* Lands                                                                      */
/* -------------------------------------------------------------------------- */

test('a land drop is a land drop, not a cast, and pays nothing', () => {
  const state = put(table(), 'f1', FOREST, 'hand');
  const plan = planLandDrop(state, 'p1', 'f1');
  assert.equal(plan.ok, true, plan.reason);

  const line = describePlay(state, 'p1', plan.actions);
  assert.ok(line);
  assert.equal(line.kind, 'land');
  assert.deepEqual(line.paidWith, []);
  assert.equal(line.text, 'You plays Forest from hand.');
});

/* -------------------------------------------------------------------------- */
/* Combat                                                                     */
/* -------------------------------------------------------------------------- */

test('an attack names the creatures and who they are being sent at', () => {
  let state = put(table(), 'a', { name: 'Grizzly Bears', typeLine: 'Creature — Bear' }, 'battlefield');
  state = put(state, 'b', { name: 'Runeclaw Bear', typeLine: 'Creature — Bear' }, 'battlefield');

  const line = describePlay(state, 'p1', [
    {
      type: 'ATTACK',
      attackers: [
        { attackerId: 'a', defenderPlayerId: 'p2', tap: true },
        { attackerId: 'b', defenderPlayerId: 'p2', tap: true },
      ],
    },
  ]);
  assert.ok(line);
  assert.equal(line.kind, 'attack');
  assert.equal(line.text, 'You attacks Surrak with Grizzly Bears and Runeclaw Bear.');
});

test('attacking taps the creature, and that tap is never reported as payment', () => {
  const state = put(table(), 'a', { name: 'Grizzly Bears', typeLine: 'Creature — Bear' }, 'battlefield');
  const line = describePlay(state, 'p1', [
    { type: 'TAP', instanceId: 'a' },
    { type: 'ATTACK', attackers: [{ attackerId: 'a', defenderPlayerId: 'p2' }] },
  ]);
  assert.ok(line);
  assert.deepEqual(line.paidWith, []);
});

test('a block names both sides, so a watcher can see the trade coming', () => {
  let state = put(
    table(),
    'atk',
    { name: 'Grizzly Bears', typeLine: 'Creature — Bear', ownerId: 'p2' },
    'battlefield'
  );
  state = put(state, 'def', { name: 'Wall of Omens', typeLine: 'Creature — Wall' }, 'battlefield');

  const line = describePlay(state, 'p1', [
    { type: 'BLOCK', blocks: [{ blockerId: 'def', attackerId: 'atk' }] },
  ]);
  assert.ok(line);
  assert.equal(line.kind, 'block');
  assert.equal(line.text, 'You: Wall of Omens blocks Grizzly Bears.');
});

/* -------------------------------------------------------------------------- */
/* Silence, deliberately                                                      */
/* -------------------------------------------------------------------------- */

test('turn structure is not a play and produces no line', () => {
  const state = table();
  assert.equal(describePlay(state, 'p1', [{ type: 'ADVANCE_STEP', at: 1 }]), null);
  assert.equal(describePlay(state, 'p1', []), null);
});

/**
 * A creature dying in combat is not a play, and it is not the attacker's.
 *
 * This is the batch `advanceActions` returns at the combat damage step:
 * `resolveCombat` pushes a `MOVE_ZONE` to the graveyard for every creature that
 * took lethal damage, and `resolveCombatAndAdvance` puts `ADVANCE_STEP` on the
 * end of it. `nextBotMove` never returns a `MOVE_ZONE`, so before this guard the
 * only way to reach the move branch at all was through this batch, and the
 * band read "Surrak moves Rumbling Baloth to the graveyard" for a creature
 * Surrak had just killed and never owned. That is a rules consequence dressed
 * up as somebody's decision, which is the one thing this module must not do.
 */
test('a creature dying to combat damage is a consequence, not a decision', () => {
  const state = put(
    table(),
    'baloth',
    { name: 'Rumbling Baloth', typeLine: 'Creature — Beast' },
    'battlefield'
  );

  assert.equal(
    describePlay(state, 'p2', [
      { type: 'MOVE_ZONE', instanceId: 'baloth', to: 'graveyard', at: 1 },
      { type: 'ADVANCE_STEP', at: 1 },
    ]),
    null
  );
});

test('a card that is not in the game produces no line rather than a guess', () => {
  const state = table();
  assert.equal(
    describePlay(state, 'p1', [{ type: 'PLAY', instanceId: 'ghost', to: 'battlefield' }]),
    null
  );
  assert.equal(
    describePlay(state, 'p1', [
      { type: 'ATTACK', attackers: [{ attackerId: 'ghost', defenderPlayerId: 'p2' }] },
    ]),
    null
  );
});

/* -------------------------------------------------------------------------- */
/* Copy rules                                                                 */
/* -------------------------------------------------------------------------- */

test('no sentence this module writes contains an em-dash', () => {
  let state = put(table(), 'f1', FOREST, 'battlefield');
  state = put(state, 'f2', FOREST, 'battlefield');
  state = put(state, 'bears', BEARS, 'hand');
  state = put(state, 'land', FOREST, 'hand');

  const lines = [
    describePlay(state, 'p1', planCastFromHand(state, 'p1', 'bears').actions),
    describePlay(state, 'p1', planLandDrop(state, 'p1', 'land').actions),
    describePlay(state, 'p2', planLandDrop(state, 'p1', 'land').actions),
  ];

  for (const line of lines) {
    assert.ok(line);
    assert.equal(line.text.indexOf('—'), -1, `em-dash in: ${line.text}`);
  }
});

/* -------------------------------------------------------------------------- */
/* A card being put somewhere, in words rather than in zone identifiers        */
/* -------------------------------------------------------------------------- */

test('a card put somewhere names the place the way a player says it', () => {
  const state = put(table(), 'baloth', { name: 'Rumbling Baloth', typeLine: 'Creature — Beast' }, 'battlefield');

  const graveyard = describePlay(
    state,
    'p1',
    [{ type: 'MOVE_ZONE', instanceId: 'baloth', to: 'graveyard' }],
    { viewerPlayerId: 'p1' }
  );
  assert.equal(graveyard?.text, 'You move Rumbling Baloth to the graveyard.');

  const command = describePlay(state, 'p2', [
    { type: 'MOVE_ZONE', instanceId: 'baloth', to: 'command' },
  ]);
  /* This is the regression. The zone was interpolated raw, so it read "to the
     command", which is an engine identifier rather than a thing a player says. */
  assert.equal(command?.text, 'Surrak moves Rumbling Baloth to the command zone.');

  const library = describePlay(state, 'p2', [
    { type: 'MOVE_ZONE', instanceId: 'baloth', to: 'library' },
  ]);
  assert.equal(library?.text, 'Surrak moves Rumbling Baloth to the top of the library.');
});

test('every zone a card can be put in has a phrase, so none can read as jargon', () => {
  const state = put(table(), 'baloth', { name: 'Rumbling Baloth', typeLine: 'Creature — Beast' }, 'battlefield');
  const zones: Zone[] = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'command', 'stack'];

  /* The three the raw identifier got wrong. "to the graveyard" and "to the
     battlefield" are what a player says anyway, so they are not listed. */
  const wasJargon: Partial<Record<Zone, string>> = {
    library: 'to the library.',
    hand: 'to the hand.',
    command: 'to the command.',
  };

  for (const zone of zones) {
    const line = describePlay(state, 'p2', [{ type: 'MOVE_ZONE', instanceId: 'baloth', to: zone }]);
    assert.ok(line, `no line for ${zone}`);
    assert.equal(line.text.indexOf('—'), -1, `em-dash in: ${line.text}`);
    const bad = wasJargon[zone];
    if (bad) assert.ok(!line.text.endsWith(bad), `raw zone name reached the reader: ${line.text}`);
  }
});
