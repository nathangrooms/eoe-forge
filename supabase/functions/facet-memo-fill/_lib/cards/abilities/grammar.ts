/**
 * The shared grammar the rule tables are built from.
 *
 * Oracle text is not a formal language, but it is a heavily templated one, and
 * almost every template is built from the same four fragments: a count, a noun
 * phrase describing an object, a player, and a duration. Parsing those four in
 * one place is what stops the rule table turning into the imperative sprawl the
 * plan is explicitly trying to avoid — a rule says "destroy `<object>`" and this
 * file decides what `<object>` means.
 *
 * ## Precision, restated for this file
 * Every parser here returns `null` rather than guessing. `parseObject('gizmo')`
 * is `null`, not `{is:'any'}`, because a filter that matches everything attached
 * to a `destroy` is how you blow up the wrong board. The compiler turns a `null`
 * into an honest gap; it never turns one into a default.
 *
 * The subtype vocabulary is DERIVED from our own catalogue — every subtype word
 * appearing on three or more of the 34,088 rows — rather than remembered, minus
 * a short blocklist of subtypes that are also ordinary English words ("Time",
 * "Will", "Book", "Lord") and would match noun phrases that are not subtypes.
 */

import type {
  CardFilter,
  Cmp,
  Condition,
  Duration,
  ManaColor,
  ManaSpendRestriction,
  PlayerSelector,
  Selector,
  TargetSpec,
  ValueExpr,
  WatchedEvent,
  Zone,
  ChoiceSubject,
} from './dsl.ts';
import { andF, isWatchableFilter, notF, orF, PROTECTION_FROM_CHOSEN_COLOR } from './dsl.ts';

/* ------------------------------------------------------------------ *
 * Counts
 * ------------------------------------------------------------------ */

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20,
};

/** Regex fragment matching any count this file can parse. */
export const NUM = `(?:${Object.keys(NUMBER_WORDS).join('|')}|x|\\d+)`;

/** `"three"` -> `3`, `"x"` -> `{v:'x'}`, anything else -> `null`. */
export function parseCount(word: string): ValueExpr | null {
  const w = word.trim().toLowerCase();
  if (w === 'x') return { v: 'x' };
  if (/^\d+$/.test(w)) return Number(w);
  return w in NUMBER_WORDS ? NUMBER_WORDS[w] : null;
}

/* ------------------------------------------------------------------ *
 * Keywords
 *
 * The closed keyword set is owned by `@/lib/game/keywords.ts`. This module
 * cannot import it: `src/lib/game/effects.ts` already imports
 * `src/lib/cards/tagger.ts`, so a `cards -> game` import would close a cycle.
 * The list is therefore mirrored here, and `compiler.test.ts` — a leaf module,
 * free to import both — asserts that every keyword `keywords.ts` knows about is
 * one this compiler recognises. Drift becomes a failing test, not a silent miss.
 * ------------------------------------------------------------------ */

export const KEYWORDS: readonly string[] = [
  // engine-backed, mirrored from ENGINE_KEYWORDS
  'flying', 'reach', 'menace', 'trample', 'deathtouch', 'first strike',
  'double strike', 'lifelink', 'vigilance', 'defender', 'indestructible',
  'hexproof', 'shroud', 'protection', 'haste',
  // advisory, mirrored from ADVISORY_KEYWORDS
  'flash', 'ward', 'prowess', 'exalted', 'annihilator', 'afflict', 'banding',
  'battle cry', 'bushido', 'cascade', 'convoke', 'crew', 'cycling', 'dredge',
  'echo', 'equip', 'evolve', 'fear', 'flanking', 'horsemanship', 'infect',
  'intimidate', 'islandwalk', 'forestwalk', 'mountainwalk', 'plainswalk',
  'swampwalk', 'melee', 'modular', 'myriad', 'persist', 'phasing',
  'protection from everything', 'rampage', 'skulk', 'storm', 'toxic',
  'undying', 'unleash', 'vanishing', 'wither',
  // present in the catalogue, absent from both lists above
  'changeling', 'devoid', 'partner', 'affinity', 'amplify', 'annihilator',
  'aura swap', 'bloodthirst', 'buyback', 'conspire', 'delve', 'dethrone',
  'entwine', 'epic', 'evoke', 'exploit', 'extort', 'fabricate', 'fading',
  'flashback', 'forecast', 'fortify', 'frenzy', 'graft', 'gravestorm',
  'haunt', 'hideaway', 'improvise', 'ingest', 'kicker', 'landwalk',
  'level up', 'living weapon', 'madness', 'miracle', 'morph', 'megamorph',
  'multikicker', 'ninjutsu', 'offering', 'outlast', 'overload', 'provoke',
  'prowl', 'rebound', 'recover', 'reinforce', 'replicate', 'retrace',
  'ripple', 'scavenge', 'shadow', 'soulbond', 'soulshift', 'splice',
  'split second', 'sunburst', 'suspend', 'totem armor', 'transfigure',
  'transmute', 'tribute', 'unearth', 'vanishing', 'wither', 'absorb',
  'aftermath', 'ascend', 'assist', 'battalion', 'bestow', 'blitz',
  'boast', 'casualty', 'champion', 'cleave', 'companion', 'compleated',
  'connive', 'daybound', 'nightbound', 'decayed', 'demonstrate',
  'disturb', 'eternalize', 'embalm', 'emerge', 'enchant', 'encore',
  'enlist', 'escalate', 'escape', 'eminence', 'evoke', 'exhaust',
  'foretell', 'freerunning', 'goad', 'hidden agenda', 'jump-start',
  'mentor', 'mutate', 'offspring', 'plot', 'prototype', 'reconfigure',
  'renown', 'riot', 'saddle', 'spectacle', 'spree', 'squad', 'surge',
  'training', 'undaunted', 'venture', 'visit', 'warp', 'more than meets the eye',
  // Keyword ABILITIES only. Ability words ("Landfall", "Threshold", "Valiant")
  // are flavour, stripped by the normaliser, and must never appear here — a
  // keyword list that swallows an ability word would turn a real trigger into a
  // no-op badge.
  'fuse', 'station', 'start your engines!', 'devour', 'backup', 'bargain',
  'craft', 'discover', 'for mirrodin!', 'job select', 'read ahead', 'ravenous',
  'harmonize', 'impending', 'gift', 'affinity', 'aftermath', 'double agenda',
] as const;

const KEYWORD_SET = new Set<string>(KEYWORDS);

/** Longest first so "first strike" wins over "strike" style prefixes. */
const KEYWORDS_BY_LENGTH: readonly string[] = [...KEYWORDS].sort((a, b) => b.length - a.length);

export function isKeyword(word: string): boolean {
  return KEYWORD_SET.has(word.trim().toLowerCase());
}

/**
 * `"flying, vigilance and trample"` -> `['flying','vigilance','trample']`.
 * Returns `null` if ANY element is not a keyword — a partial keyword list is a
 * misread sentence, not a keyword list.
 */
export function parseKeywordList(phrase: string): string[] | null {
  const parts = phrase
    .replace(/\band\b/g, ',')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const out: string[] = [];
  for (const p of parts) {
    if (!KEYWORD_SET.has(p)) return null;
    out.push(p);
  }
  return out;
}

/** A keyword optionally followed by a parameter: `ward {2}`, `annihilator 2`, `protection from red`. */
export function parseKeywordWithParameter(phrase: string): { keyword: string; parameter?: string } | null {
  const p = phrase.trim();
  if (KEYWORD_SET.has(p)) return { keyword: p };
  for (const k of KEYWORDS_BY_LENGTH) {
    if (!p.startsWith(k + ' ')) continue;
    const rest = p.slice(k.length + 1).trim();
    // Only a compact parameter — a mana cost, a number, or "from <quality>".
    if (/^((?:\{[^}]+\})+|\d+|(?:from|for) [a-z ]+|-\d+\/-\d+|\+\d+\/\+\d+)$/.test(rest)) {
      return { keyword: k, parameter: rest };
    }
    return null;
  }
  return null;
}

