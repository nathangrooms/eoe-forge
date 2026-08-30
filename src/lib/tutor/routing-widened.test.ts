/**
 * The questions that used to route nowhere, and the ones that must not move.
 *
 *   node --test --experimental-strip-types src/lib/tutor/routing-widened.test.ts
 *
 * WHY THIS EXISTS SEPARATELY FROM `engine-seam.test.ts`
 * ----------------------------------------------------
 * That file covers the six asks the request body already answered. This covers
 * the eight added on 2026-08-30 after all fifty questions in
 * `docs/design/TUTOR-FIFTY-QUESTIONS.md` were put through the deployed endpoint
 * again and thirty more were written for the shapes the fifty missed.
 *
 * ROUTING IS AN ORDERED TABLE AND THE ORDER IS THE WHOLE MECHANISM. Every ask
 * added here sits above one that shares its words: `deck-shape` owns "how much"
 * and so does `price`; `colour-identity` owns "can i play" and so does
 * `legality-in-format`; `ban-reason` owns "why was" and would otherwise fall to
 * `explain`. So the pairs matter more than the singles, and both halves of each
 * pair are asserted: the question that should move, and the question beside it
 * that must not.
 *
 * No network. `chooseAsk` is pure and so is everything it calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ASKS,
  chooseAsk,
  shapeAskedIn,
} from '../../../supabase/functions/mtg-brain/answer/route.ts';
import { printedCopyException } from '../../../supabase/functions/mtg-brain/answer/legality.ts';
import { keywordsNamedIn } from '../../../supabase/functions/mtg-brain/answer/glossary.ts';
import { conditionNote, tappedNote } from '../../../supabase/functions/mtg-brain/manabase.ts';

const askFor = (question: string): string | null => chooseAsk(question)?.ask.id ?? null;

/* ------------------------------------------------------------------ *
 * The asks themselves
 * ------------------------------------------------------------------ */

describe('the asks added after the second measurement', () => {
  const added = [
    'deck-shape',
    'colour-identity',
    'ban-reason',
    'deck-colours',
    'win-condition',
    'build-a-deck',
    'deck-missing',
  ];

  it('every one of them is in the table', () => {
    const ids = ASKS.map(a => a.id);
    for (const id of added) assert.ok(ids.includes(id), `${id} is not in ASKS`);
  });

  /**
   * `deck-shape` owns "how many" and "how much", which are the opening words of
   * a price question. It sits above `price` and `lands` and `best-of`, and the
   * only thing stopping it swallowing them is its `needs`.
   */
  it('deck-shape sits above the asks whose words it borrows', () => {
    const at = (id: string) => ASKS.findIndex(a => a.id === id);
    for (const below of ['price', 'lands', 'best-of', 'upgrades']) {
      assert.ok(at('deck-shape') < at(below), `deck-shape must be above ${below}`);
    }
  });

  it('colour-identity sits above the legality ask whose words it borrows', () => {
    const at = (id: string) => ASKS.findIndex(a => a.id === id);
    assert.ok(at('colour-identity') < at('legality-in-format'));
  });

  it('ban-reason sits above legality and explain', () => {
    const at = (id: string) => ASKS.findIndex(a => a.id === id);
    assert.ok(at('ban-reason') < at('legality'));
    assert.ok(at('ban-reason') < at('explain'));
  });
});

/* ------------------------------------------------------------------ *
 * What a list can be counted in
 * ------------------------------------------------------------------ */

