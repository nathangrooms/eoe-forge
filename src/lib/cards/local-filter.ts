/**
 * Client-side evaluation of a `CardSearchState`.
 *
 * `buildScryfallQuery` turns the shared filter state into a query string for
 * Scryfall. That is exactly right for the card-search surfaces, and useless for
 * the Collection, the Wishlist and the price watchlist: those already hold
 * their rows, and the answer has to come from the rows themselves.
 *
 * So the same `CardSearchState` gets a second interpreter. One filter UI, two
 * back ends — which is the only way "the best filter on every page" can be
 * literally the same filter rather than a lookalike that drifts.
 *
 * Anything the remote query understands and this does not is documented at the
 * point where it is dropped, rather than silently ignored.
 */

import type {
  CardSearchState,
  ColorMatchMode,
  ColorOption,
} from '@/lib/scryfall/query-builder';
import {
  getColorIdentity,
  getColors,
  getManaCost,
  getOracleText,
  getSetCode,
  getSetName,
  getTypeLine,
} from '@/lib/scryfall/card-utils';

/* ================================================================== *
 * The normalized row
 * ================================================================== */

export interface LocalCardFlags {
  foil?: boolean;
  nonfoil?: boolean;
  promo?: boolean;
  reprint?: boolean;
  reserved?: boolean;
  showcase?: boolean;
}

/**
 * Every field the filter can ask about, normalized once so the predicate never
 * has to know whether a row came from Scryfall (`set`, `card_faces`) or from
 * our own `cards` table (`set_code`, `faces`).
 */
export interface LocalCard {
  name: string;
  typeLine: string;
  oracleText: string;
  manaCost: string;
  cmc: number;
  /** Uppercase WUBRG. */
  colors: string[];
  colorIdentity: string[];
  rarity: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  legalities: Record<string, string>;
  /** Cheapest listed USD price, or null when the printing is unpriced. */
  usd: number | null;
  power: number | null;
  toughness: number | null;
  loyalty: number | null;
  artist: string;
  language: string;
  games: string[];
  keywords: string[];
  releasedAt: string;
  edhrecRank: number | null;
  flags: LocalCardFlags;
}

const num = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  // '*' and '1+*' are real printed values that are not numbers; a range filter
  // simply cannot speak about them, so they read as absent rather than as 0.
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
};

const priceOf = (prices: any): number | null => {
  if (!prices) return null;
  for (const key of ['usd', 'usd_foil', 'usd_etched']) {
    const n = num(prices[key]);
    if (n != null) return n;
  }
  return null;
};

/**
 * Normalize any card-ish object into the shape the predicate reads.
 *
 * `overrides` exists for surfaces that know something the card object does not
 * — a wishlist row's own price target, a collection row's owned price.
 */
export function toLocalCard(raw: any, overrides: Partial<LocalCard> = {}): LocalCard {
  const card = raw ?? {};

  return {
    name: String(card.name ?? ''),
    typeLine: getTypeLine(card),
    oracleText: getOracleText(card),
    manaCost: getManaCost(card),
    cmc: num(card.cmc) ?? 0,
    colors: getColors(card),
    colorIdentity: getColorIdentity(card),
    rarity: String(card.rarity ?? '').toLowerCase(),
    setCode: getSetCode(card).toLowerCase(),
    setName: getSetName(card),
    collectorNumber: String(card.collector_number ?? ''),
    legalities: (card.legalities ?? {}) as Record<string, string>,
    usd: priceOf(card.prices),
    power: num(card.power),
    toughness: num(card.toughness),
    loyalty: num(card.loyalty),
    artist: String(card.artist ?? ''),
    language: String(card.lang ?? card.language ?? '').toLowerCase(),
    games: Array.isArray(card.games) ? card.games.map((g: string) => String(g)) : [],
    keywords: Array.isArray(card.keywords) ? card.keywords.map((k: string) => String(k)) : [],
    releasedAt: String(card.released_at ?? ''),
    edhrecRank: num(card.edhrec_rank),
    flags: {
      foil: Boolean(card.foil),
      nonfoil: Boolean(card.nonfoil),
      promo: Boolean(card.promo),
      reprint: Boolean(card.reprint),
      reserved: Boolean(card.reserved),
      showcase:
        Array.isArray(card.frame_effects) && card.frame_effects.includes('showcase'),
    },
    ...overrides,
  };
}

/* ================================================================== *
 * Colours
 * ================================================================== */

const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

