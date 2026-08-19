/**
 * A repeated land name is a second COPY only when the land is basic.
 *
 *   node --test --experimental-strip-types src/lib/deck/recommend/land-repeat.test.ts
 *
 * WHY THIS RULE NEEDS A TEST
 * --------------------------
 * The optimiser's land section collapses a repeated name into a quantity, so
 * the model can ask for five Plains by listing Plains five times. That branch
 * returns *before* `resolveAdd` is called, which means `seenLandAdd` — the
 * oracle-id duplicate guard that stops every other section offering the same
 * card twice — never runs for lands at all. The land section is therefore the
 * only place in the validator where a name is accepted without being checked,
 * and the only place an outcome is decided by ADDING to a suggestion rather
 * than by dropping one.
 *
 * With no basic-land test on that branch, "Command Tower, Command Tower" was
 * folded into `quantity: 2` and recorded as ACCEPTED: a Commander player told
 * to add two copies of a singleton card, by the one code path that did not
 * verify what it was accepting. The drop rate did not show it, because the
 * repeat was counted as an acceptance.
 *
 * So this pins both directions. Too strict and multi-basic recommendations
 * stop working, which is the whole reason the collapse exists. Too loose and
 * the response emits an illegal deck.
 *
 * The type lines below are real `cards.type_line` values.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  landRepeatDisposition,
} from '../../../../supabase/functions/deck-optimizer/validate.ts';

/** Only `typeLine` is read, so only `typeLine` is supplied. */
const card = (typeLine: string) =>
  ({ typeLine }) as unknown as NonNullable<Parameters<typeof landRepeatDisposition>[0]>;

describe('landRepeatDisposition', () => {
  const copies = [
    'Basic Land — Plains',
    'Basic Land — Island',
    'Basic Land — Swamp',
    'Basic Land — Mountain',
    'Basic Land — Forest',
    'Basic Snow Land — Forest',
    'Basic Land — Wastes',
  ];
  for (const t of copies) {
    it(`counts a repeat of "${t}" as another copy`, () => {
      assert.equal(landRepeatDisposition(card(t)), 'copy');
    });
  }

  // The regression. Every one of these is singleton in Commander, so a second
  // occurrence can only ever be the model repeating itself.
  const duplicates = [
    'Land', // Command Tower, Reliquary Tower
    'Legendary Land', // Gaea's Cradle
    'Artifact Land', // Seat of the Synod
    'Land — Forest Island', // Breeding Pool: a dual, not a basic
    'Snow Land — Forest', // Snow-Covered lands are printed as Basic; this is not
    'Land Creature — Elemental', // Dryad Arbor
  ];
  for (const t of duplicates) {
    it(`counts a repeat of "${t}" as a duplicate, not a second copy`, () => {
      assert.equal(landRepeatDisposition(card(t)), 'duplicate');
    });
  }

  it('treats an unresolved card as a duplicate rather than a copy', () => {
    // "I cannot tell whether this is a basic" must resolve to the answer that
    // adds nothing to the user's deck.
    assert.equal(landRepeatDisposition(null), 'duplicate');
  });

  it('does not read the word "basic" out of a non-land type line', () => {
    // Guards the predicate against matching on the word alone: the rule is
    // "basic AND land", and a hypothetical non-land carrying the word must not
    // become repeatable.
    assert.equal(landRepeatDisposition(card('Basic Artifact')), 'duplicate');
  });
});
