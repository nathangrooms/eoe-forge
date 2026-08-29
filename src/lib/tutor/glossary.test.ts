/**
 * The keyword glossary, and the two ways it could print a wrong rule.
 *
 *   node --test --experimental-strip-types src/lib/tutor/glossary.test.ts
 *
 * Tutor now answers "what does hexproof mean" out of the reminder text Wizards
 * prints on the card. That is the first time this function has answered a rules
 * question at all, and a rule is the one kind of answer a player carries to a
 * table and acts on. So the two failure modes are worth naming:
 *
 *   1. READING THE WRONG LINE. "Flying, first strike (This creature deals
 *      combat damage before creatures without first strike.)" is one line with
 *      two keywords and one reminder, and the reminder belongs to the second.
 *      A parser that looked for the keyword anywhere on the line would hand
 *      first strike's definition to flying.
 *
 *   2. ANSWERING THE WRONG QUESTION. The routing gate is a phrase like "what
 *      does" plus a keyword name, and a lot of keyword names are ordinary
 *      English words: Flash, Fear, Reach, Storm, Support, Champion. "What is
 *      the best black removal spell under one dollar?" must not be read as a
 *      question about a keyword.
 *
 * Everything here is pure. The definitions themselves come off the catalogue at
 * request time and are checked by `scripts/tutor-keyword-probe.ts`, which reads
 * each one back off the card it claims to have come from.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  KEYWORD_NAMES,
  asksHowTheyMeet,
  keywordsNamedIn,
  reminderIn,
} from '../../../supabase/functions/mtg-brain/answer/glossary.ts';
import { ASKS, budgetFrom, countFrom, manaValueFrom } from '../../../supabase/functions/mtg-brain/answer/route.ts';
import { NO_RULES_CORPUS, looksWrong } from '../../../supabase/functions/mtg-brain/answer/voice.ts';
import { looksLikeAComparison, nothingToAnswerWith } from '../../../supabase/functions/mtg-brain/answer/index.ts';

/* -------------------------------------------------------------------------- *
 * The generated list
 * -------------------------------------------------------------------------- */

