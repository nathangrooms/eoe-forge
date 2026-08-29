/**
 * One list of what Magic words mean, and the words a player says them with.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `cards.tags` is written by `src/engine/knowledge/tagger.ts`, which is the one
 * place in this product that decides what a card IS. The deck generator and the
 * optimiser both carry a byte-identical copy of that file and read the same
 * names out of it. Tutor did not. It read the column and then kept its own
 * hand-written table of what those names mean.
 *
 * Counted before this file was written, by `scripts/tutor-vocabulary-diff.ts`:
 *
 *     engine rules                         66, writing 76 names
 *     Tutor named, across its four tables  76
 *     names Tutor used that no rule writes   0
 *     names the engine writes that Tutor named nowhere   0
 *
 * So the two lists agreed. That is the honest finding and it is not a defence:
 * nothing made them agree, nothing checked that they did, and nothing would
 * have said so on the day they stopped. A rule renamed in the tagger would have
 * left Tutor querying a tag no card carries, and the only symptom is a question
 * that answers nothing.
 *
 * THE LINE THIS FILE DRAWS
 * ------------------------
 * The engine owns what a card DOES. Every tag name, which names are aliases of
 * which, which ones only restate the type line, which ones are too common to
 * mean anything, and how rare each one is. All of that is imported, none of it
 * is retyped.
 *
 * Tutor owns how a PLAYER SAYS IT. Two different things, both of them copy:
 *
 *   - `says`  the words for a list heading: "board wipes", "ways to win".
 *   - `plain` what the tag means about one card, as a clause a sentence can
 *     hold: "a board wipe", "gets things back from the graveyard".
 *   - `also`  the other ways somebody writes it. "wrath" and "sweeper" for a
 *     board wipe, "flicker" for blink, "card advantage" for card draw, "lord"
 *     for a tribal payoff. None of these is a fact about a card. They are how
 *     people talk at a table, and no tagger rule will ever produce them.
 *
 * A tag with no entry here still works: `spelledOut` turns `cost-reduction`
 * into "cost reduction", which is both askable and sayable. So a rule added to
 * `TAG_RULES` reaches Tutor with nobody remembering to copy anything, and
 * `PHRASINGS` is only ever an improvement on the default.
 */

import { TAG_RULES, ALL_TAGS } from '../_engine/knowledge/tagger.ts';
import {
  ALIAS_TAGS,
  LOW_INFORMATION_TAGS,
  TYPE_TAGS as ENGINE_TYPE_TAGS,
  tagWeight,
} from '../_engine/knowledge/tag-signal.ts';

export { ALL_TAGS };

/** Every tag a rule writes under its own name. Aliases are not in here. */
export const CANONICAL_TAGS: ReadonlySet<string> = new Set(TAG_RULES.map(r => r.tag));

/**
 * Tags whose words would only repeat the type line printed above them.
 *
 * The engine's set answers a different question, "does sharing this tell you
 * anything about two cards", and it is nine names. Tutor's answers "is this
 * already on the screen", and `vehicle` is: the type line of a Vehicle reads
 * `Artifact — Vehicle`, so filing it under "a vehicle" says nothing new. It is
 * added here rather than in the engine because the engine's ranking uses the
 * name and would lose a real signal, worth 7.4 on its own weighting, if it were
 * dropped there. One list, one named exception, and the reason written down.
 */
export const TYPE_TAGS: ReadonlySet<string> = new Set([...ENGINE_TYPE_TAGS, 'vehicle']);

/**
 * `board-wipe` becomes "board wipe". Good enough to ask with and to read.
 *
 * Deliberately not clever. It exists so that a tag nobody has written words for
 * is still reachable and still sayable, rather than being silently invisible,
 * which is the state 28 of the engine's 56 ideas were in.
 */
export const spelledOut = (tag: string): string => tag.split('-').join(' ');

export interface Phrasing {
  /** A list heading: "The 8 most played BOARD WIPES, Commander legal:". */
  says?: string;
  /** One card's role: "We file it under: A BOARD WIPE.". Aliases need none. */
  plain?: string;
  /** Other ways a player writes it, beyond the tag spelled out. */
  also?: string[];
}