/**
 * The five colours protection can be from, in the word the card prints.
 * Kept to what `protectionQualities` in `game/keywords.ts` classifies as a
 * colour, so a grant this list admits is one the runtime applies in combat.
 */
const PROTECTION_COLOURS: ReadonlySet<string> = new Set(['white', 'blue', 'black', 'red', 'green']);

export interface GrantList {
  /** `pump.grant` entries — see the field's comment in `dsl.ts`. */
  grant: string[];
  /**
   * True when one entry is "protection from the color of your choice": the
   * ability must CHOOSE a colour on resolution before it can grant anything,
   * and the rule that builds the pump owes a `{do:'choose'}` in front of it.
   */
  choosesColor: boolean;
}

/**
 * `"protection from the color of your choice"` -> a grant list, or null.
 *
 * `parseKeywordList` reads what "gains flying and haste" gives and nothing
 * else, so twenty-nine cards saying "gains protection from the color of your
 * choice until end of turn" — Mother of Runes (rank 507) among them, whose
 * whole card is that line — produced no record. This is the same list with
 * protection's parameter admitted, and admitted NARROWLY:
 *
 *   protection from red / white / ...        the printed colour, verbatim
 *   protection from the color of your choice `PROTECTION_FROM_CHOSEN_COLOR`,
 *                                            and `choosesColor` set
 *   protection from the chosen color         the same entry, chosen EARLIER
 *                                            by a "Choose a color" sentence
 *
 * Everything else is refused, the same way a non-keyword refuses the whole
 * list. "From artifacts", "from creatures your opponents control", "from each
 * of your opponents" and "from the color of its controller's choice" are all
 * real qualities on real cards, and each is a different runtime question; a
 * list that let them through would grant a string the engine files as "ask the
 * player" without saying so anywhere in the record. Add a quality here only
 * with the consumer that reads it.
 *
 * "Black and from red" (Crown of Awe) refuses too, and deliberately: the
 * `and` split leaves a bare "from red", which is not a grant. Two colours
 * printed as one phrase wants its own reading, not a lucky split.
 */
export function parseGrantList(phrase: string): GrantList | null {
  const parts = phrase
    .replace(/\band\b/g, ',')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const grant: string[] = [];
  let choosesColor = false;
  for (const p of parts) {
    if (KEYWORD_SET.has(p)) { grant.push(p); continue; }
    const prot = p.match(/^protection from (.+)$/);
    if (!prot) return null;
    const quality = prot[1].trim();
    if (PROTECTION_COLOURS.has(quality)) { grant.push(p); continue; }
    if (quality === 'the color of your choice') {
      grant.push(PROTECTION_FROM_CHOSEN_COLOR);
      choosesColor = true;
      continue;
    }
    if (quality === 'the chosen color') { grant.push(PROTECTION_FROM_CHOSEN_COLOR); continue; }
    return null;
  }
  return { grant, choosesColor };
}

/* ------------------------------------------------------------------ *
 * Type and subtype vocabulary
 * ------------------------------------------------------------------ */

const CARD_TYPES: readonly string[] = [
  'artifact', 'battle', 'creature', 'enchantment', 'instant', 'land',
  'planeswalker', 'sorcery', 'kindred', 'tribal',
];

const SUPERTYPES: readonly string[] = ['basic', 'legendary', 'snow', 'world'];

/**
 * Derived from the catalogue: every subtype word on three or more rows, minus
 * `SUBTYPE_BLOCKLIST`. Regenerating it is a data question, not a memory one.
 *
 * T2 — `scripts/subtype-vocabulary.mjs` asks that question against the cached
 * bulk file, and asking it turned up a systematic hole rather than a few typos.
 * The list was derived from the CARD pool, and a token has no card: "Saproling",
 * "Inkling", "Mite" and "Eldrazi Spawn" exist only on token rows, which the
 * census discards before it counts anything. So the vocabulary could never have
 * contained them, while 82 pool cards say "create a 1/1 green Saproling creature
 * token" and were refused for want of the word — `parseObject` rejects any
 * phrase carrying a word it cannot place, so one missing subtype refuses the
 * whole rule and every card that uses it goes SILENT.
 *
 * The last group below is that correction. Each word was measured by the cards
 * it blocks in a token descriptor or a filter phrase, NOT by how often it
 * appears, because "time" is a subtype on thirty rows and blocks nothing while
 * "saproling" is on nine and blocks eighty-two. Words that are also ordinary
 * English were left out and belong in `SUBTYPE_BLOCKLIST` instead; so were the
 * planeswalker and plane names, which are genuine subtypes and block no card.
 */
const SUBTYPES_RAW: readonly string[] = [
  'human', 'aura', 'warrior', 'wizard', 'soldier', 'spirit', 'elf', 'elemental',
  'cleric', 'equipment', 'rogue', 'zombie', 'goblin', 'beast', 'knight', 'shaman',
  'phyrexian', 'vampire', 'dragon', 'bird', 'druid', 'horror', 'cat', 'merfolk',
  'hero', 'scout', 'angel', 'insect', 'artificer', 'werewolf', 'saga', 'giant',
  'noble', 'construct', 'mutant', 'demon', 'ally', 'villain', 'warlock',
  'dinosaur', 'vehicle', 'eldrazi', 'avatar', 'faerie', 'lizard', 'snake',
  'advisor', 'pirate', 'shapeshifter', 'dwarf', 'golem', 'berserker', 'wall',
  'monk', 'robot', 'assassin', 'dog', 'spider', 'ogre', 'orc', 'treefolk',
  'archer', 'citizen', 'ninja', 'rat', 'god', 'wurm', 'sliver', 'minotaur',
  'room', 'drake', 'wolf', 'illusion', 'plant', 'mercenary', 'nightmare',
  'elephant', 'turtle', 'kor', 'skeleton', 'detective', 'kithkin', 'rebel',
  'samurai', 'frog', 'sphinx', 'hydra', 'vedalken', 'djinn', 'centaur', 'fungus',
  'bard', 'scientist', 'troll', 'peasant', 'drone', 'ranger', 'rhino',
  'forest', 'ooze', 'swamp', 'fox', 'bear', 'mountain', 'devil', 'horse',
  'serpent', 'boar', 'dryad', 'halfling', 'spellshaper', 'sorcerer', 'fish',
  'island', 'plains', 'kavu', 'griffin', 'pilot', 'scarecrow', 'bat',
  'octopus', 'performer', 'curse', 'barbarian', 'alien', 'crab', 'elk', 'imp',
  'ape', 'myr', 'squirrel', 'minion', 'gargoyle', 'rabbit', 'phoenix',
  'crocodile', 'cyclops', 'class', 'tyranid', 'unicorn', 'gnome', 'satyr',
  'shade', 'spy', 'moonfolk', 'incarnation', 'otter', 'homunculus', 'efreet',
  'kraken', 'jackal', 'specter', 'ox', 'leviathan', 'nomad', 'thrull', 'mouse',
  'gorgon', 'pegasus', 'raccoon', 'jellyfish', 'employee', 'chimera', 'food',
  'siren', 'guest', 'shark', 'necron', 'praetor', 'archon', 'hellion',
  'astartes', 'lhurgoyf', 'monkey', 'leech', 'whale', 'ouphe', 'aetherborn',
  'juggernaut', 'scorpion', 'thopter', 'tiefling', 'salamander', 'nymph',
  'cyborg', 'weird', 'survivor', 'officer', 'goat', 'rigger', 'yeti', 'clue',
  'egg', 'hippogriff', 'clown', 'badger', 'symbiote', 'worm', 'gremlin',
  'kobold', 'atog', 'basilisk', 'manticore', 'nightstalker', 'kirin', 'licid',
  'wraith', 'harpy', 'mole', 'hag', 'dauthi', 'sloth', 'spike', 'soltari',
  'wolverine', 'camel', 'antelope', 'slug', 'pest', 'demigod', 'slith',
  'gamer', 'metathran', 'zubera', 'mystic', 'hippo', 'sheep', 'hyena',
  'thalakos', 'squid', 'beholder', 'nephilim', 'fractal', 'treasure',
  'pangolin', 'masticore', 'beeble', 'noggle', 'monger', 'trilobite',
  'bringer', 'bison', 'volver', 'aurochs', 'starfish', 'brushwagg', 'synth',
  'orgg', 'mongoose', 'surrakar', 'lemur', 'killbot', 'dreadnought', 'coward',
  'nautilus', 'lobster', 'armadillo', 'hedgehog', 'porcupine', 'cockatrice',
  'possum', 'gnoll', 'lammasu', 'brainiac', 'beaver', 'wombat', 'blood',
  'incubator', 'map', 'powerstone', 'junk', 'gold', 'contraption',

  // T2 — token-only subtypes, which no card-derived list can reach.
  'saproling', 'role', 'spawn', 'army', 'inkling', 'mite', 'servo',
  'bobblehead', 'spacecraft', 'glimmer', 'dalek', 'cartouche',
  'assembly-worker', 'moogle', 'hamster', 'klingon', 'snail', 'varmint',
];

