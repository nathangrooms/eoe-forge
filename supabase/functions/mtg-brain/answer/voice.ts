/**
 * How Tutor writes when Tutor is the one writing.
 *
 * Everything in `answer/` produces sentences directly instead of asking a
 * language model for them, so the copy rules stop being instructions in a
 * prompt and become code. They are in CLAUDE.md and they are not preferences:
 *
 *   - No em dash. A sentence that wants one wants to be two sentences.
 *   - No product vocabulary. Not "engine", "pipeline", "canonical", "taxonomy".
 *   - Never the words a Magic player does not want to read from a Magic app.
 *     The ban list is in CLAUDE.md 10a and `BANNED_WORDS` below is the same list
 *     written down so a test can check the output rather than trusting the
 *     author.
 *   - A missing price is null and is never printed as a zero.
 *
 * The voice is a knowledgeable player answering at the next table. Short words,
 * the answer first, and no ceremony about what is coming.
 */

import { KEYWORD_NAMES } from './glossary.ts';

/* -------------------------------------------------------------------------- *
 * Money
 *
 * `readAmount` and `formatAmount` are the same two functions as
 * `src/lib/pricing`, with the same rule: absence is null and null is never
 * rendered as $0.00. They are copied rather than imported because an edge
 * function cannot reach into `src/`, and the copy is deliberately tiny so the
 * two cannot drift in a way that matters. If they ever do, `src` is right.
 *
 * The reason the rule exists, from CLAUDE.md: the marketplace once showed a
 * card with no dollar quote and a 2,199.95 euro one as "$0.00". The smallest
 * real price in this database is 0.01, so a printed zero is always invented.
 * -------------------------------------------------------------------------- */

export function readAmount(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

const MONEY = {
  USD: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
  EUR: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
} as const;

export function formatAmount(amount: number | null, currency: 'USD' | 'EUR' = 'USD'): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  return MONEY[currency].format(amount);
}

/**
 * One card's price, in the words a player uses, or null when we hold none.
 *
 * Never returns a sentence containing a zero, and never says "free".
 */
export function priceLine(prices: Record<string, unknown> | null | undefined): string | null {
  const usd = formatAmount(readAmount(prices?.usd), 'USD');
  const eur = formatAmount(readAmount(prices?.eur), 'EUR');
  if (usd && eur) return `${usd}, or ${eur} in euros`;
  if (usd) return usd;
  if (eur) return `${eur} in euros`;
  return null;
}

/** Short form for a list row: "$3.22", or a plain statement of absence. */
export function priceTag(prices: Record<string, unknown> | null | undefined): string {
  return formatAmount(readAmount(prices?.usd), 'USD') ?? 'no price on file';
}

/* -------------------------------------------------------------------------- *
 * Numbers and lists
 * -------------------------------------------------------------------------- */

export const thousands = (n: number): string => n.toLocaleString('en-US');