/**
 * The one alias name used on purpose, and the measurement that justifies it.
 *
 * `removal` is written by TWO rules, `targeted-removal` and `board-wipe`, so it
 * is the union of both and no canonical name covers it. Measured over
 * `cards_unique` on 2026-08-29: `removal` 3,878 rows, `targeted-removal` 3,308,
 * `board-wipe` 610. A player who types "removal" means all 3,878, so mapping
 * the word onto either canonical name would quietly drop the other half.
 *
 * Every other alias is a second spelling of one rule's tag and must not be used
 * here. `vocabulary.test.ts` enforces that.
 */
export const UNION_NAMES: ReadonlySet<string> = new Set(['removal']);

/**
 * How a player says each tag. Keyed by the engine's own names.
 *
 * The 29 entries that carried a `says` before this file existed keep it word
 * for word, so no answer changes its wording. What changed is which name each
 * one is filed under: four of them were querying an alias, and three of those
 * four now name the rule that writes it.
 */
export const PHRASINGS: Record<string, Phrasing> = {
  /* ---- removal ---- */
  removal: { says: 'removal' },
  'targeted-removal': {
    says: 'spot removal',
    plain: 'spot removal',
    also: ['spot removal', 'single target removal'],
  },
  'board-wipe': {
    says: 'board wipes',
    plain: 'a board wipe',
    also: ['board wipes', 'sweeper', 'sweepers', 'wrath'],
  },
  counterspell: {
    says: 'counterspells',
    plain: 'a counterspell',
    also: ['counterspells', 'counter magic', 'counter spell', 'counter spells'],
  },
  bounce: {
    says: 'bounce spells',
    plain: 'bounces things back to hand',
    also: ['bounce spell', 'bounce spells', 'return to hand'],
  },
  'land-destruction': { says: 'land destruction', plain: 'destroys lands', also: ['land hate'] },
  'graveyard-hate': { says: 'graveyard hate', plain: 'graveyard hate', also: ['graveyard removal'] },

  /* ---- mana ---- */
  ramp: { says: 'ramp', plain: 'ramp', also: ['mana acceleration', 'accelerant'] },
  'mana-rock': { says: 'mana rocks', plain: 'a mana rock', also: ['mana rocks'] },
  'mana-dork': {
    says: 'mana creatures',
    plain: 'a mana creature',
    also: ['mana dorks', 'mana creature', 'mana creatures'],
  },
  'fast-mana': { says: 'fast mana', plain: 'fast mana' },
  treasure: { says: 'treasure makers', plain: 'makes treasure', also: ['treasures'] },
  'cost-reduction': {
    says: 'cost reducers',
    plain: 'makes your spells cheaper',
    also: ['cost reducer', 'cheaper spells'],
  },
  'lands-matter': { says: 'lands matter cards', plain: 'cares about lands' },
  landfall: { says: 'landfall cards', plain: 'landfall' },

  /* ---- cards and value ---- */
  'card-draw': {
    says: 'card draw',
    plain: 'draws cards',
    also: ['draw spell', 'draw spells', 'card advantage', 'draw engine'],
  },
  tutor: { says: 'tutors', plain: 'a tutor', also: ['tutors'] },
  'tutor-narrow': {
    says: 'tutors for one kind of card',
    plain: 'a tutor for one kind of card',
    also: ['narrow tutor', 'narrow tutors', 'conditional tutor'],
  },
  'tutor-broad': {
    says: 'tutors for anything',
    plain: 'a tutor for anything',
    also: ['broad tutor', 'broad tutors', 'unconditional tutor'],
  },
  'graveyard-recursion': {
    says: 'recursion',
    plain: 'gets things back from the graveyard',
    /* "reanimate" and "reanimation" have meant this wider tag since the first
       version of the table, and `reanimator` is the narrower 360-card rule
       underneath it. Moving those two words would change which cards come back
       for a question nobody has complained about, so they stay where they were
       and `reanimator` takes its own name. */
    also: ['recursion', 'reanimate', 'reanimation'],
  },
  reanimator: { says: 'reanimation spells', plain: 'reanimation', also: ['reanimator', 'reanimators'] },
  'self-mill': { says: 'self mill cards', plain: 'fills your own graveyard', also: ['self mill', 'fill my graveyard'] },
  mill: { says: 'mill cards', plain: 'mills' },

  /* ---- creatures and combat ---- */
  'token-maker': { says: 'token makers', plain: 'makes tokens', also: ['token maker', 'token makers', 'token generator'] },
  'mass-pump': { says: 'team pumps', plain: 'pumps the whole team', also: ['mass pump', 'team pump', 'pump the team', 'overrun'] },
  'haste-enabler': {
    says: 'haste enablers',
    plain: 'gives haste',
    /* Not the bare word "haste". A player who writes it usually means the
       keyword on a creature, and this tag is the cards that GRANT it. */
    also: ['haste enabler', 'haste enablers', 'gives haste', 'grants haste'],
  },
  'tribal-payoff': {
    says: 'tribal payoffs',
    plain: 'pays off a creature type',
    also: ['tribal', 'tribal payoff', 'typal', 'lord', 'lords'],
  },
  equipment: { says: 'equipment', plain: 'equipment' },
  aura: { says: 'auras', plain: 'an aura', also: ['auras'] },
  voltron: { says: 'voltron cards', plain: 'for suiting up one creature' },
  clone: { says: 'clones', plain: 'copies a creature', also: ['clones', 'copy a creature'] },
  blink: { says: 'blink effects', plain: 'blinks things in and out', also: ['flicker'] },
  vehicle: { says: 'vehicles', also: ['vehicles'] },
  infect: { says: 'infect cards', plain: 'infect' },
  prowess: { says: 'prowess cards', plain: 'prowess' },
  flash: { says: 'flash cards', plain: 'can be cast at instant speed' },
  protection: {
    says: 'protection',
    plain: 'protection',
    also: ['protect my commander', 'commander protection'],
  },
  finisher: {
    says: 'ways to win',
    plain: 'a way to win',
    also: ['win condition', 'win conditions', 'wincon', 'wincons'],
  },

  /* ---- sacrifice ---- */
  'sacrifice-outlet': {
    says: 'sacrifice outlets',
    plain: 'a sacrifice outlet',
    also: ['sac outlet', 'sac outlets', 'sacrifice outlet', 'sacrifice outlets'],
  },
  aristocrats: { says: 'aristocrats cards', plain: 'for sacrifice decks' },

  /* ---- spells and counters ---- */
  spellslinger: { says: 'spells matter cards', plain: 'for instants and sorceries', also: ['spells matter'] },
  'artifacts-matter': { says: 'artifact payoffs', plain: 'cares about artifacts', also: ['artifacts matter'] },
  'enchantments-matter': {
    says: 'enchantment payoffs',
    plain: 'cares about enchantments',
    also: ['enchantments matter', 'enchantress'],
  },
  counters: {
    says: 'cards that work with counters',
    plain: 'works with counters',
    /* "+1/+1 counters" normalises to "1 1 counters", which is why it is written
       out here rather than trusted to match as typed. */
    also: ['counters', '+1/+1 counters', 'counters matter'],
  },
  proliferate: { says: 'proliferate cards', plain: 'proliferates' },
  'x-spell': { says: 'X spells', plain: 'an X spell', also: ['x spells'] },
  storm: { says: 'storm cards', plain: 'storm' },
  cascade: { says: 'cascade cards', plain: 'cascade' },
  'extra-turn': { says: 'extra turn spells', plain: 'extra turns', also: ['extra turns'] },
  'extra-combat': { says: 'extra combat spells', plain: 'extra combats', also: ['extra combats'] },
  untapper: { says: 'untappers', plain: 'untaps things', also: ['untappers', 'untap effect'] },

  /* ---- the table, not the card ---- */
  lifegain: { says: 'lifegain', plain: 'gains life', also: ['life gain'] },
  stax: { says: 'stax pieces', plain: 'slows everyone down' },
  discard: { says: 'discard spells', plain: 'makes people discard', also: ['hand attack', 'hand disruption'] },
  'discard-outlet': { says: 'discard outlets', plain: 'lets you discard on purpose', also: ['discard outlet', 'discard outlets'] },
  'group-hug': { says: 'group hug cards', plain: 'helps everyone at the table' },

  /* ---- true of too many cards to ask for, kept for reading one card back ---- */
  etb: { plain: 'does something when it enters' },
  evasion: { plain: 'hard to block' },
};