function matchColorSet(
  cardColors: string[],
  selection: ColorOption[],
  mode: ColorMatchMode,
  /** Colour identity has no "multicolour" axis, and its `:` means "at most". */
  axis: 'colors' | 'identity'
): boolean {
  const letters = selection.filter(c => (WUBRG as readonly string[]).includes(c));
  const wantsColorless = selection.includes('C');
  const wantsMulti = axis === 'colors' && selection.includes('M');

  // The pseudo-colours are their own predicates, OR-ed with the letters exactly
  // as `colorTokens` OR-s the tokens it emits.
  if (wantsColorless && cardColors.length === 0) return true;
  if (wantsMulti && cardColors.length >= 2) return true;

  if (letters.length === 0) return false;

  const has = (c: string) => cardColors.includes(c);
  const effective: ColorMatchMode =
    mode ?? (axis === 'identity' ? 'atmost' : 'any');

  switch (effective) {
    case 'exact':
      return (
        cardColors.length === letters.length && letters.every(has)
      );
    case 'atleast':
      return letters.every(has);
    case 'atmost':
      return cardColors.every(c => letters.includes(c as ColorOption));
    case 'any':
    default:
      // `id:` is read by Scryfall as "at most"; `c:` as "any of". The filter
      // panel labels them exactly that way, so the local reading matches the
      // words on screen.
      return axis === 'identity'
        ? cardColors.every(c => letters.includes(c as ColorOption))
        : letters.some(has);
  }
}

/* ================================================================== *
 * Free-text — a usable subset of Scryfall syntax, evaluated locally
 * ================================================================== */

/** Split on whitespace, keeping "quoted phrases" intact. */
function tokenize(input: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) out.push(m[1] != null ? `"${m[1]}"` : m[2]);
  return out;
}

const unquote = (s: string) => s.replace(/^"(.*)"$/s, '$1');

function compare(actual: number | null, op: string, expected: number): boolean {
  if (actual == null) return false;
  switch (op) {
    case '>':
      return actual > expected;
    case '<':
      return actual < expected;
    case '>=':
      return actual >= expected;
    case '<=':
      return actual <= expected;
    case '!=':
      return actual !== expected;
    default:
      return actual === expected;
  }
}

const RARITY_WORD: Record<string, string> = {
  c: 'common',
  u: 'uncommon',
  r: 'rare',
  m: 'mythic',
  common: 'common',
  uncommon: 'uncommon',
  rare: 'rare',
  mythic: 'mythic',
};

/**
 * Evaluate one `key:value` token against a card.
 *
 * Returns `null` for a key this interpreter does not implement, which the
 * caller turns into a plain name match — an unknown token narrows the results
 * instead of being silently dropped, so nobody gets a result set that quietly
 * ignores half of what they typed.
 */
function matchToken(card: LocalCard, token: string): boolean | null {
  const m = /^([a-zA-Z]+)(>=|<=|!=|=|>|<|:)(.*)$/.exec(token);
  if (!m) return null;

  const key = m[1].toLowerCase();
  const op = m[2];
  const value = unquote(m[3]);
  const lower = value.toLowerCase();
  const expected = Number(value);

  switch (key) {
    case 'name':
    case 'n':
      return card.name.toLowerCase().includes(lower);
    case 'type':
    case 't':
      return card.typeLine.toLowerCase().includes(lower);
    case 'oracle':
    case 'o':
    case 'text':
      return card.oracleText.toLowerCase().includes(lower);
    case 'set':
    case 's':
    case 'e':
    case 'edition':
      return card.setCode === lower || card.setName.toLowerCase().includes(lower);
    case 'rarity':
    case 'r': {
      const want = RARITY_WORD[lower];
      if (!want) return false;
      return op === '!=' ? card.rarity !== want : card.rarity === want;
    }
    case 'mv':
    case 'cmc':
      return Number.isFinite(expected) ? compare(card.cmc, op, expected) : false;
    case 'pow':
    case 'power':
      return Number.isFinite(expected) ? compare(card.power, op, expected) : false;
    case 'tou':
    case 'toughness':
      return Number.isFinite(expected) ? compare(card.toughness, op, expected) : false;
    case 'loy':
    case 'loyalty':
      return Number.isFinite(expected) ? compare(card.loyalty, op, expected) : false;
    case 'usd':
      return Number.isFinite(expected) ? compare(card.usd, op, expected) : false;
    case 'artist':
    case 'a':
      return card.artist.toLowerCase().includes(lower);
    case 'lang':
    case 'language':
      return card.language === lower;
    case 'kw':
    case 'keyword':
      return card.keywords.some(k => k.toLowerCase() === lower);
    case 'c':
    case 'color':
    case 'colors': {
      const mode: ColorMatchMode =
        op === '=' ? 'exact' : op === '>=' ? 'atleast' : op === '<=' ? 'atmost' : 'any';
      return matchColorSet(card.colors, parseColorLetters(value), mode, 'colors');
    }
    case 'id':
    case 'ci':
    case 'identity': {
      const mode: ColorMatchMode =
        op === '=' ? 'exact' : op === '>=' ? 'atleast' : 'atmost';
      return matchColorSet(card.colorIdentity, parseColorLetters(value), mode, 'identity');
    }
    case 'f':
    case 'format':
    case 'legal': {
      const status = card.legalities[lower];
      return status === 'legal' || status === 'restricted';
    }
    case 'banned':
      return card.legalities[lower] === 'banned';
    case 'restricted':
      return card.legalities[lower] === 'restricted';
    case 'is':
    case 'has':
      return matchIsFlag(card, lower);
    case 'game':
      return card.games.includes(lower);
    default:
      return null;
  }
}

