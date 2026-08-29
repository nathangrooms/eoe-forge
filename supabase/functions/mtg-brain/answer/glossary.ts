/**
 * What a keyword means, read off a card rather than remembered.
 *
 * THE CLAIM THIS FILE CORRECTS
 * ----------------------------
 * Tutor has been telling players "we do not keep a rules reference" on every
 * question it could not route, and that sentence is broader than the truth.
 * Wizards prints the definition of a keyword on the card itself, in brackets,
 * and we hold every card. Measured 2026-08-29 over `cards_unique`: 208 keywords
 * carry such a definition, on 5,734 cards.
 *
 * So the rules gap is real and it is narrower than it was being described. It
 * is timing, the stack, priority and what happens when two things meet. It is
 * not "what does hexproof do", which is printed on 43 cards in our own database.
 *
 * WHAT IS WRITTEN DOWN AND WHAT IS READ
 * -------------------------------------
 * `keyword-names.ts` holds the NAMES, generated from the catalogue, because
 * routing decides what a question is asking before any read happens and so has
 * to answer "is that word a keyword" from the words alone.
 *
 * Nothing here holds a DEFINITION. Every definition a player reads is fetched
 * from a card at the moment they ask. A definition written into this repo would
 * be a copy that can drift from the card, and the card is the authority.
 *
 * HOW A REMINDER IS RECOGNISED, AND WHY STRICTLY
 * ---------------------------------------------
 * The keyword must OPEN a line of the card's rules text, with at most a cost
 * between it and the opening bracket. Anything looser hands one keyword's
 * definition to another:
 *
 *   Flying, first strike (This creature deals combat damage before creatures
 *   without first strike.)
 *
 * A rule that looked for "flying" anywhere on a line followed by a bracket
 * would print that as the definition of flying. Measured on the ten keywords
 * players ask about most, the loose rule produced a wrong definition for flying
 * and for vigilance and the strict rule produced none.
 */

import { KEYWORD_NAMES } from './keyword-names.ts';

export { KEYWORD_NAMES };

/* -------------------------------------------------------------------------- *
 * Finding a keyword in a question
 * -------------------------------------------------------------------------- */

/**
 * Words a player uses for a keyword that is not spelled that way on the card.
 *
 * Kept to the ones that are genuinely the common name for the same thing, not
 * to whatever would make a particular question route. Summoning sickness is the
 * rule haste ignores and every player calls it that; nobody has ever read the
 * word "haste" off a card and called it summoning sickness, and nobody has ever
 * said summoning sickness meaning anything else.
 */
const KEYWORD_NICKNAMES: { said: string; keyword: string }[] = [
  { said: 'summoning sickness', keyword: 'Haste' },
  { said: 'summoning sick', keyword: 'Haste' },
  { said: 'firststrike', keyword: 'First strike' },
  { said: 'doublestrike', keyword: 'Double strike' },
];

/** Punctuation squashed to spaces, padded, so a whole word can be matched. */
function padded(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9!'-]+/g, ' ').trim()} `;
}

export interface KeywordAsked {
  /** The keyword as the catalogue spells it, which is how it is said back. */
  name: string;
  /** The exact words the player used, so the reading can be checked. */
  words: string;
}

/**
 * Every keyword the question names, longest name first.
 *
 * Longest first matters for the same reason it does everywhere else here:
 * "double strike" contains neither "strike" nor "double" as a keyword we would
 * rather answer about, and "first strike" would otherwise lose to nothing at
 * all. A shorter name wholly inside a longer one that also matched is dropped.
 */
export function keywordsNamedIn(question: string): KeywordAsked[] {
  const text = padded(question);
  const hits: KeywordAsked[] = [];

  const consider = (name: string, words: string) => {
    if (!text.includes(` ${padded(words).trim()} `)) return;
    hits.push({ name, words: padded(words).trim() });
  };

  for (const name of KEYWORD_NAMES) consider(name, name);
  for (const nick of KEYWORD_NICKNAMES) consider(nick.keyword, nick.said);

  hits.sort((a, b) => b.words.length - a.words.length);

  const kept: KeywordAsked[] = [];
  for (const hit of hits) {
    if (kept.some(k => k.name === hit.name)) continue;
    // "first strike" already covers the "strike" that sits inside it.
    if (kept.some(k => ` ${k.words} `.includes(` ${hit.words} `))) continue;
    kept.push(hit);
  }
  return kept;
}

/* -------------------------------------------------------------------------- *
 * Reading the definition off a card
 * -------------------------------------------------------------------------- */