describe('the shape a question asks a list to be counted in', () => {
  const cases: [string, string | null][] = [
    ['How many lands should I run in a commander deck?', 'lands'],
    ['How many creatures should a commander deck run?', 'creatures'],
    ['How much ramp does a commander deck need?', 'ramp'],
    ['How much removal should I play?', 'removal'],
    ['How many counterspells should a deck run?', 'counterspells'],
    /* No shape named. These have to come back null or the price and list asks
       underneath are never reached. */
    ['How much is Black Lotus worth?', null],
    ['How much does this deck cost?', null],
    ['What is the best black removal spell under one dollar?', 'removal'],
  ];

  for (const [question, says] of cases) {
    it(`${question} -> ${says ?? 'no shape'}`, () => {
      assert.equal(shapeAskedIn(question)?.says ?? null, says);
    });
  }

  /**
   * The one that decides whether the whole ask is safe. `shapeAskedIn` finding
   * a shape in "the best black removal spell under one dollar" is correct and
   * harmless, because that question names none of the counting cues, so it
   * never reaches `deck-shape` at all.
   */
  it('a list question with a role in it still goes to the list ask', () => {
    assert.equal(askFor('What is the best black removal spell under one dollar?'), 'best-of');
  });
});

/* ------------------------------------------------------------------ *
 * The questions that used to route nowhere
 * ------------------------------------------------------------------ */

describe('questions that reached nothing before 2026-08-30', () => {
  const cases: [string, string][] = [
    /* q26, q27 and t24. The number is in `meta_decks` and was refused. */
    ['How many lands should I run in a commander deck?', 'deck-shape'],
    ['How much ramp does a commander deck need?', 'deck-shape'],
    ['How many creatures should a commander deck run?', 'deck-shape'],

    /* q48. `color_identity` is a column on every card. */
    [
      'My commander is blue and white. Can I play a card that has a green mana symbol in its rules text?',
      'colour-identity',
    ],

    /* q46. It used to print a popularity rank four lines above "banned". */
    ['Why was Jeweled Lotus banned?', 'ban-reason'],

    /* q30, q23, q35, t11. All four sat on something the request body carried
       or on a product the answer never named. */
    ['What colours is this deck short on?', 'deck-colours'],
    ['What is my win condition in this deck?', 'win-condition'],
    ['How do I build a commander deck for under fifty dollars?', 'build-a-deck'],
    ['What am I missing for this deck?', 'deck-missing'],

    /* q04, t01 and t04. Every one names a keyword and none of them uses the
       word "rules", so all three got the paragraph that says we hold none. */
    ['Can a creature I just played tap for mana the same turn?', 'keyword'],
    ['Does deathtouch work with trample?', 'keyword'],
    [
      'If I block a creature that has first strike, does my creature die before it gets to deal damage?',
      'keyword',
    ],

    /* t09. The deck's own price was in the body. */
    ['How much would it cost me to buy every card in this deck?', 'deck-value'],
  ];

  for (const [question, ask] of cases) {
    it(`${question} -> ${ask}`, () => {
      assert.equal(askFor(question), ask);
    });
  }
});

/* ------------------------------------------------------------------ *
 * The questions beside them that must not move
 * ------------------------------------------------------------------ */

describe('questions the new asks must not steal', () => {
  const cases: [string, string][] = [
    ['How much is Black Lotus worth?', 'price'],
    ['Is Rhystic Study worth sixty dollars?', 'price'],
    ['Is Sol Ring legal in Modern?', 'legality'],
    ['Can I play Swords to Plowshares in Modern?', 'legality-in-format'],
    ['What cards are banned in commander?', 'legality'],
    ['whats a good 3 mana counterspell card', 'best-of'],
    ['Can I run two copies of Sol Ring in my commander deck?', 'copies'],
    ['What is this deck worth?', 'deck-value'],
    ['Rate this deck out of ten and tell me what is holding it back.', 'deck-rating'],
    ['Is my deck legal for commander?', 'deck-legal'],
    ['Is my mana base any good?', 'lands'],
    ['What cards should I cut from this deck and why?', 'upgrades'],
  ];

  for (const [question, ask] of cases) {
    it(`${question} -> ${ask}`, () => {
      assert.equal(askFor(question), ask);
    });
  }

  /**
   * `ban-reason` is gated on the question being about a ban, so every other
   * "why was" question falls through to whatever it fell through to before.
   */
  it('a why question that is not about a ban does not reach ban-reason', () => {
    assert.notEqual(askFor('Why was this card printed in that set?'), 'ban-reason');
  });
});

