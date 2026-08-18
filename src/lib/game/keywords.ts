/**
 * DeckMatrix — shared game-state core: keyword abilities.
 *
 * Magic's rules are Turing-complete and every card can rewrite them, so a
 * complete rules engine is not a thing this project is going to have. Keyword
 * abilities are the opposite: a **closed, finite set** with fixed meanings that
 * never change from card to card. That makes them the one part of the rules we
 * can implement properly, and this module is where the closed set lives.
 *
 * Three things happen here and nowhere else:
 *
 *  1. **What a permanent's keywords actually are right now.** Printed keywords
 *     come off the Scryfall row (`CardInstance.keywords`). On top of those sit
 *     `grantedKeywords` — flagged by hand, or by a lord the engine cannot read —
 *     and `suppressedKeywords`, for a printed keyword the player has switched
 *     off. `effectiveKeywords` folds all three, and `hasKeyword` is the only
 *     question the rest of the engine asks.
 *
 *  2. **Which keywords the engine actually enforces**, stated out loud rather
 *     than left for a player to discover. `ENGINE_KEYWORDS` is the honest list;
 *     `keywordSupport` answers 'engine' or 'advisory' for anything else. A
 *     player flagging "ward" on a creature gets a badge and nothing more, and
 *     the UI is expected to say so — a keyword that looks enforced but is not is
 *     exactly the silent-no-op bug this work exists to kill.
 *
 *  3. **Protection**, which is the one keyword whose meaning is parameterised.
 *     Scryfall's `keywords` array says only "Protection"; the quality lives in
 *     oracle text ("protection from red"). `protectionQualities` reads it back
 *     out, and `hasProtectionFrom` answers the two questions combat needs:
 *     can this creature block that one, and is that damage prevented.
 *
 * Pure: no clock, no randomness, no React, no I/O. Everything takes a
 * `CardInstance` and returns a value.
 */

import type { CardInstance, ManaColor } from './types.ts';

/* -------------------------------------------------------------------------- */
/* The closed set                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Keywords whose rules `combat.ts` (and the block/attack legality helpers)
 * genuinely apply. Anything here changes what the engine does.
 *
 * `hexproof` and `shroud` are in the list because `canBeTargetedBy` enforces
 * them for any manual targeting the UI offers. The engine has no stack and no
 * automatic targeting, so they gate a target picker rather than a spell.
 */
export const ENGINE_KEYWORDS = [
  'flying',
  'reach',
  'menace',
  'trample',
  'deathtouch',
  'first strike',
  'double strike',
  'lifelink',
  'vigilance',
  'defender',
  'indestructible',
  'hexproof',
  'shroud',
  'protection',
  'haste',
] as const;

export type EngineKeyword = (typeof ENGINE_KEYWORDS)[number];

/**
 * Keywords worth offering in a manual flag menu but which the engine does NOT
 * act on. They render as a badge and a reminder, nothing else.
 *
 * They are listed rather than left open-ended so the UI can label them
 * truthfully: every one of these needs the player to resolve it by hand.
 */
export const ADVISORY_KEYWORDS = [
  'flash',
  'ward',
  'prowess',
  'exalted',
  'annihilator',
  'afflict',
  'banding',
  'battle cry',
  'bushido',
  'cascade',
  'convoke',
  'crew',
  'cycling',
  'dredge',
  'echo',
  'equip',
  'evolve',
  'fear',
  'flanking',
  'horsemanship',
  'infect',
  'intimidate',
  'islandwalk',
  'forestwalk',
  'mountainwalk',
  'plainswalk',
  'swampwalk',
  'melee',
  'modular',
  'myriad',
  'persist',
  'phasing',
  'protection from everything',
  'rampage',
  'skulk',
  'storm',
  'toxic',
  'undying',
  'unleash',
  'vanishing',
  'wither',
] as const;

