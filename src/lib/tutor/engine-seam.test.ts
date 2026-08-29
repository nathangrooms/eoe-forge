/**
 * Tutor reads the card the same way the optimiser does, and says so honestly.
 *
 *   node --test --experimental-strip-types src/lib/tutor/engine-seam.test.ts
 *
 * Three separate claims are made by the work these cover, and each fails in a
 * different way, so each is asserted separately:
 *
 *   1. THE ROUTING. Six asks were added and every one of them sits above an ask
 *      that shares its words. "What is this deck worth" contains "worth", which
 *      belonged to the card price ask, so before the order was fixed that
 *      question was answered by asking the player to pick a card. Ordering is
 *      the whole mechanism and nothing else checks it.
 *   2. WHAT IS SAYABLE ABOUT ONE CARD. `whatItDoes` hands a chosen subset of a
 *      card's facets to the engine's own phrasing. The subset is the load
 *      bearing decision: three prefixes produce phrases that are true of a pair
 *      of cards and false about one, and the reason each is excluded is written
 *      in `answer/behaviour.ts`. A prefix creeping back in would print a wrong
 *      fact under a card, which is the failure mode this whole answerer exists
 *      to avoid.
 *   3. THE COPY RULE. `deckLegality.ts` is mirrored in rather than reimplemented,
 *      and the eleven questions from `docs/design/TUTOR-FIFTY-QUESTIONS.md` are
 *      asserted here as cases so a change to the mirror or to the wrapper cannot
 *      quietly reintroduce an answer that reads as permission.
 *
 * These run with no network. The card rows below carry only the columns the
 * thing under test reads, and every value in them is copied from the catalogue
 * rather than invented.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ASKS,
  chooseAsk,
  copiesFrom,
  formatFrom,
  normalise,
} from '../../../supabase/functions/mtg-brain/answer/route.ts';
import {
  readRecord,
  thinReadingNote,
  whatItDoes,
  type RecordStanding,
} from '../../../supabase/functions/mtg-brain/answer/behaviour.ts';
import { copyVerdict } from '../../../supabase/functions/mtg-brain/answer/legality.ts';
import { looksWrong } from '../../../supabase/functions/mtg-brain/answer/voice.ts';

/* ------------------------------------------------------------------ *
 * 1. Routing
 * ------------------------------------------------------------------ */

