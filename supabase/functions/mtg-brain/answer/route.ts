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

import { COLOUR_WORDS, TAG_SYNONYMS } from './voice.ts';

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

export function readQuestion(raw: string): { question: string; card: CardInFocus | null } {
  const text = String(raw ?? '');
  const at = text.indexOf(CARD_BLOCK);
  if (at < 0) return { question: text.trim(), card: null };

  const question = text.slice(0, at).trim();
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

/* -------------------------------------------------------------------------- *
 * Step two: what is being asked
 * -------------------------------------------------------------------------- */

export type SubjectKind = 'card' | 'deck' | 'catalogue';

/**
 * Why an ask cannot be answered from what we hold. Every one of these was
 * measured, and the measurements are in `voice.ts` next to the words the player
 * reads.
 */
export type Gap = 'rules' | 'meta' | 'judgement';

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
    gap: 'meta',
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

  /* ---- the ones we can answer ---- */
  {
    id: 'legality',
    wants: 'Which formats a card may be played in.',
    subjects: ['card'],
    cues: ['legal in', 'legality', 'which formats', 'what formats', 'is it legal', 'is this legal', 'banned in', 'is it banned', 'restricted in'],
  },
  {
    id: 'combos',
    wants: 'What a card combos with, and what the combo produces.',
    subjects: ['card', 'deck'],
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
    subjects: ['card'],
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
      'consider cutting', 'weakest cards', 'improve my deck', 'make my deck better',
      'best cards for my deck', 'what should i add',
    ],
  },
  {
    id: 'best-of',
    wants: 'The most played cards doing one job, optionally in a colour or at a mana value.',
    subjects: ['deck', 'catalogue'],
    cues: [
      'best', 'good', 'top', 'show me', 'give me', 'recommend', 'suggest some', 'what are some',
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

/** "show me 5 best", "top 10". Capped so nobody gets a wall of a hundred cards. */
export function countFrom(question: string, fallback = 8): number {
  const text = normalise(question);
  const words = text.trim().split(' ');
  for (let i = 0; i < words.length - 1; i++) {
    const value = NUMBER_WORDS[words[i]] ?? (/^\d+$/.test(words[i]) ? Number(words[i]) : null);
    if (value == null) continue;
    const next = words[i + 1];
    // A number followed by a mana word is a cost, not a count.
    if (next === 'mana' || next === 'mv' || next === 'cmc' || next === 'drop') continue;
    if (value >= 1 && value <= 15) return value;
  }
  return fallback;
}
