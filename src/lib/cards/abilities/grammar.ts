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
  Duration,
  ManaColor,
  PlayerSelector,
  Selector,
  TargetSpec,
  ValueExpr,
  Zone,
} from './dsl.ts';
import { andF, notF, orF } from './dsl.ts';

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
    if (/^(\{[^}]+\}|\{[^}]+\}\{[^}]+\}|\d+|from [a-z ]+|-\d+\/-\d+|\+\d+\/\+\d+)$/.test(rest)) {
      return { keyword: k, parameter: rest };
    }
    return null;
  }
  return null;
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

/** Irregular plurals oracle text actually uses. `s`-stripping handles the rest. */
const PLURALS: Record<string, string> = {
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

  // " with flying" / " without flying".
  const withMatch = s.match(/ (with|without) ([a-z ]+)$/);
  if (withMatch) {
    const kws = parseKeywordList(withMatch[2]);
    if (!kws) return null; // "with a +1/+1 counter on it", "with mana value 3 or less" — not modelled
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
      if (typeof n === 'number' && n > 1) each = false;
      s = s.slice(numMatch[0].length);
    }
  }

  // Articles and universals.
  for (;;) {
    if (/^(a|an|the) /.test(s)) { s = s.replace(/^(a|an|the) /, ''); continue; }
    if (/^(all|each|every) /.test(s)) { s = s.replace(/^(all|each|every) /, ''); each = true; continue; }
    if (/^any number of /.test(s)) { s = s.replace(/^any number of /, ''); each = true; continue; }
    if (/^target /.test(s)) { s = s.replace(/^target /, ''); targeted = true; continue; }
    break;
  }

  // Adjectives. Loop so "another tapped artifact creature" peels fully.
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
            }
          }
        }
      }
    }
    if (s === before) break;
  }

  // "creature card" / "land card" — an object outside the battlefield.
  let isCard = false;
  if (/ cards?$/.test(s)) {
    s = s.replace(/ cards?$/, '');
    isCard = true;
  } else if (s === 'card' || s === 'cards') {
    each = each || s === 'cards';
    return finish({ is: 'any' }, true);
  }

  if (!s) return extra.length ? finish({ is: 'any' }, isCard) : null;

  // Head noun, possibly "artifact or enchantment".
  const heads = s.split(/ or /).map((h) => h.trim()).filter(Boolean);
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
    const ref: ObjectRef = { filter, isCard: card, count, upTo, targeted, each };
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