/**
 * Subtypes that are also ordinary English words. Left in, `parseObject('the
 * lord of the pit')` and every sentence containing "time", "will" or "book"
 * starts producing filters.
 */
const SUBTYPE_BLOCKLIST = new Set([
  'time', 'will', 'lord', 'book', 'eye', 'plan', 'planet', 'seal', 'child',
  'sphere', 'gamma', 'town', 'cave', 'gate', 'mount', 'omen', 'trap', 'shrine',
  'assembly', 'arcane', 'adventure', 'lesson', 'background', 'desert', 'locus',
  'rune', 'lair', 'elder', 'processor', 'carrier', 'case', 'siege', 'attraction',
  'doctor', 'sorcerer',
]);

const SUBTYPES = new Set(SUBTYPES_RAW.filter((s) => !SUBTYPE_BLOCKLIST.has(s)));

/**
 * Is this word a creature/permanent subtype? `normalize.ts` asks before it
 * shortens a legendary card's name: "Rhino, Wrecker of Walls" must not turn the
 * subtype "Rhino" into a self-reference in its own rules text.
 */
/**
 * The subject of an open choice, from the words a card prints.
 *
 * Shared by `effect-rules.ts` (which reads "choose a colour" as a standalone
 * effect) and `clause-rules.ts` (which reads the "as this enters" wrapper
 * around it). It lives here because clause-rules imports effect-rules and not
 * the other way round, so a helper both need has to sit under both — and two
 * near-identical lists of subjects is somewhere for them to disagree, which is
 * the argument `selfNames` makes for being exported at all.
 *
 * Returns null for anything not on the list, INCLUDING "a card name". Naming a
 * card is hidden information the runtime has nowhere to put, and recording it
 * as an ordinary choice would turn a declared modelling gap into a claim.
 */
export function parseChoiceSubject(raw: string): ChoiceSubject | null {
  switch (raw.trim().toLowerCase().replace('colour', 'color')) {
    case 'creature type': return 'creature-type';
    case 'basic land type': return 'basic-land-type';
    case 'color': return 'color';
    case 'player': return 'player';
    case 'opponent': return 'opponent';
    default: return null;
  }
}

/** The words a card prints for each subject, for {@link parseChoiceSubject}. */
export const CHOICE_SUBJECT_WORDS = 'creature type|colou?r|player|opponent|basic land type';

export function isSubtypeWord(word: string): boolean {
  return SUBTYPES.has(word.trim().toLowerCase());
}

/** Irregular plurals oracle text actually uses. `s`-stripping handles the rest. */
const PLURALS: Record<string, string> = {
  // "Plains" is singular AND plural, and the `s`-stripping fallback turned it
  // into "plain", which is not a subtype — so "as long as you control a Plains"
  // and every other phrase naming the land refused. Mapping it to itself is the
  // whole fix.
  plains: 'plains',
  elves: 'elf', dwarves: 'dwarf', wolves: 'wolf', werewolves: 'werewolf',
  thieves: 'thief', leaves: 'leaf', fungi: 'fungus', mice: 'mouse',
  oxen: 'ox', foxes: 'fox', boxes: 'box', witches: 'witch',
  sphinxes: 'sphinx', 'faeries': 'faerie', 'mercenaries': 'mercenary',
  'allies': 'ally', 'berserkers': 'berserker', 'zombies': 'zombie',
  'wraiths': 'wraith', 'harpies': 'harpy', 'octopuses': 'octopus',
};

function singular(word: string): string {
  if (word in PLURALS) return PLURALS[word];
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('shes') || word.endsWith('ches')) {
    return word.slice(0, -2);
  }
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

const COLORS: Record<string, ManaColor> = {
  white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G',
};

/* ------------------------------------------------------------------ *
 * Noun phrases
 * ------------------------------------------------------------------ */

export interface ObjectRef {
  filter: CardFilter;
  controller?: PlayerSelector;
  zone?: Zone;
  /** The phrase said "card", so this is an object outside the battlefield. */
  isCard: boolean;
  /** How many the phrase asks for, when it says so. */
  count: ValueExpr;
  /** The phrase said "up to". */
  upTo: boolean;
  /** The phrase named a target. */
  targeted: boolean;
  /** The phrase was plural or said "each"/"all". */
  each: boolean;
}

/** Controller phrases, longest first so the greedy match is the right one. */
const CONTROLLER_SUFFIXES: Array<[string, PlayerSelector | null]> = [
  [' you control', { who: 'you' }],
  [' you dont control', { who: 'each-opponent' }],
  [' an opponent controls', { who: 'each-opponent' }],
  [' your opponents control', { who: 'each-opponent' }],
  [' each opponent controls', { who: 'each-opponent' }],
  [' another player controls', { who: 'each-opponent' }],
  [' target player controls', null],
  [' target opponent controls', null],
  [' its controller controls', null],
  [' defending player controls', { who: 'defending' }],
];

const ZONE_SUFFIXES: Array<[string, Zone, PlayerSelector | undefined]> = [
  [' in your graveyard', 'graveyard', { who: 'you' }],
  [' from your graveyard', 'graveyard', { who: 'you' }],
  [' in a graveyard', 'graveyard', undefined],
  [' from a graveyard', 'graveyard', undefined],
  [' in your hand', 'hand', { who: 'you' }],
  [' from your hand', 'hand', { who: 'you' }],
  [' in your library', 'library', { who: 'you' }],
  [' in exile', 'exile', undefined],
];

/**
 * The workhorse: a noun phrase describing an object, in, to or from anywhere.
 *
 * Handles "up to two target artifact creatures you control with flying" by
 * peeling in a fixed order — quantifier, controller, zone, "with <keyword>",
 * adjectives, head noun — and refuses the whole phrase the moment any layer
 * leaves a word it does not recognise. That refusal is the point: a leftover
 * word means the phrase said something we did not read.
 */
