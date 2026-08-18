/**
 * `CardSearchState` ⇄ `URLSearchParams`.
 *
 * This is the half of the filter that makes a filtered view *a place*: the URL
 * carries the whole state, so a search survives a reload, a back button, and
 * being pasted into Discord. It deliberately lives next to `query-builder.ts`
 * and shares its types — there is exactly one search state in this codebase.
 *
 * Encoding rules:
 *  - Absent facets write no parameter at all, so an unfiltered URL stays clean.
 *  - Every enum is validated on the way back in; a hand-mangled URL degrades to
 *    "that facet is off" rather than throwing or smuggling junk into the query.
 */

import type {
  CardSearchState,
  ColorMatchMode,
  ColorOption,
  Format,
  LegalState,
  Rarity,
} from './query-builder';

/* ------------------------------------------------------------------ *
 * Parameter names — short, because these end up in shared links.
 * ------------------------------------------------------------------ */

export const FILTER_PARAMS = {
  text: 'q',
  oracle: 'o',
  types: 't',
  supertypes: 'st',
  subtypes: 'sub',
  colors: 'c',
  colorMode: 'cm',
  identity: 'id',
  identityMode: 'idm',
  mv: 'mv',
  pow: 'pow',
  tou: 'tou',
  loy: 'loy',
  rarities: 'r',
  sets: 'set',
  legal: 'legal',
  game: 'game',
  price: 'usd',
  extras: 'x',
  language: 'lang',
  artist: 'artist',
  order: 'sort',
  dir: 'dir',
  unique: 'u',
} as const;

/** Every key this module owns — used to clear filters without touching `tab`, `page`, … */
export const FILTER_PARAM_KEYS: string[] = Object.values(FILTER_PARAMS);

/* ------------------------------------------------------------------ *
 * Vocabularies
 * ------------------------------------------------------------------ */

const COLOR_VALUES = new Set<string>(['W', 'U', 'B', 'R', 'G', 'C', 'M']);
const COLOR_MODES = new Set<string>(['any', 'exact', 'atleast', 'atmost']);
const RARITY_VALUES = new Set<string>(['c', 'u', 'r', 'm']);
const LEGAL_STATES = new Set<string>(['legal', 'banned', 'restricted']);
const GAME_VALUES = new Set<string>(['paper', 'mtgo', 'arena']);
const UNIQUE_VALUES = new Set<string>(['prints', 'cards', 'art']);
const DIR_VALUES = new Set<string>(['asc', 'desc']);
const ORDER_VALUES = new Set<string>([
  'name', 'cmc', 'color', 'rarity', 'released',
  'usd', 'tix', 'edhrec', 'power', 'toughness', 'set',
]);
const FORMAT_VALUES = new Set<string>([
  'standard', 'pioneer', 'modern', 'legacy', 'vintage',
  'commander', 'oathbreaker', 'pauper', 'penny', 'brawl',
  'historic', 'timeless', 'alchemy', 'explorer',
]);
const EXTRA_KEYS = ['foil', 'nonfoil', 'showcase', 'reprint', 'reserved', 'promo'] as const;
type ExtraKey = (typeof EXTRA_KEYS)[number];

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

const csv = (list?: string[]) => (list && list.length ? list.join(',') : undefined);

function parseCsv(raw: string | null, allowed?: Set<string>): string[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !allowed || allowed.has(s));
  return parts.length ? Array.from(new Set(parts)) : undefined;
}

type Range = { min?: number; max?: number };

/** `2~5`, `~5` (max only), `2~` (min only). `~` avoids clashing with negative values. */
function encodeRange(r?: Range): string | undefined {
  if (!r) return undefined;
  const hasMin = typeof r.min === 'number' && Number.isFinite(r.min);
  const hasMax = typeof r.max === 'number' && Number.isFinite(r.max);
  if (!hasMin && !hasMax) return undefined;
  return `${hasMin ? r.min : ''}~${hasMax ? r.max : ''}`;
}

function decodeRange(raw: string | null): Range | undefined {
  if (!raw) return undefined;
  const [rawMin, rawMax] = raw.split('~');
  const min = rawMin !== undefined && rawMin !== '' ? Number(rawMin) : undefined;
  const max = rawMax !== undefined && rawMax !== '' ? Number(rawMax) : undefined;
  const range: Range = {};
  if (min !== undefined && Number.isFinite(min)) range.min = min;
  if (max !== undefined && Number.isFinite(max)) range.max = max;
  return range.min === undefined && range.max === undefined ? undefined : range;
}

/* ------------------------------------------------------------------ *
 * Decode
 * ------------------------------------------------------------------ */

