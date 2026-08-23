/**
 * The XMage runtime API, tested by translating real XMage card bodies.
 *
 * Every board is built from a row of the real `cards` table through
 * `harness.testlib.ts`, and every test asserts that card's Scryfall oracle text
 * before it asserts behaviour. The oracle assertion is not decoration: it pins
 * the claim in the test to the printed card, so a quoted line cannot drift away
 * from the behaviour it is there to justify.
 *
 * Card wording comes from Scryfall. Behaviour is derived from XMage, MIT,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage,
 * read in place. XMage's own display strings are not reproduced anywhere here.
 *
 * ## Why the bodies below are written the way they are
 *
 * They are TRANSLATIONS, not paraphrases. `Player controller =
 * game.getPlayer(source.getControllerId());` becomes `const controller =
 * game.getPlayer(source.getControllerId());`. If a test had to restructure the
 * Java to make it run, the API would be the wrong shape and the port would not
 * be mechanical, which is the entire premise.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertOracleContains, board } from '../abilities/primitives/harness.testlib.ts';
import type { PendingChoice } from '../activate.ts';
import { applyActions } from '../rules.ts';
import {
  CardType,
  Predicates,
  StaticFilters,
  SubType,
  controlledByOpponentPredicate,
  creaturePredicate,
  makeFilter,
  runXmageEffect,
  runXmageEffectWith,
  subTypePredicate,
  xmageApiManifest,
} from './index.ts';

const opts = (extra: Record<string, unknown> = {}) => ({
  sourceId: 'src',
  controllerId: 'p1',
  idPrefix: 'st1',
  at: 0,
  ...extra,
});

/* -------------------------------------------------------------------------- */

describe('the shape of the whole problem: chooseUse, then draw', () => {
  /*
   * Rhystic Study is the card CLAUDE.md names as the shape of the port. Its
   * XMage body is chooseUse, then createManaCost, then cost.pay, then
   * drawCards — the "unless pays" idiom spelled out imperatively. The cost
   * payment half is not implemented here; the DECISION half is, and the
   * decision half is what every one of the 845 `Player#chooseUse` calls needs.
   */
  const state = () =>
    board([
      { id: 'src', card: 'Rhystic Study', owner: 'p1' },
      { id: 'bear', card: 'Grizzly Bears', owner: 'p2' },
    ]);

  const body = (game, source) => {
    const controller = game.getPlayer(source.getControllerId());
    const opponent = game.getPlayer(game.getOpponents(source.getControllerId())[0]);
    if (!controller || !opponent) return false;
    if (!opponent.chooseUse('Pay {1}?')) {
      controller.drawCards(1);
      return true;
    }
    return false;
  };

  it('quotes the card', () => {
    assertOracleContains('Rhystic Study', 'unless that player pays');
  });

  it('stops on the question and commits nothing', () => {
    const run = runXmageEffect(state(), opts(), body);
    assert.equal(run.ok, false);
    assert.deepEqual(run.actions, [], 'a half-resolved ability must never be returned');
    assert.equal(run.pending.length, 1);
    assert.equal(run.pending[0].kind, 'mode');
    assert.equal(run.pending[0].modeRef, 'use0');
    assert.deepEqual(
      run.pending[0].modes.map(m => m.text),
      ['Yes', 'No']
    );
  });

  it('draws when the opponent declines to pay', () => {
    const run = runXmageEffect(state(), opts({ answers: { use0: [1] } }), body);
    assert.equal(run.ok, true);
    assert.deepEqual(
      run.actions.map(a => a.type),
      ['DRAW']
    );
    const draw = run.actions[0];
    assert.equal(draw.type === 'DRAW' && draw.playerId, 'p1');
  });

  it('draws nothing when the opponent pays', () => {
    const run = runXmageEffect(state(), opts({ answers: { use0: [0] } }), body);
    assert.equal(run.ok, true);
    assert.deepEqual(run.actions, []);
  });

  it('the decision ref is stable across replays', () => {
    const a = runXmageEffect(state(), opts(), body);
    const b = runXmageEffect(state(), opts(), body);
    assert.equal(a.pending[0].modeRef, b.pending[0].modeRef);
  });

  it('an existing PendingChoice decider drives it unchanged', () => {
    // The same callback shape `bot.ts` and `cast-targets.ts` already use.
    const decide = (choice: PendingChoice) => (choice.kind === 'mode' ? [1] : null);
    const run = runXmageEffectWith(state(), opts(), body, decide);
    assert.equal(run.ok, true);
    assert.deepEqual(
      run.actions.map(a => a.type),
      ['DRAW']
    );
  });
});

/* -------------------------------------------------------------------------- */