/* ------------------------------------------------------------------ *
 * Summoning sickness, asked without the word
 * ------------------------------------------------------------------ */

describe('a keyword asked about by describing it', () => {
  it('tapping for mana the turn it comes down is haste', () => {
    const found = keywordsNamedIn('Can a creature I just played tap for mana the same turn?');
    assert.equal(found[0]?.name, 'Haste');
  });

  it('summoning sickness is haste', () => {
    assert.equal(keywordsNamedIn('what is summoning sickness')[0]?.name, 'Haste');
  });

  /**
   * The nicknames are phrases rather than words on purpose. "The same turn" on
   * its own is in every question about casting two spells in a turn, and if it
   * meant haste those would all be answered with a keyword definition.
   */
  it('a bare mention of the same turn is not haste', () => {
    assert.deepEqual(keywordsNamedIn('Can I cast two spells in the same turn?'), []);
  });
});

/* ------------------------------------------------------------------ *
 * The card that overrides the singleton rule
 * ------------------------------------------------------------------ */

describe('a card that prints its own copy allowance', () => {
  /* Oracle text copied from our own rows, not typed from memory. */
  const RELENTLESS_RATS =
    'This creature gets +1/+1 for each other creature on the battlefield named Relentless Rats.\n' +
    'A deck can have any number of cards named Relentless Rats.';
  const NAZGUL =
    'Deathtouch\nWhen this creature enters, the Ring tempts you.\n' +
    'Whenever the Ring tempts you, put a +1/+1 counter on each Wraith you control.\n' +
    'A deck can have up to nine cards named Nazgûl.';
  const SOL_RING = '{T}: Add {C}{C}.';

  it('any number is read off Relentless Rats', () => {
    const found = printedCopyException(RELENTLESS_RATS);
    assert.equal(found?.allowance, 'any number of');
    assert.equal(found?.line, 'A deck can have any number of cards named Relentless Rats.');
  });

  it('a card with a limit keeps the limit in the words the card used', () => {
    assert.equal(printedCopyException(NAZGUL)?.allowance, 'up to nine');
  });

  it('an ordinary card has no exception', () => {
    assert.equal(printedCopyException(SOL_RING), null);
    assert.equal(printedCopyException(null), null);
    assert.equal(printedCopyException(''), null);
  });

  /**
   * The sentence has to be the one that grants copies. A card that merely says
   * the words "cards named" is not an exception, and reading one as an
   * exception would tell a player the singleton rule does not apply when it
   * does.
   */
  it('searching for cards named something is not an allowance', () => {
    assert.equal(
      printedCopyException(
        'When this creature enters, you may search your library for any number of cards named Battalion Foot Soldier, reveal them, put them into your hand, then shuffle.'
      ),
      null
    );
  });
});

/* ------------------------------------------------------------------ *
 * The two land facts that contradicted the card
 * ------------------------------------------------------------------ */