export function parseFilterParams(params: URLSearchParams): CardSearchState {
  const P = FILTER_PARAMS;
  const state: CardSearchState = {};

  const text = params.get(P.text);
  if (text && text.trim()) state.text = text;

  const oracle = params.get(P.oracle);
  if (oracle && oracle.trim()) state.oracle = oracle;

  state.types = parseCsv(params.get(P.types));
  state.supertypes = parseCsv(params.get(P.supertypes));
  state.subtypes = parseCsv(params.get(P.subtypes));

  const colorValues = parseCsv(params.get(P.colors), COLOR_VALUES) as ColorOption[] | undefined;
  if (colorValues) {
    const rawMode = params.get(P.colorMode) ?? '';
    state.colors = {
      mode: (COLOR_MODES.has(rawMode) ? rawMode : 'any') as ColorMatchMode,
      value: colorValues,
    };
  }

  const identity = parseCsv(params.get(P.identity), COLOR_VALUES) as ColorOption[] | undefined;
  if (identity) {
    state.identity = identity;
    const rawMode = params.get(P.identityMode) ?? '';
    if (COLOR_MODES.has(rawMode)) state.identityMode = rawMode as ColorMatchMode;
  }

  state.mv = decodeRange(params.get(P.mv));
  state.pow = decodeRange(params.get(P.pow));
  state.tou = decodeRange(params.get(P.tou));
  state.loy = decodeRange(params.get(P.loy));

  state.rarities = parseCsv(params.get(P.rarities), RARITY_VALUES) as Rarity[] | undefined;

  const sets = parseCsv(params.get(P.sets));
  if (sets) state.sets = sets.map(s => s.toLowerCase());

  const legal = params.get(P.legal);
  if (legal) {
    const entries = legal
      .split(',')
      .map(pair => pair.split(':'))
      .filter(([format, legalState]) => FORMAT_VALUES.has(format) && LEGAL_STATES.has(legalState))
      .map(([format, legalState]) => ({
        format: format as Format,
        state: legalState as LegalState,
      }));
    if (entries.length) state.legal = entries;
  }

  state.game = parseCsv(params.get(P.game), GAME_VALUES) as CardSearchState['game'];

  const price = decodeRange(params.get(P.price));
  if (price) {
    state.price = {};
    if (price.min !== undefined) state.price.usdMin = price.min;
    if (price.max !== undefined) state.price.usdMax = price.max;
  }

  const extras = parseCsv(params.get(P.extras), new Set<string>(EXTRA_KEYS));
  if (extras) {
    state.extras = {};
    extras.forEach(key => {
      state.extras![key as ExtraKey] = true;
    });
  }

  const language = params.get(P.language);
  if (language && language !== 'any') state.language = language;

  const artist = params.get(P.artist);
  if (artist && artist.trim()) state.artist = artist;

  const order = params.get(P.order);
  if (order && ORDER_VALUES.has(order)) state.order = order as CardSearchState['order'];

  const dir = params.get(P.dir);
  if (dir && DIR_VALUES.has(dir)) state.dir = dir as CardSearchState['dir'];

  const unique = params.get(P.unique);
  if (unique && UNIQUE_VALUES.has(unique)) state.unique = unique as CardSearchState['unique'];

  // Strip the keys `decodeRange`/`parseCsv` left as `undefined` so state objects
  // compare equal by JSON and never render an empty chip.
  return pruneState(state);
}

/** Drop `undefined`, empty arrays and empty objects, recursively one level deep. */
export function pruneState(state: CardSearchState): CardSearchState {
  const out: Record<string, unknown> = {};
  Object.entries(state).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return;
    out[key] = value;
  });
  return out as CardSearchState;
}

/* ------------------------------------------------------------------ *
 * Encode
 * ------------------------------------------------------------------ */

/**
 * Write `state` onto a copy of `base`, clearing only the keys this module owns
 * so unrelated params (`tab`, `page`, `deck`) survive a filter change.
 */
export function serializeFilterState(
  state: CardSearchState,
  base?: URLSearchParams
): URLSearchParams {
  const params = new URLSearchParams(base ? base.toString() : undefined);
  FILTER_PARAM_KEYS.forEach(key => params.delete(key));

  const P = FILTER_PARAMS;
  const set = (key: string, value?: string) => {
    if (value !== undefined && value !== '') params.set(key, value);
  };

  set(P.text, state.text?.trim());
  set(P.oracle, state.oracle?.trim());
  set(P.types, csv(state.types));
  set(P.supertypes, csv(state.supertypes));
  set(P.subtypes, csv(state.subtypes));

  if (state.colors?.value.length) {
    set(P.colors, csv(state.colors.value));
    if (state.colors.mode && state.colors.mode !== 'any') set(P.colorMode, state.colors.mode);
  }
  if (state.identity?.length) {
    set(P.identity, csv(state.identity));
    if (state.identityMode && state.identityMode !== 'any') set(P.identityMode, state.identityMode);
  }

  set(P.mv, encodeRange(state.mv));
  set(P.pow, encodeRange(state.pow));
  set(P.tou, encodeRange(state.tou));
  set(P.loy, encodeRange(state.loy));

  set(P.rarities, csv(state.rarities));
  set(P.sets, csv(state.sets));

  if (state.legal?.length) {
    set(P.legal, state.legal.map(l => `${l.format}:${l.state}`).join(','));
  }
  set(P.game, csv(state.game));

  set(
    P.price,
    encodeRange(
      state.price ? { min: state.price.usdMin, max: state.price.usdMax } : undefined
    )
  );

  if (state.extras) {
    const on = EXTRA_KEYS.filter(k => state.extras?.[k]);
    set(P.extras, csv(on as unknown as string[]));
  }

  set(P.language, state.language);
  set(P.artist, state.artist?.trim());
  set(P.order, state.order);
  set(P.dir, state.dir);
  set(P.unique, state.unique);

  return params;
}

/** True when the two states would produce the same URL. */
export function filterStatesEqual(a: CardSearchState, b: CardSearchState): boolean {
  return serializeFilterState(a).toString() === serializeFilterState(b).toString();
}