/** Every keyword a player may flag by hand, engine-backed ones first. */
export const FLAGGABLE_KEYWORDS: readonly string[] = [
  ...ENGINE_KEYWORDS,
  ...ADVISORY_KEYWORDS,
];

export type KeywordSupport = 'engine' | 'advisory';

const ENGINE_SET = new Set<string>(ENGINE_KEYWORDS);
const ADVISORY_SET = new Set<string>(ADVISORY_KEYWORDS);

export function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase();
}

/**
 * 'engine' when applying this keyword changes what the rules core does,
 * 'advisory' when it is a badge and a reminder to the player. Unknown keywords
 * are advisory — the honest answer, never silently "supported".
 */
export function keywordSupport(keyword: string): KeywordSupport {
  const key = normalizeKeyword(keyword);
  if (ENGINE_SET.has(key)) return 'engine';
  if (ADVISORY_SET.has(key)) return 'advisory';
  // Protection is parameterised: "protection from red" is still protection.
  if (key.startsWith('protection')) return 'engine';
  return 'advisory';
}

export function isEngineKeyword(keyword: string): boolean {
  return keywordSupport(keyword) === 'engine';
}

/* -------------------------------------------------------------------------- */
/* What a permanent has right now                                             */
/* -------------------------------------------------------------------------- */

/**
 * Printed keywords, plus anything granted by hand, minus anything switched off.
 *
 * Returned lower-cased and de-duplicated, in a stable order (printed first,
 * then granted) so a UI can render it without sorting and two clients never
 * disagree about the list.
 */
export function effectiveKeywords(card: CardInstance | null | undefined): string[] {
  if (!card) return [];
  const suppressed = new Set((card.suppressedKeywords ?? []).map(normalizeKeyword));
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const key = normalizeKeyword(raw);
    if (!key || seen.has(key) || suppressed.has(key)) return;
    seen.add(key);
    out.push(key);
  };

  for (const keyword of card.keywords ?? []) push(keyword);
  for (const keyword of card.grantedKeywords ?? []) push(keyword);
  return out;
}

/**
 * The single keyword question the rest of the engine asks.
 *
 * Matches on the folded list, so a hand-flagged "flying" is indistinguishable
 * from a printed one — which is the point of the manual controls.
 */
export function hasKeyword(card: CardInstance | null | undefined, keyword: string): boolean {
  if (!card) return false;
  const wanted = normalizeKeyword(keyword);
  return effectiveKeywords(card).some(k => k === wanted);
}

/** True when the player has hand-flagged this keyword rather than the card printing it. */
export function isGrantedKeyword(card: CardInstance | null | undefined, keyword: string): boolean {
  if (!card) return false;
  const wanted = normalizeKeyword(keyword);
  const printed = (card.keywords ?? []).map(normalizeKeyword);
  const granted = (card.grantedKeywords ?? []).map(normalizeKeyword);
  return granted.includes(wanted) && !printed.includes(wanted);
}

/**
 * Apply one flag toggle to a card's keyword lists.
 *
 * Turning a keyword ON that the card already prints is a no-op; turning one OFF
 * that it prints records a suppression, because the printed array is copied
 * from the card row and must not be rewritten.
 */
export function toggleKeyword(
  card: CardInstance,
  keyword: string,
  on: boolean
): Pick<CardInstance, 'grantedKeywords' | 'suppressedKeywords'> {
  const key = normalizeKeyword(keyword);
  const printed = (card.keywords ?? []).map(normalizeKeyword);
  const granted = (card.grantedKeywords ?? []).map(normalizeKeyword);
  const suppressed = (card.suppressedKeywords ?? []).map(normalizeKeyword);

  if (on) {
    return {
      grantedKeywords: printed.includes(key) || granted.includes(key) ? granted : [...granted, key],
      suppressedKeywords: suppressed.filter(k => k !== key),
    };
  }

  return {
    grantedKeywords: granted.filter(k => k !== key),
    suppressedKeywords:
      printed.includes(key) && !suppressed.includes(key) ? [...suppressed, key] : suppressed,
  };
}