/* -------------------------------------------------------------------------- *
 * Reading one card back
 * -------------------------------------------------------------------------- */

/**
 * A tag that says what a card DOES rather than what it is.
 *
 * An alias is excluded because it is a second name for a tag already in the
 * list, and printing both said one fact twice. That used to be six hand-written
 * supersession rules, four of which were only ever describing the alias graph
 * the tagger already publishes.
 */
export const isRoleTag = (tag: string): boolean => !TYPE_TAGS.has(tag) && !ALIAS_TAGS.has(tag);

/**
 * A tag that says the same thing less precisely, dropped when the precise one
 * is also present.
 *
 * What is left after the alias graph is subtracted is four judgements about
 * which of two TRUE statements to print, and they are judgements about English
 * rather than about cards. A tutor for one kind of card is a tutor, and saying
 * both makes Tezzeret read "a tutor, a tutor for one kind of card".
 */
export const SUPERSEDED: Record<string, string[]> = {
  tutor: ['tutor-narrow', 'tutor-broad'],
  'graveyard-recursion': ['reanimator'],
  counters: ['proliferate'],
  'sacrifice-outlet': ['aristocrats'],
  ramp: ['mana-rock', 'mana-dork', 'fast-mana'],
};

/** The plain words for a tag, falling back to the tag spelled out. */
export const plainWords = (tag: string): string => PHRASINGS[tag]?.plain ?? spelledOut(tag);

