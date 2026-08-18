/**
 * The rule that decides whether the optimiser may tell you to cut a card.
 *
 *   node --test --experimental-strip-types src/lib/deck/recommend/cut-rules.test.ts
 *
 * WHY THIS EXISTS
 * ---------------
 * `removals`, `replacements.remove` and `landRecommendations` of type "remove"
 * are the sections whose names are checked against the DECK rather than against
 * `cards` — "cut this card you play" is false unless the deck plays it. That
 * check was a single membership test against the deck, and the commander is a
 * member of the deck. It has to be: the profile, the colour identity, the role
 * counts and the curve are all measured from `deckEntries`, and the commander
 * is the card that decides the colour identity in the first place.
 *
 * So the commander passed. A `removals` entry naming it was accepted, counted
 * as accepted in `validation`, and shipped with a real `cardId` beside it —
 * and the optimiser panel applies an accepted cut by calling
 * `onRemoveCard(name)`, which makes it a one-click edit to the user's deck.
 * The prompt already omits the commander from the DECK list, so this stayed
 * latent rather than common; a prompt is a request, and this is the check.
 *
 * The ORDER of the two refusals is asserted, not just the fact of them. The
 * reason is recorded in `validation.byReason` and read as a measurement, so a
 * card that is simply not in the deck must not be reported as a commander, and
 * the commander must not be reported as absent from a deck it is part of.
 *
 * Both sets are keyed on `normalizeName` output. That is asserted too: the
 * function must not be given raw card names and quietly compare them, because
 * every caller already normalises and a raw comparison would reintroduce the
 * case sensitivity the normaliser exists to remove.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeName,
} from '../../../../supabase/functions/deck-optimizer/catalog.ts';
import {
  cutRefusal,
} from '../../../../supabase/functions/deck-optimizer/validate.ts';

/** A deck, as the validator holds it: normalised names. */
const keys = (...names: string[]) => new Set(names.map(normalizeName));

const DECK = keys(
  'Atraxa, Praetors’ Voice',
  'Sol Ring',
  'Command Tower',
  'Cultivate'
);
const COMMANDER = keys('Atraxa, Praetors’ Voice');

describe('cutRefusal', () => {
  it('allows an ordinary deck card to be cut', () => {
    assert.equal(cutRefusal(normalizeName('Sol Ring'), DECK, COMMANDER), null);
    assert.equal(cutRefusal(normalizeName('Cultivate'), DECK, COMMANDER), null);
  });

  it('refuses the commander, which is in the deck and may not be cut', () => {
    assert.equal(
      cutRefusal(normalizeName('Atraxa, Praetors’ Voice'), DECK, COMMANDER),
      'is-commander'
    );
  });

  it('refuses a card the deck does not play', () => {
    assert.equal(cutRefusal(normalizeName('Rhystic Study'), DECK, COMMANDER), 'not-in-deck');
  });

  it('reports not-in-deck ahead of is-commander, so the reason is the true one', () => {
    // A name that is somehow marked commander but absent from the deck is not
    // a commander problem — it is a name the deck does not contain.
    const orphan = keys('Edgar Markov');
    assert.equal(cutRefusal(normalizeName('Edgar Markov'), DECK, orphan), 'not-in-deck');
  });

  it('matches the commander through the normaliser, not by exact spelling', () => {
    // The model writes the ASCII apostrophe and lower-cases; the deck stores
    // the typographic one. Both are the same card, and neither may be cut.
    for (const spelling of [
      "Atraxa, Praetors' Voice",
      'ATRAXA, PRAETORS’ VOICE',
      '  Atraxa,   Praetors’ Voice  ',
    ]) {
      assert.equal(
        cutRefusal(normalizeName(spelling), DECK, COMMANDER),
        'is-commander',
        spelling
      );
    }
  });

  it('refuses nothing when there is no commander', () => {
    // A 60-card deck has no commander, and every card in it is cuttable.
    assert.equal(cutRefusal(normalizeName('Sol Ring'), DECK, new Set()), null);
  });

  it('treats an empty deck as containing nothing, not as permitting everything', () => {
    assert.equal(cutRefusal(normalizeName('Sol Ring'), new Set(), new Set()), 'not-in-deck');
  });
});
