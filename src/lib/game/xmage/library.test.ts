/**
 * The player's library, and the two things a library read can get wrong.
 *
 * Every board is built from a row of the real `cards` table through
 * `harness.testlib.ts` and every test that claims what a card says asserts it
 * against Scryfall first. Two of the tests below run the SHIPPED translated
 * body out of `bodies.generated.ts` rather than a body written here, because a
 * body written here proves the facade runs and not that anything reaches it.
 *
 * Card wording comes from Scryfall. Behaviour is derived from XMage, MIT,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage,
 * read in place. XMage's own display strings are not reproduced here.
 *
 * ## The two things these tests exist to catch
 *
 * **ORDER.** A library is a list and the order is the whole point. `zones.library`
 * is top first — `drawCards` in `rules.ts` takes index 0 — and every read here
 * has to keep that. A `getTopCards` that returns the right cards in the wrong
 * order is a Brainstorm that lies.
 *
 * **LIVENESS.** `player.getLibrary()` used to return an `XCards`, which copies
 * the id list once. XMage binds the library object before a loop and reads it
 * inside:
 *
 *     Library library = opponent.getLibrary();
 *     do { card = library.getFromTop(game); … } while (library.hasCards());
 *
 * against a snapshot that never ends. The liveness tests are the ones that fail
 * if anybody turns this back into a copy.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertOracleContains, board } from '../abilities/primitives/harness.testlib.ts';
import { applyActions } from '../rules.ts';
import type { GameState } from '../types.ts';
import { TRANSLATED_BODIES } from './bodies.generated.ts';
import { LIBRARY_READ_BUDGET, XmageRunaway } from './runtime.ts';
import { runXmageEffect, xmageApiManifest, type XmageBody } from './index.ts';

const opts = (extra: Record<string, unknown> = {}) => ({
  sourceId: 'src',
  controllerId: 'p1',
  idPrefix: 'lib1',
  at: 0,
  ...extra,
});

/**
 * A library holding, top first, exactly the cards named. `addCard` appends, so
 * the placement order IS the library order and index 0 is the top.
 */
const withLibrary = (names: readonly string[], extra: Array<Record<string, unknown>> = []): GameState =>
  board([
    { id: 'src', card: 'Countryside Crusher', owner: 'p1' },
    ...names.map((card, i) => ({ id: `l${i}`, card, owner: 'p1', zone: 'library' as const })),
    ...extra,
  ] as never);

const zoneOf = (state: GameState, id: string) => state.cards[id]?.zone;
const libraryOf = (state: GameState, playerId = 'p1') =>
  state.players.find(p => p.id === playerId)?.zones.library ?? [];

/* -------------------------------------------------------------------------- */
/* The class the work order named wrongly                                     */
/* -------------------------------------------------------------------------- */

