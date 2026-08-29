/**
 * Drawing, milling, damage and equipping BY HAND, through the path a player
 * presses.
 *
 *   node --test --experimental-strip-types src/lib/game/by-hand.test.ts
 *
 * Four actions, all implemented in the engine, all reduced correctly, all
 * covered by passing tests, and on 29 Aug 2026 none of them buildable by any
 * control in play mode. Measured by `scripts/playtest/action-census.mjs`, which
 * walks the real import graph rather than looking for a name in the tree:
 *
 *   DRAW         only `setup.ts`, dealing the opening hand and mulligans
 *   MOVE_ZONE    from a library: nothing, ever
 *   DAMAGE       only `combat.ts`, `effects.ts` and compiled abilities
 *   DAMAGE_CARD  the same
 *   ATTACH       only `abilities/to-actions.ts` and `xmage/objects.ts`
 *
 * With the compiled bridge running about 2.7% of the catalogue that is a table
 * where you cannot draw a card, cannot mill one, cannot record a Shock, and
 * cannot put a sword on a creature — for 97% of the cards that ask you to.
 *
 * These tests deliberately do NOT construct a `GameAction` literal, for the
 * reason `tokens.test.ts` sets out at length: a reducer test proves the rule
 * and says nothing about whether anybody can reach it. Every one starts at the
 * menu a panel renders — `manualControlsFor`, `playerControlsFor`,
 * `libraryControlsFor` — or at the `manual.ts` builder those menus bind, and
 * asserts on the state that comes back out of `applyAction`. Delete the control
 * and these fail.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, createGame } from './rules.ts';
import {
  attachTo,
  bottomTop,
  clearCardDamage,
  damageCard,
  damagePlayer,
  drawCards,
  exileTop,
  libraryControlsFor,
  manualControlsFor,
  millTop,
  playerControlsFor,
  topOfLibrary,
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
  ownerId?: string;
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
    const owner = spec.ownerId ?? 'p1';
    state = addCard(
      state,
      {
        instanceId: spec.id,
        cardId: spec.id,
        name: spec.name,
        ownerId: owner,
        controllerId: owner,
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

/** A library of `n` plain cards, top first, named so order is checkable. */
function withLibrary(state: GameState, n: number, playerId = 'p1'): GameState {
  let next = state;
  for (let i = 0; i < n; i++) {
    next = addCard(
      next,
      {
        instanceId: `lib-${i}`,
        cardId: `lib-${i}`,
        name: `Card ${i}`,
        ownerId: playerId,
        controllerId: playerId,
        typeLine: 'Creature — Test',
        oracleText: '',
        power: '1',
        toughness: '1',
      },
      'library'
    );
  }
  return next;
}

/** Dispatch a control's batch exactly the way a panel does. */
function press(state: GameState, actions: GameAction[]): GameState {
  let next = state;
  for (const action of actions) next = applyAction(next, action);
  return next;
}

const zoneOf = (state: GameState, playerId: string, zone: Zone) =>
  state.players.find(p => p.id === playerId)!.zones[zone];

function cardControl(state: GameState, card: CardInstance, id: string) {
  const found = manualControlsFor(state, card).find(entry => entry.id === id);
  assert.ok(found, `no control with id ${id}. The panel renders this menu, so a missing id is a missing button.`);
  return found;
}

function seatControl(state: GameState, playerId: string, id: string) {
  const found = playerControlsFor(state, playerId).find(entry => entry.id === id);
  assert.ok(found, `no seat control with id ${id}`);
  return found;
}

function libControl(state: GameState, playerId: string, id: string) {
  const found = libraryControlsFor(state, playerId).find(entry => entry.id === id);
  assert.ok(found, `no library control with id ${id}`);
  return found;
}

/* ------------------------------------------------------------------ *
 * The top of your library                                            *
 * ------------------------------------------------------------------ */

test('the library menu offers draw, mill, exile and bottom', () => {
  const state = withLibrary(game(), 10);
  const groups = new Set(libraryControlsFor(state, 'p1').map(c => c.group));
  assert.deepEqual(
    [...groups].sort(),
    ['bottom', 'draw', 'exile', 'mill'],
    'all four are things a Commander player does to their own library every game',
  );
});

test('drawing by hand puts the top card in your hand', () => {
  const state = withLibrary(game(), 10);
  const top = zoneOf(state, 'p1', 'library')[0];
  const next = press(state, libControl(state, 'p1', 'library:draw:1').actions);

  assert.equal(zoneOf(next, 'p1', 'library').length, 9);
  assert.ok(zoneOf(next, 'p1', 'hand').includes(top), 'the card that was on top is the one drawn');
});

