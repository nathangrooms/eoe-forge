/**
 * Deciding what a question is asking, and whether we can answer it.
 *
 * WHY THIS IS A TABLE AND NOT A PILE OF PATTERNS
 * ---------------------------------------------
 * The old function decided things about a question with regular expressions
 * scattered through the request handler, and every one of them was wrong at
 * least once. The worst was a gate on whether to send the decklist at all:
 *
 *   /(card list|specific cards|which cards|card analysis|cut these|...)/i
 *
 * "Which lands can I upgrade?" does not contain "which cards", so the deck was
 * withheld and the answer said it did not know what was in the deck. Nobody
 * could see that from reading the handler, because the pattern was three
 * hundred lines from the sentence it broke.
 *
 * So routing is one decision, made in one place, in three steps a person can
 * follow and argue with:
 *
 *   1. READ. Pull the question out of the request, and the card the page
 *      attached to it. `Tutor.tsx` rides the card's catalogue data on the end of
 *      the message text, so the question has to be separated from it before
 *      anything reads the words.
 *
 *   2. WHAT IS BEING ASKED. `ASKS` below is an ordered list. Each entry says in
 *      one sentence what the player wants, which subjects it makes sense for,
 *      and the plain phrases that mean it. The first entry whose phrase appears
 *      in the question wins, so the list is ordered narrowest first: a question
 *      about rules interactions with a card must not be read as a general
 *      request to explain the card.
 *
 *   3. WHAT IT IS ABOUT. An ask names the subjects it can serve, in order of
 *      preference. The router picks the first one that is actually available.
 *      An ask that needs a card and has none does not guess, it says which
 *      thing is missing.
 *
 * Everything the router decided travels with the answer as `Routing`, gets
 * logged, and is returned on the response, so "why did it answer that" is a
 * thing you can read rather than reconstruct.
 */

import { COLOUR_WORDS, FORMATS } from './voice.ts';
import { TAG_SYNONYMS } from './vocabulary.ts';
import { keywordsNamedIn } from './glossary.ts';

/* -------------------------------------------------------------------------- *
 * Step one: read the request
 * -------------------------------------------------------------------------- */

export interface CardInFocus {
  name: string;
  setCode: string | null;
  collectorNumber: string | null;
}

/**
 * `Tutor.tsx` appends the card's catalogue data to the message rather than
 * sending it as its own field, because this function has only ever taken a deck
 * and a message. The block starts with a fixed line, so it can be lifted back
 * off cleanly.
 *
 * It matters that it comes off before anything reads the words. A card's rules
 * text is full of the phrases the table below is looking for, so leaving it
 * attached would let Rhystic Study's own text decide what the player asked.
 */
const CARD_BLOCK = 'CARD IN FOCUS.';

/**
 * Six other screens invoke this function, and none of them sends a question.
 *
 * They send a template with the player's words buried inside it. `BrainAnalysis`
 * writes a whole briefing and puts what the player typed after a heading;
 * `ScanInsightsHelper` and `AITemplateRecommendations` send numbered
 * instructions to a writer. Reading those as questions is how "Analyze my
 * deck's mana base and color sources" would be answered as one thing and
 * "Analyze these recently scanned cards" as another, both by accident.
 *
 * So a template is recognised and left alone, and where a template marks off
 * the player's own words those words are lifted out and used.
 */
const PLAYER_SAID = '**User Question**:';

/** Written for a writer, not asked by a player. */
const TEMPLATE_MARKS = [
  'you are deckmatrix', 'your tone', 'response style', 'provide:', 'finish with:',
  'end with:', 'referenced cards',
];

/**
 * A question this router should read at all.
 *
 * Length is the last check and the crudest. The longest prompt the Tutor page
 * offers is about 120 characters, and every caller template is several hundred,
 * so 400 sits well clear of both.
 */
export function looksLikeAPlayerAsking(question: string): boolean {
  const text = question.toLowerCase();
  if (TEMPLATE_MARKS.some(mark => text.includes(mark))) return false;
  const numbered = question.split('\n').filter(line => /^\s*\d+[.)]\s/.test(line)).length;
  if (numbered >= 2) return false;
  return question.length <= 400;
}

