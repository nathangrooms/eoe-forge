/**
 * The round-trip check: render the DSL back to English, compare it to the real
 * oracle text, and refuse anything that invented or dropped meaning.
 *
 * ## Why this is the stage that matters
 *
 * Schema validation proves the JSON is well-formed. Well-formed and wrong is the
 * dangerous combination, and it is precisely what a language model produces when
 * it is unsure: fluent, plausible, structurally perfect, and about a different
 * card. `{do:'draw', count:3}` on a card that draws one passes every type check
 * ever written. The only way to catch it is to say the DSL out loud and check the
 * words against the words on the card.
 *
 * ## How the comparison works, and what it deliberately does not attempt
 *
 * It is not a similarity score. A number between 0 and 1 has to be thresholded,
 * a threshold is a knob, and a knob gets turned until the pass rate looks good.
 * Instead the comparison is a **two-directional set difference over semantic
 * tokens**, and both directions have a name:
 *
 *   - **invented** — a token the rendered DSL asserts that the oracle text does
 *     not contain. This is hallucination, and it is the one that corrupts games.
 *   - **dropped**  — a token the oracle text contains that the rendered DSL
 *     never mentions. This is silent omission, and it is the one that makes a
 *     card look automated while half of it does nothing.
 *
 * Either being non-empty is a failure, and the failure names the exact tokens.
 * There is nothing to tune.
 *
 * ## Three deliberate weakenings, each stated because each costs detection
 *
 * 1. **Sets, not multisets.** "Destroy target creature" renders as "target
 *    creature … destroy target creature", because the target list and the effect
 *    both name it. Counting occurrences would reject that, so occurrences are not
 *    counted. Cost: a DSL that draws two cards twice where the card draws twice
 *    once is not caught by the number check.
 * 2. **A closed lexicon.** Only words on `SEMANTIC_WORDS` are compared. An open
 *    vocabulary would drown in "the", "a", "of", and in every place the renderer
 *    words something differently from Wizards. Cost: a difference expressed
 *    entirely in words outside the lexicon is invisible.
 * 3. **Unparsed text is removed from the oracle side first.** A card whose model
 *    output marks half its text `unparsed` is checked only against the half it
 *    claimed. Without this, `partial` cards could never pass, and the pipeline
 *    would push the model toward covering everything — the exact opposite of the
 *    behaviour we want.
 *
 * ## The calibration obligation
 *
 * This gate has a false-rejection rate, and quoting a model's pass rate without
 * it would be dishonest: some of what it rejects is our renderer's wording, not
 * the model's error. `scripts/coverage/llm/calibrate.ts` runs this check over the
 * hand-written compiler's own `coverage:'full'` cards — text we know is correctly
 * represented — and the share it rejects is the gate's own error bar. Every pass
 * rate this pipeline reports is stated next to that number.
 */

import type { Ability, UnparsedClause } from './dsl.ts';
import { renderAbilities } from './render.ts';
import type { AbilityCard } from './normalize.ts';
import { normalizeParagraph, selfNames } from './normalize.ts';

/* ------------------------------------------------------------------ *
 * Tokenisation
 * ------------------------------------------------------------------ */

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
  thirteen: '13', twenty: '20',
};

/**
 * The closed comparison vocabulary.
 *
 * Membership rule, applied to every entry: the word must be one that BOTH
 * Wizards' oracle text and `render.ts` use for the same concept, and its
 * presence or absence must change what a card does. "Destroy" qualifies.
 * "Permanent" qualifies. "The" does not. "Battlefield" does not — the renderer
 * says "enters" where a pre-2024 reprint says "enters the battlefield", and the
 * word carries no meaning the event tag has not already carried.
 *
 * Entries are stems. `stem()` below strips a trailing 's' and a trailing 'es'
 * when doing so lands on a member, which is what makes "draws"/"draw" and
 * "creatures"/"creature" the same token.
 *
 * ADDING TO THIS LIST MAKES THE GATE STRICTER, NOT LOOSER. Removing from it is
 * the change that needs justifying, and every removal made during calibration is
 * recorded in `REMOVED_FROM_LEXICON` below with the false rejection it fixed.
 */
