/**
 * `{do:'xmage-body'}` — the seam that lets a machine-translated XMage body
 * resolve through the ordinary ability bridge.
 *
 * Six of these tests are about BEHAVIOUR: a real card, its Scryfall oracle text
 * asserted before anything else, the effect run through `runEffects` and the
 * actions folded through the real reducer, so the assertion is on the board.
 *
 * The seventh is the one that matters most and it asserts nothing about a card.
 * It walks the SHIPPED table, `lowered.generated.ts`, and checks that every
 * `{do:'xmage-body'}` in it names a body this build actually carries and that
 * none of them is a `trivial` override. Those two files are written by two
 * different scripts, and if they ever disagree the symptom is a card that
 * resolves to nothing on a real board and passes every other test in the suite.
 *
 * Card wording comes from Scryfall. Behaviour is derived from XMage, MIT,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage,
 * read in place and not vendored.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Effect } from '../../cards/abilities/dsl.ts';
import { XMAGE_LOWERED } from '../../cards/xmage/lowered.generated.ts';
import { assertOracleContains, board } from './primitives/harness.testlib.ts';
import { applyActions } from '../rules.ts';
import { makeContext } from './context.ts';
import { runEffects } from './to-actions.ts';
import { TRANSLATED_BODIES } from '../xmage/bodies.generated.ts';
import type { GameState, StackTarget } from '../types.ts';

const pointer = (key: string): Effect => {
  const cut = key.indexOf('::');
  return { do: 'xmage-body', key, card: key.slice(0, cut), effect: key.slice(cut + 2) };
};

function run(
  state: GameState,
  effects: readonly Effect[],
  targets: StackTarget[] = []
): { actions: ReturnType<typeof runEffects>['actions']; deferred: string[]; after: GameState } {
  const ctx = makeContext(state, 'src', 'p1', { targets });
  const result = runEffects(effects, ctx, { idPrefix: 'xb', at: 0 });
  return { actions: result.actions, deferred: result.deferred, after: applyActions(state, result.actions) };
}

const onBattlefield = (id: string): StackTarget => ({ kind: 'card', instanceId: id, zone: 'battlefield' });

/* -------------------------------------------------------------------------- */

describe('a translated body resolves through the ordinary bridge', () => {
  it("Misfortune's Gain destroys the creature and its OWNER gains the life", () => {
    assertOracleContains("Misfortune's Gain", 'Destroy target creature. Its owner gains 4 life.');

    const state = board([
      { id: 'src', card: "Misfortune's Gain", owner: 'p1', zone: 'graveyard' },
      { id: 'theirs', card: 'Grizzly Bears', owner: 'p2' },
    ]);
    const before = state.players[1].life;

    const { after } = run(state, [pointer("MisfortunesGain::MisfortunesGainEffect")], [onBattlefield('theirs')]);

    assert.ok(after.players[1].zones.graveyard.includes('theirs'), 'the creature was destroyed');
    // "Its owner", not the caster. Getting this backwards is a card that runs
    // and is wrong, which is the failure this port keeps making.
    assert.equal(after.players[1].life, before + 4);
    assert.equal(after.players[0].life, state.players[0].life);
  });

  it('Feed the Swarm charges the caster the destroyed permanent’s mana value', () => {
    assertOracleContains(
      'Feed the Swarm',
      "You lose life equal to that permanent's mana value"
    );

    // Grizzly Bears is {1}{G}, mana value 2. The board carries the real row, so
    // the number comes from the card rather than from this test.
    const state = board([
      { id: 'src', card: 'Feed the Swarm', owner: 'p1', zone: 'graveyard' },
      { id: 'theirs', card: 'Grizzly Bears', owner: 'p2' },
    ]);
    const before = state.players[0].life;

    const { after } = run(state, [pointer('FeedTheSwarm::FeedTheSwarmEffect')], [onBattlefield('theirs')]);

    assert.ok(after.players[1].zones.graveyard.includes('theirs'), 'the creature was destroyed');
    assert.equal(after.players[0].life, before - 2);
  });
});