describe('the asks the request body can now answer', () => {
  const added = ['deck-rating', 'deck-value', 'deck-legal', 'copies', 'does-it-fit', 'can-i-cast'];

  it('every one of them is in the table', () => {
    const ids = ASKS.map(a => a.id);
    for (const id of added) assert.ok(ids.includes(id), `${id} is not in ASKS`);
  });

  /**
   * The questions that were refused while the answer sat in the request, each
   * with the ask it has to reach. Every one is quoted from the review.
   */
  const mustRoute: [string, string][] = [
    ['Rate this deck out of ten', 'deck-rating'],
    ['What is this deck worth?', 'deck-value'],
    ['Is my deck legal for commander?', 'deck-legal'],
    ['Can I run two copies of Sol Ring in my commander deck?', 'copies'],
    ['Should I add a second Sol Ring to this deck?', 'copies'],
    ['Two copies of Sol Ring, is that allowed here?', 'copies'],
    ['I already run Rhystic Study. Should I run more copies of it for consistency?', 'copies'],
    ['How many copies of Arcane Signet can I play in commander?', 'copies'],
    ['Is running 4 copies of Lightning Bolt fine in my deck?', 'copies'],
    ['Can I run two Islands in my commander deck?', 'copies'],
    ['Sol Ring, can I run two?', 'copies'],
    ['Sol Ring, how many copies in commander?', 'copies'],
    ['Does Inexorable Tide fit my deck?', 'does-it-fit'],
    ['Is Craterhoof Behemoth good in my deck?', 'does-it-fit'],
    ['Can I cast Cyclonic Rift in this deck?', 'can-i-cast'],
  ];

  for (const [question, ask] of mustRoute) {
    it(`"${question}" reaches ${ask}`, () => {
      const choice = chooseAsk(question);
      assert.ok(choice, 'matched no ask at all');
      assert.equal(choice.ask.id, ask, `matched ${choice.ask.id} on the phrase "${choice.cue}"`);
    });
  }

  /**
   * The other half of an ordering change, and the half that is easy to forget.
   *
   * Every one of these already worked. A cue placed too loosely above the ask
   * that used to serve them would take the question and then answer it with a
   * request to attach a deck, which is worse than the answer it replaced.
   */
  const mustNotChange: [string, string][] = [
    ['Is Sol Ring legal in Modern?', 'legality'],
    ['How much is Black Lotus worth?', 'price'],
    ['Is Rhystic Study worth sixty dollars?', 'price'],
    ['What are the best three mana counterspells?', 'best-of'],
    ['Which lands can I upgrade?', 'lands'],
    ['What card should I replace to fit in a second Cyclonic Rift?', 'upgrades'],
    ['What cards should I cut from this deck and why?', 'upgrades'],
    ['How does the stack work?', 'rules'],
    ['How should I pilot this deck?', 'pilot'],
    ['Which commanders want this card?', 'which-commanders'],
  ];

  for (const [question, ask] of mustNotChange) {
    it(`"${question}" still reaches ${ask}`, () => {
      const choice = chooseAsk(question);
      assert.ok(choice, 'matched no ask at all');
      assert.equal(choice.ask.id, ask, `matched ${choice.ask.id} on the phrase "${choice.cue}"`);
    });
  }

  /**
   * The one question that must NOT become a request to attach a deck.
   *
   * Every cue on the six new asks names the deck out loud, and this is what
   * that rule is protecting. "How strong is Sol Ring" is a card question that
   * shares its words with "how strong is this deck".
   */
  it('a card question worded like a deck question still reaches the card', () => {
    const choice = chooseAsk('How strong is Sol Ring?');
    assert.equal(choice, null, `it matched ${choice?.ask.id} on "${choice?.cue}"`);
  });

  /**
   * A deck ask that could be triggered without a deck being mentioned is an ask
   * that will tell somebody to attach a deck when they asked about a card. The
   * rule is stated in `route.ts` next to the cues; this is the check.
   */
  it('every cue on a deck-only ask names the deck', () => {
    const deckOnly = ASKS.filter(a => a.subjects.length === 1 && a.subjects[0] === 'deck');
    const nameless: string[] = [];
    for (const ask of deckOnly) {
      for (const cue of ask.cues) {
        const text = normalise(cue);
        if (!/ (my|this|the) deck|deck /.test(text) && !/ my commander /.test(text)) {
          nameless.push(`${ask.id}: "${cue}"`);
        }
      }
    }
    /* THE RULE, AND THE ONE ASK IT DOES NOT APPLY TO.

       A deck-only ask that fires on a question with no deck in it answers
       "attach a deck", and when the question had a perfectly good card answer
       that is a downgrade. So a cue on such an ask has to name the deck.

       `can-i-cast` is exempt, and the reason is that there is no card answer to
       exempt it from: "can I cast Lightning Bolt" cannot be answered without
       knowing the mana it would be cast off, so asking for the deck is the
       correct reply rather than a downgrade. Its own property is checked below
       instead. `lands` and `upgrades` predate this rule and were measured into
       their current shape. */
    const held = new Set(['deck-rating', 'deck-value', 'deck-legal', 'does-it-fit']);

    /* TWO NAMED EXCEPTIONS, asserted as an exact list so a third cannot join
       them quietly. A bracket is a property of a deck and of nothing else, so
       "what bracket is this" cannot be stealing a card question: there is no
       card answer for it to steal. Everything else on these asks says "deck".

       This rule already earned its keep once. It caught a bare "legal for
       commander" on `deck-legal`, which sits inside "Is Sol Ring legal for
       commander?" and would have answered that card question by asking the
       player to attach a deck. */
    const allowed = ['deck-rating: "what bracket is this"', 'deck-rating: "what bracket is my"'];
    const offenders = nameless.filter(n => held.has(n.split(':')[0]) && !allowed.includes(n));
    assert.deepEqual(offenders, [], offenders.join('\n'));
    assert.deepEqual(
      nameless.filter(n => allowed.includes(n)).sort(),
      [...allowed].sort(),
      'a declared exception disappeared, so the declaration is now describing nothing'
    );
  });

  it('every cue on the casting ask is about mana or casting', () => {
    const ask = ASKS.find(a => a.id === 'can-i-cast');
    assert.ok(ask);
    const stray = ask.cues.filter(c => !/(cast|mana|sources|pay)/.test(normalise(c)));
    assert.deepEqual(stray, [], stray.join(', '));
  });

  /**
   * A phrase on two asks is decided by table order, and table order is not
   * something a reader of one entry can see. So a shared phrase has to be
   * declared, and the declaration has to say what makes the two unambiguous.
   *
   * TWO ARE DECLARED, both between `keyword` and `explain`, and what separates
   * them is not order: `keyword` carries a `needs` gate that requires the
   * question to actually name a keyword the catalogue prints a definition for.
   * "Explain hexproof" passes it and "Explain Cyclonic Rift" does not, so the
   * two asks never both want the same question. The assertion below checks that
   * the gate is really there rather than taking the comment's word for it.
   */
  const SHARED_PHRASES = ['explain: keyword and explain', 'tell me about: keyword and explain'];

  it('no phrase belongs to two asks, other than the declared pair', () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const ask of ASKS) {
      for (const cue of ask.cues) {
        const key = normalise(cue).trim();
        const already = owner.get(key);
        if (already && already !== ask.id) clashes.push(`${cue}: ${already} and ${ask.id}`);
        else owner.set(key, ask.id);
      }
    }
    assert.deepEqual(
      clashes.filter(c => !SHARED_PHRASES.includes(c)),
      [],
      clashes.join('\n')
    );
    assert.deepEqual(
      clashes.filter(c => SHARED_PHRASES.includes(c)).sort(),
      [...SHARED_PHRASES].sort(),
      'a declared shared phrase disappeared, so the declaration describes nothing'
    );
  });

  it('a shared phrase is only safe because one of the two asks is gated', () => {
    const keyword = ASKS.find(a => a.id === 'keyword');
    assert.ok(keyword?.needs, 'without the gate, "explain" on two asks IS ambiguous');
    assert.equal(keyword!.needs!.met('Explain Cyclonic Rift in plain terms'), false);
    assert.equal(keyword!.needs!.met('Explain hexproof'), true);
  });
});

