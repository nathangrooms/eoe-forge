/**
 * Whose pile is it: the owner scope on a zone target.
 *
 * ## The defect these tests exist to keep out
 *
 * XMage puts the owner restriction in the TARGET CLASS, never in the filter.
 * `TargetCardInYourGraveyard.possibleTargets(sourceControllerId, …)` reads
 * `game.getPlayer(sourceControllerId).getGraveyard()`, and the filter it was
 * built with is a plain `FilterCreatureCard` whose only mention of "your" is
 * the display name. `TargetCardInHand` and `TargetCardInLibrary` are the same
 * shape, scoped to the chooser; `TargetCardInOpponentsGraveyard` is scoped the
 * other way; `TargetCardInGraveyard` genuinely means every graveyard.
 *
 * The translator read the filter, took the zone from the class name, and threw
 * the rest away. All four classes therefore arrived here as a bare zone, and
 * `makeTarget` offered every player's pile. 26 shipped bodies were in that
 * state: Gix's Command would return a creature card from an OPPONENT'S
 * graveyard to your hand, and Dream Cache would put two cards out of somebody
 * else's hand on a library.
 *
 * The last test is the ratchet. It walks the shipped bundle rather than a
 * fixture, because the mapping lives in a generator and a test that only
 * checks a hand-written target would pass with the generator wrong.
 *
 * Card wording comes from Scryfall. Behaviour is derived from XMage, MIT,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage,
 * read in place and not vendored. XMage's display strings are not reproduced.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertOracleContains, board } from '../abilities/primitives/harness.testlib.ts';
import type { GameState } from '../types.ts';
import { makeScope } from './runtime.ts';
import { makeTarget } from './targets.ts';
import { StaticFilters } from './filters.ts';
import { TRANSLATED_BODIES } from './bodies.generated.ts';
import { runXmageEffect } from './index.ts';

/** Two graveyards and two hands, each holding one creature card and one spell. */
function twoPiles(): GameState {
  return board([
    { id: 'src', card: "Gix's Command", owner: 'p1', zone: 'graveyard' },
    { id: 'myBeast', card: 'Grizzly Bears', owner: 'p1', zone: 'graveyard' },
    { id: 'theirAngel', card: 'Serra Angel', owner: 'p2', zone: 'graveyard' },
    { id: 'myShock', card: 'Shock', owner: 'p1', zone: 'hand' },
    { id: 'theirShock', card: 'Shock', owner: 'p2', zone: 'hand' },
  ]);
}

const names = (state: GameState, ids: readonly string[]): string[] =>
  ids.map(id => `${state.cards[id].name}/${state.cards[id].ownerId}`).sort();

/** `possibleTargets` only reads the scope, so a stub game is enough for it. */
const stubGame = (scope: ReturnType<typeof makeScope>) =>
  ({ xmageScope: () => scope }) as never;