test('milling four moves exactly the top four, in order, and reveals nothing else', () => {
  const state = withLibrary(game(), 10);
  const beforeTop = zoneOf(state, 'p1', 'library').slice(0, 4);

  const next = press(state, libControl(state, 'p1', 'library:mill:4').actions);

  assert.equal(zoneOf(next, 'p1', 'library').length, 6);
  assert.deepEqual(
    zoneOf(next, 'p1', 'graveyard'),
    beforeTop,
    'the four that were on top, in the order they were on top',
  );
});

test('exiling from the top does not touch the graveyard', () => {
  const state = withLibrary(game(), 10);
  const next = press(state, exileTop(state, 'p1', 2));
  assert.equal(zoneOf(next, 'p1', 'exile').length, 2);
  assert.equal(zoneOf(next, 'p1', 'graveyard').length, 0);
  assert.equal(zoneOf(next, 'p1', 'library').length, 8);
});

test('putting cards on the bottom keeps their order rather than reversing it', () => {
  const state = withLibrary(game(), 6);
  const [first, second, ...rest] = zoneOf(state, 'p1', 'library');

  const next = press(state, bottomTop(state, 'p1', 2));

  assert.deepEqual(
    zoneOf(next, 'p1', 'library'),
    [...rest, first, second],
    'the old top card ends up above the one that was under it, as at a table',
  );
});

test('a library control never offers to move more cards than the library holds', () => {
  const state = withLibrary(game(), 2);
  const ids = libraryControlsFor(state, 'p1').map(c => c.id);
  assert.ok(ids.includes('library:mill:2'), 'two cards, so milling two is offered');
  assert.ok(
    !ids.some(id => id.endsWith(':3') || id.endsWith(':5')),
    'drawing from an empty library should happen because the game asked, not because a button was there',
  );
});

test('reading the top of a library does not move or reveal anything', () => {
  const state = withLibrary(game(), 10);
  const top = topOfLibrary(state, 'p1', 3);
  assert.equal(top.length, 3);
  assert.equal(zoneOf(state, 'p1', 'library').length, 10, 'looking is not a move');
});

test('milling an empty library asks for nothing', () => {
  const state = game();
  assert.deepEqual(millTop(state, 'p1', 4), []);
  assert.deepEqual(drawCards('p1', 0), []);
  assert.deepEqual(libraryControlsFor(state, 'nobody'), []);
});

/* ------------------------------------------------------------------ *
 * Damage                                                             *
 * ------------------------------------------------------------------ */

test('the card menu offers damage, and it is not the toughness nudge', () => {
  const state = game([{ id: 'bear', name: 'Grizzly Bears' }]);
  const controls = manualControlsFor(state, state.cards.bear);
  assert.ok(
    controls.some(c => c.group === 'damage'),
    'nothing outside combat and ability resolution had ever built a DAMAGE_CARD',
  );
  assert.ok(
    controls.some(c => c.group === 'stats'),
    'the stat nudges stay: they are a different fact and both are needed',
  );
});

test('marked damage wears off at end of turn where a toughness nudge does not', () => {
  const state = game([{ id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '3' }]);

  const damaged = press(state, cardControl(state, state.cards.bear, 'damage:+2').actions);
  assert.equal(damaged.cards.bear.damage, 2, 'two damage is marked on it (CR 119.3)');
  assert.equal(damaged.cards.bear.toughnessOverride, undefined, 'and its toughness is untouched');

  // The other route a player was forced to use when no damage control existed.
  const nudged = press(state, cardControl(state, state.cards.bear, 'stat:t-').actions);
  assert.notEqual(
    nudged.cards.bear.toughnessOverride,
    undefined,
    'a toughness override is permanent, which is why it was the wrong way to record a Shock',
  );
});

