/**
 * The shared effect classes, the token table behind them, and the four defects
 * this tranche found.
 *
 * `docs/engine/RUNTIME-API.md` section 6c is the account. Every function under
 * test exists because a row on the translator's work order named it: the token
 * classes (127 bodies across 101 rows of one and two), `CreateTokenEffect` (54),
 * `BoostTargetEffect` (54) and `Token#putOntoBattlefield/3` (55).
 *
 * Most tests here run a SHIPPED body out of `bodies.generated.ts` rather than
 * one written by the test, for the reason `library.test.ts` gives: a body
 * written by the test proves the facade runs, not that anything reaches it.
 * Every board is folded through the real reducer before it is asserted, because
 * green tests do not mean a player can reach it.
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
import { XMAGE_TOKENS } from '../../cards/xmage/tokens.generated.ts';
import { TRANSLATED_BODIES } from './bodies.generated.ts';
import { boostTargetEffect, createTokenEffect, xmageToken } from './effects.ts';
import { fixedTarget } from './targets.ts';
import { runXmageEffect } from './index.ts';

const opts = (extra: Record<string, unknown> = {}) => ({
  sourceId: 'src',
  controllerId: 'p1',
  idPrefix: 'fx1',
  at: 0,
  ...extra,
});

const battlefield = (state: GameState, playerId = 'p1') =>
  Object.values(state.cards).filter(c => c.zone === 'battlefield' && c.controllerId === playerId);

/** Run a body that really ships, by its key in the generated file. */
function runShipped(key: string, state: GameState, extra: Record<string, unknown> = {}) {
  const entry = TRANSLATED_BODIES[key];
  assert.ok(entry, `${key} is not in bodies.generated.ts`);
  return runXmageEffect(state, opts(extra), entry.run);
}

/* -------------------------------------------------------------------------- */
/* The token table                                                            */
/* -------------------------------------------------------------------------- */