export interface KeywordDefinition {
  keyword: string;
  /** Wizards' words, exactly as printed, brackets stripped. */
  definition: string;
  /** A card it was read off, so the claim can be checked against a real card. */
  readOff: string;
  /** How many of the cards read printed this same wording. */
  agreeing: number;
  /** How many cards printed a definition of this keyword at all. */
  parsed: number;
  /** How many cards were read to find it. */
  sampled: number;
  /**
   * Set when the cards disagree about the wording, so there is no one answer.
   *
   * SOME KEYWORDS DO NOT HAVE A SINGLE DEFINITION and pretending otherwise is
   * how this prints a wrong rule. Protection is the case that proved it: the
   * reminder on Knight of Infamy reads "can't be blocked, targeted, dealt
   * damage, or enchanted by anything WHITE", because protection is always
   * protection from something. Two of the forty eight cards read agreed with
   * it and the rest said a different colour. Cycling, Kicker, Equip, Crew and
   * Ward are the same shape with a cost instead of a colour, and Indestructible
   * is worded per permanent type.
   *
   * The definition is still printed, because it is a real reminder text off a
   * real card. What changes is that the answer says the wording moves from card
   * to card, and the answer is reported as partial rather than complete.
   */
  varies: boolean;
}

/**
 * The share of the definitions found that have to agree before the wording is
 * treated as THE wording rather than one card's version of it.
 *
 * Half. Measured over the thirty eight keywords players ask about most:
 * everything with one settled wording clears it comfortably, and Protection,
 * Cycling, Kicker, Equip, Crew and Indestructible do not, which is exactly the
 * set that genuinely has no single wording.
 */
const AGREEMENT = 0.5;

export type GlossaryRead =
  | { ok: true; value: KeywordDefinition | null }
  | { ok: false; why: string };

/**
 * How many cards to read before deciding what a keyword means.
 *
 * Twenty four, and the ceiling is the statement timeout rather than taste. The
 * read is a trigram match on `oracle_text`, which over-matches: measured on
 * 2026-08-29 for the worst case, "flying (", the index offers 5,059 rows and
 * about ninety of them really match. Unordered with `limit 24` that is 11.8 ms,
 * because the scan stops as soon as it has enough. The same query with an
 * `order by edhrec_rank` has to finish the whole scan and took 1,493 ms against
 * a 3 s limit, so it is deliberately not ordered.
 */
const SAMPLE = 24;

/**
 * Four patterns, tried in order, each one there because a real keyword needed it.
 *
 * 1. `Hexproof (` is how most reminders read, and it is very selective. It
 *    answers flying, hexproof, deathtouch, trample and the rest of the ten
 *    players ask about most.
 * 2. A LINE that starts with the keyword, which is what a reminder is. This one
 *    catches `Scry 2 (Look at the top two cards...)`: pattern 1 finds nothing
 *    because of the 2, and the loose pattern below fills its whole sample with
 *    cards that merely say "scry" in the middle of a sentence.
 * 3. The same thing when the keyword opens the card's text, so there is no
 *    newline in front of it.
 * 4. Anything at all between the keyword and the bracket. This is what finds
 *    `Overload {1}{R} (You may cast this spell...)` and `Protection from red
 *    (...)`. It is the loosest and lowest yield, so it goes last.
 *
 * Pattern 4 is the one that had to be added after running this: the first
 * version had only pattern 1, and "What does overload mean?" came back saying
 * we hold no printed definition of overload, four lines above a sentence
 * offering to look overload up.
 */
function patternsFor(keyword: string): { like: string; limit: number }[] {
  return [
    { like: `%${keyword} (%`, limit: SAMPLE },
    { like: `%\n${keyword}%(%`, limit: SAMPLE },
    { like: `${keyword}%(%`, limit: SAMPLE },
    { like: `%${keyword} %(%`, limit: SAMPLE * 2 },
  ];
}

interface Reminder {
  definition: string;
  /**
   * What stood between the keyword and the bracket, which is its parameter.
   *
   * `Ward {2} (...)` carries `{2}`, `Protection from white (...)` carries
   * `from white`, `Flying (...)` carries nothing. It is kept because a keyword
   * whose parameter reappears inside its own definition has no single
   * definition, and that is the difference between reading a card and stating
   * a rule.
   */
  between: string;
}