/**
 * What a card is for, most telling first.
 *
 * The caller prints the first four, so the order decides what a player reads.
 * It used to be the order the tags arrived in, which is alphabetical on our own
 * internal ids: `etb` before `counterspell` because e comes before c. Measured
 * over all 4,151 distinct tag combinations in `cards_unique`, 182 of them spent
 * one of the four on "does something when it enters" or "hard to block" while
 * cutting something else off the end.
 *
 * `tagWeight` is the engine's own measure of how much a word tells you, and it
 * already knows those two are the least telling things we can say: `etb` is on
 * 4,622 cards and scores 2.88, `counterspell` is on 428 and scores 6.31. So the
 * order is its answer rather than a second opinion.
 *
 * After: 31. Every one of those carries BOTH `etb` and `evasion` and exactly
 * five roles, so the fourth slot goes to "hard to block" and the only thing cut
 * is the least telling thing on the card. There is nothing more descriptive
 * left to promote, which is the state this is meant to reach.
 */
export function roleWords(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  const held = new Set(tags);
  const out: string[] = [];
  const kept = tags.filter(tag => {
    if (!isRoleTag(tag)) return false;
    const beatenBy = SUPERSEDED[tag];
    return !(beatenBy && beatenBy.some(better => held.has(better)));
  });
  kept.sort((a, b) => tagWeight(b) - tagWeight(a) || a.localeCompare(b));
  for (const tag of kept) {
    const words = plainWords(tag);
    if (!out.includes(words)) out.push(words);
  }
  return out;
}

/* -------------------------------------------------------------------------- *
 * Asking for a list
 * -------------------------------------------------------------------------- */

export interface TagSynonym {
  tag: string;
  says: string;
  words: string[];
}

/**
 * Every job a player can ask for a list of, and the words that mean it.
 *
 * Derived from the engine rather than listed. A canonical tag is askable unless
 * the engine says sharing it means nothing: `etb` is on 4,512 cards and
 * `evasion` on 4,291, so "the most played cards that enter the battlefield" is
 * a fact about nothing. That judgement is `LOW_INFORMATION_TAGS` and it belongs
 * to the engine, not here.
 *
 * Before this was derived, 29 entries were written by hand and covered 28 of
 * the engine's 56 ideas. The other 28 could not be asked for in any wording,
 * including `voltron` (1,211 cards), `counters` (2,813) and `aristocrats`
 * (456), all measured over `cards_unique` on 2026-08-29.
 */
export const TAG_SYNONYMS: TagSynonym[] = (() => {
  const askable: string[] = [
    ...UNION_NAMES,
    ...Array.from(CANONICAL_TAGS).filter(
      tag => !ENGINE_TYPE_TAGS.has(tag) && !LOW_INFORMATION_TAGS.has(tag)
    ),
  ];

  return askable
    .map(tag => {
      const phrasing = PHRASINGS[tag];
      const base = spelledOut(tag);
      const words = Array.from(new Set([base, ...(phrasing?.also ?? [])]));
      return { tag, says: phrasing?.says ?? base, words };
    })
    /* Longest phrase first so the table reads as narrowest first, the same
       order `ASKS` is written in. `roleFrom` picks the longest match anyway, so
       this changes nothing at runtime and a great deal when reading it. */
    .sort((a, b) => b.words[0].length - a.words[0].length || a.tag.localeCompare(b.tag));
})();
