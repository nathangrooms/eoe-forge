/**
 * The machine-translated XMage bodies, run on a real board.
 *
 * `bodies.generated.ts` is written by `scripts/xmage/translate-bodies.mjs` from
 * XMage's Java. This file does not test the translator; it tests the OUTPUT,
 * the way CLAUDE.md insists: every board is built from a row of the real
 * `cards` table, every test quotes that card's Scryfall oracle text before it
 * asserts behaviour, and the actions are folded through the real reducer so the
 * assertion is on the BOARD rather than on the intent.
 *
 * Green tests do not mean a player can reach it. Nothing in this file claims a
 * player can reach these cards: `bodies.generated.ts` is imported by this test
 * and by nothing else. What these tests establish is narrower and worth having
 * on its own — that a body translated by machine, with no hand editing, runs
 * and moves a real board the way the printed card says.
 *
 * Card wording comes from Scryfall. Behaviour is derived from XMage, MIT,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage,
 * read in place. None of XMage's display strings appear here or in the
 * generated file; `scripts/xmage/translate-check.mjs` measures that rather than
 * asserting it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertOracleContains, board } from '../abilities/primitives/harness.testlib.ts';
import { applyActions } from '../rules.ts';
import { runXmageEffect } from './index.ts';
import { TRANSLATED_BODIES, translatedBodyCount } from './bodies.generated.ts';

const opts = (extra: Record<string, unknown> = {}) => ({
  sourceId: 'src',
  controllerId: 'p1',
  idPrefix: 'st1',
  at: 0,
  ...extra,
});

/** Fail loudly rather than skip: a body that vanished is a regression. */
function bodyFor(key: string) {
  const record = TRANSLATED_BODIES[key];
  assert.ok(record, `${key} is not in bodies.generated.ts — regenerate, do not edit`);
  return record;
}

/* -------------------------------------------------------------------------- */

describe('the generated file describes itself honestly', () => {
  it('counts are read off the object, not written down', () => {
    const { total, substantive } = translatedBodyCount();
    assert.equal(total, Object.keys(TRANSLATED_BODIES).length);
    assert.ok(substantive > 0 && substantive < total);
  });

  it('half of what translates is a bare return, and the record says so', () => {
    // An `AsThoughEffect` or `ContinuousEffect` has to override `apply` and its
    // real behaviour is in another method. Those translate perfectly and are
    // worth nothing, so `trivial` is on the record. If this ever reads false
    // for all of them, the flag has stopped being computed.
    const trivial = Object.values(TRANSLATED_BODIES).filter(b => b.trivial);
    assert.ok(trivial.length > 0);
    for (const record of trivial.slice(0, 20)) {
      const run = runXmageEffect(board([{ id: 'src', card: 'Sol Ring', owner: 'p1' }]), opts(), record.run);
      assert.deepEqual(run.actions, [], 'a body marked trivial must emit nothing');
    }
  });

  it('every record names where in XMage it came from', () => {
    for (const [key, record] of Object.entries(TRANSLATED_BODIES)) {
      assert.equal(key, `${record.card}::${record.effect}`);
      assert.match(record.source, /^Mage\.Sets\/src\/mage\/cards\//);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe('Elspeth Tirel: gain 1 life for each creature you control', () => {
  it('quotes the card', () => {
    assertOracleContains('Elspeth Tirel', 'each creature you control');
  });

  it('gains life equal to the creature count, on the real board', () => {
    const state = board([
      { id: 'src', card: 'Elspeth Tirel', owner: 'p1' },
      { id: 'bear', card: 'Grizzly Bears', owner: 'p1' },
      { id: 'elf', card: 'Llanowar Elves', owner: 'p1' },
      { id: 'ring', card: 'Sol Ring', owner: 'p1' },
      { id: 'theirs', card: 'Grizzly Bears', owner: 'p2' },
    ]);
    const before = state.players.find(p => p.id === 'p1')!.life;

    const run = runXmageEffect(state, opts(), bodyFor('ElspethTirel::ElspethTirelFirstEffect').run);
    assert.equal(run.ok, true);

    const after = applyActions(state, run.actions);
    // Two creatures of ours. The artifact does not count and neither does the
    // opponent's bear, which is the whole point of the controller argument.
    assert.equal(after.players.find(p => p.id === 'p1')!.life, before + 2);
  });
});

/* -------------------------------------------------------------------------- */

describe("Hidetsugu's Second Rite: 10 damage when the target is at exactly 10", () => {
  it('quotes the card', () => {
    assertOracleContains("Hidetsugu's Second Rite", 'exactly 10 life');
  });

  const state = (life: number) => {
    const base = board([
      { id: 'src', card: "Hidetsugu's Second Rite", owner: 'p1', zone: 'graveyard' },
      { id: 'bear', card: 'Grizzly Bears', owner: 'p2' },
    ]);
    return {
      ...base,
      players: base.players.map(p => (p.id === 'p2' ? { ...p, life } : p)),
    };
  };

  const targets = [{ kind: 'player', playerId: 'p2' } as const];

  it('deals 10 at exactly 10', () => {
    const start = state(10);
    const run = runXmageEffect(start, opts({ targets }), bodyFor('HidetsugusSecondRite::HidetsugusSecondRiteEffect').run);
    assert.equal(run.ok, true);
    const after = applyActions(start, run.actions);
    assert.equal(after.players.find(p => p.id === 'p2')!.life, 0);
  });

  it('deals nothing at 11, which is the whole card', () => {
    const start = state(11);
    const run = runXmageEffect(start, opts({ targets }), bodyFor('HidetsugusSecondRite::HidetsugusSecondRiteEffect').run);
    assert.equal(run.ok, true);
    assert.deepEqual(run.actions, []);
    const after = applyActions(start, run.actions);
    assert.equal(after.players.find(p => p.id === 'p2')!.life, 11);
  });
});

/* -------------------------------------------------------------------------- */

describe('Biorhythm: every life total becomes that player\'s creature count', () => {
  it('quotes the card', () => {
    assertOracleContains('Biorhythm', 'life total becomes the number of creatures');
  });

  it('moves both players to their own creature count', () => {
    const state = board([
      { id: 'src', card: 'Biorhythm', owner: 'p1', zone: 'graveyard' },
      { id: 'bear', card: 'Grizzly Bears', owner: 'p1' },
      { id: 'elf', card: 'Llanowar Elves', owner: 'p1' },
      { id: 'wall', card: 'Grizzly Bears', owner: 'p2' },
    ]);

    const run = runXmageEffect(state, opts(), bodyFor('Biorhythm::BiorhythmEffect').run);
    assert.equal(run.ok, true);

    const after = applyActions(state, run.actions);
    assert.equal(after.players.find(p => p.id === 'p1')!.life, 2);
    assert.equal(after.players.find(p => p.id === 'p2')!.life, 1);
  });
});