describe('xmageToken, the 741-class table', () => {
  const empty = (): GameState => board([{ id: 'src', card: 'Forest', owner: 'p1' }] as never);

  it('creates a token with the characteristics XMage gave the class', () => {
    const state = empty();
    const run = runXmageEffect(state, opts(), (game, source) => {
      const token = xmageToken(game.xmageScope(), 'SoldierToken');
      return token.putOntoBattlefield(2, source.getControllerId());
    });

    assert.equal(run.ok, true);
    const after = applyActions(state, run.actions);
    const made = battlefield(after).filter(c => c.name === 'Soldier');
    assert.equal(made.length, 2, 'two tokens arrived');
  });

  /*
   * The defect that would otherwise have shipped in this very change.
   * `XTokenSpec` was a narrower copy of `TokenSpec` with no `colorIdentity`,
   * and a narrower object is assignable to a wider one, so the colour was
   * dropped by the type system without a word. It was unreachable until the
   * token table was wired in, and would have become reachable in the same
   * commit.
   */
  it('carries the token colour, which a narrower spec silently dropped', () => {
    assert.deepEqual(
      XMAGE_TOKENS['SoldierToken'].spec.colorIdentity,
      ['W'],
      'the table says a Soldier token is white'
    );
    const state = empty();
    const run = runXmageEffect(state, opts(), (game, source) => {
      xmageToken(game.xmageScope(), 'SoldierToken').putOntoBattlefield(1, source.getControllerId());
      return true;
    });
    const created = run.actions.find(a => a.type === 'CREATE_TOKEN');
    assert.ok(created && created.type === 'CREATE_TOKEN');
    assert.deepEqual(
      created.token.colorIdentity,
      ['W'],
      'the colour reaches the action, not just the table'
    );
  });

  /*
   * 191 of the 741 classes add an ability a `TokenSpec` cannot carry. The token
   * is still created, because a Treasure on the board is more of the card than
   * nothing is, but the missing half is declared so the behaviour probe
   * downgrades the card rather than counting it.
   */
  it('says out loud when a token loses an ability it cannot carry', () => {
    assert.ok(
      XMAGE_TOKENS['TreasureToken'].otherAbilities.length > 0,
      'a Treasure token carries a sacrifice ability the spec cannot express'
    );
    const state = empty();
    const run = runXmageEffect(state, opts(), (game, source) => {
      xmageToken(game.xmageScope(), 'TreasureToken').putOntoBattlefield(1, source.getControllerId());
      return true;
    });
    assert.equal(run.ok, true);
    assert.ok(
      run.deferred.some(line => /without \d+ (ability|abilities)/.test(line)),
      `expected a deferral naming the missing abilities, got ${JSON.stringify(run.deferred)}`
    );
  });

  /*
   * A class the table does not hold RAISES. It does not fall back on a 1/1: a
   * wrong token on the board looks exactly like a right one and there is no
   * later moment where anybody could notice. The translator blocks such a body
   * at generate time, so this can only fire if that guard is removed, and
   * `to-actions.ts` turns the throw into a line in the game log rather than a
   * dead resolution.
   */
  it('raises rather than inventing a token for a class the table does not hold', () => {
    const state = empty();
    assert.throws(
      () =>
        runXmageEffect(state, opts(), (game, source) => {
          xmageToken(game.xmageScope(), 'NoSuchTokenClass').putOntoBattlefield(
            1,
            source.getControllerId()
          );
          return true;
        }),
      /no token class "NoSuchTokenClass"/
    );
  });

  it('reports the ids it made, read off the board and not re-derived', () => {
    const state = empty();
    let seen: string[] = [];
    const run = runXmageEffect(state, opts(), (game, source) => {
      const token = xmageToken(game.xmageScope(), 'SoldierToken');
      token.putOntoBattlefield(3, source.getControllerId());
      seen = token.getLastAddedTokenIds();
      return true;
    });
    assert.equal(run.ok, true);
    assert.equal(seen.length, 3);
    const after = applyActions(state, run.actions);
    for (const id of seen) {
      assert.equal(after.cards[id]?.zone, 'battlefield', `${id} is on the battlefield`);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* A shipped body, end to end                                                 */
/* -------------------------------------------------------------------------- */

describe('Brood Birthing, a shipped body that reads the board then makes tokens', () => {
  it('makes one token with no Eldrazi Spawn out', () => {
    assertOracleContains('Brood Birthing', 'Eldrazi Spawn');
    const state = board([{ id: 'src', card: 'Brood Birthing', owner: 'p1' }] as never);
    const run = runShipped('BroodBirthing::BroodBirthingEffect', state);

    assert.equal(run.ok, true);
    assert.equal(run.applied, true);
    const created = run.actions.filter(a => a.type === 'CREATE_TOKEN');
    assert.equal(created.length, 1);
    assert.equal(created[0].type === 'CREATE_TOKEN' && created[0].count, 1);
  });

  /*
   * The other half of the card, and the reason the count is read from the board
   * rather than fixed. There is no CARD named "Eldrazi Spawn" — it is a token —
   * so the fixture is a real card with the type line overridden, which is what
   * `Placement.typeLine` is for. The filter reads through
   * `characteristics.ts`, so the overridden line is what it sees.
   */
  it('makes three with an Eldrazi Spawn already out', () => {
    const state = board([
      { id: 'src', card: 'Brood Birthing', owner: 'p1' },
      {
        id: 'spawn',
        card: 'Grizzly Bears',
        owner: 'p1',
        typeLine: 'Creature — Eldrazi Spawn',
      },
    ] as never);
    const run = runShipped('BroodBirthing::BroodBirthingEffect', state);

    assert.equal(run.ok, true);
    const created = run.actions.filter(a => a.type === 'CREATE_TOKEN');
    assert.equal(created.length, 1);
    assert.equal(created[0].type === 'CREATE_TOKEN' && created[0].count, 3);
  });
});

describe('Feral Lightning, a shipped body through CreateTokenEffect', () => {
  it('creates three tokens and says the delayed trigger cannot be stored', () => {
    assertOracleContains('Feral Lightning', 'haste');
    const state = board([{ id: 'src', card: 'Feral Lightning', owner: 'p1' }] as never);
    const run = runShipped('FeralLightning::FeralLightningEffect', state);

    assert.equal(run.ok, true);
    const after = applyActions(state, run.actions);
    assert.equal(battlefield(after).filter(c => c.name === 'Elemental').length, 3);

    /*
     * "Exile them at the beginning of the next end step" is a delayed
     * triggered ability and there is no store for one, so the tokens stay. A
     * silent success here would be a card that appeared to set something up and
     * never fired it, which is the failure `Game#addDelayedTriggeredAbility`
     * already refuses on.
     */
    assert.ok(
      run.deferred.some(line => line.includes('delayed trigger')),
      `expected the delayed trigger to be declared, got ${JSON.stringify(run.deferred)}`
    );
  });
});

/* -------------------------------------------------------------------------- */
/* BoostTargetEffect                                                          */
/* -------------------------------------------------------------------------- */

describe('BoostTargetEffect', () => {
  const withCreature = (): GameState =>
    board([
      { id: 'src', card: "Blacksmith's Skill", owner: 'p1' },
      { id: 'bear', card: 'Grizzly Bears', owner: 'p1' },
    ] as never);

  it('stores a continuous effect over the pointed permanent', () => {
    const state = withCreature();
    const run = runXmageEffect(state, opts(), (game, source) => {
      const effect = boostTargetEffect(game.xmageScope(), 2, 2).setTargetPointer(
        fixedTarget('bear')
      );
      game.addEffect(effect, source);
      return true;
    });

    assert.equal(run.ok, true);
    const added = run.actions.filter(a => a.type === 'ADD_CONTINUOUS');
    assert.equal(added.length, 1);
    const effect = added[0].type === 'ADD_CONTINUOUS' ? added[0].effect : null;
    assert.ok(effect);
    assert.deepEqual(effect.affects, { kind: 'match', ids: ['bear'] });
    assert.equal(effect.parts.length, 1);
    assert.deepEqual(effect.parts[0].modification, {
      kind: 'modify-pt',
      power: 2,
      toughness: 2,
    });
    // A stored effect must say when it ends; the reducer refuses one that does not.
    assert.equal(effect.expiry?.kind, 'end-of-turn');
    // The log line is ours. XMage's own `getText` is Wizards wording.
    assert.match(String(effect.note), /\+2\/\+2/);

    // And the reducer takes it.
    const after = applyActions(state, run.actions);
    assert.equal((after.timedEffects ?? []).length, 1);
  });

  /*
   * `setTargetPointer` returns `this`, not `XEffect`. Written as a chain, which
   * is how every XMage body writes it, and with `XEffect` as the return type
   * this line does not compile: 16 bodies were translated correctly and thrown
   * away by `tsc` for it.
   */
  it('chains, and the chain is still a continuous builder', () => {
    const state = withCreature();
    const run = runXmageEffect(state, opts(), (game, source) => {
      game.addEffect(
        boostTargetEffect(game.xmageScope(), 1, 1).setTargetPointer(fixedTarget('bear')),
        source
      );
      return true;
    });
    assert.equal(run.actions.filter(a => a.type === 'ADD_CONTINUOUS').length, 1);
  });

  /*
   * Nothing bound means nothing stored. An effect with an empty id list would
   * modify no object for the rest of the turn while looking, in the log, like
   * a pump that happened.
   */
  it('stores nothing when the pointer bound nothing, and says so', () => {
    const state = withCreature();
    const run = runXmageEffect(state, opts({ targets: [] }), (game, source) => {
      game.addEffect(boostTargetEffect(game.xmageScope(), 3, 3), source);
      return true;
    });
    assert.equal(run.actions.filter(a => a.type === 'ADD_CONTINUOUS').length, 0);
    assert.ok(run.deferred.length > 0, 'the unbound pointer reported');
  });

  it('refuses to store when it was not given the ability it came from', () => {
    const state = withCreature();
    const run = runXmageEffect(state, opts(), game => {
      game.addEffect(
        boostTargetEffect(game.xmageScope(), 4, 4).setTargetPointer(fixedTarget('bear'))
      );
      return true;
    });
    assert.equal(run.actions.filter(a => a.type === 'ADD_CONTINUOUS').length, 0);
    assert.ok(
      run.deferred.some(line => line.includes('without the ability')),
      `expected the missing ability to be declared, got ${JSON.stringify(run.deferred)}`
    );
  });
});

/* -------------------------------------------------------------------------- */
/* fixedTarget, which XMage hands an object as often as an id                  */
/* -------------------------------------------------------------------------- */

describe('fixedTarget', () => {
  it('takes a permanent as well as an id, which is XMage’s own overload', () => {
    const state = board([
      { id: 'src', card: 'Forest', owner: 'p1' },
      { id: 'bear', card: 'Grizzly Bears', owner: 'p1' },
    ] as never);
    runXmageEffect(state, opts(), game => {
      const permanent = game.getPermanent('bear');
      assert.ok(permanent);
      assert.deepEqual(fixedTarget(permanent).getTargets(), ['bear']);
      assert.equal(fixedTarget('bear').getFirst(), 'bear');
      assert.deepEqual(fixedTarget(null).getTargets(), []);
      return true;
    });
  });
});

/* -------------------------------------------------------------------------- */
/* CreateTokenEffect, the parts a body reads back off it                      */
/* -------------------------------------------------------------------------- */

describe('CreateTokenEffect', () => {
  const empty = (): GameState => board([{ id: 'src', card: 'Forest', owner: 'p1' }] as never);

  it('creates nothing and claims nothing for a count of zero', () => {
    const state = empty();
    let applied: boolean | null = null;
    const run = runXmageEffect(state, opts(), (game, source) => {
      const effect = createTokenEffect(
        game.xmageScope(),
        xmageToken(game.xmageScope(), 'SoldierToken'),
        0
      );
      applied = effect.apply(game, source);
      assert.deepEqual(effect.getLastAddedTokenIds(), []);
      return true;
    });
    assert.equal(run.ok, true);
    // XMage's own `apply` returns true whatever the count: "a token for each
    // creature that died" on a turn nothing died is a real answer.
    assert.equal(applied, true);
    assert.equal(run.actions.filter(a => a.type === 'CREATE_TOKEN').length, 0);
  });

  it('puts counters on every token it made', () => {
    const state = empty();
    const run = runXmageEffect(state, opts(), (game, source) => {
      createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), 'SoldierToken'), 2)
        .entersWithCounters('+1/+1', 1)
        .apply(game, source);
      return true;
    });
    assert.equal(run.ok, true);
    const after = applyActions(state, run.actions);
    const made = battlefield(after).filter(c => c.name === 'Soldier');
    assert.equal(made.length, 2);
    for (const token of made) {
      assert.equal(token.counters?.['+1/+1'], 1, 'each token entered with a counter');
    }
  });

  it('makes every token in the list, not just the first', () => {
    const state = empty();
    const run = runXmageEffect(state, opts(), (game, source) => {
      createTokenEffect(game.xmageScope(), xmageToken(game.xmageScope(), 'SoldierToken'))
        .withAdditionalTokens(xmageToken(game.xmageScope(), 'SaprolingToken'))
        .apply(game, source);
      return true;
    });
    const after = applyActions(state, run.actions);
    const names = battlefield(after).map(c => c.name);
    assert.ok(names.includes('Soldier'), `expected a Soldier, got ${JSON.stringify(names)}`);
    assert.ok(names.includes('Saproling'), `expected a Saproling, got ${JSON.stringify(names)}`);
  });
});