describe('what a swap line may claim about a land', () => {
  /* Oracle text copied from our own rows on 2026-08-30. */
  const PATH_OF_ANCESTRY =
    'This land enters tapped.\n' +
    "{T}: Add one mana of any color in your commander's color identity. When that mana is spent " +
    'to cast a creature spell that shares a creature type with your commander, scry 1. ' +
    '(Look at the top card of your library. You may put that card on the bottom.)';
  const WATERY_GRAVE =
    '({T}: Add {U} or {B}.)\nAs this land enters, you may pay 2 life. If you don\'t, it enters tapped.';
  const EXOTIC_ORCHARD =
    '{T}: Add one mana of any color that a land an opponent controls could produce.';
  const COMMAND_TOWER =
    "{T}: Add one mana of any color in your commander's color identity.";

  /**
   * The fault this fixes was on screen: "Cut Rogue's Passage, play Path of
   * Ancestry. Taps for BGUW, sometimes enters tapped." The card says "This land
   * enters tapped." with no condition at all, and the only "you may" on it is
   * inside the scry reminder.
   */
  it('a flat tapped clause is not softened by a you may inside a reminder', () => {
    assert.equal(tappedNote(PATH_OF_ANCESTRY), 'enters tapped');
  });

  it('a shockland is still reported as a shockland', () => {
    assert.equal(tappedNote(WATERY_GRAVE), 'enters untapped if you pay the life');
  });

  it('a land with no tapped clause enters untapped', () => {
    assert.equal(tappedNote(COMMAND_TOWER), 'enters untapped');
  });

  /**
   * The other one: "Cut Roadside Reliquary, play Exotic Orchard. Taps for BGUW,
   * enters untapped." Its colours are whatever an opponent's lands make, and
   * against three mono red opponents it makes {R} and casts nothing.
   */
  it('a land whose colours depend on somebody else says so', () => {
    const note = conditionNote(EXOTIC_ORCHARD);
    assert.ok(note && /somebody else/.test(note), String(note));
  });

  /**
   * And the line that decides this is a real rule rather than a blanket hedge.
   * Command Tower's condition IS the commander's colour identity, which is the
   * deck being asked about, so there is nothing to warn anybody about.
   */
  it('a land keyed to your own commander is not hedged', () => {
    assert.equal(conditionNote(COMMAND_TOWER), null);
  });
});

/* ------------------------------------------------------------------ *
 * Asking for a list in the plainest words there are
 *
 * Found by measurement, not by reading the table. Five list questions were put
 * through the deployed function on 2026-08-30 with the price cap and the count
 * stated in each. Three were answered from the catalogue with prices beside
 * every card. Two got the generic "I cannot answer that one":
 *
 *   Name ten green ramp cards for Commander, each under five dollars.
 *   List seven blue card draw spells.
 *
 * The job words were never the problem. `roleFrom` reads ramp and card draw
 * perfectly well and always did. `best-of` simply had no cue for NAME or LIST,
 * so `chooseAsk` returned nothing and the answer was a refusal about a subject
 * we hold thousands of rows on.
 * ------------------------------------------------------------------ */

describe('a list asked for in the plainest words', () => {
  it('routes the two questions the deployed function refused', () => {
    assert.equal(askFor('Name ten green ramp cards for Commander, each under five dollars.'), 'best-of');
    assert.equal(askFor('List seven blue card draw spells.'), 'best-of');
  });

  it('routes the other plain ways a player asks for a shortlist', () => {
    for (const q of [
      'find me some black removal',
      'which cards ramp in green',
      'options for board wipes in white',
      'ideas for card draw in blue',
      'help me find counterspells under a dollar',
      'name a few artifact tutors',
    ]) {
      assert.equal(askFor(q), 'best-of', q);
    }
  });

  /**
   * The other half, and the reason the loose cues are safe at all. `needs`
   * requires the question to name a job we can list, so a cue on its own
   * routes nowhere rather than to the nearest thing we recognised.
   */
  it('a cue with no job named still routes nowhere', () => {
    for (const q of [
      'name that card',
      'list my decks',
      'find my collection',
      'what is the name of this',
    ]) {
      assert.notEqual(askFor(q), 'best-of', q);
    }
  });

  /**
   * `explain` owns a card asked about by name, and "name" is now a cue. The
   * two must not collide, so the questions beside the new ones are asserted
   * the way every other pair in this file is.
   */
  it('does not steal a question about one card', () => {
    assert.notEqual(askFor('tell me about Sol Ring'), 'best-of');
    assert.notEqual(askFor('what does this card do'), 'best-of');
    assert.notEqual(askFor('is it any good'), 'best-of');
  });
});