describe('getLibrary returns a Library, not a Cards', () => {
  /*
   * `docs/engine/RUNTIME-API.md` ranks the two biggest open rows on the whole
   * work order as `ZoneChangeInfo.Library#getFromTop` and `#getTopCards`. That
   * nested class declares `top`, three constructors and `copy()`. The class the
   * card bodies actually call is `mage.players.Library`, and building the other
   * one would have bought nothing at all.
   */
  it('carries the four methods 459 card bodies stop on', () => {
    const state = withLibrary(['Forest']);
    const run = runXmageEffect(state, opts(), (game, source) => {
      const controller = game.getPlayer(source.getControllerId());
      if (!controller) return false;
      const library = controller.getLibrary();
      for (const method of ['getTopCards', 'getFromTop', 'hasCards', 'getCards'] as const) {
        assert.equal(typeof library[method], 'function', `Library#${method} is missing`);
      }
      return true;
    });
    assert.equal(run.ok, true);
  });

  it('the manifest reports them, so the coverage join cannot claim what the code lacks', () => {
    const manifest = xmageApiManifest();
    assert.ok(manifest.Library, 'the manifest has no Library entry');
    for (const method of ['getTopCards', 'getFromTop', 'hasCards', 'getCards']) {
      assert.ok(manifest.Library.includes(method), `manifest is missing Library#${method}`);
    }
    // Deliberately absent: they take a card out of the library without saying
    // where it goes, and a mapping that returned the card while leaving it in
    // place turns a `while` loop into a loop on one card for ever.
    for (const method of ['removeFromTop', 'remove', 'clear']) {
      assert.ok(
        !manifest.Library.includes(method),
        `Library#${method} would be claimed as implemented and it is not`
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Order                                                                      */
/* -------------------------------------------------------------------------- */

describe('a library read is ordered, top first', () => {
  const state = () => withLibrary(['Forest', 'Mountain', 'Island', 'Grizzly Bears']);

  it('getTopCards hands back the top n in order', () => {
    const run = runXmageEffect(state(), opts(), (game, source) => {
      const controller = game.getPlayer(source.getControllerId());
      if (!controller) return false;
      assert.deepEqual(
        controller.getLibrary().getTopCards(3).map(c => c.getName()),
        ['Forest', 'Mountain', 'Island']
      );
      return true;
    });
    assert.equal(run.ok, true);
  });

  it('getFromTop is the top and getFromBottom is the bottom', () => {
    const run = runXmageEffect(state(), opts(), (game, source) => {
      const controller = game.getPlayer(source.getControllerId());
      if (!controller) return false;
      assert.equal(controller.getLibrary().getFromTop()?.getName(), 'Forest');
      assert.equal(controller.getLibrary().getFromBottom()?.getName(), 'Grizzly Bears');
      return true;
    });
    assert.equal(run.ok, true);
  });

  it('getCards is every card, still top to bottom', () => {
    const run = runXmageEffect(state(), opts(), (game, source) => {
      const controller = game.getPlayer(source.getControllerId());
      if (!controller) return false;
      assert.deepEqual(
        controller.getLibrary().getCards().map(c => c.getName()),
        ['Forest', 'Mountain', 'Island', 'Grizzly Bears']
      );
      return true;
    });
    assert.equal(run.ok, true);
  });

  it('asking for more than there is gives what there is, not padding', () => {
    const run = runXmageEffect(withLibrary(['Forest']), opts(), (game, source) => {
      const controller = game.getPlayer(source.getControllerId());
      if (!controller) return false;
      assert.equal(controller.getLibrary().getTopCards(9).length, 1);
      assert.deepEqual(controller.getLibrary().getTopCards(0), []);
      return true;
    });
    assert.equal(run.ok, true);
  });
});

/* -------------------------------------------------------------------------- */
/* Null, because the translator emits `=== null`                              */
/* -------------------------------------------------------------------------- */

describe('an empty library answers null, not undefined', () => {
  /*
   * XMage bodies are full of `if (card == null) break;` and the translator
   * turns that into `card === null`. A facade returning `undefined` fails that
   * check, and the body carries on holding nothing — which is the silent
   * failure this project keeps shipping rather than a visible one.
   */
  it('getFromTop on an empty library is null', () => {
    const run = runXmageEffect(withLibrary([]), opts(), (game, source) => {
      const controller = game.getPlayer(source.getControllerId());
      if (!controller) return false;
      const library = controller.getLibrary();
      assert.equal(library.getFromTop(), null);
      assert.equal(library.getFromBottom(), null);
      assert.equal(library.hasCards(), false);
      assert.equal(library.size(), 0);
      assert.deepEqual(library.getCards(), []);
      return true;
    });
    assert.equal(run.ok, true);
  });

  it('getCard finds a card in THIS library and nothing else', () => {
    const state = board([
      { id: 'src', card: 'Countryside Crusher', owner: 'p1' },
      { id: 'mine', card: 'Forest', owner: 'p1', zone: 'library' },
      { id: 'inHand', card: 'Island', owner: 'p1', zone: 'hand' },
      { id: 'theirs', card: 'Mountain', owner: 'p2', zone: 'library' },
    ]);
    const run = runXmageEffect(state, opts(), (game, source) => {
      const controller = game.getPlayer(source.getControllerId());
      if (!controller) return false;
      const library = controller.getLibrary();
      assert.equal(library.getCard('mine')?.getName(), 'Forest');
      assert.equal(library.getCard('inHand'), null, 'a card in hand is not in the library');
      assert.equal(library.getCard('theirs'), null, "another player's library is not this one");
      assert.equal(library.getCard(undefined), null);
      return true;
    });
    assert.equal(run.ok, true);
  });
});

/* -------------------------------------------------------------------------- */
/* Liveness                                                                   */
/* -------------------------------------------------------------------------- */

describe('the library object is live, because XMage binds it before the loop', () => {
  it('a bound library sees a card leave the top', () => {
    const state = withLibrary(['Forest', 'Mountain']);
    const run = runXmageEffect(state, opts(), (game, source) => {
      const controller = game.getPlayer(source.getControllerId());
      if (!controller) return false;
      // Bound ONCE, exactly as NicolBolasGodPharaoh's body binds it.
      const library = controller.getLibrary();
      assert.equal(library.getFromTop()?.getName(), 'Forest');
      controller.moveCards(library.getFromTop()!, 'graveyard');
      assert.equal(library.getFromTop()?.getName(), 'Mountain', 'a snapshot would still say Forest');
      assert.equal(library.size(), 1);
      controller.moveCards(library.getFromTop()!, 'graveyard');
      assert.equal(library.hasCards(), false, 'a snapshot never empties, so the loop never ends');
      return true;
    });
    assert.equal(run.ok, true);
  });

  it('putOnTop and putOnBottom go where they say', () => {
    const state = board([
      { id: 'src', card: 'Countryside Crusher', owner: 'p1' },
      { id: 'l0', card: 'Forest', owner: 'p1', zone: 'library' },
      { id: 'l1', card: 'Mountain', owner: 'p1', zone: 'library' },
      { id: 'h0', card: 'Island', owner: 'p1', zone: 'hand' },
      { id: 'h1', card: 'Grizzly Bears', owner: 'p1', zone: 'hand' },
    ]);
    const run = runXmageEffect(state, opts(), (game, source) => {
      const controller = game.getPlayer(source.getControllerId());
      if (!controller) return false;
      const library = controller.getLibrary();
      library.putOnTop('h0');
      library.putOnBottom('h1');
      assert.deepEqual(library.getCardList(), ['h0', 'l0', 'l1', 'h1']);
      return true;
    });
    assert.equal(run.ok, true);
    // And the same thing is true of the BOARD, once the reducer has folded it.
    const after = applyActions(state, run.actions);
    assert.deepEqual(libraryOf(after), ['h0', 'l0', 'l1', 'h1']);
  });

  it('the state handed in is untouched', () => {
    const state = withLibrary(['Forest', 'Mountain']);
    const before = JSON.stringify(state);
    runXmageEffect(state, opts(), (game, source) => {
      const controller = game.getPlayer(source.getControllerId());
      if (!controller) return false;
      controller.moveCards(controller.getLibrary().getFromTop()!, 'graveyard');
      controller.getLibrary().putOnBottom('l1');
      return true;
    });
    assert.equal(JSON.stringify(state), before, 'a facade wrote to the state it was handed');
  });
});

/* -------------------------------------------------------------------------- */
/* The runaway guard                                                          */
/* -------------------------------------------------------------------------- */

describe('a loop that does not end says so instead of hanging', () => {
  /*
   * Liveness is what makes a loop possible at all, so it comes with the thing
   * that stops one. The budget is far above any real library; tripping it means
   * a body or a facade is wrong, and an engine that hangs is worse than one
   * that says no. `to-actions.ts` already turns a throw from a translated body
   * into a line in the log rather than a dead resolution.
   */
  it('throws rather than spinning for ever', () => {
    const state = withLibrary(['Forest', 'Mountain']);
    const runaway: XmageBody = (game, source) => {
      const controller = game.getPlayer(source.getControllerId());
      if (!controller) return false;
      const library = controller.getLibrary();
      // Nothing in here ever moves a card, which is the shape of the bug.
      while (library.hasCards()) library.getFromTop();
      return true;
    };
    assert.throws(() => runXmageEffect(state, opts(), runaway), XmageRunaway);
  });

  it('the budget is well above a real library', () => {
    assert.ok(LIBRARY_READ_BUDGET > 10_000, 'a hundred-card library costs a few hundred reads');
  });
});

/* -------------------------------------------------------------------------- */
/* Two shipped bodies, on a real board, through the real reducer              */
/* -------------------------------------------------------------------------- */

describe('Countryside Crusher, the shipped translation', () => {
  const KEY = 'CountrysideCrusher::CountrysideCrusherEffect';

  it('quotes the card', () => {
    assertOracleContains(
      'Countryside Crusher',
      "reveal the top card of your library. If it's a land card, put it into your graveyard and repeat this process"
    );
  });

  it('is in the shipped table and is not a bare return', () => {
    assert.ok(TRANSLATED_BODIES[KEY], `${KEY} is not in bodies.generated.ts`);
    assert.equal(TRANSLATED_BODIES[KEY].trivial, false);
  });

  it('bins the run of lands on top and stops at the first nonland', () => {
    const state = withLibrary(['Forest', 'Mountain', 'Grizzly Bears', 'Island']);
    const run = runXmageEffect(state, opts(), TRANSLATED_BODIES[KEY].run);
    assert.equal(run.ok, true);
    assert.equal(run.applied, true);

    // The board, not the action list: green tests do not mean a player can reach it.
    const after = applyActions(state, run.actions);
    assert.equal(zoneOf(after, 'l0'), 'graveyard', 'the Forest on top should have gone');
    assert.equal(zoneOf(after, 'l1'), 'graveyard', 'and the Mountain under it');
    assert.equal(zoneOf(after, 'l2'), 'library', 'the Grizzly Bears stops the process');
    assert.equal(zoneOf(after, 'l3'), 'library', 'and nothing under it is touched');
    assert.deepEqual(libraryOf(after), ['l2', 'l3']);
  });

  it('does nothing to a library whose top card is not a land', () => {
    const state = withLibrary(['Grizzly Bears', 'Forest']);
    const run = runXmageEffect(state, opts(), TRANSLATED_BODIES[KEY].run);
    assert.equal(run.ok, true);
    const after = applyActions(state, run.actions);
    assert.deepEqual(libraryOf(after), ['l0', 'l1']);
  });
});

/* -------------------------------------------------------------------------- */
/* Searching a library fills the target the next line reads                   */
/* -------------------------------------------------------------------------- */

describe('Oriq Loremage: the search has to fill the target', () => {
  const KEY = 'OriqLoremage::OriqLoremageEffect';

  /*
   * XMage's `searchLibrary(target, source, game)` FILLS the target, and every
   * body that searches reads the answer back off it on the next line:
   *
   *     player.searchLibrary(target, source, game);
   *     Card card = player.getLibrary().getCard(target.getFirstTarget(), game);
   *
   * Ours took a bare filter and returned the ids, so the target stayed empty,
   * `getFirstTarget()` was undefined and `getCard(undefined)` was null. Oriq
   * Loremage asked the player to search, took the answer, shuffled, and put
   * nothing in the graveyard — and returned true. It is in this file because
   * `Library#getCard` is the line that reads the answer, and mapping it is what
   * let these bodies ship at all.
   */
  it('quotes the card', () => {
    assertOracleContains('Oriq Loremage', 'Search your library for a card, put it into your graveyard');
  });

  const state = () =>
    board([
      { id: 'src', card: 'Oriq Loremage', owner: 'p1' },
      { id: 'l0', card: 'Lightning Bolt', owner: 'p1', zone: 'library' },
      { id: 'l1', card: 'Forest', owner: 'p1', zone: 'library' },
    ]);

  it('asks before it searches, and commits nothing until it is answered', () => {
    const run = runXmageEffect(state(), opts(), TRANSLATED_BODIES[KEY].run);
    assert.equal(run.ok, false);
    assert.deepEqual(run.actions, []);
    assert.equal(run.pending.length, 1);
    assert.deepEqual(run.pending[0].instanceIds.sort(), ['l0', 'l1']);
  });

  it('puts the card the player picked into the graveyard', () => {
    const before = state();
    const run = runXmageEffect(before, opts({ answers: { cards0: ['l0'] } }), TRANSLATED_BODIES[KEY].run);
    assert.equal(run.ok, true);
    const after = applyActions(before, run.actions);
    assert.equal(
      zoneOf(after, 'l0'),
      'graveyard',
      'the searched card must actually move: this is the silent card the fix is for'
    );
    assert.equal(zoneOf(after, 'l1'), 'library');
  });

  it('and puts a counter on itself, because a Lightning Bolt is an instant', () => {
    const before = state();
    const run = runXmageEffect(before, opts({ answers: { cards0: ['l0'] } }), TRANSLATED_BODIES[KEY].run);
    const after = applyActions(before, run.actions);
    assert.equal(after.cards.src.counters['+1/+1'], 1);
  });

  it('a land gets no counter, which is the half of the card that tells them apart', () => {
    const before = state();
    const run = runXmageEffect(before, opts({ answers: { cards0: ['l1'] } }), TRANSLATED_BODIES[KEY].run);
    const after = applyActions(before, run.actions);
    assert.equal(zoneOf(after, 'l1'), 'graveyard');
    assert.equal(after.cards.src.counters['+1/+1'] ?? 0, 0);
  });
});

describe('Misinformation: a library WRITE is ordered too, and the order was not ours', () => {
  const KEY = 'Misinformation::MisinformationEffect';

  /*
   * `putCardsOnTopOfLibrary` emitted one `position: 'top'` move per card in
   * order, and each one goes to index 0, so three cards came back REVERSED. The
   * card whose whole job is to put cards on top in a chosen order was
   * scrambling them, in silence.
   */
  it('quotes the card', () => {
    assertOracleContains('Misinformation', 'on top of their library in any order');
  });

  const state = () =>
    board([
      { id: 'src', card: 'Misinformation', owner: 'p1' },
      { id: 'a', card: 'Grizzly Bears', owner: 'p2', zone: 'graveyard' },
      { id: 'b', card: 'Lightning Bolt', owner: 'p2', zone: 'graveyard' },
      { id: 'c', card: 'Forest', owner: 'p2', zone: 'graveyard' },
      { id: 'deck', card: 'Island', owner: 'p2', zone: 'library' },
    ]);

  const targets = [
    { kind: 'card' as const, instanceId: 'a' },
    { kind: 'card' as const, instanceId: 'b' },
    { kind: 'card' as const, instanceId: 'c' },
  ];

  it('puts them back in the order it was given, not upside down', () => {
    const before = state();
    const run = runXmageEffect(before, opts({ targets }), TRANSLATED_BODIES[KEY].run);
    assert.equal(run.ok, true);
    const after = applyActions(before, run.actions);
    // They are owned by p2, so `moveCard` files them under p2's library.
    assert.deepEqual(libraryOf(after, 'p2'), ['a', 'b', 'c', 'deck']);
  });

  it('says out loud that the player was not asked to order them', () => {
    const run = runXmageEffect(state(), opts({ targets }), TRANSLATED_BODIES[KEY].run);
    assert.equal(
      run.deferred.some(line => line.includes('not asked to order them')),
      true,
      'the order is the player decision and skipping it has to be visible'
    );
  });

  it('one card is no decision, so nothing is deferred', () => {
    const run = runXmageEffect(
      state(),
      opts({ targets: [targets[0]] }),
      TRANSLATED_BODIES[KEY].run
    );
    assert.equal(run.ok, true);
    assert.deepEqual(run.deferred, []);
  });
});

describe('Balustrade Spy, the shipped translation', () => {
  const KEY = 'BalustradeSpy::BalustradeSpyEffect';

  it('quotes the card', () => {
    assertOracleContains(
      'Balustrade Spy',
      'reveals cards from the top of their library until they reveal a land card'
    );
  });

  it('mills the target player down to and including the first land', () => {
    // The body reads the target pointer, so the target is announced rather than
    // assumed: p2 is the player being milled and p1 is the one who cast it.
    const state = board([
      { id: 'src', card: 'Balustrade Spy', owner: 'p1' },
      { id: 'a', card: 'Grizzly Bears', owner: 'p2', zone: 'library' },
      { id: 'b', card: 'Lightning Bolt', owner: 'p2', zone: 'library' },
      { id: 'c', card: 'Island', owner: 'p2', zone: 'library' },
      { id: 'd', card: 'Forest', owner: 'p2', zone: 'library' },
    ]);
    const run = runXmageEffect(
      state,
      opts({ targets: [{ kind: 'player', playerId: 'p2' }] }),
      TRANSLATED_BODIES[KEY].run
    );
    assert.equal(run.ok, true);

    const after = applyActions(state, run.actions);
    assert.equal(zoneOf(after, 'a'), 'graveyard');
    assert.equal(zoneOf(after, 'b'), 'graveyard');
    assert.equal(zoneOf(after, 'c'), 'graveyard', 'the land itself is milled too');
    assert.equal(zoneOf(after, 'd'), 'library', 'and the process stops there');
    assert.deepEqual(libraryOf(after, 'p2'), ['d']);
  });

  it('a library with no land at all is emptied, not looped on', () => {
    const state = board([
      { id: 'src', card: 'Balustrade Spy', owner: 'p1' },
      { id: 'a', card: 'Grizzly Bears', owner: 'p2', zone: 'library' },
      { id: 'b', card: 'Lightning Bolt', owner: 'p2', zone: 'library' },
    ]);
    const run = runXmageEffect(
      state,
      opts({ targets: [{ kind: 'player', playerId: 'p2' }] }),
      TRANSLATED_BODIES[KEY].run
    );
    assert.equal(run.ok, true);
    const after = applyActions(state, run.actions);
    assert.deepEqual(libraryOf(after, 'p2'), []);
  });
});
