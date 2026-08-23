/**
 * The overloads this tranche mapped, and the two defects the sample read found.
 *
 * `docs/engine/TRANSLATION.md` section 11 is the account. Every function here
 * exists because a row on the translator's work order named it: `Player#choose/5`
 * (97 bodies), `Player#millCards` (70), `Permanent#damage/6` (63),
 * `Card#addCounters/3` (35), `Player#discard/4` (27) and `Player#choose/3` (29).
 *
 * Four of these tests run a SHIPPED body out of `bodies.generated.ts` rather
 * than a body written here, for the reason `library.test.ts` gives: a body
 * written by the test proves the facade runs, not that anything reaches it.
 *
 * Card wording comes from Scryfall. Behaviour is derived from XMage, MIT,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage,
 * read in place and not vendored. XMage's display strings are not reproduced.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertOracleContains, board } from '../abilities/primitives/harness.testlib.ts';
import { applyActions } from '../rules.ts';
import type { GameState } from '../types.ts';
import { TRANSLATED_BODIES } from './bodies.generated.ts';
import { makeTarget } from './targets.ts';
import { StaticFilters } from './filters.ts';
import { runXmageEffect, runXmageEffectWith } from './index.ts';

const opts = (extra: Record<string, unknown> = {}) => ({
  sourceId: 'src',
  controllerId: 'p1',
  idPrefix: 'ov1',
  at: 0,
  ...extra,
});

const handOf = (state: GameState, playerId = 'p1') =>
  state.players.find(p => p.id === playerId)?.zones.hand ?? [];
const graveyardOf = (state: GameState, playerId = 'p1') =>
  state.players.find(p => p.id === playerId)?.zones.graveyard ?? [];
const libraryOf = (state: GameState, playerId = 'p1') =>
  state.players.find(p => p.id === playerId)?.zones.library ?? [];

/* -------------------------------------------------------------------------- */
/* millCards                                                                  */
/* -------------------------------------------------------------------------- */

describe('Player#millCards', () => {
  const withLibrary = (names: readonly string[]): GameState =>
    board([
      { id: 'src', card: 'Grindclock', owner: 'p1' },
      ...names.map((card, i) => ({ id: `l${i}`, card, owner: 'p2', zone: 'library' as const, controller: 'p2' })),
    ] as never);

  it('moves the top cards to the graveyard, top first, and returns them', () => {
    const state = withLibrary(['Forest', 'Island', 'Mountain', 'Swamp']);
    const run = runXmageEffect(state, opts(), (game, source) => {
      const victim = game.getPlayer('p2');
      if (!victim) return false;
      const milled = victim.millCards(2);
      // XMage returns a `Cards`, and the next line of a body reads it.
      assert.deepEqual(milled.ids(), ['l0', 'l1'], 'top first');
      return true;
    });

    assert.equal(run.ok, true);
    const after = applyActions(state, run.actions);
    assert.deepEqual(graveyardOf(after, 'p2'), ['l0', 'l1']);
    assert.deepEqual(libraryOf(after, 'p2'), ['l2', 'l3']);
  });

  it('mills what is there when the library is shorter than asked', () => {
    const state = withLibrary(['Forest']);
    const run = runXmageEffect(state, opts(), (game) => {
      const victim = game.getPlayer('p2');
      return !!victim && victim.millCards(5).size() === 1;
    });
    assert.equal(run.ok, true);
    assert.equal(graveyardOf(applyActions(state, run.actions), 'p2').length, 1);
  });

  it('mills nothing, and emits nothing, for a count of zero', () => {
    const state = withLibrary(['Forest']);
    const run = runXmageEffect(state, opts(), (game) => {
      const victim = game.getPlayer('p2');
      return !!victim && victim.millCards(0).isEmpty();
    });
    assert.equal(run.ok, true);
    assert.equal(run.actions.length, 0);
  });

  it('Grindclock mills as many as it has charge counters, through its shipped body', () => {
    assertOracleContains('Grindclock', 'Target player mills X cards');

    const body = TRANSLATED_BODIES['Grindclock::GrindclockEffect'];
    assert.ok(body && !body.trivial, 'the shipped file no longer carries this body');

    const state = board([
      { id: 'src', card: 'Grindclock', owner: 'p1', counters: { charge: 3 } },
      { id: 'l0', card: 'Forest', owner: 'p2', zone: 'library', controller: 'p2' },
      { id: 'l1', card: 'Island', owner: 'p2', zone: 'library', controller: 'p2' },
      { id: 'l2', card: 'Mountain', owner: 'p2', zone: 'library', controller: 'p2' },
      { id: 'l3', card: 'Swamp', owner: 'p2', zone: 'library', controller: 'p2' },
    ] as never);

    const run = runXmageEffect(
      state,
      opts({ targets: [{ kind: 'player', playerId: 'p2' }] }),
      body.run
    );

    assert.equal(run.ok, true, JSON.stringify(run.deferred));
    const after = applyActions(state, run.actions);
    assert.equal(graveyardOf(after, 'p2').length, 3, 'three charge counters, three cards');
  });
});