describe('reading the details out of a copies question', () => {
  const cases: [string, number | null][] = [
    ['Can I run two copies of Sol Ring in my commander deck?', 2],
    ['Is running 4 copies of Lightning Bolt fine in my deck?', 4],
    ['Sol Ring, can I run two?', 2],
    ['Should I add a second Sol Ring to this deck?', 2],
    /* No number, and the answer to that is the rule rather than a verdict on a
       count nobody asked about. Null has to survive as null. */
    ['How many copies of Arcane Signet can I play in commander?', null],
    ['Sol Ring, how many copies in commander?', null],
  ];
  for (const [question, expected] of cases) {
    it(`"${question}" reads ${expected === null ? 'no count' : expected}`, () => {
      assert.equal(copiesFrom(question), expected);
    });
  }

  it('a format named in the question wins', () => {
    assert.equal(formatFrom('How many copies of Lightning Bolt can I run in modern?'), 'modern');
    assert.equal(formatFrom('Can I run two copies of Sol Ring in my commander deck?'), 'commander');
    assert.equal(formatFrom('Should I add a second Sol Ring to this deck?'), null);
  });
});

/* ------------------------------------------------------------------ *
 * 2. What is sayable about one card
 * ------------------------------------------------------------------ */

/**
 * Real rows, cut down to the columns the reader touches.
 *
 * Every value is copied from `cards_unique`. The three cards are chosen because
 * each one broke a different draft of the rule: Cyclonic Rift produced "about
 * lands" from a filter that names NONLAND permanents, Rhystic Study produced
 * "hits everything at once" about a card that hits nothing, and Smothering
 * Tithe said "makes tokens" and "makes treasure tokens" in one breath.
 */
const CYCLONIC_RIFT = {
  name: 'Cyclonic Rift',
  type_line: 'Instant',
  mana_cost: '{1}{U}',
  cmc: 2,
  oracle_text:
    "Return target nonland permanent you don't control to its owner's hand.\nOverload {6}{U} (You may cast this spell for its overload cost. If you do, change \"target\" in its text to \"each.\")",
};

const RHYSTIC_STUDY = {
  name: 'Rhystic Study',
  type_line: 'Enchantment',
  mana_cost: '{2}{U}',
  cmc: 3,
  oracle_text:
    'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
};

const SMOTHERING_TITHE = {
  name: 'Smothering Tithe',
  type_line: 'Enchantment',
  mana_cost: '{3}{W}',
  cmc: 4,
  oracle_text:
    'Whenever an opponent draws a card, that player may pay {2}. If the player doesn\'t, you create a Treasure token.',
};

const SOL_RING = {
  name: 'Sol Ring',
  type_line: 'Artifact',
  mana_cost: '{1}',
  cmc: 1,
  oracle_text: '{T}: Add {C}{C}.',
};

