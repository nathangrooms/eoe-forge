/**
 * GATE 3 — behaviour, for P05, P06, P17.
 *
 *   node --test --experimental-strip-types src/lib/game/abilities/primitives/zones.test.ts
 *
 * The pair that matters is A1 against A2 in each primitive: the forced case must
 * resolve and the choice case must not. An implementation that passed A1 by
 * always moving the first N cards would fail A2, and it would fail it the way
 * that matters — by tutoring for the player.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyActions } from '../../rules.ts';
import type { Effect } from '../../../cards/abilities/dsl.ts';
import { returnFromForced, searchLibraryForced, zonePool } from './zones.ts';
import { assertOracleContains, board, ctxFor, env } from './harness.testlib.ts';

const creatureFilter = { sel: 'all', where: { is: 'type', value: 'creature' } } as const;
const basicLandFilter = {
  sel: 'all',
  where: { is: 'and', of: [{ is: 'type', value: 'land' }, { is: 'supertype', value: 'basic' }] },
} as const;

const raiseDead = (count = 1): Extract<Effect, { do: 'return-from' }> => ({
  do: 'return-from',
  zone: 'graveyard',
  who: { who: 'you' },
  what: creatureFilter as never,
  count,
  to: 'hand',
});

const rampantGrowth = (thenShuffle = true): Extract<Effect, { do: 'search-library' }> => ({
  do: 'search-library',
  who: { who: 'you' },
  what: basicLandFilter as never,
  count: 1,
  to: 'battlefield',
  thenShuffle,
  tapped: true,
});

test('P05/cards — the fixture cards are real and say what the spec claims', () => {
  assertOracleContains('Raise Dead', 'from your graveyard to your hand');
  assertOracleContains('Regrowth', 'from your graveyard to your hand');
  assertOracleContains('Rampant Growth', 'Search your library for a basic land card');
  assertOracleContains('Demonic Tutor', 'Search your library for a card');
});

/* ------------------------------------------------------------------ *
 * P17
 * ------------------------------------------------------------------ */

test('P17/A1 — the pool is the matching cards, in stored order', () => {
  const state = board([
    { id: 'g1', card: 'Grizzly Bears', zone: 'graveyard' },
    { id: 'g2', card: 'Forest', zone: 'graveyard' },
    { id: 'g3', card: 'Grizzly Bears', zone: 'graveyard' },
  ]);
  assert.deepEqual(zonePool('graveyard', 'p1', creatureFilter as never, ctxFor(state, 'src')), ['g1', 'g3']);
});

test('P17/A2 — an empty zone is empty', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  assert.deepEqual(zonePool('graveyard', 'p1', creatureFilter as never, ctxFor(state, 'bear')), []);
});

test('P17/A3 — a non-all selector yields NO pool, rather than the whole zone', () => {
  const state = board([{ id: 'g1', card: 'Grizzly Bears', zone: 'graveyard' }]);
  assert.deepEqual(zonePool('graveyard', 'p1', { sel: 'self' }, ctxFor(state, 'g1')), []);
});

test('P17/A4 — the same call twice is identical', () => {
  const state = board([
    { id: 'g1', card: 'Grizzly Bears', zone: 'graveyard' },
    { id: 'g2', card: 'Grizzly Bears', zone: 'graveyard' },
  ]);
  const ctx = ctxFor(state, 'src');
  assert.deepEqual(
    zonePool('graveyard', 'p1', creatureFilter as never, ctx),
    zonePool('graveyard', 'p1', creatureFilter as never, ctx)
  );
});

test('P17/A5 — another player’s graveyard holds only their cards', () => {
  const state = board([
    { id: 'mine', card: 'Grizzly Bears', zone: 'graveyard' },
    { id: 'theirs', card: 'Grizzly Bears', owner: 'p2', zone: 'graveyard' },
  ]);
  assert.deepEqual(zonePool('graveyard', 'p2', creatureFilter as never, ctxFor(state, 'src')), ['theirs']);
});

/* ------------------------------------------------------------------ *
 * P05
 * ------------------------------------------------------------------ */

test('P05/A1 — one eligible card is no choice: it moves, nothing defers', () => {
  const state = board([{ id: 'g1', card: 'Grizzly Bears', zone: 'graveyard' }]);
  const result = returnFromForced(raiseDead(), ctxFor(state, 'rd'), env());

  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].type, 'MOVE_ZONE');
  assert.equal((result.actions[0] as { to: string }).to, 'hand');
  assert.deepEqual(result.deferred, []);

  const after = applyActions(state, result.actions);
  assert.equal(after.cards.g1.zone, 'hand');
});

test('P05/A2 — three eligible for one slot IS a choice: nothing moves, one deferral', () => {
  const state = board([
    { id: 'g1', card: 'Grizzly Bears', zone: 'graveyard' },
    { id: 'g2', card: 'Grizzly Bears', zone: 'graveyard' },
    { id: 'g3', card: 'Grizzly Bears', zone: 'graveyard' },
  ]);
  const result = returnFromForced(raiseDead(), ctxFor(state, 'rd'), env());
  assert.deepEqual(result.actions, []);
  assert.equal(result.deferred.length, 1);
});

test('P05/A3 — an empty graveyard does nothing and says nothing', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears' }]);
  const result = returnFromForced(raiseDead(), ctxFor(state, 'rd'), env());
  assert.deepEqual(result.actions, []);
  assert.deepEqual(result.deferred, []);
});