/* -------------------------------------------------------------------------- */
/* discard, which is four XMage overloads and two meanings                    */
/* -------------------------------------------------------------------------- */

describe('Player#discard and Player#discardCards', () => {
  const withHand = (names: readonly string[]): GameState =>
    board([
      { id: 'src', card: 'Windfall', owner: 'p1', zone: 'graveyard' },
      ...names.map((card, i) => ({ id: `h${i}`, card, owner: 'p1', zone: 'hand' as const })),
    ] as never);

  it('discardCards discards exactly the named cards and asks nobody', () => {
    const state = withHand(['Forest', 'Island', 'Mountain']);
    const run = runXmageEffect(state, opts(), (game, source) => {
      const player = game.getPlayer(source.getControllerId());
      if (!player) return false;
      return player.discardCards(player.getHand()).size() === 3;
    });

    // No decision was raised: the cards were named, so there was nothing to ask.
    assert.equal(run.ok, true, JSON.stringify(run.pending));
    const after = applyActions(state, run.actions);
    assert.equal(handOf(after).length, 0);
    assert.equal(graveyardOf(after).length, 4, 'three cards, plus the source already there');
  });

  it('discardCards ignores a card that is not in that hand', () => {
    const state = board([
      { id: 'src', card: 'Windfall', owner: 'p1', zone: 'graveyard' },
      { id: 'mine', card: 'Forest', owner: 'p1', zone: 'hand' },
      { id: 'theirs', card: 'Island', owner: 'p2', zone: 'hand', controller: 'p2' },
    ] as never);

    const run = runXmageEffect(state, opts(), (game, source) => {
      const player = game.getPlayer(source.getControllerId());
      if (!player) return false;
      // "theirs" is somebody else's card. Discarding it here would move a card
      // out of another player's hand under this player's name.
      return player.discardCards(['mine', 'theirs']).size() === 1;
    });

    assert.equal(run.ok, true);
    const after = applyActions(state, run.actions);
    assert.equal(handOf(after, 'p2').length, 1, "the other player's hand is untouched");
  });

  it('discard with a range asks for a range, not for the minimum', () => {
    // DEFECT THIS COVERS. `discard(0, Integer.MAX_VALUE, …)` is XMage's "discard
    // any number of cards". One arity-5 row read argument 0 as the amount, so
    // it became `discard(0)` and returned nothing without asking anybody.
    const state = withHand(['Forest', 'Island', 'Mountain']);

    let asked: { min: number; max: number } | null = null;
    const run = runXmageEffectWith(state, opts(), (game, source) => {
      const player = game.getPlayer(source.getControllerId());
      if (!player) return false;
      return player.discard(0, Number.MAX_SAFE_INTEGER).size() === 2;
    }, (choice) => {
      asked = { min: choice.min, max: choice.max };
      return ['h0', 'h1'];
    });

    assert.ok(asked, 'the player was asked at all');
    assert.deepEqual(asked, { min: 0, max: 3 }, 'any number, up to the size of the hand');
    assert.equal(run.ok, true, JSON.stringify(run.deferred));
    assert.deepEqual(graveyardOf(applyActions(state, run.actions)).sort(), ['h0', 'h1', 'src']);
  });

  it('Windfall discards every hand and redraws the largest, through its shipped body', () => {
    assertOracleContains('Windfall', 'Each player discards their hand');

    const body = TRANSLATED_BODIES['Windfall::WindfallEffect'];
    assert.ok(body && !body.trivial, 'the shipped file no longer carries this body');

    const state = board([
      { id: 'src', card: 'Windfall', owner: 'p1', zone: 'graveyard' },
      { id: 'h0', card: 'Forest', owner: 'p1', zone: 'hand' },
      { id: 'h1', card: 'Island', owner: 'p1', zone: 'hand' },
      { id: 'e0', card: 'Mountain', owner: 'p2', zone: 'hand', controller: 'p2' },
      { id: 'l0', card: 'Swamp', owner: 'p1', zone: 'library' },
      { id: 'l1', card: 'Plains', owner: 'p1', zone: 'library' },
      { id: 'l2', card: 'Forest', owner: 'p2', zone: 'library', controller: 'p2' },
      { id: 'l3', card: 'Island', owner: 'p2', zone: 'library', controller: 'p2' },
    ] as never);

    const run = runXmageEffect(state, opts(), body.run);
    assert.equal(run.ok, true, JSON.stringify(run.deferred));

    const after = applyActions(state, run.actions);
    // The greatest number anybody discarded was two, so everybody draws two.
    assert.equal(handOf(after, 'p1').length, 2);
    assert.equal(handOf(after, 'p2').length, 2);
    assert.ok(graveyardOf(after, 'p1').includes('h0'));
    assert.ok(graveyardOf(after, 'p2').includes('e0'));
  });
});