export const SEMANTIC_WORDS: readonly string[] = [
  // what happens
  'draw', 'discard', 'mill', 'destroy', 'exile', 'sacrifice', 'tap', 'untap',
  'counter', 'create', 'return', 'search', 'shuffle', 'reveal', 'gain', 'lose',
  'deal', 'damage', 'prevent', 'scry', 'surveil', 'fight', 'attack', 'block',
  'cast', 'activate', 'pay', 'add', 'remove', 'put', 'control',
  // what it happens to
  'card', 'creature', 'artifact', 'enchantment', 'land', 'planeswalker',
  'instant', 'sorcery', 'token', 'player', 'opponent',
  'life', 'mana', 'library', 'graveyard', 'hand', 'exile', 'counter',
  // how much, how many, whose
  'target', 'other',
  // shape
  'may', 'unless', 'instead', 'until', 'end', 'turn', 'combat',
  // evergreen keywords — a dropped one is a different card
  'flying', 'trample', 'vigilance', 'haste', 'deathtouch', 'lifelink',
  'menace', 'reach', 'hexproof', 'shroud', 'indestructible', 'defender',
  'flash', 'ward', 'protection', 'wither', 'infect', 'annihilator',
];

/**
 * Words that mean the same thing in two spellings, folded to one token.
 *
 * Every entry was added because calibration showed it producing a matched
 * "invented X / dropped Y" pair on cards the hand-written compiler represents
 * correctly — i.e. one difference being counted twice, both times wrongly.
 */
const SYNONYMS: Record<string, string> = {
  another: 'other',
  controls: 'control',
  controlled: 'control',
};

/**
 * Words REMOVED from the lexicon during calibration, and the false rejection
 * each one caused. Recorded here rather than silently deleted, because a
 * shrinking lexicon is a weakening gate and a weakening gate that nobody can
 * audit is how a pass rate becomes fiction.
 *
 *   'you' / 'your'      — oracle text omits the subject ("Draw a card"), the DSL
 *                         names it ({who:'you'}). Invented on 486 of 2,000 known-
 *                         good cards; dropped on 8.
 *   'each' / 'all'      — English writes "creatures you control" for the same
 *                         thing it sometimes writes "all creatures" for, and
 *                         `{sel:'all'}` cannot tell which. 488 false inventions.
 *   'when' / 'whenever' — the distinction is once-vs-repeatable, which the
 *                         ability KIND already carries. 102 false pairs.
 *   'spell'             — "instant and sorcery spells" vs a filter over card
 *                         types. 91 false drops.
 *   'permanent'         — `{is:'any'}` has no word in oracle text at all.
 *                         179 false inventions before `render.ts` was fixed to
 *                         emit nothing; kept out because "permanent" and
 *                         "creature" alternate freely in real wordings.
 */
export const REMOVED_FROM_LEXICON: readonly string[] = [
  'you', 'your', 'each', 'all', 'any', 'when', 'whenever', 'spell', 'permanent',
];

const LEXICON = new Set(SEMANTIC_WORDS);

function stem(raw: string): string | null {
  const word = SYNONYMS[raw] ?? raw;
  if (LEXICON.has(word)) return word;
  if (word.endsWith('s') && LEXICON.has(word.slice(0, -1))) return word.slice(0, -1);
  if (word.endsWith('es') && LEXICON.has(word.slice(0, -2))) return word.slice(0, -2);
  if (word.endsWith('ed') && LEXICON.has(word.slice(0, -2))) return word.slice(0, -2);
  if (word.endsWith('ing') && LEXICON.has(word.slice(0, -3))) return word.slice(0, -3);
  return null;
}