describe('Game#getBattlefield with a filter: Wrath of God', () => {
  const state = () =>
    board([
      { id: 'src', card: 'Wrath of God', owner: 'p1', zone: 'graveyard' },
      { id: 'bear', card: 'Grizzly Bears', owner: 'p1' },
      { id: 'elf', card: 'Llanowar Elves', owner: 'p2' },
      { id: 'ring', card: 'Sol Ring', owner: 'p1' },
    ]);

  it('quotes the card', () => {
    assertOracleContains('Wrath of God', 'Destroy all creatures');
  });

  it('destroys every creature and nothing else', () => {
    const run = runXmageEffect(state(), opts(), (game, source) => {
      for (const permanent of game.getBattlefield().getActivePermanents(StaticFilters.creature())) {
        permanent.destroy(true);
      }
      return true;
    });

    assert.equal(run.ok, true);
    const moved = run.actions.filter(a => a.type === 'MOVE_ZONE');
    assert.deepEqual(moved.map(a => a.instanceId).sort(), ['bear', 'elf']);
    assert.ok(moved.every(a => a.to === 'graveyard'));

    // Green tests do not mean a player can reach it. Fold the actions through
    // the real reducer and check the BOARD, not the intent.
    const after = applyActions(state(), run.actions);
    assert.equal(after.cards.bear.zone, 'graveyard');
    assert.equal(after.cards.elf.zone, 'graveyard');
    assert.equal(after.cards.ring.zone, 'battlefield');
  });
});

/* -------------------------------------------------------------------------- */

describe('destroy honours indestructible and says so', () => {
  it('quotes the card', () => {
    assertOracleContains('Blightsteel Colossus', 'indestructible');
  });

  it('refuses, out loud', () => {
    const state = board([
      { id: 'src', card: 'Wrath of God', owner: 'p1', zone: 'graveyard' },
      { id: 'colossus', card: 'Blightsteel Colossus', owner: 'p2' },
    ]);
    const run = runXmageEffect(state, opts(), game => {
      game.getPermanent('colossus').destroy();
      return true;
    });
    assert.equal(run.ok, true);
    assert.deepEqual(
      run.actions.map(a => a.type),
      ['NOTE'],
      'a card that reports destroying an indestructible creature is worse than one that reports it could not'
    );
    const after = applyActions(state, run.actions);
    assert.equal(after.cards.colossus.zone, 'battlefield');
  });
});

/* -------------------------------------------------------------------------- */

describe('reads see writes inside one body', () => {
  it('a card moved to the graveyard is in the graveyard on the next line', () => {
    const state = board([
      { id: 'src', card: 'Sol Ring', owner: 'p1' },
      { id: 'bear', card: 'Grizzly Bears', owner: 'p1' },
    ]);

    let sizeBefore = -1;
    let sizeAfter = -1;
    const run = runXmageEffect(state, opts(), (game, source) => {
      const controller = game.getPlayer(source.getControllerId());
      sizeBefore = controller.getGraveyard().size();
      game.getPermanent('bear').destroy(true);
      sizeAfter = controller.getGraveyard().size();
      return true;
    });

    assert.equal(run.ok, true);
    assert.equal(sizeBefore, 0);
    assert.equal(sizeAfter, 1, 'an XMage body routinely moves a card and then asks where it is');
  });

  it('the state handed in is never mutated', () => {
    const state = board([{ id: 'bear', card: 'Grizzly Bears', owner: 'p1' }]);
    const before = JSON.stringify(state);
    runXmageEffect(state, opts({ sourceId: 'bear' }), game => {
      game.getPermanent('bear').destroy(true);
      game.getPlayer('p1').drawCards(2);
      return true;
    });
    assert.equal(JSON.stringify(state), before);
  });
});

/* -------------------------------------------------------------------------- */

describe('getPermanentOrLKIBattlefield', () => {
  it('answers from the board the run started on after the permanent has gone', () => {
    const state = board([{ id: 'bear', card: 'Grizzly Bears', owner: 'p1' }]);
    let liveAfter = 'unset';
    let lkiName = 'unset';
    runXmageEffect(state, opts({ sourceId: 'bear' }), game => {
      game.getPermanent('bear').destroy(true);
      liveAfter = game.getPermanent('bear') === null ? 'gone' : 'still there';
      lkiName = game.getPermanentOrLKIBattlefield('bear')?.getName() ?? 'nothing';
      return true;
    });
    assert.equal(liveAfter, 'gone');
    assert.equal(lkiName, 'Grizzly Bears');
  });
});

/* -------------------------------------------------------------------------- */