/* -------------------------------------------------------------------------- */
/* A target whose minimum is zero                                             */
/* -------------------------------------------------------------------------- */

describe('a target that may legally take nothing still asks', () => {
  /*
   * DEFECT THIS COVERS, and it is the worse of the two the sample read found.
   *
   * `Target#choose` began with `if (chosen.length >= min) return [...chosen]`.
   * `new TargetCardInHand(0, Integer.MAX_VALUE, filter)` is XMage's "any number
   * of cards", so `min` is 0, so the very first line was `0 >= 0` and the target
   * returned an empty list without asking anybody. The body then read the empty
   * target and carried on as though the player had declined.
   *
   * The translator half of the same defect is that `Integer.MAX_VALUE` did not
   * read as an int, so the target was built `min: 0, max: 0` and could not have
   * held anything even if it had asked.
   */
  const withHand = (names: readonly string[]): GameState =>
    board([
      { id: 'src', card: 'Nantuko Cultivator', owner: 'p1' },
      ...names.map((card, i) => ({ id: `h${i}`, card, owner: 'p1', zone: 'hand' as const })),
    ] as never);

  it('asks rather than answering "none" on the caller\'s behalf', () => {
    const state = withHand(['Forest', 'Island']);
    const run = runXmageEffect(state, opts(), (game, source) => {
      const player = game.getPlayer(source.getControllerId());
      if (!player) return false;
      const target = makeTarget(game.xmageScope(), {
        filter: StaticFilters.card(),
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
        zone: 'hand',
      });
      target.choose(game, '', player.getId());
      return true;
    });

    assert.equal(run.ok, false, 'the run stopped on the question rather than assuming an answer');
    assert.equal(run.actions.length, 0);
    assert.ok(run.pending.length > 0, 'and the question is on the table');
    assert.equal(run.pending[0].min, 0, 'declining is one of the legal answers');
  });

  it('still short-circuits when something was already bound', () => {
    const state = withHand(['Forest', 'Island']);
    const run = runXmageEffect(state, opts(), (game, source) => {
      const player = game.getPlayer(source.getControllerId());
      if (!player) return false;
      const target = makeTarget(game.xmageScope(), {
        filter: StaticFilters.card(),
        min: 0,
        max: 4,
        zone: 'hand',
        chosen: ['h0'],
      });
      assert.deepEqual(target.choose(game, '', player.getId()), ['h0']);
      return true;
    });
    assert.equal(run.ok, true, 'nobody was asked a question that was already answered');
  });

  it('Nantuko Cultivator discards the lands it was given and draws that many', () => {
    assertOracleContains('Nantuko Cultivator', 'You may discard any number of land cards');

    const body = TRANSLATED_BODIES['NantukoCultivator::NantukoCultivatorEffect'];
    assert.ok(body && !body.trivial, 'the shipped file no longer carries this body');

    const state = board([
      { id: 'src', card: 'Nantuko Cultivator', owner: 'p1' },
      { id: 'h0', card: 'Forest', owner: 'p1', zone: 'hand' },
      { id: 'h1', card: 'Island', owner: 'p1', zone: 'hand' },
      { id: 'l0', card: 'Swamp', owner: 'p1', zone: 'library' },
      { id: 'l1', card: 'Plains', owner: 'p1', zone: 'library' },
    ] as never);

    const run = runXmageEffectWith(state, opts(), body.run, () => ['h0', 'h1']);

    assert.equal(run.ok, true, JSON.stringify(run.deferred));
    const after = applyActions(state, run.actions);
    assert.equal(graveyardOf(after).length, 2, 'both lands were discarded');
    assert.equal(handOf(after).length, 2, 'and two cards were drawn');
    assert.equal(after.cards['src']?.counters?.['+1/+1'], 2, 'and it grew by that many');
  });
});