export interface SemanticTokens {
  numbers: Set<string>;
  mana: Set<string>;
  words: Set<string>;
}

/**
 * Self-references are collapsed to nothing on BOTH sides rather than to a shared
 * token. `~` (what `normalizeParagraph` leaves) and "this permanent" (what the
 * renderer emits) always correspond, so comparing them tests the normaliser
 * rather than the model.
 */
const SELF_PHRASES = [
  '~', 'this permanent', 'this creature', 'that permanent', 'that creature',
];

export function semanticTokens(text: string): SemanticTokens {
  let s = text.toLowerCase().replace(/\([^)]*\)/g, ' ');
  for (const phrase of SELF_PHRASES) s = s.split(phrase).join(' ');
  s = s.replace(/[’'`]/g, '').replace(/[—–−]/g, '-');

  const mana = new Set<string>();
  s = s.replace(/\{([^{}]{1,8})\}/g, (_all, symbol: string) => {
    mana.add(String(symbol).toLowerCase());
    return ' ';
  });

  s = s.replace(/[a-z]+/g, (word) => NUMBER_WORDS[word] ?? word);

  /**
   * 0 and 1 are excluded, in BOTH directions, and this is a real weakening.
   *
   * English writes 1 as "a" ("draw a card") and 0 as nothing at all, so a DSL
   * that faithfully says `count: 1` has no numeral to match in the oracle text.
   * On 2,000 known-good compiler cards that produced 445 false inventions of "1"
   * and 83 of "0" — by far the largest single source of false rejection.
   *
   * Cost, stated: a model that writes `count: 1` where the card draws two is
   * still caught (the 2 is dropped), but one that writes `count: 1` where the
   * card says "a card" and one that writes it where the card says nothing are
   * indistinguishable here. Everything from 2 upward is checked exactly.
   */
  const numbers = new Set<string>();
  for (const match of s.matchAll(/\d+/g)) {
    const n = match[0].replace(/^0+(?=\d)/, '');
    if (n !== '0' && n !== '1') numbers.add(n);
  }

  const words = new Set<string>();
  for (const match of s.matchAll(/[a-z]+/g)) {
    const stemmed = stem(match[0]);
    if (stemmed) words.add(stemmed);
  }

  return { numbers, mana, words };
}

const missing = (from: Set<string>, inside: Set<string>): string[] =>
  [...from].filter((token) => !inside.has(token)).sort();

/* ------------------------------------------------------------------ *
 * Locating the model's verbatim spans — the stage before this one
 * ------------------------------------------------------------------ */

/** Whitespace-insensitive, punctuation-preserving containment. */
function loosen(text: string): string {
  return text.toLowerCase().replace(/[’'`]/g, "'").replace(/[—–−]/g, '-').replace(/\s+/g, ' ').trim();
}

export interface VerbatimVerdict {
  ok: boolean;
  /** Quoted spans that are not present in the card's oracle text. */
  notFound: string[];
  /**
   * Share of the oracle text's semantic tokens that appear in at least one
   * quoted span. Below 1 means text was never accounted for by anything —
   * neither compiled nor declared unparsed.
   */
  accountedFraction: number;
  unaccounted: string[];
}

/**
 * Did the model quote the card, or write about it?
 *
 * Every `text` it returned must be findable in the oracle text, and between them
 * they must account for the card's semantic content. This runs BEFORE the
 * round-trip because a paraphrased quote makes the round-trip meaningless: the
 * oracle side would be reduced by a span that was never really there.
 */
export function checkVerbatim(
  quoted: readonly string[],
  oracleText: string,
): VerbatimVerdict {
  const haystack = loosen(oracleText);
  const notFound = quoted.filter((span) => span.trim() && !haystack.includes(loosen(span)));

  const oracleTokens = semanticTokens(oracleText);
  const quotedTokens = semanticTokens(quoted.join('\n'));
  const all = [...oracleTokens.words, ...oracleTokens.numbers, ...oracleTokens.mana];
  const covered = new Set<string>([...quotedTokens.words, ...quotedTokens.numbers, ...quotedTokens.mana]);
  const unaccounted = all.filter((token) => !covered.has(token)).sort();

  return {
    ok: notFound.length === 0 && unaccounted.length === 0,
    notFound,
    accountedFraction: all.length === 0 ? 1 : (all.length - unaccounted.length) / all.length,
    unaccounted,
  };
}

/* ------------------------------------------------------------------ *
 * The round trip
 * ------------------------------------------------------------------ */

export interface RoundTripVerdict {
  ok: boolean;
  /** The DSL said back in words. Kept so a failure can be read by a human. */
  rendered: string;
  /** The oracle text the DSL claimed, i.e. minus every `unparsed` span. */
  claimed: string;
  invented: { numbers: string[]; mana: string[]; words: string[] };
  dropped: { numbers: string[]; mana: string[]; words: string[] };
}

/**
 * Remove the spans the author declared unrepresented, so the comparison is
 * against what was actually claimed.
 */
export function claimedOracleText(oracleText: string, unparsed: readonly UnparsedClause[]): string {
  let remaining = oracleText;
  for (const clause of unparsed) {
    const needle = clause.text.trim();
    if (!needle) continue;
    const at = loosen(remaining).indexOf(loosen(needle));
    if (at < 0) continue; // not located — `checkVerbatim` has already failed this card
    // Work on the loosened index by rebuilding from the original with a regex
    // that tolerates the same whitespace differences the index did.
    const pattern = needle
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+')
      .replace(/['’`]/g, "['’`]")
      .replace(/[—–−-]/g, '[—–−-]');
    remaining = remaining.replace(new RegExp(pattern, 'i'), ' ');
  }
  return remaining;
}

export function roundTrip(
  abilities: readonly Ability[],
  unparsed: readonly UnparsedClause[],
  oracleText: string,
  /** The card, only so its own name folds to `~` on the oracle side exactly as
   *  `normalizeCard` folds it. Pass `{ name }` at minimum. */
  card: AbilityCard = {},
): RoundTripVerdict {
  const rendered = renderAbilities(abilities);
  const claimedRaw = claimedOracleText(oracleText, unparsed);
  const cardNames = selfNames(card);
  // Normalise the oracle side the same way the compiler does, so the card's own
  // name and its reminder text are gone from both sides for the same reason.
  const claimed = claimedRaw
    .split('\n')
    .map((line) => normalizeParagraph(line, cardNames))
    .filter(Boolean)
    .join('\n');

  const left = semanticTokens(rendered);
  const right = semanticTokens(claimed);

  const invented = {
    numbers: missing(left.numbers, right.numbers),
    mana: missing(left.mana, right.mana),
    words: missing(left.words, right.words),
  };
  const dropped = {
    numbers: missing(right.numbers, left.numbers),
    mana: missing(right.mana, left.mana),
    words: missing(right.words, left.words),
  };

  const empty = (bucket: { numbers: string[]; mana: string[]; words: string[] }): boolean =>
    bucket.numbers.length === 0 && bucket.mana.length === 0 && bucket.words.length === 0;

  return { ok: empty(invented) && empty(dropped), rendered, claimed, invented, dropped };
}

/** One line naming why a round trip failed, for a report or a database column. */
export function describeRoundTrip(verdict: RoundTripVerdict): string {
  if (verdict.ok) return 'round-trip clean';
  const parts: string[] = [];
  const flat = (b: { numbers: string[]; mana: string[]; words: string[] }): string[] =>
    [...b.numbers, ...b.mana.map((m) => `{${m}}`), ...b.words];
  const inv = flat(verdict.invented);
  const drop = flat(verdict.dropped);
  if (inv.length) parts.push(`invented ${inv.join(', ')}`);
  if (drop.length) parts.push(`dropped ${drop.join(', ')}`);
  return parts.join('; ');
}
