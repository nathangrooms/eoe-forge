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
 * Tags, written as a player would say them
 *
 * `cards.tags` is our own vocabulary and some of it is invented product words:
 * "tutor-narrow", "removal-spot", "token-maker". Those are fine in a column and
 * are not fine on a screen, so every tag that reaches a player passes through
 * here first.
 *
 * Three groups come out entirely:
 *   - Type tags (creature, instant, land). The type line is already printed
 *     above them, so repeating it is noise.
 *   - Alias pairs. TAG_RULES writes both `draw` and `card-draw` for the same
 *     card; a player should read that once.
 *   - Anything with no label. A tag we have not written words for is not shown,
 *     because showing the raw id is the jargon rule broken.
 * -------------------------------------------------------------------------- */

/** Already on the type line. */
const TYPE_TAGS = new Set([
  'creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'planeswalker',
  'land', 'basic-land', 'battle', 'vehicle',
]);

/**
 * The plain words for a role tag. A tag missing from this table is never shown.
 * Aliases share a phrase and are de-duplicated after mapping.
 */
const TAG_WORDS: Record<string, string> = {
  'etb': 'does something when it enters',
  'evasion': 'hard to block',
  'removal': 'removal',
  'removal-spot': 'spot removal',
  'targeted-removal': 'spot removal',
  'board-wipe': 'a board wipe',
  'removal-sweeper': 'a board wipe',
  'tokens': 'makes tokens',
  'token-maker': 'makes tokens',
  'draw': 'draws cards',
  'card-draw': 'draws cards',
  'counters': 'works with counters',
  'lifegain': 'gains life',
  'ramp': 'ramp',
  'mana-rock': 'a mana rock',
  'mana-dork': 'a mana creature',
  'fast-mana': 'fast mana',
  'treasure': 'makes treasure',
  'cost-reduction': 'makes your spells cheaper',
  'recursion': 'gets things back from the graveyard',
  'graveyard-recursion': 'gets things back from the graveyard',
  'reanimator': 'reanimation',
  'self-mill': 'fills your own graveyard',
  'mill': 'mills',
  'graveyard-hate': 'graveyard hate',
  'aura': 'an aura',
  'auras': 'an aura',
  'equipment': 'equipment',
  'voltron': 'for suiting up one creature',
  'protection': 'protection',
  'finisher': 'a way to win',
  'wincon': 'a way to win',
  'sacrifice': 'a sacrifice outlet',
  'sac-outlet': 'a sacrifice outlet',
  'sacrifice-outlet': 'a sacrifice outlet',
  'aristocrats': 'for sacrifice decks',
  'mass-pump': 'pumps the whole team',
  'flash': 'can be cast at instant speed',
  'discard-outlet': 'lets you discard on purpose',
  'discard': 'makes people discard',
  'x-spell': 'an X spell',
  'stax': 'slows everyone down',
  'group-hug': 'helps everyone at the table',
  'tribal-payoff': 'pays off a creature type',
  'lands-matter': 'cares about lands',
  'landfall': 'landfall',
  'land-destruction': 'destroys lands',
  'haste-enabler': 'gives haste',
  'bounce': 'bounces things back to hand',
  'counterspell': 'a counterspell',
  'tutor': 'a tutor',
  'tutor-narrow': 'a tutor for one kind of card',
  'tutor-broad': 'a tutor for anything',
  'untapper': 'untaps things',
  'spellslinger': 'for instants and sorceries',
  'artifacts-matter': 'cares about artifacts',
  'enchantments-matter': 'cares about enchantments',
  'blink': 'blinks things in and out',
  'clone': 'copies a creature',
  'infect': 'infect',
  'prowess': 'prowess',
  'proliferate': 'proliferates',
  'extra-turn': 'extra turns',
  'extra-combat': 'extra combats',
  'cascade': 'cascade',
  'storm': 'storm',
};

/**
 * A tag that says the same thing less precisely, and is dropped when the
 * precise one is also present.
 *
 * The tagger writes both `tutor` and `tutor-narrow` on the same card, so
 * Tezzeret came out as "a tutor, a tutor for one kind of card", which is one
 * fact said twice and the second time better.
 */
const SUPERSEDED: Record<string, string[]> = {
  'tutor': ['tutor-narrow', 'tutor-broad'],
  'removal': ['removal-spot', 'targeted-removal', 'board-wipe', 'removal-sweeper'],
  'recursion': ['reanimator'],
  'counters': ['proliferate'],
  'sacrifice': ['aristocrats'],
  'ramp': ['mana-rock', 'mana-dork', 'fast-mana'],
};