/* -------------------------------------------------------------------------- */
/* Choosing out of a named pile                                               */
/* -------------------------------------------------------------------------- */

describe('Target#choose over a pile the caller already has', () => {
  /*
   * `Player#choose(Outcome, Cards, TargetCard, Ability, Game)` is 97 bodies and
   * it chooses out of a pile rather than off the battlefield. The pile is
   * usually somewhere the target's own zone would not look: cards revealed off
   * a library, or a pile already in exile.
   */
  it('offers only what is in the pile, narrowed by the target filter', () => {
    const state = board([
      { id: 'src', card: 'Fire Prophecy', owner: 'p1', zone: 'graveyard' },
      { id: 'h0', card: 'Grizzly Bears', owner: 'p1', zone: 'hand' },
      { id: 'h1', card: 'Forest', owner: 'p1', zone: 'hand' },
      { id: 'h2', card: 'Island', owner: 'p1', zone: 'hand' },
    ] as never);

    let offered: string[] = [];
    runXmageEffectWith(state, opts(), (game, source) => {
      const player = game.getPlayer(source.getControllerId());
      if (!player) return false;
      const target = makeTarget(game.xmageScope(), { filter: StaticFilters.landCard(), zone: 'hand' });
      // The pile is two of the three cards in hand, and one of those two is not
      // a land. One legal answer is expected, not two and not three.
      target.choose(game, '', player.getId(), ['h0', 'h1']);
      return true;
    }, (choice) => {
      offered = [...choice.instanceIds];
      return null;
    });

    assert.deepEqual(offered, ['h1']);
  });

  it('falls back to the target zone when no pile is given', () => {
    const state = board([
      { id: 'src', card: 'Fire Prophecy', owner: 'p1', zone: 'graveyard' },
      { id: 'h0', card: 'Forest', owner: 'p1', zone: 'hand' },
      { id: 'h1', card: 'Island', owner: 'p1', zone: 'hand' },
    ] as never);

    let offered: string[] = [];
    runXmageEffectWith(state, opts(), (game, source) => {
      const player = game.getPlayer(source.getControllerId());
      if (!player) return false;
      const target = makeTarget(game.xmageScope(), { filter: StaticFilters.card(), zone: 'hand' });
      target.choose(game, '', player.getId());
      return true;
    }, (choice) => {
      offered = [...choice.instanceIds];
      return null;
    });

    assert.deepEqual(offered.sort(), ['h0', 'h1']);
  });
});