test('P05/A4 — count 2 with exactly 2 eligible moves both', () => {
  const state = board([
    { id: 'g1', card: 'Grizzly Bears', zone: 'graveyard' },
    { id: 'g2', card: 'Grizzly Bears', zone: 'graveyard' },
  ]);
  const result = returnFromForced(raiseDead(2), ctxFor(state, 'rd'), env());
  assert.equal(result.actions.length, 2);
  assert.deepEqual(result.deferred, []);
});

test('P05/A5 — a land in the graveyard is not eligible for a creature filter', () => {
  const state = board([
    { id: 'land', card: 'Forest', zone: 'graveyard' },
    { id: 'g1', card: 'Grizzly Bears', zone: 'graveyard' },
  ]);
  const result = returnFromForced(raiseDead(), ctxFor(state, 'rd'), env());
  assert.equal(result.actions.length, 1);
  assert.equal((result.actions[0] as { instanceId: string }).instanceId, 'g1');
});

/* ------------------------------------------------------------------ *
 * P06
 * ------------------------------------------------------------------ */

test('P06/A1 — one matching land: it enters tapped, then the library shuffles', () => {
  const state = board([{ id: 'f1', card: 'Forest', zone: 'library' }]);
  const result = searchLibraryForced(rampantGrowth(), ctxFor(state, 'rg'), env());

  assert.deepEqual(result.actions.map(a => a.type), ['MOVE_ZONE', 'SHUFFLE']);
  assert.equal((result.actions[0] as { tapped?: boolean }).tapped, true);
  assert.deepEqual(result.deferred, []);

  const after = applyActions(state, result.actions);
  assert.equal(after.cards.f1.zone, 'battlefield');
  assert.equal(after.cards.f1.tapped, true);
});

test('P06/A2 — four matching lands is a real search: shuffle only, plus a deferral', () => {
  const state = board([
    { id: 'f1', card: 'Forest', zone: 'library' },
    { id: 'f2', card: 'Forest', zone: 'library' },
    { id: 'f3', card: 'Forest', zone: 'library' },
    { id: 'f4', card: 'Forest', zone: 'library' },
  ]);
  const result = searchLibraryForced(rampantGrowth(), ctxFor(state, 'rg'), env());
  assert.deepEqual(result.actions.map(a => a.type), ['SHUFFLE']);
  assert.equal(result.deferred.length, 1);
});

test('P06/A3 — CR 701.19: a fruitless search still shuffles, and defers nothing', () => {
  const state = board([{ id: 'bear', card: 'Grizzly Bears', zone: 'library' }]);
  const result = searchLibraryForced(rampantGrowth(), ctxFor(state, 'rg'), env());
  assert.deepEqual(result.actions.map(a => a.type), ['SHUFFLE']);
  assert.deepEqual(result.deferred, []);
});

test('P06/A4 — thenShuffle false emits no SHUFFLE', () => {
  const state = board([{ id: 'f1', card: 'Forest', zone: 'library' }]);
  const result = searchLibraryForced(rampantGrowth(false), ctxFor(state, 'rg'), env());
  assert.equal(result.actions.some(a => a.type === 'SHUFFLE'), false);
});

/* ------------------------------------------------------------------ *
 * A tutor that leaves the card on top
 * ------------------------------------------------------------------ */

/*
 * Vampiric Tutor, Enlightened Tutor, Mystical Tutor, Worldly Tutor and Sylvan
 * Tutor all say "shuffle and put that card on top", in that order, and until
 * 31 Aug 2026 none of them compiled to anything at all.
 *
 * The order is the card. A shuffle after the placement buries the card the
 * player just paid for, so these two tests are about sequence rather than about
 * which actions appear.
 */
const vampiricTutor = (): Extract<Effect, { do: 'search-library' }> => ({
  do: 'search-library',
  who: { who: 'you' },
  what: basicLandFilter as never,
  count: 1,
  to: 'library',
  thenShuffle: true,
  toPosition: 'top',
});

test('a tutor to top places the card on top of the library', () => {
  const state = board([{ id: 'f1', card: 'Forest', zone: 'library' }]);
  const result = searchLibraryForced(vampiricTutor(), ctxFor(state, 'rg'), env());
  const move = result.actions.find(a => a.type === 'MOVE_ZONE');
  assert.ok(move, 'the card has to move');
  assert.equal((move as { to?: string }).to, 'library');
  assert.equal(
    (move as { position?: string }).position,
    'top',
    'without the position the card is shuffled in, which is a different and much worse card'
  );
});

test('a tutor to top shuffles BEFORE it places, not after', () => {
  const state = board([{ id: 'f1', card: 'Forest', zone: 'library' }]);
  const result = searchLibraryForced(vampiricTutor(), ctxFor(state, 'rg'), env());
  const shuffleAt = result.actions.findIndex(a => a.type === 'SHUFFLE');
  const moveAt = result.actions.findIndex(a => a.type === 'MOVE_ZONE');
  assert.ok(shuffleAt >= 0 && moveAt >= 0);
  assert.ok(shuffleAt < moveAt, 'shuffling afterwards would bury the card the tutor just found');
});

test('a search that leaves the library still shuffles last', () => {
  const state = board([{ id: 'f1', card: 'Forest', zone: 'library' }]);
  const result = searchLibraryForced(rampantGrowth(), ctxFor(state, 'rg'), env());
  const shuffleAt = result.actions.findIndex(a => a.type === 'SHUFFLE');
  const moveAt = result.actions.findIndex(a => a.type === 'MOVE_ZONE');
  assert.ok(moveAt < shuffleAt, 'the ordering change must be confined to searches that name a position');
});
