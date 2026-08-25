/**
 * The archetype catalogue, tested on the two things that now depend on it.
 *
 *   node --test --experimental-strip-types src/lib/deck/archetypeShells.test.ts
 *
 * The card names in `DECK_ARCHETYPES` used to be display text and are now read
 * by the generator: `pipeline.ts` looks each one up in the card database by
 * EXACT name and compiles what it finds into behaviour facets. A name that does
 * not resolve contributes nothing and fails silently, which is why the shape of
 * a name is asserted here rather than left to a build that is quietly thinner
 * than it looks.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DECK_ARCHETYPES,
  shellCardNames,
  shellForArchetype,
  shellForRequestedArchetype,
} from './archetypeShells.ts';

describe('the catalogue is shaped so the generator can read it', () => {
  it('every shell has an id nothing else has', () => {
    const ids = DECK_ARCHETYPES.map(s => s.id);
    assert.deepEqual(ids, [...new Set(ids)]);
  });

  it('every shell names cards, and every package has some', () => {
    for (const shell of DECK_ARCHETYPES) {
      assert.ok(shell.packages.length > 0, `${shell.id} has no packages`);
      for (const pkg of shell.packages) {
        assert.ok(pkg.cards.length > 0, `${shell.id} / ${pkg.name} names no cards`);
      }
      // Two cards have to share a behaviour before it becomes a want, so a
      // shell with fewer than two cards can never say anything at all.
      assert.ok(shellCardNames(shell).length >= 2, `${shell.id} names too few cards`);
    }
  });

  it('no card name carries a typographic apostrophe', () => {
    /*
     * The lookup is an exact match against `cards.name`, which uses the ASCII
     * apostrophe. Three names in this file carried U+2019 and resolved to
     * nothing for as long as they existed: `Nature's Lore`, `Tyvar's Stand` and
     * `Thassa's Oracle`. Nothing failed, the shells were simply three cards
     * thinner than they read.
     */
    for (const shell of DECK_ARCHETYPES) {
      for (const name of shellCardNames(shell)) {
        assert.equal(name.includes('’'), false, `${shell.id} names "${name}"`);
      }
    }
  });

  it('a card is named once per shell', () => {
    for (const shell of DECK_ARCHETYPES) {
      const all = shell.packages.flatMap(p => p.cards);
      assert.equal(
        all.length,
        new Set(all).size,
        `${shell.id} names the same card in two packages, which would weight it twice`
      );
    }
  });
});

describe('resolving the archetype a player asked for', () => {
  it('the ids the builder offers all resolve', () => {
    // Every `value` `AIBuilder.tsx` can put in a request body. It builds them
    // from this catalogue now, and this is the assertion that keeps it that way.
    for (const shell of DECK_ARCHETYPES) {
      assert.equal(shellForRequestedArchetype(shell.id)?.id, shell.id);
      assert.equal(shellForRequestedArchetype(shell.name)?.id, shell.id);
    }
  });

  it('punctuation and case do not matter', () => {
    assert.equal(shellForRequestedArchetype('Big Mana')?.id, 'big-mana');
    assert.equal(shellForRequestedArchetype('big_mana')?.id, 'big-mana');
    assert.equal(shellForRequestedArchetype('+1/+1 counters')?.id, 'counters');
    assert.equal(shellForRequestedArchetype('Token Strategy')?.id, 'tokens');
  });

  it('a name no shell matches returns nothing rather than something close', () => {
    // A shell decides what the deck is built out of, so a near miss builds the
    // wrong deck and says nothing about it. `midrange` is the standing case: it
    // is a description of having no shell.
    assert.equal(shellForRequestedArchetype('midrange'), undefined);
    assert.equal(shellForRequestedArchetype('aggressive tokens'), undefined);
    assert.equal(shellForRequestedArchetype(''), undefined);
  });

  it('the detected-name lookup still answers about finished decks', () => {
    // A different question and a different vocabulary: this one is about an
    // archetype the analyser found in a deck someone already has.
    assert.equal(shellForArchetype('Aristocrats')?.id, 'aristocrats');
    assert.equal(shellForArchetype('Ramp/Big Mana')?.id, 'big-mana');
    assert.equal(shellForArchetype('Landfall'), undefined);
  });
});