export function parseObject(input: string): ObjectRef | null {
  let s = input.trim().toLowerCase().replace(/[.,]+$/, '');
  if (!s) return null;

  let controller: PlayerSelector | undefined;
  let zone: Zone | undefined;
  let count: ValueExpr = 1;
  let upTo = false;
  let targeted = false;
  let each = false;
  /** T3. The phrase stated a number above one, so it can never mean "all". */
  let countBounded = false;
  const extra: CardFilter[] = [];

  // Zone, then controller. Zone first: "creature card in your graveyard" carries
  // its controller inside the zone phrase.
  for (const [suffix, z, who] of ZONE_SUFFIXES) {
    if (s.endsWith(suffix)) {
      s = s.slice(0, -suffix.length);
      zone = z;
      if (who) controller = who;
      break;
    }
  }
  if (!controller) {
    for (const [suffix, who] of CONTROLLER_SUFFIXES) {
      if (!s.endsWith(suffix)) continue;
      if (who === null) return null; // a controller we cannot name without a target ref
      s = s.slice(0, -suffix.length);
      controller = who;
      break;
    }
  }

  // " with mana value 3 or less" / " with mana value 4 or greater" — a bound,
  // not a keyword. `{is:'mana-value'}` has been in `CardFilter` since it was
  // written and the runtime compares it, but no phrase ever produced it, so
  // "return target creature card with mana value 3 or less from your
  // graveyard" (Teshar) and Lurrus's "permanent spell with mana value 2 or
  // less" both refused on the word "mana". Read BEFORE the keyword branch:
  // "mana value x or less" is all letters and would reach `parseKeywordList`.
  const mvMatch = s.match(/ with (mana value .+)$/);
  if (mvMatch) {
    const bound = parseManaValueBound(mvMatch[1]);
    if (!bound) return null;
    s = s.slice(0, mvMatch.index);
    extra.push(bound);
  }

  // " with flying" / " without flying".
  const withMatch = s.match(/ (with|without) ([a-z ]+)$/);
  if (withMatch) {
    const kws = parseKeywordList(withMatch[2]);
    if (!kws) return null; // "with a +1/+1 counter on it" — not modelled
    s = s.slice(0, withMatch.index);
    const f = orF(...kws.map((k) => ({ is: 'keyword', value: k } as CardFilter)));
    extra.push(withMatch[1] === 'with' ? f : notF(f));
  }

  // Quantifier.
  const upToMatch = s.match(new RegExp(`^up to (${NUM}) `));
  if (upToMatch) {
    const n = parseCount(upToMatch[1]);
    if (n === null) return null;
    count = n;
    upTo = true;
    s = s.slice(upToMatch[0].length);
  } else {
    const numMatch = s.match(new RegExp(`^(${NUM}) `));
    if (numMatch && !/^(a|an) $/.test(numMatch[0])) {
      const n = parseCount(numMatch[1]);
      if (n === null) return null;
      count = n;
      // T3. A stated number is BOUNDED, and nothing later in this function may
      // talk it back into "every match". Clearing `each` here was not enough:
      // "two creatures you control" strips to the head noun "creatures", the
      // plural check below sees the `s` and sets `each` again, and the phrase
      // ends up meaning every creature its controller has. `countBounded` is
      // sticky and is applied last, in `finish`.
      if (typeof n === 'number' && n > 1) { each = false; countBounded = true; }
      s = s.slice(numMatch[0].length);
    }
  }

  // Articles and universals.
  for (;;) {
    if (/^(a|an|the) /.test(s)) { s = s.replace(/^(a|an|the) /, ''); continue; }
    if (/^(all|each|every) /.test(s)) { s = s.replace(/^(all|each|every) /, ''); each = true; continue; }
    if (/^any number of /.test(s)) { s = s.replace(/^any number of /, ''); each = true; continue; }
    if (/^target /.test(s)) { s = s.replace(/^target /, ''); targeted = true; continue; }
    /*
     * "ANOTHER" COMES BEFORE "TARGET", AND WAS ONLY BEING STRIPPED AFTER IT.
     *
     * It is also in the adjective loop below, which runs after this one, so
     * "another target creature" got as far as stripping "another" and was then
     * left holding "target creature" with no loop willing to take the "target"
     * off it. The head-noun parse saw "target creature", which is not a type,
     * and refused the whole phrase.
     *
     * 416 cards say "another target". It is why Eldrazi Displacer, Emiel the
     * Blessed and Distinguished Conjurer were the three blink cards that stayed
     * unread after the blink rule landed, and the failure had nothing to do
     * with blink: any effect whose object is "another target anything" was
     * refused outright.
     *
     * Kept in BOTH loops rather than moved, because the adjective loop peels
     * "another tapped artifact creature" and the article loop cannot reach a
     * second adjective. Whichever sees it first wins and the result is the same
     * filter.
     */
    if (/^(another|other) /.test(s)) {
      s = s.replace(/^(another|other) /, '');
      extra.push({ is: 'other' });
      continue;
    }
    break;
  }

  // Adjectives. Loop so "another tapped artifact creature" peels fully.
  //
  // A trailing space is appended for the duration of the loop so an adjective
  // can also be the WHOLE phrase: "noncreature" in "whenever you cast a
  // noncreature spell" is an adjective with its noun supplied by the sentence,
  // and without this it would fail every `^adjective ` pattern and refuse.
  s = s + ' ';
  for (;;) {
    const before = s;
    if (/^(another|other) /.test(s)) { s = s.replace(/^(another|other) /, ''); extra.push({ is: 'other' }); }
    else if (/^attacking /.test(s)) { s = s.replace(/^attacking /, ''); extra.push({ is: 'attacking' }); }
    else if (/^blocking /.test(s)) { s = s.replace(/^blocking /, ''); extra.push({ is: 'blocking' }); }
    else if (/^blocked /.test(s)) { s = s.replace(/^blocked /, ''); extra.push({ is: 'blocked' }); }
    else if (/^tapped /.test(s)) { s = s.replace(/^tapped /, ''); extra.push({ is: 'tapped' }); }
    else if (/^untapped /.test(s)) { s = s.replace(/^untapped /, ''); extra.push({ is: 'untapped' }); }
    else if (/^token /.test(s)) { s = s.replace(/^token /, ''); extra.push({ is: 'token' }); }
    else if (/^nontoken /.test(s)) { s = s.replace(/^nontoken /, ''); extra.push(notF({ is: 'token' })); }
    else if (/^colorless /.test(s)) { s = s.replace(/^colorless /, ''); extra.push({ is: 'colorless' }); }
    else if (/^multicolored /.test(s)) { s = s.replace(/^multicolored /, ''); extra.push({ is: 'multicolored' }); }
    else {
      const colorMatch = s.match(/^(white|blue|black|red|green) /);
      if (colorMatch) {
        s = s.slice(colorMatch[0].length);
        extra.push({ is: 'color', value: COLORS[colorMatch[1]] });
      } else {
        const nonColor = s.match(/^non(white|blue|black|red|green) /);
        if (nonColor) {
          s = s.slice(nonColor[0].length);
          extra.push(notF({ is: 'color', value: COLORS[nonColor[1]] }));
        } else {
          const superMatch = s.match(/^(basic|legendary|snow|nonbasic|nonlegendary) /);
          if (superMatch) {
            s = s.slice(superMatch[0].length);
            const bare = superMatch[1].replace(/^non/, '');
            const f: CardFilter = { is: 'supertype', value: bare };
            extra.push(superMatch[1].startsWith('non') ? notF(f) : f);
          } else {
            const nonType = s.match(/^non(artifact|creature|land|enchantment|planeswalker) /);
            if (nonType) {
              s = s.slice(nonType[0].length);
              extra.push(notF({ is: 'type', value: nonType[1] }));
            } else {
              /*
               * "non-Human creature", "non-Vampire creature", "non-Aura
               * enchantment". Wizards hyphenates a negated SUBTYPE and runs a
               * negated type together ("noncreature"), so the hyphen is the
               * whole signal and the branch above cannot be widened to cover
               * this: `non([a-z]+)` would read "nonsnow" as a subtype called
               * snow and refuse nothing.
               *
               * It has to be a NEGATED filter, not a dropped word. Kinnan,
               * Bonder Prodigy puts "a non-Human creature card" onto the
               * battlefield; reading that as "a creature card" would let the
               * runtime offer Humans, which is a wrong ability rather than a
               * missing one, and this folder treats those as worse. The word
               * is checked against the subtype vocabulary so "non-gizmo"
               * still refuses the phrase, the way an unread head noun does.
               */
              const nonSub = s.match(/^non-([a-z]+) /);
              if (nonSub && SUBTYPES.has(nonSub[1])) {
                s = s.slice(nonSub[0].length);
                extra.push(notF({ is: 'subtype', value: nonSub[1] }));
              }
            }
          }
        }
      }
    }
    if (s === before) break;
  }
  s = s.trim();

  // "creature card" / "land card" — an object outside the battlefield.
  let isCard = false;
  if (/ cards?$/.test(s)) {
    // T3. The plural lives on "cards", and stripping the word threw it away.
    // "land cards in your graveyard" reported `each: false` while "lands you
    // control" reported `each: true`, so `parseValueExpr` refused every "the
    // number of X cards in your graveyard" in the pool — threshold counts,
    // delirium counts, and every Lhurgoyf-shaped creature. The bare "cards"
    // branch below already did this; the qualified one did not.
    if (/ cards$/.test(s)) each = true;
    s = s.replace(/ cards?$/, '');
    isCard = true;
  } else if (s === 'card' || s === 'cards') {
    each = each || s === 'cards';
    return finish({ is: 'any' }, true);
  }

  if (!s) return extra.length ? finish({ is: 'any' }, isCard) : null;

  // Head noun, possibly "artifact or enchantment" — or "artifacts and
  // enchantments", which names the SAME set. "The number of artifacts and
  // enchantments your opponents control" counts permanents that are either, not
  // permanents that are both, so the two connectives mean one thing in head
  // position and splitting on both is a rules identity, not a loosening.
  //
  // It cannot silently swallow a sentence, because every head still has to
  // parse: "destroy target creature and draw a card" splits to a second head of
  // "draw a card", whose first word is not a type, and the whole phrase is
  // refused exactly as it was before.
  //
  // AND ON COMMAS, for the same reason and with the same safety. A list of
  // three or more is written with them: "a Plains, Island, Swamp, or Mountain
  // card". By the time the phrase reaches here the articles, adjectives, zone
  // and controller suffixes and any "with ..." clause have all been stripped,
  // so a comma left in a head noun phrase is a list separator or the phrase was
  // never going to parse. Splitting cannot loosen anything, because every head
  // still has to be a type, supertype or subtype word and one that is not
  // refuses the whole phrase.
  //
  // Farseek is the card, ranked 23 in Commander, and it had NO ability record
  // at all: `singular('plains,')` is not a subtype, so the first head refused
  // and the compiler reported the whole card unread. Nature's Lore, Wood Elves
  // and every "basic land type" fetch are the same sentence.
  // The comma before the final "or" belongs to that "or" and not to the list,
  // so it has to be consumed with it. Splitting on ", " and " or " as separate
  // alternatives leaves a head of "or mountain", whose first word is not a type
  // and which therefore refuses the whole phrase — which is exactly what
  // Farseek did, with the split already in place.
  const heads = s.split(/,?\s+(?:or|and)\s+|,\s+/).map((h) => h.trim()).filter(Boolean);
  if (!heads.length) return null;

  const headFilters: CardFilter[] = [];
  for (const head of heads) {
    const words = head.split(' ').filter(Boolean);
    const parts: CardFilter[] = [];
    for (const word of words) {
      const w = singular(word);
      if (w !== word) each = true;
      if (w === 'permanent') { parts.push({ is: 'any' }); continue; }
      if (CARD_TYPES.includes(w)) { parts.push({ is: 'type', value: w }); continue; }
      if (SUPERTYPES.includes(w)) { parts.push({ is: 'supertype', value: w }); continue; }
      if (SUBTYPES.has(w)) { parts.push({ is: 'subtype', value: w }); continue; }
      return null; // an unread word. Refuse the phrase.
    }
    if (!parts.length) return null;
    headFilters.push(andF(...parts));
  }

  return finish(orF(...headFilters), isCard);

  function finish(head: CardFilter, card: boolean): ObjectRef {
    const filter = extra.length ? andF(head, ...extra) : head;
    const ref: ObjectRef = { filter, isCard: card, count, upTo, targeted, each: countBounded ? false : each };
    if (controller) ref.controller = controller;
    if (zone) ref.zone = zone;
    return ref;
  }
}