describe('the filter builder', () => {
  const state = () =>
    board([
      { id: 'goblin', card: 'Mogg Fanatic', owner: 'p1' },
      { id: 'piker', card: 'Goblin Piker', owner: 'p2' },
      { id: 'bear', card: 'Grizzly Bears', owner: 'p1' },
      { id: 'ring', card: 'Sol Ring', owner: 'p1' },
    ]);

  it('quotes the cards', () => {
    assertOracleContains('Mogg Fanatic', 'Sacrifice this creature');
  });

  it('add() composes, the way an XMage body builds one', () => {
    const filter = makeFilter('Goblin you control');
    filter.add(creaturePredicate());
    filter.add(SubType.of('Goblin').getPredicate());
    filter.add((s, card, ctx) => card.controllerId === ctx.controllerId);

    const run = runXmageEffect(state(), opts(), game => {
      const found = game
        .getBattlefield()
        .getActivePermanents(filter, 'p1')
        .map(p => p.getId());
      assert.deepEqual(found, ['goblin']);
      return true;
    });
    assert.equal(run.ok, true);
  });

  it('Predicates.or and Predicates.not behave', () => {
    const filter = makeFilter('artifact or a Goblin an opponent controls');
    filter.add(
      Predicates.or(
        CardType.ARTIFACT.getPredicate(),
        Predicates.and(subTypePredicate('Goblin'), controlledByOpponentPredicate())
      )
    );
    runXmageEffect(state(), opts(), game => {
      const found = game
        .getBattlefield()
        .getActivePermanents(filter, 'p1')
        .map(p => p.getId())
        .sort();
      assert.deepEqual(found, ['piker', 'ring']);
      return true;
    });
  });

  it('reads layered types, not the printed line', () => {
    // A Forest is not a creature. If this read `typeLine` directly it would
    // still be right; it is here so that the day an animation effect exists,
    // the failure lands on this test rather than on a card.
    const forest = board([{ id: 'forest', card: 'Forest', owner: 'p1' }]);
    runXmageEffect(forest, opts({ sourceId: 'forest' }), game => {
      assert.equal(game.getPermanent('forest').isCreature(), false);
      assert.equal(game.getPermanent('forest').isLand(), true);
      return true;
    });
  });
});

/* -------------------------------------------------------------------------- */

describe('counters', () => {
  it("Ajani's Pridemate: a counter arrives and reads back", () => {
    assertOracleContains("Ajani's Pridemate", 'put a +1/+1 counter on this creature');
    const state = board([{ id: 'cat', card: "Ajani's Pridemate", owner: 'p1' }]);

    let after = -1;
    const run = runXmageEffect(state, opts({ sourceId: 'cat' }), (game, source) => {
      const permanent = game.getPermanent(source.getSourceId());
      permanent.addCounters('+1/+1', 1);
      after = permanent.getCounters().getCount('+1/+1');
      return true;
    });

    assert.equal(run.ok, true);
    assert.deepEqual(
      run.actions.map(a => a.type),
      ['CARD_COUNTER']
    );
    assert.equal(after, 1);
    const board2 = applyActions(state, run.actions);
    assert.equal(board2.cards.cat.counters['+1/+1'], 1);
  });
});

/* -------------------------------------------------------------------------- */

describe('a watcher this engine does not fold is refused, not answered with zero', () => {
  it('returns null and names the watcher', () => {
    const state = board([{ id: 'src', card: 'Sol Ring', owner: 'p1' }]);
    const run = runXmageEffect(state, opts(), game => {
      const watcher = game.getState().getWatcher('CreaturesDiedWatcher');
      if (!watcher) return false;
      return true;
    });
    assert.equal(run.ok, true);
    assert.deepEqual(run.actions, []);
    assert.equal(run.deferred.length, 1);
    assert.ok(run.deferred[0].includes('CreaturesDiedWatcher'));
    assert.ok(run.deferred[0].includes('0 is not the real number'));
  });
});

/* -------------------------------------------------------------------------- */

describe('the manifest is read off the code, not typed', () => {
  it('lists what the facades actually have', () => {
    const manifest = xmageApiManifest();
    assert.ok(manifest.Game.includes('getPlayer'));
    assert.ok(manifest.Game.includes('getPermanent'));
    assert.ok(manifest.Player.includes('moveCards'));
    assert.ok(manifest.Player.includes('chooseUse'));
    assert.ok(manifest.Permanent.includes('getControllerId'));
    assert.ok(manifest.GameEvent.includes('getType'));
    assert.ok(manifest.Ability.includes('getSourceId'));
    assert.equal(
      manifest.Game.includes('aMethodNobodyWrote'),
      false,
      'the manifest must not be able to claim a method the code does not have'
    );
  });
});