/* -------------------------------------------------------------------------- */
/* Protection                                                                 */
/* -------------------------------------------------------------------------- */

const COLOR_WORDS: Record<string, ManaColor> = {
  white: 'W',
  blue: 'U',
  black: 'B',
  red: 'R',
  green: 'G',
};

/** A quality protection can be from. `everything` is CR 702.16e. */
export type ProtectionQuality =
  | { kind: 'color'; color: ManaColor }
  | { kind: 'everything' }
  | { kind: 'creatures' }
  | { kind: 'other'; label: string };

const PROTECTION_RE = /protection from ([a-z][a-z' -]*)/g;

/**
 * Read protection qualities out of oracle text.
 *
 * Scryfall's `keywords` array carries the bare word "Protection" and nothing
 * else, so the quality has to come from the text. Anything this cannot classify
 * is returned as `other` and treated as *not* granting protection in combat —
 * a false "damage prevented" is worse than making the player click.
 */
export function protectionQualities(card: CardInstance | null | undefined): ProtectionQuality[] {
  if (!card) return [];
  const out: ProtectionQuality[] = [];
  const seen = new Set<string>();

  const record = (quality: ProtectionQuality, key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push(quality);
  };

  // Hand-flagged "protection from red" arrives on grantedKeywords, printed
  // protection arrives in oracle text — read both.
  const sources = [
    (card.oracleText ?? '').toLowerCase(),
    ...(card.grantedKeywords ?? []).map(normalizeKeyword),
  ];

  for (const source of sources) {
    PROTECTION_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PROTECTION_RE.exec(source)) !== null) {
      const raw = match[1].trim();
      if (raw.startsWith('everything')) {
        record({ kind: 'everything' }, 'everything');
        continue;
      }
      const first = raw.split(/[ ,]/)[0];
      if (COLOR_WORDS[first]) {
        record({ kind: 'color', color: COLOR_WORDS[first] }, `c:${COLOR_WORDS[first]}`);
        continue;
      }
      if (first === 'creatures') {
        record({ kind: 'creatures' }, 'creatures');
        continue;
      }
      record({ kind: 'other', label: raw }, `o:${raw}`);
    }
  }

  return out;
}

/**
 * Would `protected` be protected from `source`?
 *
 * Colour comes from `colorIdentity`, which is a deliberate approximation: for a
 * creature the two almost always agree, and the alternative is oracle-parsing a
 * colour, which is worse. Documented rather than hidden — a hybrid or a card
 * whose identity exceeds its colour can read wrong here.
 */
export function hasProtectionFrom(
  protectedCard: CardInstance | null | undefined,
  source: CardInstance | null | undefined
): boolean {
  if (!protectedCard || !source) return false;
  const qualities = protectionQualities(protectedCard);
  if (qualities.length === 0) return false;

  const sourceColors = new Set(source.colorIdentity ?? []);
  const sourceIsCreature = (source.typeLine ?? '').toLowerCase().includes('creature');

  return qualities.some(quality => {
    switch (quality.kind) {
      case 'everything':
        return true;
      case 'creatures':
        return sourceIsCreature;
      case 'color':
        return sourceColors.has(quality.color);
      case 'other':
        // Unclassified quality: the player resolves it, the engine does not guess.
        return false;
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Targeting                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Whether a manual target picker should offer this permanent.
 *
 * There is no stack and nothing here targets automatically, so this exists for
 * the UI: a hexproof creature is not offered to an opponent, a shrouded one is
 * offered to nobody.
 */
export function canBeTargetedBy(
  card: CardInstance | null | undefined,
  byPlayerId: string,
  source?: CardInstance | null
): boolean {
  if (!card) return false;
  if (hasKeyword(card, 'shroud')) return false;
  if (hasKeyword(card, 'hexproof') && card.controllerId !== byPlayerId) return false;
  if (source && hasProtectionFrom(card, source)) return false;
  return true;
}