/** `ObjectRef` -> the `all` selector that matches it. */
export function objectSelector(ref: ObjectRef): Selector {
  const s: Selector = { sel: 'all', where: ref.filter };
  if (ref.controller) (s as { controller?: PlayerSelector }).controller = ref.controller;
  const zone = ref.zone ?? (ref.isCard ? undefined : 'battlefield');
  if (zone) (s as { zone?: Zone }).zone = zone;
  return s;
}

/* ------------------------------------------------------------------ *
 * Players
 * ------------------------------------------------------------------ */

/** Regex fragment matching any player phrase `parsePlayer` understands. */
export const PLAYER =
  '(?:you|each player|each opponent|each other player|target player|target opponent|' +
  'any opponent|an opponent|that player|its controller|its owner|the monarch|defending player)';

/**
 * A player phrase. `addTarget` is required only for the "target ..." forms; a
 * caller that has no target machinery passes `null` and those forms refuse.
 */
export function parsePlayer(
  input: string,
  addTarget: ((spec: Omit<TargetSpec, 'ref'>) => number) | null,
): PlayerSelector | null {
  const s = input.trim().toLowerCase().replace(/[.,]+$/, '');
  switch (s) {
    case 'you': return { who: 'you' };
    case 'each player':
    case 'all players':
    case 'each of the players':
      return { who: 'each-player' };
    case 'each opponent':
    case 'all opponents':
    case 'each of your opponents':
      return { who: 'each-opponent' };
    case 'each other player': return { who: 'each-opponent' };
    case 'defending player': return { who: 'defending' };
    case 'the monarch': return { who: 'monarch' };
    case 'target player':
      if (!addTarget) return null;
      return { who: 'target-player', ref: addTarget({ what: 'player', min: 1, max: 1, prompt: 'Choose target player' }) };
    case 'target opponent':
      if (!addTarget) return null;
      return {
        who: 'target-player',
        ref: addTarget({ what: 'player', min: 1, max: 1, controller: { who: 'each-opponent' }, prompt: 'Choose target opponent' }),
      };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * E9 — computed values
 *
 * `ValueExpr` and its evaluator (`context.ts`'s `evalValue`) were both finished
 * before this function existed. The gap E9 names was never the type space or
 * the runtime; it was here, in the front end: across the whole compiler exactly
 * ONE non-numeric `ValueExpr` was ever constructed — `{v:'x'}` — and `{v:'count'}`
 * was constructed zero times. Every "equal to the number of …" in the catalogue
 * therefore became a `{do:'manual'}` note while the machinery to express it sat
 * unused two files away.
 *
 * The same refusal discipline as everything else here: an amount phrase this
 * cannot read comes back `null`, and `null` becomes a counted gap. A quantity
 * guessed wrong is not a smaller version of the right answer — "draw cards
 * equal to the number of creatures you control" resolving as "draw 1" is a card
 * that looks like it worked.
 * ------------------------------------------------------------------ */

/** Player groups a value phrase can count. Longest first. */
const PLAYER_GROUP_COUNTS: Array<[RegExp, PlayerSelector]> = [
  [/^opponents you have$/, { who: 'each-opponent' }],
  [/^your opponents$/, { who: 'each-opponent' }],
  [/^opponents$/, { who: 'each-opponent' }],
  [/^players in the game$/, { who: 'each-player' }],
  [/^players$/, { who: 'each-player' }],
];

/** Life-total phrases. `~`-relative and "that player" forms are deliberately absent. */
const LIFE_TOTALS: Array<[RegExp, PlayerSelector]> = [
  [/^your life total$/, { who: 'you' }],
  [/^the number of life you have$/, { who: 'you' }],
];

/**
 * "mana value 3 or less" / "mana value 4 or greater" -> the filter, or `null`.
 *
 * Only the two closed spellings. "Mana value less than or equal to Alesha's
 * power" is a comparison against a computed value and stays refused rather
 * than rounded to a number, and "total mana value 6 or less" (Invoke Calamity)
 * is a bound on a SUM, which no filter on one card can say.
 */
export function parseManaValueBound(input: string): CardFilter | null {
  const m = input.trim().toLowerCase().match(/^mana value (.+?) or (less|greater)$/);
  if (!m) return null;
  const value = parseValueExpr(m[1]);
  if (value === null) return null;
  return { is: 'mana-value', cmp: m[2] === 'less' ? 'lte' : 'gte', value };
}

/**
 * A quantity phrase -> a `ValueExpr`, or `null` to refuse.
 *
 * Reads "3", "the number of creatures you control", "the number of artifacts
 * and enchantments your opponents control", "the number of cards in your hand",
 * "twice the number of Elves you control", "your life total" and "the number of
 * opponents you have".
 *
 * It deliberately does NOT read "its power", "that creature's toughness" or any
 * phrase whose subject is bound by an earlier sentence: resolving one of those
 * means guessing which object "it" was, and the whole point of a computed value
 * is that it is computed from something we can actually name.
 */
export function parseValueExpr(input: string): ValueExpr | null {
  const s = input.trim().toLowerCase().replace(/[.,]+$/, '');
  if (!s) return null;

  // A plain count, including "x" — which the caller may then rebind.
  const direct = parseCount(s);
  if (direct !== null) return direct;

  /* "~s power" — the SOURCE's own power, after `normalizeParagraph` has turned
   * "this creature's" into "~s". This is the one P/T phrase whose subject can
   * be named without guessing, which is exactly the line the comment above
   * draws: "its power" is refused because "it" was bound by a sentence this
   * function cannot see; "~" is bound by the card. Esper Sentinel's "{X}, where
   * X is this creature's power" is the shape, at rank 78. */
  const ownStat = s.match(/^~s (power|toughness)$/);
  if (ownStat) return { v: ownStat[1] as 'power' | 'toughness', of: { sel: 'self' } };

  // "The number of creatures that died this turn" is history, not board state.
  const history = parseWatchValue(s.replace(/^the number of /, ''));
  if (history) return history;

  for (const [re, who] of LIFE_TOTALS) if (re.test(s)) return { v: 'life', of: who };

  // Multipliers. "Half" is absent on purpose: "half X, rounded up" and "rounded
  // down" are different numbers and the phrase that says which is not always
  // in the same sentence.
  const scaled = s.match(/^(twice|three times) (.+)$/);
  if (scaled) {
    const inner = parseValueExpr(scaled[2]);
    if (inner === null) return null;
    return { v: 'mul', of: [scaled[1] === 'twice' ? 2 : 3, inner] };
  }

  const counted = s.match(/^the number of (.+)$/);
  if (!counted) return null;
  const what = counted[1].trim();

  for (const [re, who] of PLAYER_GROUP_COUNTS) if (re.test(what)) return { v: 'count-players', of: who };

  /* T3 — counters on the source. A PARITY GAP, not a new idea:
   * `parseForEachValue` has read "for each +1/+1 counter on ~" since it was
   * written and this function never learned the same phrase, so
   * "~ gets +1/+0 for each charge counter on ~" compiled and
   * "~'s power is equal to the number of charge counters on ~" did not. Ranked
   * over the pool by `scratch/t3phrases2.mjs`, the counter shapes are the
   * largest single refusal in "the number of …": +1/+1 (22 uses on `~`, 17 on
   * "it"), charge (17), verse (11), time (5), and a bare "counters on ~" (6).
   *
   * The subject list is `~` and `it` and nothing else, matching
   * `parseForEachValue` exactly. "The number of +1/+1 counters on that
   * creature" names a permanent an earlier sentence bound, and counting the
   * source's counters instead would be a confident wrong number. */
  const countersOnSelf = what.match(/^(\+\d+\/\+\d+|-\d+\/-\d+|[a-z]+) counters on (?:~|it)$/);
  if (countersOnSelf) return { v: 'counters', of: { sel: 'self' }, counter: countersOnSelf[1] };
  /* "The number of counters on ~" with no kind named. `Effect` and `ValueExpr`
   * both key a counter by its NAME, and there is no "any kind" wildcard, so
   * this one is refused rather than answered with the +1/+1 count. */

  const ref = parseObject(what);
  if (!ref) return null;
  // "The number of TARGET creatures" is not a thing, and a bound count phrase
  // ("the number of that creature") is a subject we cannot name.
  if (ref.targeted) return null;
  // Singular means the phrase named one specific object rather than a set —
  // counting a set we did not read is how a count comes back wrong.
  if (!ref.each) return null;
  return { v: 'count', of: objectSelector(ref) };
}

/**
 * "for each <thing>" -> the multiplier it names. Objects and player groups
 * both, because "you gain 1 life for each opponent" is as common as "for each
 * creature you control".
 */
export function parseForEachValue(input: string): ValueExpr | null {
  const s = input.trim().toLowerCase().replace(/[.,]+$/, '');
  if (!s) return null;
  const history = parseWatchValue(s);
  if (history) return history;
  for (const [re, who] of PLAYER_GROUP_COUNTS) {
    // "for each opponent" is singular where "the number of opponents" is plural.
    if (re.test(s) || re.test(s + 's')) return { v: 'count-players', of: who };
  }

  // "for each oil counter on it" / "for each +1/+1 counter on ~". The counter
  // lives on the SOURCE, and `{sel:'self'}` is the only subject this can name:
  // "on that creature" is bound by an earlier sentence and is refused, exactly
  // as `parseValueExpr` refuses "its power".
  const onSelf = s.match(/^(\+\d+\/\+\d+|-\d+\/-\d+|[a-z]+) counters? on (?:~|it)$/);
  if (onSelf) return { v: 'counters', of: { sel: 'self' }, counter: onSelf[1] };

  const ref = parseObject(s);
  if (!ref || ref.targeted) return null;
  // Unlike "the number of …", the plural check is NOT applied here. "For each"
  // is a set iteration by construction and the catalogue writes its noun
  // singular — "for each creature you control" — so demanding a plural would
  // refuse the ordinary spelling and accept only the rare one.
  return { v: 'count', of: objectSelector(ref) };
}

/* ------------------------------------------------------------------ *
 * E6 — history phrases
 *
 * "The number of creatures that died this turn" is not a board question. The
 * creatures are gone; nothing on the battlefield can be counted to answer it.
 * These phrases compile to `{v:'watch'}`, a declarative query over the action
 * log — see the `WatchQuery` block in `dsl.ts` for why it is a query rather
 * than a mutable watcher, and `src/lib/game/abilities/watch.ts` for the fold.
 *
 * ## What this is worth, honestly
 *
 * The catalogue's history phrases have a very flat tail: 56 distinct spellings
 * of "for each … this turn" across 135 rows, the largest single form appearing
 * 38 times and being storm's reminder text. The seven templates below are the
 * ones frequent enough and unambiguous enough to be worth a rule; everything
 * else is refused. This is a small unlock and it is reported as a small one.
 *
 * ## And what it does NOT buy
 *
 * A card compiling to `{v:'watch'}` becomes REPRESENTABLE. It does not become
 * automated: no caller folds a log yet, so the value evaluates to 0.
 * `unrunnableReason` therefore refuses to let the ability engine own such a
 * card, and `runEffects` emits a note naming the query. Both guards exist
 * precisely because 0 is a wrong answer that looks like a quiet one.
 * ------------------------------------------------------------------ */

/** The filter of an object phrase, but only if a past snapshot could answer it. */
function watchableObject(phrase: string): { filter: CardFilter; controller?: PlayerSelector } | null {
  const ref = parseObject(phrase);
  if (!ref || ref.targeted) return null;
  if (ref.zone && ref.zone !== 'battlefield') return null; // a zone phrase is not an event
  if (!isWatchableFilter(ref.filter)) return null;
  return ref.controller ? { filter: ref.filter, controller: ref.controller } : { filter: ref.filter };
}

const YOU: PlayerSelector = { who: 'you' };

/**
 * A "… this turn" phrase -> a `{v:'watch'}` expression, or `null` to refuse.
 *
 * Takes the noun phrase WITHOUT its "the number of" / "for each" prefix, so one
 * table serves both spellings.
 */
export function parseWatchValue(input: string): ValueExpr | null {
  const s = input.trim().toLowerCase().replace(/[.,]+$/, '');
  if (!/ this turn$/.test(s)) return null;
  const body = s.slice(0, -' this turn'.length).trim();
  if (!body) return null;

  const watch = (event: WatchedEvent, measure: 'events' | 'amount'): ValueExpr => ({
    v: 'watch',
    query: { event, window: 'this-turn', measure },
  });

  /* "creatures that died this turn", "nontoken creatures that died under your
     control this turn". */
  const died = body.match(/^(.+?) that died(?: under your control)?$/);
  if (died) {
    const object = watchableObject(died[1]);
    if (!object) return null;
    const controller = /under your control$/.test(body) ? YOU : object.controller;
    return watch(controller ? { saw: 'died', what: object.filter, controller } : { saw: 'died', what: object.filter }, 'events');
  }

  /* "creatures that attacked this turn". */
  const attacked = body.match(/^(.+?) that attacked$/);
  if (attacked) {
    const object = watchableObject(attacked[1]);
    if (!object) return null;
    return watch(
      object.controller ? { saw: 'attacked', what: object.filter, controller: object.controller } : { saw: 'attacked', what: object.filter },
      'events',
    );
  }

  /* "cards you've drawn this turn". `measure:'amount'` because one DRAW of
     three cards is three cards, not one event. */
  if (/^cards youve drawn$/.test(body)) return watch({ saw: 'drew', by: YOU }, 'amount');

  /* "spells you've cast this turn", "instant and sorcery spells you've cast
     this turn", "spells cast this turn". */
  const yourSpells = body.match(/^(?:(.+?) )?spells youve cast$/);
  if (yourSpells) {
    if (!yourSpells[1]) return watch({ saw: 'spell-cast', by: YOU }, 'events');
    const object = watchableObject(yourSpells[1]);
    if (!object) return null;
    return watch({ saw: 'spell-cast', what: object.filter, by: YOU }, 'events');
  }
  if (/^spells cast$/.test(body)) return watch({ saw: 'spell-cast' }, 'events');

  /* "tokens you created this turn". */
  if (/^tokens you created$/.test(body)) return watch({ saw: 'token-created', by: YOU }, 'amount');

  return null;
}

/* ------------------------------------------------------------------ *
 * Conditions — "as long as …", "during your turn"
 *
 * A continuous effect that only sometimes applies is not a different kind of
 * ability; it is an ordinary static ability with a `condition`, and
 * `scanStatics` already asks that condition before it hands the effect to the
 * layer engine. So the whole of "as long as" is a phrase parser, and it lands in
 * this file beside the other four fragments for the same reason they are here:
 * one condition table, and every static rule composes with it for free.
 *
 * ## What is refused, and why the refusals are the interesting half
 *
 * Three shapes are common in the catalogue and all three come back `null`:
 *
 *   "as long as ~ is untapped"      — a fact about the SOURCE's own state.
 *                                     `Condition` has no member that reads it,
 *                                     and `{if:'count', of:{sel:'all', where:
 *                                     {is:'untapped'}}}` counts every untapped
 *                                     permanent on the table instead.
 *   "as long as you gained life
 *    this turn"                     — turn history. It would compile to
 *                                     `{v:'watch'}`, which evaluates to 0 with
 *                                     no log to fold, and 0 here reads as "the
 *                                     ability is switched off" — a wrong answer
 *                                     wearing the clothes of a quiet one.
 *   "as long as your devotion to
 *    blue is less than five"        — devotion is not in the value vocabulary.
 *
 * Each of those is a `null`, which the caller turns into a counted gap. None of
 * them is approximated, because an anthem that silently never switches on and
 * an anthem that silently never switches off are both worse than an anthem the
 * report says is missing.
 * ------------------------------------------------------------------ */

const YOU_PLAYER: PlayerSelector = { who: 'you' };

/** "three or more" / "one or fewer" / "no" / "exactly two" -> a bound. */
function parseBound(phrase: string): { cmp: Cmp; value: ValueExpr; rest: string } | null {
  const s = phrase.trim();

  const noneOf = s.match(/^no (.+)$/);
  if (noneOf) return { cmp: 'eq', value: 0, rest: noneOf[1] };

  const exactly = s.match(new RegExp(`^exactly (${NUM}) (.+)$`));
  if (exactly) {
    const n = parseCount(exactly[1]);
    return n === null ? null : { cmp: 'eq', value: n, rest: exactly[2] };
  }

  const bounded = s.match(new RegExp(`^(${NUM}) or (more|greater|fewer|less) (.+)$`));
  if (bounded) {
    const n = parseCount(bounded[1]);
    if (n === null) return null;
    const cmp: Cmp = bounded[2] === 'more' || bounded[2] === 'greater' ? 'gte' : 'lte';
    return { cmp, value: n, rest: bounded[3] };
  }

  // No quantifier at all: "you control an artifact" means one or more.
  return { cmp: 'gte', value: 1, rest: s };
}

/** Zone phrases a condition may count cards in. Only the ones a player owns. */
const CONDITION_ZONES: Array<[RegExp, Zone]> = [
  [/^in your graveyard$/, 'graveyard'],
  [/^in your hand$/, 'hand'],
  [/^in hand$/, 'hand'],
];

/**
 * An "as long as …" phrase -> a `Condition`, or `null` to refuse.
 *
 * Reads the shapes the catalogue actually writes most often:
 *
 *   "you control an artifact"                     -> controls, one or more
 *   "you control three or more artifacts"         -> controls, bounded
 *   "you control no untapped lands"               -> controls, zero
 *   "there are seven or more cards in your
 *    graveyard"                                   -> cards-in graveyard
 *   "you have one or fewer cards in hand"         -> cards-in hand
 *   "you have 25 or more life"                    -> life total
 *   "it's your turn"                              -> your-turn
 */
export function parseCondition(input: string): Condition | null {
  const s = input.trim().toLowerCase().replace(/[.,]+$/, '');
  if (!s) return null;

  if (/^(its|it is) your turn$/.test(s)) return { if: 'your-turn' };
  /* "If it's not your turn" — the Force cycle's gate (Force of Negation, rank
     265). The positive form was already read; the negation is the same fact
     wrapped once, and `{if:'not'}` is exactly the wrapper. */
  if (/^(its|it is) not your turn$/.test(s)) return { if: 'not', of: { if: 'your-turn' } };

  /* "You control a commander" — the free-spell cycle's gate.
     ------------------------------------------------------------------
     `parseObject` has no head noun for "commander": it is not a card type, and
     teaching the workhorse a pseudo-type would make "commander creatures you
     control" (Bastion Protector) and "target commander" parse through a loop
     that has never seen the word as an adjective. The condition is one fixed
     sentence, so it is read here as one fixed sentence. The filter it lands on
     is `{is:'commander'}`, which the runtime already answers from
     `card.isCommander` (`context.ts`). */
  if (/^you control a commander$/.test(s)) {
    return { if: 'controls', who: YOU_PLAYER, what: { is: 'commander' }, cmp: 'gte', value: 1 };
  }

  /* "you have 25 or more life". */
  const life = s.match(new RegExp(`^you have (${NUM}) or (more|greater|fewer|less) life$`));
  if (life) {
    const n = parseCount(life[1]);
    if (n === null) return null;
    const cmp: Cmp = life[2] === 'more' || life[2] === 'greater' ? 'gte' : 'lte';
    return { if: 'value', a: { v: 'life', of: YOU_PLAYER }, cmp, b: n };
  }

  /* "you have no cards in hand", "you have one or fewer cards in hand". */
  const have = s.match(/^you have (.+)$/);
  if (have) {
    const bound = parseBound(have[1]);
    if (bound) {
      const zoned = bound.rest.match(/^cards? (in .+)$/);
      if (zoned) {
        for (const [re, zone] of CONDITION_ZONES) {
          if (re.test(zoned[1])) {
            return { if: 'value', a: { v: 'cards-in', zone, of: YOU_PLAYER }, cmp: bound.cmp, b: bound.value };
          }
        }
      }
    }
    /* "you have two or more opponents".
       ------------------------------------------------------------------
       The Battlebond and Commander Legends duals — Morphic Pool (rank 142),
       Rejuvenating Springs (143), Training Center (151), Spectator Seating,
       Undergrowth Stadium and their siblings, ten of them inside the 200 most
       played cards in the format. Every one entered UNTAPPED every time,
       because the "unless" reading in `parseReplacement` refuses a condition it
       cannot parse rather than downgrading it, and this was one it could not
       parse. In Commander the condition is true at almost every table, so the
       lands were also playing close to correctly by accident, which is why it
       went unnoticed: the record said nothing at all about a card that behaves
       right nine games in ten.

       `count-players` was already in the value vocabulary. */
    if (bound) {
      const opponents = bound.rest.match(/^opponents?$/);
      if (opponents) {
        return {
          if: 'value',
          a: { v: 'count-players', of: { who: 'each-opponent' } },
          cmp: bound.cmp,
          b: bound.value,
        };
      }
    }

    // Anything else after "you have" is a keyword-counter or a designation
    // ("an enduring story", "the initiative"), none of which is in the value
    // vocabulary. Refused rather than guessed.
    return null;
  }

  /* "there are seven or more cards in your graveyard" and its typed cousin
     "there are four or more permanent cards in your graveyard". */
  const thereAre = s.match(/^there (?:are|is) (.+)$/);
  if (thereAre) {
    const bound = parseBound(thereAre[1]);
    if (!bound) return null;
    const bare = bound.rest.match(/^cards? (in .+)$/);
    if (bare) {
      for (const [re, zone] of CONDITION_ZONES) {
        if (re.test(bare[1])) {
          return { if: 'value', a: { v: 'cards-in', zone, of: YOU_PLAYER }, cmp: bound.cmp, b: bound.value };
        }
      }
      return null;
    }
    // A typed phrase — `parseObject` owns the zone suffix, so it reads
    // "permanent cards in your graveyard" whole.
    const ref = parseObject(bound.rest);
    if (!ref || ref.targeted || !ref.zone) return null;
    return { if: 'count', of: objectSelector(ref), cmp: bound.cmp, value: bound.value };
  }

  /* "<player> control(s) <object>". The controller is stated by the sentence,
     never inferred: "an opponent controls an artifact" and "you control an
     artifact" switch opposite abilities on. */
  const controls = s.match(/^(you|an opponent|each opponent|your opponents|a player|each player) controls? (.+)$/);
  if (controls) {
    const who: PlayerSelector | null =
      controls[1] === 'you' ? { who: 'you' }
      : controls[1] === 'a player' || controls[1] === 'each player' ? { who: 'each-player' }
      : { who: 'each-opponent' };
    const bound = parseBound(controls[2]);
    if (!bound) return null;
    /*
     * THE EVALUATOR SUMS. `{if:'controls'}` counts the battlefield of every
     * player `who` resolves to, so for anyone but "you" the count is the
     * TABLE's and not one opponent's. Whether that is the sentence depends on
     * the quantifier, and it has to be checked here because the DSL has no
     * way to say "any one of them":
     *
     *   an opponent controls an artifact          sum >= 1  <=>  somebody has one   sound
     *   an opponent controls three or more         sum >= 3  three opponents with one each   WRONG
     *   your opponents control no creatures        sum == 0  <=>  none of them has one   sound
     *   each opponent controls a creature          sum >= 1  one opponent with three  WRONG
     *
     * Defense of the Heart (rank 1302) reads "if an opponent controls three or
     * more creatures", and once an intervening "if" rides on a trigger a
     * loosened condition is not a subscore — it puts two creatures onto the
     * battlefield at the wrong time. Refused until the DSL can quantify.
     */
    if (controls[1] !== 'you') {
      const existential = controls[1] === 'an opponent' || controls[1] === 'a player';
      const collective = controls[1] === 'your opponents';
      const isZero = bound.cmp === 'eq' && bound.value === 0;
      const isOneOrMore = bound.cmp === 'gte' && bound.value === 1;
      if (!(collective || isZero || (existential && isOneOrMore))) return null;
    }
    const ref = parseObject(bound.rest);
    // A zone phrase inside "controls" is not a thing anyone controls, and a
    // targeted phrase is not a continuous condition.
    if (!ref || ref.targeted || (ref.zone && ref.zone !== 'battlefield')) return null;
    // "you control another creature" is about the source's peers; `{is:'other'}`
    // is resolved against the source and `{if:'controls'}` has no source to
    // compare against, so it would count the source itself. Refused.
    if (JSON.stringify(ref.filter).includes('"other"')) return null;
    if (ref.controller) return null; // "you control creatures you control" is not a sentence
    return { if: 'controls', who, what: ref.filter, cmp: bound.cmp, value: bound.value };
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * E8 — conditional mana (CR 106.6)
 * ------------------------------------------------------------------ */

/**
 * "Spend this mana only to cast artifact spells" -> the restriction, or `null`.
 *
 * Four templates cover the clear majority of the 164 occurrences in the
 * catalogue. Everything else — "only on costs that contain {X}", "only to pay
 * cumulative upkeep costs", "only to cast a creature spell of the chosen type"
 * — is refused, because a restriction read loosely is worse than none at all:
 * mana that should have been locked to creatures paying for a counterspell is
 * exactly the silent upgrade this extension exists to prevent.
 */
export function parseManaSpendRestriction(input: string): ManaSpendRestriction | null {
  const raw = input.trim().replace(/[.]+$/, '');
  const s = raw.toLowerCase();

  const only = s.match(/^spend this mana only to (.+)$/);
  if (!only) return null;
  const rest = only[1].trim();

  if (rest === 'activate abilities') return { spendOn: 'activate', text: raw };
  if (rest === 'cast spells') return { spendOn: 'cast', text: raw };

  // "cast artifact spells or activate abilities of artifacts" — one filter, two
  // permitted uses. The two noun phrases must AGREE; a card that let creature
  // mana activate artifact abilities would be a different card.
  const both = rest.match(/^cast (.+?) spells? or activate (?:an )?abilit(?:y|ies) of (?:an? )?(.+?)(?: source)?$/);
  if (both) {
    const spell = parseObject(both[1]);
    const source = parseObject(both[2]);
    if (!spell || !source || spell.targeted || source.targeted) return null;
    if (JSON.stringify(spell.filter) !== JSON.stringify(source.filter)) return null;
    return { spendOn: 'cast-or-activate', what: spell.filter, text: raw };
  }

  const cast = rest.match(/^cast (.+?) spells?$/);
  if (cast) {
    const ref = parseObject(cast[1]);
    if (!ref || ref.targeted) return null;
    return { spendOn: 'cast', what: ref.filter, text: raw };
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Durations
 * ------------------------------------------------------------------ */

/**
 * Only the four the DSL can express. "Until end of combat" and "until your next
 * end step" are the declared `duration` gap and must come back `null` so the
 * caller reports a gap instead of silently rounding them to end of turn.
 */
export function parseDuration(input: string): Duration | null {
  switch (input.trim().toLowerCase()) {
    case 'until end of turn': return 'end-of-turn';
    case 'until your next turn': return 'your-next-turn';
    case 'for as long as you control ~': return 'while-source-on-battlefield';
    case '': return 'permanent';
    default: return null;
  }
}

/* ------------------------------------------------------------------ *
 * Target registration
 * ------------------------------------------------------------------ */

/**
 * Turns a parsed "target ..." noun phrase into a `TargetSpec` and returns the
 * `{sel:'target'}` that points at it. `min`/`max` carry "up to" faithfully so
 * the announce step offers the right cardinality.
 */
export function registerTarget(
  ref: ObjectRef,
  addTarget: (spec: Omit<TargetSpec, 'ref'>) => number,
  prompt: string,
): Selector {
  const n = typeof ref.count === 'number' ? ref.count : 1;
  const spec: Omit<TargetSpec, 'ref'> = {
    what: 'card',
    filter: ref.filter,
    min: ref.upTo ? 0 : n,
    max: n,
    prompt,
  };
  if (ref.zone) spec.zone = ref.zone;
  else if (!ref.isCard) spec.zone = 'battlefield';
  if (ref.controller) spec.controller = ref.controller;
  if (n > 1) spec.distinct = true;
  return { sel: 'target', ref: addTarget(spec) };
}