describe('the keyword list', () => {
  it('holds names and no definitions', () => {
    assert.ok(KEYWORD_NAMES.length > 100, `only ${KEYWORD_NAMES.length} keywords`);
    /* A definition is a sentence. A name is not. If a definition ever gets
       written into the generated file, this is what says so, because the whole
       design is that the words a player reads come off a card. */
    const sentences = KEYWORD_NAMES.filter(n => n.length > 40 || n.includes('.'));
    assert.deepEqual(sentences, [], 'these read like definitions, not names');
  });

  it('has no duplicates and nothing empty', () => {
    assert.equal(new Set(KEYWORD_NAMES).size, KEYWORD_NAMES.length);
    assert.deepEqual(KEYWORD_NAMES.filter(n => !n.trim()), []);
  });

  it('holds the keywords the fifty questions ask about', () => {
    for (const keyword of ['Hexproof', 'Shroud', 'Overload', 'Haste', 'Deathtouch', 'Trample', 'First strike']) {
      assert.ok(KEYWORD_NAMES.includes(keyword), `${keyword} is missing`);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Reading the reminder off a card
 * -------------------------------------------------------------------------- */

describe('a reminder is read off the line it belongs to', () => {
  it('reads a plain reminder', () => {
    const found = reminderIn(
      'Flying (This creature can\'t be blocked except by creatures with flying or reach.)',
      'Flying'
    );
    assert.equal(found?.definition, "This creature can't be blocked except by creatures with flying or reach.");
    assert.equal(found?.between, '');
  });

  /**
   * The case the strictness exists for, and it is a real line off a real card.
   * Flying opens this line and the bracket after it is first strike's.
   */
  it('does not hand one keyword the next keyword\'s definition', () => {
    const line = 'Flying, first strike (This creature deals combat damage before creatures without first strike.)';
    assert.equal(reminderIn(line, 'First strike'), null, 'first strike does not open the line');
    assert.equal(reminderIn(line, 'Flying'), null, 'the bracket belongs to first strike');
  });

  /**
   * The short version of the same line, and the one the line anchor alone does
   * NOT catch. ", haste " fits inside the window a cost is allowed to occupy,
   * so without the comma rule flying would be told it can attack the turn it
   * arrives.
   */
  it('does not take a short keyword list for a cost', () => {
    const line = 'Flying, haste (This creature can attack and {T} as soon as it comes under your control.)';
    assert.equal(reminderIn(line, 'Flying'), null);
    assert.equal(
      reminderIn(line, 'Haste'),
      null,
      'haste does not open the line either, so this card teaches us nothing about haste'
    );
  });

  it('reads a reminder that sits behind a cost', () => {
    const found = reminderIn(
      'Overload {1}{R} (You may cast this spell for its overload cost. If you do, change "target" in its text to "each.")',
      'Overload'
    );
    assert.ok(found, 'overload carries a cost and was the case that broke the first version');
    assert.equal(found!.between, '{1}{R}');
    assert.ok(found!.definition.startsWith('You may cast this spell'));
  });

  it('finds a reminder on any line, not only the first', () => {
    const text = 'Whenever this creature attacks, draw a card.\nWard {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)';
    const found = reminderIn(text, 'Ward');
    assert.equal(found?.between, '{2}');
  });

  it('ignores a bracket that is not a reminder', () => {
    assert.equal(reminderIn('Destroy target creature. (It cannot be regenerated.)', 'Flying'), null);
  });

  it('will not take a scrap of text as a definition', () => {
    assert.equal(reminderIn('Flying (see below)', 'Flying'), null, 'too short to be a definition');
  });
});

/* -------------------------------------------------------------------------- *
 * Finding a keyword in a sentence
 * -------------------------------------------------------------------------- */

describe('a keyword is found only when it was actually asked about', () => {
  it('finds one', () => {
    assert.deepEqual(keywordsNamedIn('What does overload mean?').map(k => k.name), ['Overload']);
  });

  it('finds two, longest name first', () => {
    const found = keywordsNamedIn('What does hexproof do and how is it different from shroud?');
    assert.deepEqual(found.map(k => k.name), ['Hexproof', 'Shroud']);
  });

  it('prefers the longer name over the one inside it', () => {
    const found = keywordsNamedIn('How do first strike and deathtouch work together?');
    assert.ok(found.some(k => k.name === 'First strike'));
    assert.ok(found.some(k => k.name === 'Deathtouch'));
  });

  it('knows what a player calls summoning sickness', () => {
    assert.deepEqual(keywordsNamedIn('what is summoning sickness').map(k => k.name), ['Haste']);
  });

  /**
   * The list carries names that are ordinary English words, so this is the
   * assertion that stops the whole ask from firing on questions about
   * something else. Every one of these is from the fifty.
   */
  it('does not fire on a question that is about something else', () => {
    const notAboutAKeyword = [
      'What is the best black removal spell under one dollar?',
      'How many lands should I run in a commander deck?',
      'What are the best two card infinite combos in commander?',
      'How do I build a commander deck for under fifty dollars?',
      'What does Sol Ring do?',
      'What does Doubling Season do with planeswalkers?',
      'Explain Cyclonic Rift in plain terms and when it is good.',
      'What cards are banned in commander?',
      'How much is Black Lotus worth?',
      'Which lands can I upgrade?',
      'What are the best ramp cards for my deck?',
      'Is Cultivate or Rampant Growth better in commander?',
      'What is my win condition in this deck?',
      'How much commander damage kills a player?',
      'What is the difference between exile and destroy?',
      'How does the stack work in Magic?',
      'Do I lose the game as soon as my library is empty?',
      'Rate this deck out of ten',
      'What is this deck worth?',
      'Is my deck legal for commander?',
    ];
    for (const question of notAboutAKeyword) {
      assert.deepEqual(
        keywordsNamedIn(question).map(k => k.name),
        [],
        `read as a keyword question: ${question}`
      );
    }
  });

  it('tells a definition question from an interaction question', () => {
    assert.equal(asksHowTheyMeet('What does hexproof do and how is it different from shroud?'), false);
    assert.equal(asksHowTheyMeet('How do first strike and deathtouch work together?'), true);
    assert.equal(
      asksHowTheyMeet('If my creature has deathtouch and trample, how much damage do I have to assign to the blocker?'),
      true
    );
  });
});

/* -------------------------------------------------------------------------- *
 * Where the ask sits
 * -------------------------------------------------------------------------- */

describe('the keyword ask is placed so it cannot steal a card question', () => {
  it('sits above the rules refusal it used to fall into', () => {
    const ids = ASKS.map(a => a.id);
    assert.ok(ids.indexOf('keyword') >= 0, 'there is a keyword ask');
    assert.ok(
      ids.indexOf('keyword') < ids.indexOf('rules'),
      'a keyword question must be answered rather than refused as a rules question'
    );
  });

  it('is gated on the question naming a keyword', () => {
    const ask = ASKS.find(a => a.id === 'keyword')!;
    assert.ok(ask.needs, 'without the gate, "what does" would swallow every card question');
    assert.equal(ask.needs!.met('What does Sol Ring do?'), false);
    assert.equal(ask.needs!.met('What does hexproof mean?'), true);
  });

  it('every ask id is written once', () => {
    const ids = ASKS.map(a => a.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

/* -------------------------------------------------------------------------- *
 * Money in a question
 * -------------------------------------------------------------------------- */

describe('a number that is money is not a count', () => {
  /**
   * The measured fault: "the best black removal spell under one dollar" listed
   * ONE card, chosen with no price filter, and it cost $4.59.
   */
  it('reads a budget written in words', () => {
    assert.equal(budgetFrom('What is the best black removal spell under one dollar?'), 1);
    assert.equal(countFrom('What is the best black removal spell under one dollar?', 8), 8);
  });

  it('reads a budget written with a sign', () => {
    assert.equal(budgetFrom('best white removal under $2'), 2);
    assert.equal(budgetFrom('best counterspells less than $10'), 10);
  });

  it('reads cents as cents', () => {
    assert.equal(budgetFrom('best ramp under 50 cents'), 0.5);
  });

  it('reads a limit written after the number', () => {
    assert.equal(budgetFrom('best black removal, 2 dollars or less'), 2);
  });

  /**
   * The guard that keeps a mana value from being read as money. Without it,
   * "under 3 mana" would set a three dollar ceiling and quietly drop most of
   * the catalogue.
   */
  it('does not read a mana value as money', () => {
    assert.equal(budgetFrom('what are the best removal spells under 3 mana'), null);
    assert.equal(manaValueFrom('what are the best 3 mana counterspells'), 3);
    assert.equal(budgetFrom('what are the best 3 mana counterspells'), null);
  });

  it('keeps a real count when a budget is also given', () => {
    assert.equal(countFrom('show me the top 10 black removal spells under 5 dollars', 8), 10);
    assert.equal(budgetFrom('show me the top 10 black removal spells under 5 dollars'), 5);
  });

  it('still reads a plain count', () => {
    assert.equal(countFrom('show me 5 counterspells', 8), 5);
    assert.equal(countFrom('best counterspells', 8), 8);
  });

  /**
   * "Two card infinite combos" asked for eight and printed two, because the
   * two belonged to "card" and not to the list.
   */
  it('does not read a number in front of a singular noun as a count', () => {
    assert.equal(countFrom('What are the best two card infinite combos in commander?', 8), 8);
    assert.equal(countFrom('give me 5 cards', 8), 5, 'the plural is still a count');
  });
});

/* -------------------------------------------------------------------------- *
 * Two cards
 * -------------------------------------------------------------------------- */

describe('a question comparing two cards is recognised', () => {
  it('recognises the ways a player writes it', () => {
    for (const question of [
      'Swords to Plowshares or Path to Exile, which is better?',
      'Is Cultivate or Rampant Growth better in commander?',
      'Sol Ring vs Arcane Signet',
      'Counterspell versus Negate',
      'Should I play Cultivate instead of Kodama\'s Reach?',
    ]) {
      assert.equal(looksLikeAComparison(question), true, question);
    }
  });

  it('does not read a plain question as a comparison', () => {
    for (const question of [
      'What does Sol Ring do?',
      'Is Rhystic Study worth sixty dollars?',
      'Which lands can I upgrade?',
    ]) {
      assert.equal(looksLikeAComparison(question), false, question);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The claim that was wider than the truth
 * -------------------------------------------------------------------------- */

describe('the rules gap is described at the size it is', () => {
  /**
   * The old sentence said we keep no copy of the rules, full stop, and it was
   * printed at players asking what hexproof does while hexproof's definition
   * sat in our catalogue on 43 cards.
   */
  it('no longer claims we hold no rules reference at all', () => {
    assert.ok(
      !/we do not keep a copy of the rules|no rules reference/i.test(NO_RULES_CORPUS),
      'that claim is broader than the truth'
    );
  });

  it('names what it IS true about', () => {
    for (const word of ['timing', 'stack', 'priority']) {
      assert.ok(NO_RULES_CORPUS.toLowerCase().includes(word), `does not name ${word}`);
    }
  });

  it('says the keyword glossary is there, with the count off the list itself', () => {
    assert.ok(NO_RULES_CORPUS.includes(String(KEYWORD_NAMES.length)), 'the count is written by hand somewhere');
    assert.ok(/keyword/i.test(NO_RULES_CORPUS));
  });

  it('the stock paragraph offers the keyword glossary too', () => {
    const stock = nothingToAnswerWith({ card: false, deck: false });
    assert.ok(/keyword/i.test(stock), 'a player told no is owed the next move');
    assert.ok(
      !/i do not hold is a rules reference/i.test(stock),
      'the narrowed claim has to be narrowed in both places'
    );
  });

  it('every one of these passes the copy rules', () => {
    for (const text of [NO_RULES_CORPUS, nothingToAnswerWith({ card: false, deck: true })]) {
      assert.deepEqual(looksWrong(text), [], text.slice(0, 80));
    }
  });
});
