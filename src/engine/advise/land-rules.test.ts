/**
 * The two predicates the optimiser's land section is built on.
 *
 *   node --test --experimental-strip-types src/lib/deck/recommend/land-rules.test.ts
 *
 * WHY THESE ARE WORTH A TEST OF THEIR OWN
 * ---------------------------------------
 * `isBasicLand` decides whether a card is exempt from the optimiser's "you
 * already play this" rule. Everything else in the validator is fail-closed —
 * a name that does not resolve is dropped — but this one predicate is a
 * deliberate *exemption*, so a mistake in it fails in whichever direction the
 * regex happens to be wrong:
 *
 *   too narrow  every basic-land recommendation is dropped as `already-in-deck`,
 *               which is the bug this replaced: a land-short deck that plays
 *               Plains is exactly the deck that should be told to add Plains,
 *               and it was told nothing. It also inflated the drop rate the
 *               response reports, so the measurement lied about the model.
 *   too broad   a non-basic the deck already plays is waved through, and the
 *               user is told to add a second Sol Ring to a singleton deck.
 *
 * The type lines below are real `cards.type_line` values, not invented ones.
 * `Snow-Covered Plains` and the Wastes/Un-set cases are the ones that decide
 * whether the rule is written against the word "Basic" or against a hardcoded
 * list of five names — it has to be the former.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isBasicLand,
  isLandCard,
} from '../../../../supabase/functions/deck-optimizer/validate.ts';

/** Only `typeLine` is read, so only `typeLine` is supplied. */
const card = (typeLine: string) =>
  ({ typeLine }) as unknown as Parameters<typeof isBasicLand>[0];

describe('isLandCard', () => {
  const lands = [
    'Land',
    'Basic Land — Plains',
    'Legendary Land',
    'Artifact Land',
    'Land Creature — Elemental',
    'Snow Land — Forest',
    'Basic Snow Land — Island',
  ];
  for (const t of lands) {
    it(`treats "${t}" as a land`, () => assert.equal(isLandCard(card(t)), true));
  }

  const notLands = [
    'Creature — Human Wizard',
    'Instant',
    'Artifact — Equipment',
    'Enchantment — Aura',
    'Legendary Creature — Elder Dragon',
  ];
  for (const t of notLands) {
    it(`does not treat "${t}" as a land`, () => assert.equal(isLandCard(card(t)), false));
  }

  it('does not match "Island" inside a word', () => {
    // "Islandwalk" is an ability, not a type. `\b` is what keeps this false,
    // and the same anchoring is why "Landfall" text can never make a spell
    // look like a land.
    assert.equal(isLandCard(card('Creature — Merfolk')), false);
  });
});

describe('isBasicLand', () => {
  it('accepts the five basics', () => {
    for (const n of ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']) {
      assert.equal(isBasicLand(card(`Basic Land — ${n}`)), true, n);
    }
  });

  it('accepts Wastes, which is a basic land with no colour', () => {
    assert.equal(isBasicLand(card('Basic Land')), true);
  });

  it('accepts snow basics, which are still basics and still unlimited', () => {
    // `Snow-Covered Plains` is `Basic Snow Land — Plains`. A deck may run any
    // number, so it must take the exemption too.
    assert.equal(isBasicLand(card('Basic Snow Land — Plains')), true);
  });

  it('rejects a non-basic land', () => {
    // The singleton rule applies to these, so the "already in the deck" check
    // must still bite.
    for (const t of ['Land', 'Legendary Land', 'Artifact Land', 'Snow Land — Forest']) {
      assert.equal(isBasicLand(card(t)), false, t);
    }
  });

  it('rejects a non-land that merely says "basic"', () => {
    // The exemption is "a basic LAND", not "anything describing itself as
    // basic". Dropping the land half of the conjunction would let a spell the
    // deck already plays be recommended again.
    assert.equal(isBasicLand(card('Creature — Basic Bear')), false);
    assert.equal(isBasicLand(card('Enchantment')), false);
  });

  it('is a strict subset of isLandCard', () => {
    const all = [
      'Basic Land — Plains',
      'Basic Snow Land — Island',
      'Basic Land',
      'Land',
      'Legendary Land',
      'Creature — Human',
      'Instant',
    ];
    for (const t of all) {
      if (isBasicLand(card(t))) {
        assert.equal(isLandCard(card(t)), true, `${t} is basic but not a land`);
      }
    }
  });
});