test('three damage on a 2/2 destroys it, because state-based actions still run', () => {
  const state = game([{ id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' }]);
  const next = press(state, damageCard('bear', 3));
  assert.equal(next.cards.bear.zone, 'graveyard', 'CR 704.5g, checked by sba.ts after the action');
});

test('one point of deathtouch damage is lethal, and the amount alone cannot say so', () => {
  const state = game([{ id: 'ox', name: 'Ox', power: '1', toughness: '4' }]);

  const plain = press(state, damageCard('ox', 1));
  assert.equal(plain.cards.ox.zone, 'battlefield', 'one damage on a 1/4 is nothing');

  const touched = press(state, cardControl(state, state.cards.ox, 'damage:deathtouch').actions);
  assert.equal(touched.cards.ox.zone, 'graveyard', 'CR 702.2b');
});

test('clearing damage takes all of it off and does not go negative', () => {
  const state = game([{ id: 'wall', name: 'Wall', power: '0', toughness: '9' }]);
  const hurt = press(state, damageCard('wall', 4));
  assert.equal(hurt.cards.wall.damage, 4);

  const clean = press(hurt, clearCardDamage(hurt.cards.wall));
  assert.equal(clean.cards.wall.damage, 0);
  assert.deepEqual(clearCardDamage(clean.cards.wall), [], 'nothing to take off is no action at all');
});

test('the seat menu offers damage separately from a life change', () => {
  const state = game();
  const damage = playerControlsFor(state, 'p1').filter(c => c.group === 'damage');
  assert.ok(damage.length > 0, 'nothing had ever built a DAMAGE outside combat and resolution');

  const next = press(state, seatControl(state, 'p1', 'damage:3').actions);
  assert.equal(next.players[0].life, 37, 'three damage costs three life');
});

test('damage dealt as poison is poison, which a life change cannot express', () => {
  const state = game();
  const next = press(state, seatControl(state, 'p1', 'damage:infect').actions);
  assert.equal(next.players[0].poison, 1, 'infect and toxic deal damage as poison counters');
  assert.equal(next.players[0].life, 40, 'and take no life');
});

test('a negative or zero amount is refused rather than reversed', () => {
  assert.deepEqual(damagePlayer('p1', 0), [], 'dealing no damage is not an event');
  assert.deepEqual(damagePlayer('p1', -3), [], 'and damage cannot be negative');
});

/* ------------------------------------------------------------------ *
 * Attach                                                             *
 * ------------------------------------------------------------------ */

const SWORD: Spec = {
  id: 'sword',
  name: 'Colossus Hammer',
  typeLine: 'Artifact — Equipment',
  oracleText: 'Equipped creature gets +10/+10 and loses flying. Equip {8}',
  power: undefined,
  toughness: undefined,
};

test('the card menu offers a host for an Equipment the compiler never read', () => {
  const state = game([SWORD, { id: 'bear', name: 'Grizzly Bears' }]);
  const attach = manualControlsFor(state, state.cards.sword).filter(c => c.group === 'attach');

  assert.ok(
    attach.some(c => c.id === 'attach:bear'),
    'ATTACH was back to being built only by ability resolution, so an Equipment on a ' +
      'board of cards the bridge cannot read sat there forever',
  );
});

test('attaching by hand puts the Equipment on the creature', () => {
  const state = game([SWORD, { id: 'bear', name: 'Grizzly Bears' }]);
  const next = press(state, cardControl(state, state.cards.sword, 'attach:bear').actions);
  assert.equal(next.cards.sword.attachedTo, 'bear');
});

test('taking it off is offered only once it is on something', () => {
  const state = game([SWORD, { id: 'bear', name: 'Grizzly Bears' }]);
  assert.ok(
    !manualControlsFor(state, state.cards.sword).some(c => c.id === 'attach:off'),
    'nothing to take off yet',
  );

  const on = press(state, attachTo('sword', 'bear'));
  const off = press(on, cardControl(on, on.cards.sword, 'attach:off').actions);
  assert.equal(off.cards.sword.attachedTo, undefined);
});

test('the host it is already on is not offered again', () => {
  const state = press(
    game([SWORD, { id: 'bear', name: 'Grizzly Bears' }, { id: 'ox', name: 'Ox' }]),
    attachTo('sword', 'bear')
  );
  const ids = manualControlsFor(state, state.cards.sword)
    .filter(c => c.group === 'attach')
    .map(c => c.id);
  assert.ok(!ids.includes('attach:bear'), 'it is already there');
  assert.ok(ids.includes('attach:ox'), 'the other creature still is');
});

test('a plain creature gets no attach controls', () => {
  const state = game([{ id: 'bear', name: 'Grizzly Bears' }]);
  assert.equal(
    manualControlsFor(state, state.cards.bear).filter(c => c.group === 'attach').length,
    0,
    'only an Equipment, an Aura or a Fortification is put on something',
  );
});

test('the hosts offered are the engine’s own answer, so an Aura cannot go on a land', () => {
  const state = game([
    {
      id: 'aura',
      name: 'Test Aura',
      typeLine: 'Enchantment — Aura',
      oracleText: 'Enchant creature\nEnchanted creature gets +2/+2.',
    },
    { id: 'bear', name: 'Grizzly Bears' },
    { id: 'forest', name: 'Forest', typeLine: 'Basic Land — Forest', power: undefined, toughness: undefined },
  ]);
  const ids = manualControlsFor(state, state.cards.aura)
    .filter(c => c.group === 'attach')
    .map(c => c.id);
  assert.ok(ids.includes('attach:bear'));
  assert.ok(!ids.includes('attach:forest'), 'Enchant creature is enforced by attach.ts, not re-derived here');
});