function parseColorLetters(value: string): ColorOption[] {
  const named: Record<string, ColorOption> = {
    white: 'W',
    blue: 'U',
    black: 'B',
    red: 'R',
    green: 'G',
    colorless: 'C',
    multicolor: 'M',
    multicolour: 'M',
  };
  const lower = value.toLowerCase();
  if (named[lower]) return [named[lower]];
  return lower
    .split('')
    .map(ch => ch.toUpperCase())
    .filter((ch): ch is ColorOption => 'WUBRGCM'.includes(ch));
}

function matchIsFlag(card: LocalCard, flag: string): boolean {
  switch (flag) {
    case 'foil':
      return Boolean(card.flags.foil);
    case 'nonfoil':
      return Boolean(card.flags.nonfoil);
    case 'promo':
      return Boolean(card.flags.promo);
    case 'reprint':
      return Boolean(card.flags.reprint);
    case 'reserved':
      return Boolean(card.flags.reserved);
    case 'showcase':
      return Boolean(card.flags.showcase);
    case 'commander':
      return (
        /legendary/i.test(card.typeLine) && /creature/i.test(card.typeLine)
      ) || /can be your commander/i.test(card.oracleText);
    case 'spell':
      return !/land/i.test(card.typeLine);
    case 'permanent':
      return !/instant|sorcery/i.test(card.typeLine);
    case 'colorless':
      return card.colors.length === 0;
    case 'multicolor':
    case 'multicolour':
      return card.colors.length >= 2;
    default:
      return false;
  }
}

/**
 * The free-text box, evaluated locally.
 *
 * Tokens are AND-ed, `-` negates, and a bare word matches the card name the way
 * Scryfall's does. `OR` groups and regex operators are not implemented — a
 * query using them falls through to a name match on the literal text, which
 * narrows rather than widens, so the result set is never quietly wrong.
 */
export function matchesFreeText(card: LocalCard, text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  for (const token of tokenize(trimmed)) {
    if (/^(or|and)$/i.test(token)) continue;

    const negated = token.startsWith('-') && token.length > 1;
    const body = negated ? token.slice(1) : token;

    let result = matchToken(card, body);
    if (result == null) {
      const needle = unquote(body).toLowerCase();
      result =
        card.name.toLowerCase().includes(needle) ||
        card.typeLine.toLowerCase().includes(needle);
    }

    if (negated ? result : !result) return false;
  }

  return true;
}

/* ================================================================== *
 * The predicate
 * ================================================================== */

const inRange = (
  value: number | null,
  range?: { min?: number; max?: number }
): boolean => {
  if (!range || (range.min == null && range.max == null)) return true;
  if (value == null) return false;
  if (range.min != null && value < range.min) return false;
  if (range.max != null && value > range.max) return false;
  return true;
};

const RARITY_LETTER: Record<string, string> = {
  common: 'c',
  uncommon: 'u',
  rare: 'r',
  mythic: 'm',
};

/**
 * Does this card survive the filter?
 *
 * Every facet the panel can set is honoured except the escape hatches
 * (`orGroups`, raw `not` tokens, `is:` flags Scryfall computes server-side),
 * which have no local meaning and are documented as skipped in `matchIsFlag`.
 */