describe('what Tutor will say a card does', () => {
  it('never says a card is about lands because a filter excluded lands', async () => {
    const said = whatItDoes(await readRecord(CYCLONIC_RIFT));
    assert.ok(
      !said.some(p => p.includes('about lands')),
      `Cyclonic Rift is about everything that is NOT a land: ${said.join('; ')}`
    );
  });

  it('never says a card hits everything at once because its filter named everything', async () => {
    const said = whatItDoes(await readRecord(RHYSTIC_STUDY));
    assert.ok(
      !said.some(p => p.includes('everything at once')),
      `Rhystic Study hits nothing: ${said.join('; ')}`
    );
  });

  it('says the specific thing rather than the general one as well', async () => {
    const said = whatItDoes(await readRecord(SMOTHERING_TITHE));
    assert.ok(said.includes('makes treasure tokens'), said.join('; '));
    assert.ok(!said.includes('makes tokens'), `both were said: ${said.join('; ')}`);
  });

  it('leads with the verb rather than with the alphabet', async () => {
    const said = whatItDoes(await readRecord(SOL_RING));
    assert.equal(said[0], 'adds mana', said.join('; '));
    assert.ok(said.includes('costs nothing to use'), said.join('; '));
  });

  /**
   * Our own internal event names are not words a player uses.
   *
   * Smothering Tithe carries `trig:draws-card`, which the engine's phrasing
   * renders as "triggers on draws-card". That is an identifier with a hyphen in
   * it, and the copy rules say a product-invented word does not go in front of
   * a player.
   */
  it('never prints one of our own internal names', async () => {
    for (const card of [CYCLONIC_RIFT, RHYSTIC_STUDY, SMOTHERING_TITHE, SOL_RING]) {
      const said = whatItDoes(await readRecord(card));
      for (const phrase of said) {
        assert.ok(!/[a-z]-[a-z]/.test(phrase), `${card.name}: "${phrase}" reads as an identifier`);
        assert.deepEqual(looksWrong(phrase), [], `${card.name}: "${phrase}"`);
      }
    }
  });

  /**
   * Nothing sayable is a real answer, and the caller prints nothing at all.
   *
   * Doubling Season is read completely and produces two facets, `rec:full` and
   * `type:enchantment`, neither of which says anything about what it does that
   * is not already on the type line. An empty list here has to stay empty
   * rather than becoming an empty sentence.
   */
  it('returns nothing rather than an empty phrase', async () => {
    const doublingSeason = {
      name: 'Doubling Season',
      type_line: 'Enchantment',
      mana_cost: '{4}{G}',
      cmc: 5,
      oracle_text:
        'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.',
    };
    assert.deepEqual(whatItDoes(await readRecord(doublingSeason)), []);
  });
});

describe('saying that the reading is thin', () => {
  it('says nothing at all when every paragraph was read', () => {
    /* `rec:full` is the compiler reporting that it consumed the card, NOT that
       it was right. CLAUDE.md is explicit that the two must never be conflated,
       so there is no sentence here that could be read as "we understand this
       card completely". */
    assert.equal(thinReadingNote('full'), null);
  });

  const thin: RecordStanding[] = ['partial', 'none', 'unread'];
  for (const standing of thin) {
    it(`says something, once, for a ${standing} reading`, () => {
      const note = thinReadingNote(standing);
      assert.ok(note && note.length > 20, `nothing said for ${standing}`);
      assert.deepEqual(looksWrong(note), [], note);
    });
  }

  it('says a different thing for each, so two gaps do not read as one', () => {
    const notes = thin.map(s => thinReadingNote(s));
    assert.equal(new Set(notes).size, thin.length, notes.join(' | '));
  });
});

/* ------------------------------------------------------------------ *
 * 3. The copy rule
 * ------------------------------------------------------------------ */

/**
 * The legality fragments each case needs, copied from the catalogue.
 *
 * Only the formats a case asks about are here. A format left out is a format no
 * assertion below reads, and writing the whole map would be copying values
 * nothing checks.
 */
const SOL_RING_LEGALITIES = { commander: 'legal', vintage: 'restricted', legacy: 'banned' };
const LIGHTNING_BOLT_LEGALITIES = { commander: 'legal', modern: 'legal', legacy: 'legal' };
const ISLAND_LEGALITIES = { commander: 'legal', modern: 'legal' };

const ATRAXA_IDENTITY = ['W', 'U', 'B', 'G'];