describe('nothing resolves to silence', () => {
  it('a key this build does not carry defers instead of doing nothing', () => {
    const state = board([{ id: 'src', card: 'Grizzly Bears', owner: 'p1' }]);
    const { actions, deferred } = run(state, [pointer('NoSuchCard::NoSuchEffect')]);

    assert.equal(actions.length, 0);
    assert.equal(deferred.length, 1);
    assert.match(deferred[0], /does not carry it/);
  });

  it('a trivial override defers rather than pretending to be behaviour', () => {
    // Half of `TRANSLATED_BODIES` is a bare `return true`. Those belong to an
    // AsThoughEffect or a ContinuousEffect whose behaviour is in a different
    // method, so running one produces nothing and would look like a card that
    // resolved. The generator refuses them; this is the second bar, at the
    // point of use, because the first one lives in a script and this ships.
    const trivial = Object.entries(TRANSLATED_BODIES).find(([, b]) => b.trivial);
    assert.ok(trivial, 'the generated file no longer carries any trivial body');

    const state = board([{ id: 'src', card: 'Grizzly Bears', owner: 'p1' }]);
    const { actions, deferred } = run(state, [pointer(trivial[0])]);

    assert.equal(actions.length, 0);
    assert.match(deferred[0], /override with no behaviour/);
  });

  it('a body that reads an object nothing bound says so, even when it also acts', () => {
    assertOracleContains(
      'Dimir Cutpurse',
      'that player discards a card and you draw a card'
    );

    // The dangerous shape. XMage pins the target pointer to the damaged player
    // inside the TRIGGER class, which is a different Java file and not part of
    // the translated body. Nothing binds it here, so the discard cannot happen
    // while the draw still can: the card runs half of itself. Actions come out,
    // so no caller can tell from the outside that anything was missed. The read
    // itself has to report.
    const state = board([
      { id: 'src', card: 'Dimir Cutpurse', owner: 'p1' },
      { id: 'lib', card: 'Grizzly Bears', owner: 'p1', zone: 'library' },
    ]);
    const { actions, deferred, after } = run(state, [pointer('DimirCutpurse::DimirCutpurseEffect')]);

    assert.ok(actions.some(a => a.type === 'DRAW'), 'the half it could do, it did');
    assert.equal(after.players[0].zones.hand.length, state.players[0].zones.hand.length + 1);
    assert.ok(
      deferred.some(d => d.includes('never bound')),
      `the half it could not do is named. Got: ${JSON.stringify(deferred)}`
    );
  });

  it('a decision stops the body and returns NO actions at all', () => {
    assertOracleContains('Vexing Devil', 'any opponent may have it deal 4 damage to them');

    const state = board([{ id: 'src', card: 'Vexing Devil', owner: 'p1' }]);
    const { actions, deferred } = run(state, [pointer('VexingDevil::VexingDevilEffect')]);

    // Nothing half-done is ever committed: the run aborts and the action list is
    // empty, so the card either resolves completely or not at all.
    assert.equal(actions.length, 0);
    assert.ok(deferred.length > 0, 'and the question is named');
  });
});

describe('the shipped table and the shipped bodies agree', () => {
  it('every pointer in lowered.generated.ts names a substantive body this build carries', () => {
    const keys: string[] = [];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
        return;
      }
      if (!value || typeof value !== 'object') return;
      const node = value as Record<string, unknown>;
      if (node.do === 'xmage-body' && typeof node.key === 'string') keys.push(node.key);
      for (const item of Object.values(node)) walk(item);
    };
    walk(Object.values(XMAGE_LOWERED));

    // Not `> 0` as a formality: if this ever reads zero, the two generators have
    // stopped meeting and every card below is being carried by nothing.
    assert.ok(keys.length > 0, 'lowered.generated.ts carries no body pointers at all');

    const missing = keys.filter(key => !TRANSLATED_BODIES[key]);
    assert.deepEqual(missing, [], 'pointers naming a body this build does not carry');

    const trivial = keys.filter(key => TRANSLATED_BODIES[key]?.trivial);
    assert.deepEqual(trivial, [], 'pointers at an override with no behaviour in it');
  });
});