/** "a, b and c". Never an Oxford comma, never a dash. */
export function joinWords(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * How much Commander plays a card, said honestly.
 *
 * `edhrec_rank` is a rank, so 1 is the most played card there is. Printing the
 * bare number invites it to be read as a score out of something. The denominator
 * is stated every time because CLAUDE.md requires it: two agents have already
 * been misled by a coverage figure quoted without one.
 */
export function popularityLine(rank: number | null, rankedTotal: number): string | null {
  if (rank == null) return null;
  return `Commander players rank it ${thousands(rank)} out of the ${thousands(rankedTotal)} cards we hold a popularity number for. Lower means more decks play it.`;
}

/* -------------------------------------------------------------------------- *
 * Tags
 *
 * There used to be four tables here saying what a tag name means: which ones
 * only restate the type line, the plain words for each one, which ones say the
 * same thing less precisely, and the phrases a player asks for one with. All of
 * it was written by hand beside an engine that already declares every tag name
 * and every alias.
 *
 * They live in `vocabulary.ts` now and take their names from the engine. This
 * file keeps what it is for: how a sentence is written, and the rules the
 * output is checked against on the way out.
 * -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- *
 * Colours and formats
 * -------------------------------------------------------------------------- */

export const COLOUR_WORDS: { letter: string; says: string; words: string[] }[] = [
  { letter: 'W', says: 'white', words: ['white'] },
  { letter: 'U', says: 'blue', words: ['blue'] },
  { letter: 'B', says: 'black', words: ['black'] },
  { letter: 'R', says: 'red', words: ['red'] },
  { letter: 'G', says: 'green', words: ['green'] },
];

export const colourName = (letter: string): string =>
  COLOUR_WORDS.find(c => c.letter === letter)?.says ?? letter;

/** The formats worth naming to a player, in the order they care about them. */
export const FORMATS: { key: string; says: string }[] = [
  { key: 'commander', says: 'Commander' },
  { key: 'standard', says: 'Standard' },
  { key: 'pioneer', says: 'Pioneer' },
  { key: 'modern', says: 'Modern' },
  { key: 'legacy', says: 'Legacy' },
  { key: 'vintage', says: 'Vintage' },
  { key: 'pauper', says: 'Pauper' },
  { key: 'brawl', says: 'Brawl' },
  { key: 'historic', says: 'Historic' },
  { key: 'oathbreaker', says: 'Oathbreaker' },
];

/* -------------------------------------------------------------------------- *
 * The two gaps, said out loud
 *
 * These are the only honest answers to two whole groups of questions, and both
 * were measured rather than guessed. Writing them once means they cannot drift
 * into a softer claim later.
 * -------------------------------------------------------------------------- */

/**
 * The rules gap, said at the size it actually is.
 *
 * THIS SENTENCE USED TO BE WIDER THAN THE TRUTH. It read "we do not keep a copy
 * of the rules", full stop, and it was printed at every question the router
 * could not place. Players asking what hexproof does were told we hold no rules
 * reference while hexproof's definition sat in our own catalogue, printed by
 * Wizards on 43 cards.
 *
 * What we genuinely do not hold is the rules THEMSELVES: timing, the stack,
 * priority, and what happens when two things meet. 82 base tables and not one
 * carries rules text or rulings; `cards` has 39 columns and none is about them.
 * What we do hold is the keyword glossary, because it is printed on the cards,
 * and the count comes off the generated list rather than being written here, so
 * the sentence cannot go stale as the catalogue grows.
 */
export const NO_RULES_CORPUS = [
  'What I do not keep is the rules themselves. Timing, the stack, priority, what happens when two things want to happen at once: I will not answer any of those from memory.',
  `What I can do is read you a keyword. Wizards prints the definition of a keyword on the card itself, in brackets, and we hold ${KEYWORD_NAMES.length} keywords that way. Ask what flying or hexproof or overload means and you get Wizards' own words back.`,
  'For the rest, Gatherer carries the official rulings for a card and the Comprehensive Rules cover everything else. A judge at your local shop will beat both.',
].join('\n\n');

/**
 * We hold no tournament results and no per-commander deck lists. The deck lists
 * we do hold are precons and published lists, grouped by format only, and the
 * biggest group has 552 decks in it.
 */
export const NO_META_DATA = [
  'Nothing here tracks what is winning right now. The deck lists we hold are preconstructed decks and published lists, and the biggest group of them is 552 decks, none of it tournament results.',
  'So an answer about the current field would be me making it up, and a made up answer about the field is worse than no answer.',
].join('\n\n');

/**
 * We hold no deck lists grouped by commander, and we never will from what we
 * ingest. `meta_card_inclusion` carries format scope only, two scopes, and the
 * rule that a scope under 30 decks publishes nothing at all is what keeps it
 * honest: preconstructed decks give roughly one deck per commander, so a per
 * commander rate would be one deck reported as a percentage.
 */
export const NO_COMMANDER_DATA = [
  'I cannot tell you which commanders want a card. The deck lists we hold are grouped by format, not by commander, so there is no honest number to give you.',
  'The reason there is no per commander number is that most of what we hold is preconstructed decks, which is about one deck per commander. A rate worked out from one deck is not a rate.',
  'What I can tell you is what the card does, what it combos with and how many Commander decks run it overall. Ask for any of those.',
].join('\n\n');

/** Judgement we do not hold and will not fake. */
export const judgementGap = (what: string): string =>
  `${what} is a table call. We hold what a card does, what it costs and how many decks play it, and none of those add up to that, so I am leaving it to you rather than dressing a guess up as an answer.`;

/* -------------------------------------------------------------------------- *
 * The self check
 *
 * The copy rules are enforced on the way out rather than trusted on the way in.
 * `looksWrong` is used by the tests and by the answerer itself, which logs a
 * warning rather than shipping a sentence that breaks a rule silently.
 * -------------------------------------------------------------------------- */

/** CLAUDE.md 10a, written down so it can be checked instead of remembered. */
export const BANNED_WORDS = [
  'ai', 'assistant', 'smart', 'intelligent', 'powered by', 'neural', 'gpt',
  'model', 'bot', 'llm', 'algorithm',
];

export function looksWrong(text: string): string[] {
  const faults: string[] = [];
  if (text.includes('—')) faults.push('em dash');
  if (/\$0\.00|€0\.00/.test(text)) faults.push('a price printed as zero');
  const lower = ` ${text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')} `;
  for (const word of BANNED_WORDS) {
    if (lower.includes(` ${word} `)) faults.push(`the word "${word}"`);
  }
  return faults;
}