describe('how many copies, answered by the validator that already existed', () => {
  it('a second Sol Ring in Commander is refused, and the rule is stated', () => {
    const v = copyVerdict({
      card: { name: 'Sol Ring', legalities: SOL_RING_LEGALITIES, colorIdentity: [] },
      copies: 2,
      format: 'commander',
      commanderIdentity: ATRAXA_IDENTITY,
    });
    assert.equal(v.allowed, 1);
    assert.ok(v.rule && /one copy/i.test(v.rule), v.rule ?? 'no rule');
    assert.ok(v.faults.some(f => f.fault === 'copy-limit'), JSON.stringify(v.faults));
  });

  /**
   * The exact sentence the review found reading as permission.
   *
   * "Legal in Commander and Vintage (one copy only)" attaches Vintage's
   * restriction to the end of a joined list, where it reads as a qualifier on
   * the whole thing. Asked about Commander, this path must not consult Vintage
   * at all.
   */
  it('does not let another format\'s restriction answer for Commander', () => {
    const v = copyVerdict({
      card: { name: 'Sol Ring', legalities: SOL_RING_LEGALITIES, colorIdentity: [] },
      copies: null,
      format: 'commander',
      commanderIdentity: ATRAXA_IDENTITY,
    });
    assert.equal(v.formatLabel, 'Commander');
    assert.deepEqual(v.faults, []);
    assert.equal(v.allowed, 1);
  });

  it('reports Vintage as one copy when Vintage is what was asked about', () => {
    const v = copyVerdict({
      card: { name: 'Sol Ring', legalities: SOL_RING_LEGALITIES, colorIdentity: [] },
      copies: 2,
      format: 'vintage',
      commanderIdentity: null,
    });
    assert.equal(v.allowed, 1);
    assert.ok(v.faults.some(f => f.fault === 'restricted'), JSON.stringify(v.faults));
  });

  /**
   * The case an answer reporting one fault per card gets wrong.
   *
   * Four copies of Lightning Bolt in a WUBG deck is two separate problems, and
   * the count fault outranks the colour fault, so a single call reports only
   * the count. A player who fixes the count still cannot play the card.
   */
  it('says both that the format is singleton and that the colour is wrong', () => {
    const v = copyVerdict({
      card: { name: 'Lightning Bolt', legalities: LIGHTNING_BOLT_LEGALITIES, colorIdentity: ['R'] },
      copies: 4,
      format: 'commander',
      commanderIdentity: ATRAXA_IDENTITY,
    });
    const kinds = v.faults.map(f => f.fault).sort();
    assert.deepEqual(kinds, ['colour-identity', 'copy-limit'], JSON.stringify(v.faults));
  });

  /** The one copies question whose answer is yes. */
  it('two Islands in Commander is allowed, because basics are the exception', () => {
    const v = copyVerdict({
      card: { name: 'Island', legalities: ISLAND_LEGALITIES, colorIdentity: [] },
      copies: 2,
      format: 'commander',
      commanderIdentity: ATRAXA_IDENTITY,
    });
    assert.equal(v.basicLandExempt, true);
    assert.deepEqual(v.faults, []);
  });

  it('four Lightning Bolt in Modern is allowed, and the cap is four', () => {
    const v = copyVerdict({
      card: { name: 'Lightning Bolt', legalities: LIGHTNING_BOLT_LEGALITIES, colorIdentity: ['R'] },
      copies: 4,
      format: 'modern',
      commanderIdentity: null,
    });
    assert.deepEqual(v.faults, []);
    assert.equal(v.allowed, 4);
  });

  /**
   * With no deck attached there is no commander, and colour identity is a rule
   * about a commander. Asking about Lightning Bolt on its own must not produce
   * a colour fault against nothing.
   */
  it('says nothing about colour when there is no deck to say it about', () => {
    const v = copyVerdict({
      card: { name: 'Lightning Bolt', legalities: LIGHTNING_BOLT_LEGALITIES, colorIdentity: ['R'] },
      copies: 1,
      format: 'commander',
      commanderIdentity: null,
    });
    assert.deepEqual(v.faults, []);
  });

  it('every line it hands to an answer passes the copy rules', () => {
    const v = copyVerdict({
      card: { name: 'Lightning Bolt', legalities: LIGHTNING_BOLT_LEGALITIES, colorIdentity: ['R'] },
      copies: 4,
      format: 'commander',
      commanderIdentity: ATRAXA_IDENTITY,
    });
    for (const f of v.faults) assert.deepEqual(looksWrong(f.detail), [], f.detail);
    if (v.rule) assert.deepEqual(looksWrong(v.rule), [], v.rule);
  });
});