export function reminderIn(oracleText: string | null, keyword: string): Reminder | null {
  if (!oracleText) return null;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}\\b([^()]{0,14})\\(([^)]{12,})\\)`, 'i');
  for (const line of oracleText.split('\n')) {
    const found = line.trim().match(pattern);
    if (!found) continue;
    /* A COMMA BETWEEN THE KEYWORD AND THE BRACKET MEANS A LIST OF KEYWORDS, and
       the bracket then belongs to the last one. "Flying, haste (This creature
       can attack and {T} as soon as it comes under your control.)" would
       otherwise give flying haste's definition, which is the exact fault the
       line anchor was put there to stop and which the anchor alone does not
       catch: it only catches the cases where the list happens to be longer than
       the window. A parameter is a cost or a colour and never a list. */
    if (/[,;]/.test(found[1])) continue;
    return { definition: found[2].trim(), between: found[1].trim() };
  }
  return null;
}

/**
 * Whether the keyword's own parameter turns up inside its definition.
 *
 * `Ward {2}` reads "counter it unless that player pays {2}", and a player
 * holding Ward {4} is being told the wrong number. `Overload {1}{R}` reads
 * "cast this spell for its overload cost", which names no number and is true of
 * every overload card there is. So the test is not whether the keyword has a
 * parameter, it is whether the parameter leaked into the words.
 *
 * Measured over the thirty eight keywords players ask about most: it catches
 * ward, cycling, equip, kicker, crew and protection, and it leaves overload,
 * convoke, delve, cascade and flashback alone, which is exactly right.
 */
function parameterLeaked(between: string, definition: string): boolean {
  if (!between) return false;
  const tokens = [
    ...(between.match(/\{[^}]+\}/g) ?? []),
    ...(between.match(/\b\d+\b/g) ?? []),
    ...(between.match(/\b[a-z]{3,}\b/gi) ?? []).filter(w => w.toLowerCase() !== 'from'),
  ];
  return tokens.some(token => definition.includes(token));
}

/**
 * The definition Wizards prints most often for this keyword.
 *
 * A keyword's reminder text has been reworded over thirty years, and a card can
 * carry an old wording, a gendered wording or a joke. Taking the wording that
 * appears on the most cards is what picks the current one: measured over the
 * whole catalogue for the ten keywords players ask about most, the most common
 * wording is the right one for all ten, and every wrong wording is on one or
 * two cards.
 */
export async function keywordDefinition(db: any, keyword: string): Promise<GlossaryRead> {
  let read = 0;
  for (const pattern of patternsFor(keyword)) {
    const { data, error } = await db
      .from('cards_unique')
      .select('name, oracle_text')
      .not('oracle_text', 'is', null)
      .ilike('oracle_text', pattern.like)
      .limit(pattern.limit);
    if (error) return { ok: false, why: error.message };

    const rows = (data ?? []) as { name: string; oracle_text: string | null }[];
    read += rows.length;

    const seen = new Map<string, { count: number; readOff: string; between: string }>();
    let parsed = 0;
    for (const row of rows) {
      const reminder = reminderIn(row.oracle_text, keyword);
      if (!reminder) continue;
      parsed++;
      const already = seen.get(reminder.definition);
      if (already) already.count++;
      else seen.set(reminder.definition, { count: 1, readOff: row.name, between: reminder.between });
    }
    if (!seen.size) continue;

    const best = [...seen.entries()].sort(
      (a, b) => b[1].count - a[1].count || a[0].length - b[0].length
    )[0];

    return {
      ok: true,
      value: {
        keyword,
        definition: best[0],
        readOff: best[1].readOff,
        agreeing: best[1].count,
        parsed,
        sampled: read,
        varies:
          best[1].count / parsed < AGREEMENT || parameterLeaked(best[1].between, best[0]),
      },
    };
  }
  return { ok: true, value: null };
}

/* -------------------------------------------------------------------------- *
 * What the question wants doing with them
 * -------------------------------------------------------------------------- */

/**
 * Whether the question is about two keywords MEETING rather than about what
 * each one means.
 *
 * The difference decides whether the answer is complete or half of one. We hold
 * what deathtouch says and what trample says. What happens when a creature has
 * both and is blocked is a combat damage rule, and that we do not hold. Saying
 * so is the whole point; printing two definitions and letting the sentence read
 * as an answer to the interaction would be the confident wrong answer this
 * whole approach exists to avoid.
 */
const INTERACTION = [
  'work together', 'works together', 'work with', 'interact', 'interaction',
  'combined', 'combine', 'at the same time', 'both', 'how much damage',
  'do i have to assign', 'assign to the blocker', 'together',
];

export function asksHowTheyMeet(question: string): boolean {
  const text = padded(question);
  return INTERACTION.some(p => text.includes(` ${padded(p).trim()} `));
}