/**
 * Whether a tag says what a card DOES, rather than what it is.
 *
 * `creature` and `planeswalker` describe the type line, which is printed above
 * anything built from these, and treating them as roles makes every
 * planeswalker look like every other planeswalker.
 */
export const isRoleTag = (tag: string): boolean => !TYPE_TAGS.has(tag) && Boolean(TAG_WORDS[tag]);

export function roleWords(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  const held = new Set(tags);
  const out: string[] = [];
  for (const tag of tags) {
    if (TYPE_TAGS.has(tag)) continue;
    const beatenBy = SUPERSEDED[tag];
    if (beatenBy && beatenBy.some(better => held.has(better))) continue;
    const words = TAG_WORDS[tag];
    if (!words) continue;
    if (!out.includes(words)) out.push(words);
  }
  return out;
}

/** The tag ids a plain word in a question could mean. Used by the router. */
export const TAG_SYNONYMS: { tag: string; says: string; words: string[] }[] = [
  { tag: 'counterspell', says: 'counterspells', words: ['counterspell', 'counterspells', 'counter magic', 'counter spell', 'counter spells'] },
  { tag: 'removal-spot', says: 'spot removal', words: ['spot removal', 'targeted removal', 'single target removal'] },
  { tag: 'board-wipe', says: 'board wipes', words: ['board wipe', 'board wipes', 'sweeper', 'sweepers', 'wrath'] },
  { tag: 'removal', says: 'removal', words: ['removal'] },
  { tag: 'ramp', says: 'ramp', words: ['ramp', 'mana acceleration', 'accelerant'] },
  { tag: 'mana-rock', says: 'mana rocks', words: ['mana rock', 'mana rocks'] },
  { tag: 'mana-dork', says: 'mana creatures', words: ['mana dork', 'mana dorks', 'mana creature', 'mana creatures'] },
  { tag: 'card-draw', says: 'card draw', words: ['card draw', 'draw spell', 'draw spells', 'card advantage', 'draw engine'] },
  { tag: 'tutor', says: 'tutors', words: ['tutor', 'tutors'] },
  { tag: 'protection', says: 'protection', words: ['protection', 'protect my commander', 'commander protection'] },
  { tag: 'graveyard-hate', says: 'graveyard hate', words: ['graveyard hate', 'graveyard removal'] },
  { tag: 'recursion', says: 'recursion', words: ['recursion', 'reanimate', 'reanimation'] },
  { tag: 'token-maker', says: 'token makers', words: ['token maker', 'token makers', 'token generator'] },
  { tag: 'sacrifice-outlet', says: 'sacrifice outlets', words: ['sac outlet', 'sacrifice outlet', 'sacrifice outlets'] },
  { tag: 'equipment', says: 'equipment', words: ['equipment'] },
  { tag: 'stax', says: 'stax pieces', words: ['stax'] },
  { tag: 'extra-turn', says: 'extra turn spells', words: ['extra turn', 'extra turns'] },
  { tag: 'extra-combat', says: 'extra combat spells', words: ['extra combat', 'extra combats'] },
  { tag: 'wincon', says: 'ways to win', words: ['win condition', 'win conditions', 'wincon', 'wincons'] },
  { tag: 'fast-mana', says: 'fast mana', words: ['fast mana'] },
  { tag: 'treasure', says: 'treasure makers', words: ['treasure', 'treasures'] },
  { tag: 'proliferate', says: 'proliferate cards', words: ['proliferate'] },
  { tag: 'landfall', says: 'landfall cards', words: ['landfall'] },
  { tag: 'mill', says: 'mill cards', words: ['mill'] },
  { tag: 'lifegain', says: 'lifegain', words: ['lifegain', 'life gain'] },
  { tag: 'blink', says: 'blink effects', words: ['blink', 'flicker'] },
  { tag: 'infect', says: 'infect cards', words: ['infect'] },
  { tag: 'storm', says: 'storm cards', words: ['storm'] },
  { tag: 'cascade', says: 'cascade cards', words: ['cascade'] },
];

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
 * We hold no rules reference. 82 tables and not one of them carries rules text,
 * rulings or a glossary; `cards` has 39 columns and none is about rulings.
 */
export const NO_RULES_CORPUS = [
  'I can read you a card and everything we hold about it, but we do not keep a copy of the rules, so I will not answer a timing or stack question from memory.',
  'Gatherer carries the official rulings for a card, and the Comprehensive Rules cover the rest. A judge at your local shop will beat both.',
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