export function readQuestion(raw: string): { question: string; card: CardInFocus | null } {
  const text = String(raw ?? '');
  const at = text.indexOf(CARD_BLOCK);
  if (at < 0) return { question: playerPart(text), card: null };

  const question = playerPart(text.slice(0, at));
  const block = text.slice(at);

  const field = (label: string): string | null => {
    const line = block.split('\n').find(l => l.trim().toLowerCase().startsWith(`${label.toLowerCase()}:`));
    if (!line) return null;
    const value = line.slice(line.indexOf(':') + 1).trim();
    return value || null;
  };

  const name = field('Name');
  if (!name) return { question, card: null };

  // "Printing: MH3 #58 (rare)"
  const printing = field('Printing') ?? '';
  const match = printing.match(/^([A-Za-z0-9]+)\s+#(\S+)/);

  return {
    question,
    card: {
      name,
      setCode: match ? match[1].toLowerCase() : null,
      collectorNumber: match ? match[2] : null,
    },
  };
}

/** The player's own words, when a template marked them off from its own. */
function playerPart(text: string): string {
  const at = text.indexOf(PLAYER_SAID);
  return (at >= 0 ? text.slice(at + PLAYER_SAID.length) : text).trim();
}

/* -------------------------------------------------------------------------- *
 * Step two: what is being asked
 * -------------------------------------------------------------------------- */

export type SubjectKind = 'card' | 'deck' | 'catalogue';

/**
 * Why an ask cannot be answered from what we hold. Every one of these was
 * measured, and the measurements are in `voice.ts` next to the words the player
 * reads.
 */
export type Gap = 'rules' | 'meta' | 'commander-scope' | 'judgement';

export interface Ask {
  id: string;
  /** What the player wants, in one sentence. This is documentation, not copy. */
  wants: string;
  /** Subjects this ask can be answered about, best first. */
  subjects: SubjectKind[];
  /** Plain phrases that mean this ask. Matched as text, not as patterns. */
  cues: string[];
  /**
   * Set when we hold nothing that answers this. The answer is then a straight
   * refusal naming the gap, which is a correct answer and is counted as one.
   */
  gap?: Gap;
  /**
   * A second condition the question has to meet, and what it is in plain words.
   *
   * One ask needs this and it is worth the field. "best" and "good" are the
   * words people use to ask for a list, and they are also the words in "explain
   * this card and when it is good". Without the guard that sentence was read as
   * a request for a list, produced no list because it names no job, and the
   * whole question fell through unanswered. Measured on the real transcript.
   */
  needs?: { said: string; met: (question: string) => boolean };
}

/**
 * Narrowest first. The first entry whose phrase appears in the question wins,
 * so anything that would also match a broader entry has to be above it.
 */
export const ASKS: Ask[] = [
  /* ---- what a keyword means, ABOVE the rules refusal it used to fall into ----

     "We do not keep a rules reference" was being printed at players who asked
     what hexproof does, and hexproof's definition is printed on 43 cards in our
     own catalogue. Wizards puts the definition of a keyword on the card in
     brackets, and we hold every card: 208 keywords, on 5,734 cards, measured
     2026-08-29.

     TWO GATES, BOTH NEEDED. The phrases below are how anybody asks what a word
     means, and on their own they would swallow "What does Sol Ring do?". So
     `needs` requires the question to actually name a keyword, checked against
     the generated list in `keyword-names.ts`. A question with the shape and no
     keyword falls straight through to the asks below, exactly as before. ---- */
  {
    id: 'keyword',
    wants: 'What a keyword on a card means, in Wizards\' own printed words.',
    subjects: ['catalogue'],
    cues: [
      'what does', 'what do', 'what is', 'what are', 'how does', 'how do',
      'what happens when', 'mean', 'means', 'meaning', 'difference between',
      'explain', 'tell me about', 'rules for', 'how it works', 'work together',
      'works', 'define',
      /* Not a request for a definition, but the only thing we can honestly say
         about it starts with the definitions. "If my creature has deathtouch
         and trample, how much damage do I have to assign to the blocker?" is a
         combat rule we do not hold, and it names two keywords we do. The answer
         reads both out and says plainly that what happens when they meet is the
         part we cannot give. That is better than the stock paragraph, which
         mentions neither keyword. */
      'how much damage', 'if my creature', 'if a creature', 'if it has',
      /* "Does deathtouch work with trample?" and "If I block a creature that
         has first strike, does my creature die?" both routed nowhere. Both
         name two keywords we hold definitions for, and the honest answer reads
         both out and says the interaction is the part we do not have. Missing
         that is worse than the interaction being missing, because the player is
         told we know nothing when we know half. */
      'work with', 'works with', 'combine with', 'combined with',
      'interact', 'interacts', 'interaction with',
      'if i block', 'when i block', 'if i attack', 'when i attack',
      'blocked by', 'blocks a creature',
      /* A player asking about summoning sickness does not write the word haste
         and does not write the word rules either. "Can a creature I just played
         tap for mana the same turn?" is the shape, and the nickname table in
         `glossary.ts` is what turns that phrase into a keyword. Broad phrases
         are safe here only because `needs` below still requires the question to
         name a keyword: a question with this shape and no keyword in it falls
         through to the asks underneath exactly as before. */
      'can a creature', 'can my creature', 'can this creature',
      'the same turn', 'right away', 'do i have to wait',
    ],
    needs: {
      said: 'the question has to name a keyword a card prints a definition for',
      met: q => keywordsNamedIn(q).length > 0,
    },
  },

  /* ---- the three we cannot answer, above everything they would otherwise
     be mistaken for. A rules question about a card contains the card, and a
     question about the field contains the deck. ---- */
  {
    id: 'rules',
    wants: 'How a card or a rule works: timing, the stack, priority, what beats what.',
    subjects: ['card', 'deck', 'catalogue'],
    gap: 'rules',
    cues: [
      'rules interaction', 'rules interactions', 'misplay', 'misplays',
      'how does the stack', 'how the stack', 'the stack work', 'priority work',
      'combat damage', 'damage step', 'edge case', 'edge cases',
      'state based', 'layers work', 'does it still trigger', 'timing rules',
      'explain how the stack',
    ],
  },
  {
    id: 'meta',
    wants: 'What is winning right now, and how a deck sits against the field.',
    subjects: ['deck', 'catalogue', 'card'],
    gap: 'meta',
    cues: [
      'current meta', 'the meta', 'meta game', 'metagame', 'in the meta',
      'top strategies', 'top commanders', 'most popular commanders',
      'tier list', 'tournament', 'cedh field', 'current field',
      'perform in the current',
    ],
  },
  {
    id: 'which-commanders',
    wants: 'Which commanders and archetypes want a particular card.',
    subjects: ['card'],
    gap: 'commander-scope',
    cues: ['which commanders want', 'what commanders want', 'which commanders and', 'what commanders play', 'which decks want'],
  },
  {
    id: 'strictly-better',
    wants: 'Whether some other card beats this one on every axis.',
    subjects: ['card'],
    gap: 'judgement',
    cues: ['strictly better', 'strictly worse'],
  },
  {
    id: 'pilot',
    wants: 'How to play the deck: the game plan and the decision points.',
    subjects: ['deck'],
    gap: 'judgement',
    cues: ['how should i pilot', 'pilot this deck', 'game plan', 'how do i play this deck', 'decision points', 'how to pilot'],
  },
  {
    id: 'answer-it',
    wants: 'How to beat a card or a deck across the table.',
    subjects: ['card', 'deck'],
    gap: 'judgement',
    cues: ['answer it across the table', 'how do i answer it', 'how do i beat', 'deal with aggro', 'how do i stop', 'play against'],
  },

  /* ---- the deck the request already carried ----
     Every one of these was refused while the answer sat in the request body.
     They are above the card asks that share their words, because "worth" means
     one thing about a card and another about a deck, and the card ask would
     otherwise take the question and then ask the player to pick a card.

     Every cue in this group names the deck out loud. That is deliberate rather
     than tidy: these asks all need a deck, so a question that matched one
     without mentioning a deck would be answered with "attach a deck" instead of
     the card answer it used to get. "How strong is Sol Ring" must not become a
     request to attach a deck. ---- */
  {
    id: 'deck-rating',
    wants: 'How strong the attached deck is, as the score the deck page already computed.',
    subjects: ['deck'],
    cues: [
      'rate this deck', 'rate my deck', 'rate the deck', 'score my deck', 'score this deck',
      'how good is my deck', 'how good is this deck', 'how strong is my deck',
      'how strong is this deck', 'how powerful is my deck', 'how powerful is this deck',
      'power level of my deck', 'power level of this deck', 'deck out of ten',
      'what bracket is this', 'what bracket is my', 'bracket is this deck',
    ],
  },
  {
    id: 'deck-value',
    wants: 'What the attached deck costs to buy, as the value the deck page already computed.',
    subjects: ['deck'],
    cues: [
      'what is this deck worth', 'what is my deck worth', 'what this deck is worth',
      'how much is this deck worth', 'how much is my deck worth', 'this deck worth',
      'my deck worth', 'value of this deck', 'value of my deck', 'deck value',
      'how much does this deck cost', 'how much did this deck cost',
      'cost to build this deck', 'price of this deck', 'price of my deck',
      /* "How much would it cost me to buy every card in this deck?" is the same
         question and matched none of the above. A player asking what a deck
         costs is usually asking what buying it costs. Every one of these names
         the deck, because a cue on a deck-only ask that does not would answer
         a card question by telling the player to attach a deck. */
      'buy every card in this deck', 'buy every card in my deck',
      'buy all the cards in this deck', 'buy all the cards in my deck',
      'buy this whole deck', 'buy the whole deck', 'buy this deck', 'buy my deck',
    ],
  },

  /* ---- what of this deck the player does not own ----
     `economy.missing` and `economy.ownedPct` are both in the request body and
     the question got the stock paragraph. WHICH cards are missing is not in the
     body, so the answer gives the count and names the page that lists them
     rather than making a list up. ---- */
  {
    id: 'deck-missing',
    wants: 'How much of the attached deck the player does not own yet.',
    subjects: ['deck'],
    cues: [
      'missing for this deck', 'missing for my deck',
      'missing from this deck', 'missing from my deck',
      'still need for this deck', 'still need for my deck',
      'need to buy for this deck', 'need to buy for my deck',
      'of this deck do i own', 'of my deck do i own',
      'own of this deck', 'own of my deck',
      'this deck do i already own', 'my deck do i already own',
    ],
  },
  {
    id: 'deck-legal',
    wants: 'Whether the attached deck is a legal deck for its format.',
    subjects: ['deck'],
    cues: [
      'is my deck legal', 'is this deck legal', 'is the deck legal', 'deck legal for',
      'deck legality', 'my deck legal', 'this deck legal',
      /* NOT a bare 'legal for commander'. That phrase is in "Is Sol Ring legal
         for commander?", which is a card question with a good card answer, and
         this ask needs a deck, so it would have replied "attach a deck". Caught
         by the test that every cue here names the deck. */
      'legal commander deck', 'does my deck break',
      'anything illegal in this deck', 'anything illegal in my deck',
    ],
  },
  {
    id: 'copies',
    wants: 'How many copies of a card a format allows, and whether this deck may run it at all.',
    subjects: ['card', 'deck'],
    cues: [
      'two copies', 'three copies', 'four copies', 'more copies', 'multiple copies',
      'how many copies', 'second copy', 'add a second', 'another copy', 'extra copy',
      'run two', 'play two', 'run 2', 'play 2', 'run 4', 'play 4', '2 copies', '3 copies',
      '4 copies', 'singleton', 'one copy',
    ],
  },
  {
    id: 'does-it-fit',
    wants: 'Whether a card does the job the attached deck is built to do.',
    subjects: ['deck'],
    cues: [
      'fit my deck', 'fit in my deck', 'fits my deck', 'fit this deck', 'fits this deck',
      'good in my deck', 'good in this deck', 'right for my deck', 'right for this deck',
      'work in my deck', 'work in this deck', 'belong in my deck', 'belong in this deck',
      'slot in my deck', 'slot in this deck', 'go in my deck', 'go in this deck',
      'play this in my deck', 'add it to my deck', 'add this to my deck',
      'suit my deck', 'suits my deck', 'for my commander',
    ],
  },
  {
    id: 'can-i-cast',
    wants: 'How often the attached deck will have the mana for a card.',
    subjects: ['deck'],
    cues: [
      /* 'can i cast' rather than 'can i cast it', because the question a player
         actually types names the card: "Can I cast Cyclonic Rift in this deck?"
         matched neither of the longer forms and was answered as a request to
         explain the card. Measured on the repo's own router. */
      'can i cast', 'can my deck cast', 'will i be able to cast', 'able to cast',
      'hard to cast', 'hard for me to cast', 'castable', 'cast it on curve',
      'do i have the mana', 'will i have the mana', 'have the mana for',
      'enough sources for', 'can i pay for',
    ],
  },

  /* ---- which colours the attached deck is thin on ----
     The deck's own list says how many cards want each colour and how many
     lands make it. Both halves were in the request body and the question got
     the stock paragraph. Above `lands`, which owns the word colour screw, and
     above `best-of`, which owns "short on". ---- */
  {
    id: 'deck-colours',
    wants: 'Which of the deck\'s own colours it has too few sources for.',
    subjects: ['deck'],
    /* Every cue names the deck. A bare "short on colour" would fire on a
       question with no deck attached and answer it with "attach a deck", and
       the rule that stops that is checked by a test. */
    cues: [
      'which colours is this deck', 'which colors is this deck',
      'what colours is this deck', 'what colors is this deck',
      'which colours is my deck', 'which colors is my deck',
      'what colours is my deck', 'what colors is my deck',
      'this deck short on', 'my deck short on',
      'this deck short of', 'my deck short of',
      'colour balance of this deck', 'color balance of this deck',
      'colour balance of my deck', 'color balance of my deck',
      'colour sources in this deck', 'color sources in this deck',
      'colour sources in my deck', 'color sources in my deck',
      'is this deck colour screwed', 'is this deck color screwed',
      'colours does this deck', 'colors does this deck',
    ],
  },

  /* ---- how the deck wins ----
     A win condition is a judgement about a list, and tags do not make one: the
     Atraxa deck's tags say counters and proliferate, which is a theme. Saying
     so and naming the two things we CAN show beats the stock paragraph, which
     mentions neither. ---- */
  {
    id: 'win-condition',
    wants: 'How the attached deck actually wins, which is a judgement we do not hold.',
    subjects: ['deck'],
    /* No `gap`, deliberately, even though the answer is a refusal. The generic
       judgement paragraph would say "that is a table call" and stop, and this
       one names the two things near it that we CAN do. A refusal is still owed
       a next move. */
    /* The bare forms are kept and are declared exceptions to the rule that a
       deck-only cue names the deck. A win condition is a property of a deck and
       of nothing else, so "what is my win condition" cannot be stealing a card
       question: there is no card answer for it to steal. Same reasoning as the
       bracket cues on `deck-rating`, and the test names both. */
    cues: [
      'win condition', 'win conditions', 'wincon', 'wincons', 'win con',
      'how does this deck win', 'how does my deck win', 'how do i win with this deck',
      'how is this deck supposed to win',
    ],
  },

  /* ---- building a deck from nothing ----
     The Deck Generator does this, with a budget, and Tutor never named it. A
     hand-off to the thing that does the job is a better answer than a refusal
     that pretends the job cannot be done here. ---- */
  {
    id: 'build-a-deck',
    wants: 'Building a whole deck from scratch, which the Deck Generator does.',
    subjects: ['catalogue'],
    cues: [
      'build a commander deck', 'build a deck', 'build me a deck', 'how do i build',
      'build an edh deck', 'deck from scratch', 'start a new deck', 'starting a deck',
      'first commander deck', 'brew a deck', 'make a commander deck', 'make a deck',
    ],
  },

  /* ---- how many of a thing a deck in this format runs ----

     "How many lands should I run in a commander deck?" and "How much ramp does
     a commander deck need?" are two of the questions a Commander player asks
     most, and both got the paragraph Tutor prints when it has no route at all.
     We hold 192 complete 100-card Commander lists and every card in them. The
     median is 38 lands and 9 ramp cards, and it took one function to read.

     ABOVE `lands`, `price` and `best-of`, all of which own a word in these
     questions. "How many LANDS should I run" would otherwise be read as a
     request to grade the attached deck's own lands, and "How MUCH ramp" would
     be read by `price`, whose cue is "how much is".

     `needs` is what stops it swallowing them back. The question has to name a
     thing we can actually count, so "How much is Black Lotus worth?" names no
     shape, matches nothing here, and reaches `price` exactly as before. ---- */
  {
    id: 'deck-shape',
    wants: 'How many of one kind of card the lists we hold for a format run.',
    subjects: ['catalogue'],
    cues: [
      'how many', 'how much', 'should i run', 'should i play', 'should a deck',
      'does a deck need', 'do i need', 'should a commander deck', 'typical',
      'average number', 'usual number', 'the right number', 'how big should',
    ],
    needs: {
      said: 'the question has to name something we can count in a list, like lands or ramp',
      met: q => shapeAskedIn(q) !== null,
    },
  },

  /* ---- what colour identity actually counts ----

     "My commander is blue and white. Can I play a card that has a green mana
     symbol in its rules text?" is a rule, and it is a rule we can show rather
     than recite: `color_identity` is a column on every card and it already
     counts the symbols in the rules text. Talisman of Curiosity costs {2} and
     its identity is green and blue purely because of the {G} it prints.

     Above `legality-in-format`, whose cue "can i play" is in this question. ---- */
  {
    id: 'colour-identity',
    wants: 'Whether a mana symbol somewhere on a card counts towards colour identity.',
    subjects: ['catalogue'],
    cues: [
      'colour identity', 'color identity', 'mana symbol', 'mana symbols',
      'symbol in its rules text', 'symbol in the rules text',
      'symbol in its text', 'outside my commander', 'outside my colours',
      'outside my colors', 'in my commander s colours', 'in my commander s colors',
    ],
  },

  /* ---- why a card was banned ----
     We hold WHETHER a card is banned, on the card, and we hold nothing at all
     about why. Answering with a card page and never saying that is how q46
     printed "Commander plays it at rank 8,914" four lines above "Banned in
     Commander" and left the player to reconcile them. ---- */
  {
    id: 'ban-reason',
    wants: 'Why a card was banned, which we do not hold, said before its status is given.',
    subjects: ['card'],
    cues: ['why was', 'why is', 'why did', 'why are', 'reason for the ban', 'what got'],
    needs: {
      said: 'the question has to be about a ban',
      met: q => / ban/i.test(` ${q}`),
    },
  },

  /* ---- the ones we can answer ---- */
  /* "Can I play Swords to Plowshares in Modern?" is a legality question that
     says neither "legal" nor "banned", so it matched nothing and got the stock
     paragraph while `legalities->>'modern'` sat in the row. Every cue here is a
     way of asking permission, and `needs` requires the question to name the
     format it is asking permission for, because "can I play this" with no
     format named is a deck question and belongs to the asks above. */
  {
    id: 'legality-in-format',
    wants: 'Whether a card may be played in a format the question named.',
    subjects: ['card', 'catalogue'],
    cues: [
      'can i play', 'can i use', 'can you play', 'allowed in', 'ok to play',
      'play it in', 'use it in', 'play this in', 'playable in',
    ],
    needs: {
      said: 'the question has to name the format it is asking about',
      met: q => formatFrom(q) !== null,
    },
  },
  {
    id: 'legality',
    wants: 'Which formats a card may be played in.',
    /* `catalogue` so "what cards are banned in commander" has something to be
       about. It is 76 rows and one read. Without it the ask had no subject and
       the question got the stock refusal. `card` stays first, so a question
       that names a card still gets that card. */
    subjects: ['card', 'catalogue'],
    cues: ['legal in', 'legality', 'which formats', 'what formats', 'is it legal', 'is this legal', 'banned in', 'is it banned', 'restricted in', 'banned list', 'ban list'],
  },
  {
    id: 'combos',
    wants: 'What a card combos with, and what the combo produces.',
    /* `catalogue` last, so a named card still wins and an attached deck still
       gets the deck answer. It serves one question: the best two card combos in
       the format, which is 3,887 rows we hold and were refusing to look at. */
    subjects: ['card', 'deck', 'catalogue'],
    cues: [
      'combo', 'combos', 'combo with', 'infinite', 'what does it enable',
      'best way to abuse', 'abuse this', 'break this card', 'synergise', 'synergize',
      'synergies', 'synergy', 'cards that go with',
    ],
  },
  {
    id: 'alternatives',
    wants: 'Other cards that do the same job, cheaper or more played.',
    subjects: ['card'],
    cues: [
      'alternative', 'alternatives', 'similar job', 'similar card', 'similar cards',
      'instead of', 'cheaper version', 'budget version', 'budget option',
      'something like', 'cards like', 'swap it for', 'replace it with', 'straight upgrade',
    ],
  },
  {
    id: 'in-my-decks',
    wants: 'Whether the player already runs this card, and where.',
    subjects: ['card'],
    cues: ['do i play', 'am i playing', 'which of my decks', 'do i already', 'is it in my', 'do i own', 'in any of my decks'],
  },
  {
    id: 'price',
    wants: 'What a card costs to buy.',
    /* `catalogue` so a price question with no card is answered rather than
       dropped. It answers one thing outright, the most expensive cards we hold,
       and otherwise says where a price comes from and asks for a card. Card
       first, so nothing that names one changes. */
    subjects: ['card', 'catalogue'],
    cues: ['worth', 'how much is', 'how much does it cost to buy', 'price', 'expensive', 'cost to buy'],
  },
  {
    id: 'lands',
    wants: 'Which lands in a deck are weak, and what to play instead.',
    subjects: ['deck'],
    cues: ['land', 'lands', 'mana base', 'manabase', 'fixing', 'dual', 'duals', 'colour screw', 'color screw', 'enters tapped'],
  },
  {
    id: 'upgrades',
    wants: 'Which cards to add to a deck, and which to take out.',
    subjects: ['deck'],
    cues: [
      'upgrade', 'upgrades', 'what should i cut', 'what to cut', 'cutting from my deck',
      /* "What cards should I cut from this deck and why?" is one of the thirty
         prompts the Tutor page offers, and it matched none of the cues beside
         this line: it says "what CARDS should i cut", and the cue said "what
         should i cut". Found by asserting the questions that were supposed to
         already work. */
      'should i cut', 'cut from this deck', 'cut from my deck',
      'consider cutting', 'weakest cards', 'improve my deck', 'make my deck better',
      'best cards for my deck', 'what should i add',
      /* The owner asked "What card should I replace for more ramp" and got the
         generic refusal. Every cue above is a way of saying this and none of
         them is the way they said it. A player swapping a card says replace or
         swap at least as often as cut. */
      'replace', 'replacement', 'swap', 'swap out', 'take out', 'room for',
    ],
  },
  {
    id: 'best-of',
    wants: 'The most played cards doing one job, optionally in a colour or at a mana value.',
    subjects: ['deck', 'catalogue'],
    cues: [
      'best', 'good', 'top', 'show me', 'give me', 'recommend', 'suggest some', 'what are some',
      /* Asking for MORE of a job is the same question as asking which ones are
         good at it, and it is how a player phrases it while looking at their
         own list. Safe to add loosely because `needs` below still requires the
         question to name a job we can actually list, so a bare "more" routes
         nowhere. */
      'more', 'need more', 'not enough', 'short on', 'light on', 'thin on',
    ],
    needs: {
      said: 'the question has to name a job we can list, like counterspells or ramp',
      met: q => roleFrom(q) !== null,
    },
  },
  {
    id: 'staples',
    wants: 'The cards Commander plays most, by colour.',
    subjects: ['catalogue'],
    cues: ['staple', 'staples', 'must have', 'must-have', 'most played cards', 'most popular cards'],
  },
  {
    id: 'explain',
    wants: 'What a card is, what it does, what it costs and how much it is played.',
    subjects: ['card'],
    cues: [
      'explain', 'what does it do', 'what does this card do', 'in plain terms',
      'tell me about', 'what is this card', 'worth a slot', 'is it any good',
      'how good is', 'what is it for',
    ],
  },
];

export interface AskChoice {
  ask: Ask;
  /** The phrase that matched, so the decision can be read back. */
  cue: string | null;
}

/** Punctuation squashed to spaces so "counterspell?" matches "counterspell". */
export function normalise(question: string): string {
  return ` ${question.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

export function chooseAsk(question: string): AskChoice | null {
  const text = normalise(question);
  for (const ask of ASKS) {
    if (ask.needs && !ask.needs.met(question)) continue;
    for (const cue of ask.cues) {
      if (text.includes(` ${normalise(cue).trim()} `)) return { ask, cue };
    }
  }
  return null;
}

/**
 * Whether the question points at something the player believes is attached.
 *
 * "Explain this card" with nothing selected is worth answering with "pick one".
 * "Explain the main Commander archetypes" is not, and telling somebody to pick
 * a card when they did not ask about one reads as not having listened.
 */
const POINTERS = ['this card', 'this one', 'this deck', 'my deck', ' it ', 'the card'];

export function pointsAtSomething(question: string): boolean {
  const text = normalise(question);
  return POINTERS.some(p => text.includes(normalise(p).trim().length ? ` ${normalise(p).trim()} ` : p));
}

/* -------------------------------------------------------------------------- *
 * Step three: what it is about
 * -------------------------------------------------------------------------- */

export interface Available {
  card: boolean;
  deck: boolean;
  /** The catalogue is always there. Kept in the shape so the check reads the same. */
  catalogue: true;
}

export interface Routing {
  /** The question with the attached card data taken back off. */
  question: string;
  ask: string;
  /** What the ask means, copied off the table so a log line explains itself. */
  wants: string;
  cue: string | null;
  subject: SubjectKind | null;
  /** Set when the ask needs something the request did not carry. */
  missing: SubjectKind | null;
  gap: Gap | null;
}

export function chooseSubject(ask: Ask, have: Available): SubjectKind | null {
  for (const subject of ask.subjects) {
    if (subject === 'catalogue') return 'catalogue';
    if (subject === 'card' && have.card) return 'card';
    if (subject === 'deck' && have.deck) return 'deck';
  }
  return null;
}

/**
 * The whole decision, in the order above.
 *
 * Returns null when nothing in the table matched, which means we have no
 * opinion about what was asked. The caller then does not answer, rather than
 * answering the nearest thing it recognised.
 */
export function route(question: string, have: Available): Routing | null {
  const choice = chooseAsk(question);

  // Nothing matched, but a card is attached and a card is a whole subject on
  // its own. "Tezzeret the Seeker" with a card open is a request to be told
  // about it, and that is the one default worth having.
  const ask = choice?.ask ?? (have.card ? ASKS.find(a => a.id === 'explain')! : null);
  if (!ask) return null;

  const subject = chooseSubject(ask, have);
  return {
    question,
    ask: ask.id,
    wants: ask.wants,
    cue: choice?.cue ?? null,
    subject,
    missing: subject ? null : ask.subjects[0],
    gap: ask.gap ?? null,
  };
}

/* -------------------------------------------------------------------------- *
 * The details a question carries with it
 *
 * A role word, a colour, a mana value and a count. Each is read once, said out
 * loud in the answer, and never inferred beyond what the words support.
 * -------------------------------------------------------------------------- */

export interface RoleAsked {
  tag: string;
  /** How to say it back: "counterspells", "board wipes". */
  says: string;
  /** The exact words the player used. */
  words: string;
}

export function roleFrom(question: string): RoleAsked | null {
  const text = normalise(question);
  let best: RoleAsked | null = null;
  for (const entry of TAG_SYNONYMS) {
    for (const word of entry.words) {
      const padded = ` ${normalise(word).trim()} `;
      if (!text.includes(padded)) continue;
      // Longest match wins, so "board wipe" beats "removal" in "board wipe removal".
      if (!best || word.length > best.words.length) {
        best = { tag: entry.tag, says: entry.says, words: word };
      }
    }
  }
  return best;
}

/* -------------------------------------------------------------------------- *
 * A shape a list can be counted in
 *
 * `meta_deck_shape` counts three kinds of thing: lands, creatures, and anything
 * carrying a role tag. Lands and creatures are not askable roles, deliberately,
 * because the tagger treats them as type tags and `TAG_SYNONYMS` drops those.
 * So they are named here and everything else is read off the same synonym table
 * every other list question uses, which means a job Tutor can list is a job
 * Tutor can also count.
 * -------------------------------------------------------------------------- */

export interface ShapeAsked {
  /** What `meta_deck_shape` counts: 'land', 'creature' or 'tag'. */
  kind: 'land' | 'creature' | 'tag';
  /** The tag, when the kind is a tag. */
  tag: string | null;
  /** How to say it back: "lands", "ramp", "board wipes". */
  says: string;
}

const TYPE_SHAPES: { kind: 'land' | 'creature'; says: string; words: string[] }[] = [
  { kind: 'land', says: 'lands', words: ['land', 'lands'] },
  { kind: 'creature', says: 'creatures', words: ['creature', 'creatures'] },
];

export function shapeAskedIn(question: string): ShapeAsked | null {
  const text = normalise(question);
  for (const shape of TYPE_SHAPES) {
    if (shape.words.some(word => text.includes(` ${word} `))) {
      return { kind: shape.kind, tag: null, says: shape.says };
    }
  }
  const role = roleFrom(question);
  return role ? { kind: 'tag', tag: role.tag, says: role.says } : null;
}

/** Guild names are plain player words and mean a pair of colours. */
const GUILDS: Record<string, string[]> = {
  azorius: ['W', 'U'], dimir: ['U', 'B'], rakdos: ['B', 'R'], gruul: ['R', 'G'],
  selesnya: ['G', 'W'], orzhov: ['W', 'B'], izzet: ['U', 'R'], golgari: ['B', 'G'],
  boros: ['R', 'W'], simic: ['G', 'U'],
};

export function coloursFrom(question: string): string[] {
  const text = normalise(question);
  for (const [guild, letters] of Object.entries(GUILDS)) {
    if (text.includes(` ${guild} `)) return letters;
  }
  const out: string[] = [];
  for (const colour of COLOUR_WORDS) {
    for (const word of colour.words) {
      if (text.includes(` ${word} `) && !out.includes(colour.letter)) out.push(colour.letter);
    }
  }
  return out;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/**
 * "a good 3 mana counterspell" and "three mana counterspells" both mean the
 * same thing. A bare number with no mana word next to it is not a mana value,
 * it is usually how many cards they want, so the two are read separately.
 */
export function manaValueFrom(question: string): number | null {
  const text = normalise(question);
  const words = text.trim().split(' ');
  for (let i = 0; i < words.length - 1; i++) {
    const next = words[i + 1];
    if (next !== 'mana' && next !== 'mv' && next !== 'cmc' && next !== 'drop') continue;
    const value = NUMBER_WORDS[words[i]] ?? (/^\d+$/.test(words[i]) ? Number(words[i]) : null);
    if (value != null && value >= 0 && value <= 16) return value;
  }
  // "mana value 3", "cmc 3"
  const after = text.match(/ (?:mana value|mv|cmc) (\d+) /);
  if (after) {
    const value = Number(after[1]);
    if (value >= 0 && value <= 16) return value;
  }
  return null;
}

/**
 * How many copies the question asked about, or null when it did not say.
 *
 * Different from `countFrom`, which is how many cards to LIST and always
 * returns something. "How many copies of Arcane Signet can I play in commander"
 * names no number at all, and the answer to that is the format's rule rather
 * than a verdict on a count nobody asked about. So null is a real answer here
 * and the caller states the rule instead of judging a number it invented.
 */
export function copiesFrom(question: string): number | null {
  const text = normalise(question);
  const words = text.trim().split(' ');
  for (let i = 0; i < words.length; i++) {
    const value = NUMBER_WORDS[words[i]] ?? (/^\d+$/.test(words[i]) ? Number(words[i]) : null);
    if (value == null || value < 1 || value > 60) continue;
    /* Only when the number is actually counting copies. "two copies", "run two
       Islands", "play 4 of these". A bare number somewhere else in a sentence
       is not a copy count. */
    const after = words.slice(i + 1, i + 4).join(' ');
    const before = words.slice(Math.max(0, i - 2), i).join(' ');
    if (/^(copies|copy|of )/.test(after) || /\b(run|play|add|include)$/.test(before)) {
      return value;
    }
  }
  // "a second copy", "another copy" are both one more than whatever is there.
  if (/ (second|another|extra) (copy|one) /.test(text) || / add a second /.test(text)) return 2;
  return null;
}

/**
 * A format the question named, or null.
 *
 * Read off `FORMATS`, which is the same list every legality line is written
 * from, so a format Tutor can say is a format Tutor can be asked about. The
 * caller falls back to the attached deck's own format and says which one it
 * used, because "can I run two of these" has a different answer in Commander
 * and in Modern and guessing silently is how the wrong one gets believed.
 */
export function formatFrom(question: string): string | null {
  const text = normalise(question);
  for (const format of FORMATS) {
    if (text.includes(` ${format.key} `)) return format.key;
  }
  if (text.includes(' edh ') || text.includes(' commander deck ')) return 'commander';
  return null;
}

/* -------------------------------------------------------------------------- *
 * Money in a question
 *
 * "What is the best black removal spell under one dollar?" carried two separate
 * defects and they were the same number. The "one" was read as how many cards
 * to list, and the dollar was never read at all, so the answer was one card,
 * chosen with no price filter, and it cost $4.59. Both are below.
 * -------------------------------------------------------------------------- */

/** Words that mean the number beside them is money. */
const MONEY_WORDS = ['dollar', 'dollars', 'buck', 'bucks', 'usd', 'cent', 'cents'];

/** Words that mean the number after them is a ceiling. */
const LIMIT_WORDS = [
  'under', 'below', 'less than', 'up to', 'within', 'at most', 'no more than',
  'cheaper than', 'max', 'maximum', 'maximum of', 'or under',
];

const NUMBER_PATTERN = `(\\d+(?:\\.\\d+)?|${Object.keys(NUMBER_WORDS).join('|')}|a)`;

function amountFrom(word: string): number | null {
  if (word === 'a') return 1;
  const known = NUMBER_WORDS[word];
  if (known != null) return known;
  const n = Number(word);
  return Number.isFinite(n) ? n : null;
}

/**
 * The most a card may cost, in dollars, or null when the question set no limit.
 *
 * A DOLLAR SIGN OR A MONEY WORD IS REQUIRED, and that guard is the whole
 * difference between reading a budget and inventing one. "The best removal
 * under 3 mana" is a mana value with a limit word in front of it, and reading it
 * as three dollars would silently throw away most of the catalogue.
 *
 * Cents are read as cents. "under 50 cents" is half a dollar, not fifty.
 */
export function budgetFrom(question: string): number | null {
  const text = ` ${question.toLowerCase()} `;
  const money = `(${MONEY_WORDS.join('|')})`;

  for (const limit of LIMIT_WORDS) {
    // "under $2", "less than 5 dollars", "up to a dollar"
    const withMoney = new RegExp(`\\b${limit}\\s+\\$?\\s*${NUMBER_PATTERN}\\s*${money}?\\b`, 'i');
    const found = text.match(withMoney);
    if (!found) continue;
    const value = amountFrom(found[1]);
    if (value == null || value <= 0) continue;
    const unit = found[2];
    if (!unit && !new RegExp(`\\b${limit}\\s+\\$`, 'i').test(text)) continue;
    return unit === 'cent' || unit === 'cents' ? value / 100 : value;
  }

  // "$5 or less", "two dollars or less"
  const trailing = text.match(
    new RegExp(`\\$?\\s*${NUMBER_PATTERN}\\s*${money}?\\s+or\\s+(?:less|under|cheaper)\\b`, 'i')
  );
  if (trailing) {
    const value = amountFrom(trailing[1]);
    const unit = trailing[2];
    if (value != null && value > 0 && (unit || /\$\s*\d/.test(text))) {
      return unit === 'cent' || unit === 'cents' ? value / 100 : value;
    }
  }

  return null;
}

/** "show me 5 best", "top 10". Capped so nobody gets a wall of a hundred cards. */
export function countFrom(question: string, fallback = 8): number {
  const text = normalise(question);
  const words = text.trim().split(' ');
  const dollared = new Set(
    [...question.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)].map(m => m[1].split('.')[0])
  );
  for (let i = 0; i < words.length - 1; i++) {
    const value = NUMBER_WORDS[words[i]] ?? (/^\d+$/.test(words[i]) ? Number(words[i]) : null);
    if (value == null) continue;
    const next = words[i + 1];
    // A number followed by a mana word is a cost, not a count.
    if (next === 'mana' || next === 'mv' || next === 'cmc' || next === 'drop') continue;
    /* "TWO CARD COMBOS" IS NOT A REQUEST FOR TWO COMBOS. A number in front of
       the SINGULAR "card" is describing the thing, not counting it: nobody
       writes "show me 5 card", they write "show me 5 cards". So a singular
       card with a word after it is a modifier and the number belongs to it.
       Measured on "what are the best two card infinite combos in commander",
       which asked for eight and printed two. */
    if (next === 'card' && words[i + 2]) continue;
    /* A NUMBER THAT IS MONEY IS NOT A COUNT. "under one dollar" was read as a
       request for one card, so a budget question came back with a single card
       and no price filter. Three ways a number is money, and all three are
       checked: a money word after it, a limit word before it, or a dollar sign
       written against it. */
    if (MONEY_WORDS.includes(next)) continue;
    if (LIMIT_WORDS.some(limit => text.includes(` ${limit} ${words[i]} `))) continue;
    if (dollared.has(words[i])) continue;
    if (value >= 1 && value <= 15) return value;
  }
  return fallback;
}
