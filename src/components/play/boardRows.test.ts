/**
 * Where a permanent lies on the mat.
 *
 *   node --test --experimental-strip-types src/components/play/boardRows.test.ts
 *
 * The rows themselves are the owner's layout and have been stable; what is
 * tested here is the one thing that moves a card out of the row its type line
 * would put it in, which is being attached to something.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rowForCard, splitIntoRows } from './boardRows.ts';
import type { CardInstance } from '../../lib/game/index.ts';

function card(spec: Partial<CardInstance> & { instanceId: string; name: string }): CardInstance {
  return {
    cardId: spec.instanceId,
    ownerId: 'p1',
    controllerId: 'p1',
    zone: 'battlefield',
    typeLine: 'Creature — Bear',
    oracleText: '',
    counters: {},
    damage: 0,
    tapped: false,
    summoningSick: false,
    zoneChangeCounter: 0,
    ...spec,
  } as CardInstance;
}

const names = (cards: readonly CardInstance[]) => cards.map(entry => entry.name);

test('a type line still decides the row', () => {
  assert.equal(rowForCard(card({ instanceId: 'a', name: 'Bear' })), 'creatures');
  assert.equal(rowForCard(card({ instanceId: 'b', name: 'Forest', typeLine: 'Basic Land — Forest' })), 'lands');
  assert.equal(
    rowForCard(card({ instanceId: 'c', name: 'Bonesplitter', typeLine: 'Artifact — Equipment' })),
    'support'
  );
});

test('an unattached Equipment stays in the noncreature block', () => {
  const rows = splitIntoRows([
    card({ instanceId: 'bear', name: 'Grizzly Bears' }),
    card({ instanceId: 'sword', name: 'Bonesplitter', typeLine: 'Artifact — Equipment' }),
  ]);

  assert.deepEqual(names(rows.creatures), ['Grizzly Bears']);
  assert.deepEqual(names(rows.support), ['Bonesplitter']);
});

test('an equipped sword moves to sit beside the creature carrying it', () => {
  const rows = splitIntoRows([
    card({ instanceId: 'elf', name: 'Llanowar Elves' }),
    card({ instanceId: 'bear', name: 'Grizzly Bears' }),
    card({ instanceId: 'sword', name: 'Bonesplitter', typeLine: 'Artifact — Equipment', attachedTo: 'bear' }),
  ]);

  // Immediately after its host, so the mat says which creature is carrying it
  // without anybody reading a word.
  assert.deepEqual(names(rows.creatures), ['Llanowar Elves', 'Grizzly Bears', 'Bonesplitter']);
  assert.deepEqual(names(rows.support), []);
});

test('several attachments on one creature all follow it, in arrival order', () => {
  const rows = splitIntoRows([
    card({ instanceId: 'bear', name: 'Grizzly Bears' }),
    card({ instanceId: 'sword', name: 'Bonesplitter', typeLine: 'Artifact — Equipment', attachedTo: 'bear' }),
    card({ instanceId: 'rancor', name: 'Rancor', typeLine: 'Enchantment — Aura', attachedTo: 'bear' }),
    card({ instanceId: 'elf', name: 'Llanowar Elves' }),
  ]);

  assert.deepEqual(names(rows.creatures), ['Grizzly Bears', 'Bonesplitter', 'Rancor', 'Llanowar Elves']);
});

test('an Aura on a land follows the land into the mana row', () => {
  const rows = splitIntoRows([
    card({ instanceId: 'forest', name: 'Forest', typeLine: 'Basic Land — Forest' }),
    card({ instanceId: 'growth', name: 'Wild Growth', typeLine: 'Enchantment — Aura', attachedTo: 'forest' }),
  ]);

  assert.deepEqual(names(rows.lands), ['Forest', 'Wild Growth']);
  assert.deepEqual(names(rows.support), []);
});

test('an Aura on a creature this seat does not have keeps its own row', () => {
  // The host is on the OPPONENT's mat, so there is nothing here to sit beside.
  const rows = splitIntoRows([
    card({ instanceId: 'aura', name: 'Pacifism', typeLine: 'Enchantment — Aura', attachedTo: 'theirs' }),
  ]);

  assert.deepEqual(names(rows.support), ['Pacifism']);
});

test('every permanent appears exactly once, whatever is attached to what', () => {
  const board = [
    card({ instanceId: 'bear', name: 'Grizzly Bears' }),
    card({ instanceId: 'sword', name: 'Bonesplitter', typeLine: 'Artifact — Equipment', attachedTo: 'bear' }),
    card({ instanceId: 'rancor', name: 'Rancor', typeLine: 'Enchantment — Aura', attachedTo: 'bear' }),
    card({ instanceId: 'forest', name: 'Forest', typeLine: 'Basic Land — Forest' }),
    card({ instanceId: 'rock', name: 'Sol Ring', typeLine: 'Artifact' }),
  ];
  const rows = splitIntoRows(board);
  const drawn = [...rows.creatures, ...rows.lands, ...rows.support].map(entry => entry.instanceId);

  assert.equal(drawn.length, board.length, 'nothing may be drawn twice or dropped');
  assert.deepEqual(new Set(drawn).size, board.length);
});