describe('a zone target is scoped to a player, the way the XMage class is', () => {
  it('no owner means every pile, which is what TargetCardInGraveyard means', () => {
    const state = twoPiles();
    const scope = makeScope(state, { idPrefix: 'os' });
    const target = makeTarget(scope, { filter: StaticFilters.creatureCard(), zone: 'graveyard' });

    assert.deepEqual(names(state, target.possibleTargets(stubGame(scope), 'p1')), [
      'Grizzly Bears/p1',
      'Serra Angel/p2',
    ]);
  });

  it("owner 'chooser' is only the chooser's graveyard", () => {
    const state = twoPiles();
    const scope = makeScope(state, { idPrefix: 'os' });
    const target = makeTarget(scope, {
      filter: StaticFilters.creatureCard(),
      zone: 'graveyard',
      owner: 'chooser',
    });

    assert.deepEqual(names(state, target.possibleTargets(stubGame(scope), 'p1')), ['Grizzly Bears/p1']);
    // The same target asked by the other player sees the other graveyard. The
    // scope is the CHOOSER's, not the source controller's, which is what
    // `possibleTargets(sourceControllerId, …)` means in XMage.
    assert.deepEqual(names(state, target.possibleTargets(stubGame(scope), 'p2')), ['Serra Angel/p2']);
  });

  it("owner 'not-chooser' is every graveyard except the chooser's", () => {
    const state = twoPiles();
    const scope = makeScope(state, { idPrefix: 'os' });
    const target = makeTarget(scope, {
      filter: StaticFilters.creatureCard(),
      zone: 'graveyard',
      owner: 'not-chooser',
    });

    assert.deepEqual(names(state, target.possibleTargets(stubGame(scope), 'p1')), ['Serra Angel/p2']);
  });

  it('a hand target is the chooser’s hand, not every hand', () => {
    const state = twoPiles();
    const scope = makeScope(state, { idPrefix: 'os' });
    const target = makeTarget(scope, {
      filter: StaticFilters.card(),
      zone: 'hand',
      owner: 'chooser',
    });

    assert.deepEqual(names(state, target.possibleTargets(stubGame(scope), 'p1')), ['Shock/p1']);
  });

  it('with no chooser it offers NOTHING and says so, rather than falling back to everything', () => {
    // The direction matters. Falling back to "every pile" is the original bug
    // wearing a guard clause, and it would be silent. An empty list plus a line
    // in the log is the visible failure this port prefers.
    const state = twoPiles();
    const scope = makeScope(state, { idPrefix: 'os' });
    const target = makeTarget(scope, {
      filter: StaticFilters.creatureCard(),
      zone: 'graveyard',
      owner: 'chooser',
    });

    assert.deepEqual(target.possibleTargets(stubGame(scope), undefined), []);
    assert.equal(scope.deferred.length, 1);
    assert.match(scope.deferred[0], /no chooser/);
  });
});

describe('the shipped body, not a fixture', () => {
  it("Gix's Command cannot reach into an opponent's graveyard", () => {
    assertOracleContains("Gix's Command", 'from your graveyard');

    const body = TRANSLATED_BODIES['GixsCommand::GixsCommandReturnEffect'];
    assert.ok(body, 'the shipped bundle no longer carries this body');
    assert.equal(body.trivial, false);

    const state = twoPiles();
    const answerWith = (id: string): string[] => {
      const run = runXmageEffect(
        state,
        { sourceId: 'src', controllerId: 'p1', idPrefix: 'gix', at: 0, answers: { cards0: [id] } },
        body.run
      );
      // Both halves matter. A run that stopped on the question would move
      // nothing either, and would pass the negative assertion for the wrong
      // reason, so the answer has to be one the body consumed.
      assert.equal(run.ok, true, 'the body stopped on a question instead of taking the answer');
      return run.actions
        .filter(a => a.type === 'MOVE_ZONE')
        .map(a => (a as { instanceId: string }).instanceId);
    };

    // Measured against the pre-fix bundle: answering with `theirAngel` used to
    // return an OPPONENT'S Serra Angel to p1's hand.
    assert.deepEqual(answerWith('theirAngel'), [], "an opponent's card was returned to hand");
    assert.deepEqual(answerWith('myBeast'), ['myBeast'], 'the chooser’s own card still comes back');
  });
});

describe('the ratchet, over the whole shipped bundle', () => {
  it('every hand or library target in the bundle names whose pile it is', () => {
    // XMage has exactly one hand target class and one library target class in
    // this corpus, and both are scoped to the chooser. So a shipped body that
    // builds one without an owner is the mapping regressing, not a card that
    // legitimately means "any player's hand".
    const offenders: string[] = [];
    for (const [key, entry] of Object.entries(TRANSLATED_BODIES)) {
      if (entry.trivial) continue;
      const source = String(entry.run);
      for (const zone of ['hand', 'library'] as const) {
        const at = source.indexOf(`zone: "${zone}"`);
        if (at < 0) continue;
        // The owner rides in the same object literal, right after the zone.
        const tail = source.slice(at, at + 80);
        if (!tail.includes('owner:')) offenders.push(`${key} (${zone})`);
      }
    }
    assert.deepEqual(offenders, []);
  });
});