export function matchesCardFilter(card: LocalCard, state: CardSearchState): boolean {
  if (state.text && !matchesFreeText(card, state.text)) return false;

  if (state.oracle?.trim()) {
    if (!card.oracleText.toLowerCase().includes(state.oracle.trim().toLowerCase())) {
      return false;
    }
  }

  const typeLine = card.typeLine.toLowerCase();
  // Types within one axis are AND-ed, matching `t:creature t:artifact`.
  for (const group of [state.types, state.supertypes, state.subtypes]) {
    if (group?.length && !group.every(t => typeLine.includes(t.toLowerCase()))) {
      return false;
    }
  }

  if (state.colors?.value.length) {
    if (!matchColorSet(card.colors, state.colors.value, state.colors.mode, 'colors')) {
      return false;
    }
  }

  if (state.identity?.length) {
    if (
      !matchColorSet(
        card.colorIdentity,
        state.identity,
        state.identityMode ?? 'atmost',
        'identity'
      )
    ) {
      return false;
    }
  }

  if (!inRange(card.cmc, state.mv)) return false;
  if (!inRange(card.power, state.pow)) return false;
  if (!inRange(card.toughness, state.tou)) return false;
  if (!inRange(card.loyalty, state.loy)) return false;

  if (state.rarities?.length) {
    const letter = RARITY_LETTER[card.rarity] ?? card.rarity.charAt(0);
    if (!state.rarities.includes(letter as any)) return false;
  }

  if (state.sets?.length && !state.sets.includes(card.setCode)) return false;

  if (state.legal?.length) {
    for (const rule of state.legal) {
      const status = card.legalities[rule.format];
      if (rule.state === 'legal' && status !== 'legal' && status !== 'restricted') return false;
      if (rule.state === 'banned' && status !== 'banned') return false;
      if (rule.state === 'restricted' && status !== 'restricted') return false;
    }
  }

  if (state.game?.length && !state.game.some(g => card.games.includes(g))) return false;

  if (state.price) {
    if (state.price.usdMin != null && (card.usd == null || card.usd < state.price.usdMin)) {
      return false;
    }
    if (state.price.usdMax != null && (card.usd == null || card.usd > state.price.usdMax)) {
      return false;
    }
  }

  if (state.extras) {
    for (const [key, wanted] of Object.entries(state.extras)) {
      if (wanted && !matchIsFlag(card, key)) return false;
    }
  }

  if (state.language && state.language !== 'any' && card.language) {
    if (card.language !== state.language.toLowerCase()) return false;
  }

  if (state.artist?.trim()) {
    if (!card.artist.toLowerCase().includes(state.artist.trim().toLowerCase())) return false;
  }

  if (state.is?.length && !state.is.every(flag => matchIsFlag(card, flag.toLowerCase()))) {
    return false;
  }

  return true;
}

/* ================================================================== *
 * Sorting
 * ================================================================== */

const RARITY_ORDER: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  special: 3,
  mythic: 4,
  bonus: 5,
};

const COLOR_ORDER_INDEX: Record<string, number> = { W: 0, U: 1, B: 2, R: 3, G: 4 };

/**
 * Local equivalent of Scryfall's `order=` parameter.
 *
 * Nulls always sort last regardless of direction — a card with no price is not
 * "cheapest", it is unknown, and burying it is what every price list does.
 */
export function compareLocalCards(
  a: LocalCard,
  b: LocalCard,
  order: CardSearchState['order'] = 'name',
  dir: CardSearchState['dir'] = 'asc'
): number {
  const factor = dir === 'desc' ? -1 : 1;

  const byNumber = (x: number | null, y: number | null): number => {
    if (x == null && y == null) return 0;
    // Deliberately not multiplied by `factor`: an unknown value sinks to the
    // bottom of the list in both directions.
    if (x == null) return 1;
    if (y == null) return -1;
    return (x - y) * factor;
  };

  let cmp = 0;
  switch (order) {
    case 'cmc':
      cmp = (a.cmc - b.cmc) * factor;
      break;
    case 'usd':
    case 'tix':
      cmp = byNumber(a.usd, b.usd);
      break;
    case 'power':
      cmp = byNumber(a.power, b.power);
      break;
    case 'toughness':
      cmp = byNumber(a.toughness, b.toughness);
      break;
    case 'edhrec':
      cmp = byNumber(a.edhrecRank, b.edhrecRank);
      break;
    case 'rarity':
      cmp = ((RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0)) * factor;
      break;
    case 'released':
      cmp = a.releasedAt.localeCompare(b.releasedAt) * factor;
      break;
    case 'set':
      cmp = a.setCode.localeCompare(b.setCode) * factor;
      break;
    case 'color':
      cmp =
        ((COLOR_ORDER_INDEX[a.colors[0] ?? ''] ?? 99) -
          (COLOR_ORDER_INDEX[b.colors[0] ?? ''] ?? 99)) *
        factor;
      break;
    case 'name':
    default:
      cmp = a.name.localeCompare(b.name) * factor;
      break;
  }

  return cmp === 0 ? a.name.localeCompare(b.name) : cmp;
}

export function sortLocalCards<T>(
  rows: T[],
  read: (row: T) => LocalCard,
  order: CardSearchState['order'] = 'name',
  dir: CardSearchState['dir'] = 'asc'
): T[] {
  return [...rows].sort((x, y) => compareLocalCards(read(x), read(y), order, dir));
}
