export type Color = "W" | "U" | "B" | "R" | "G";
/** WUBRG plus the two pseudo-colours Scryfall understands: colourless and multicolour. */
export type ColorOption = Color | "C" | "M";
export type Rarity = "c" | "u" | "r" | "m";
export type Format =
  | "standard" | "pioneer" | "modern" | "legacy" | "vintage"
  | "commander" | "oathbreaker" | "pauper" | "penny" | "brawl"
  | "historic" | "timeless" | "alchemy" | "explorer";

export type LegalState = "legal" | "banned" | "restricted";

/**
 * How a set of colours is matched.
 *  - `any`     → `:`  (on `c:` "includes any of these"; on `id:` Scryfall already reads it as "at most")
 *  - `exact`   → `=`
 *  - `atleast` → `>=` "including" — the card has these and may have more
 *  - `atmost`  → `<=` the Commander question: "may my deck run this?"
 */
export type ColorMatchMode = "any" | "exact" | "atleast" | "atmost";

export interface CardSearchState {
  text?: string;                 // raw Scryfall syntax / free text — passed through verbatim
  oracle?: string;               // o:"..."
  types?: string[];              // ['creature','artifact', ...]
  supertypes?: string[];         // ['legendary','basic', ...]
  subtypes?: string[];           // ['elf','warrior', ...]
  colors?: { mode: ColorMatchMode; value: ColorOption[] }; // c:, c=, c>=, c<=
  identity?: ColorOption[];      // id:...
  /** Match mode for `identity`. Omitted behaves as `any`, which Scryfall reads as "at most". */
  identityMode?: ColorMatchMode;
  mv?: { min?: number; max?: number };
  pow?: { min?: number; max?: number };
  tou?: { min?: number; max?: number };
  loy?: { min?: number; max?: number };
  rarities?: Rarity[];
  sets?: string[];               // set codes
  legal?: { format: Format; state: LegalState }[];
  game?: ("paper" | "mtgo" | "arena")[];
  price?: { usdMax?: number; usdMin?: number };
  extras?: {
    foil?: boolean;
    nonfoil?: boolean;
    showcase?: boolean;
    reprint?: boolean;
    reserved?: boolean;
    promo?: boolean;
  };
  language?: string;             // lang:...
  artist?: string;
  is?: string[];                 // arbitrary is: flags
  not?: string[];                // raw NOT tokens
  orGroups?: string[][];         // each inner array is OR-joined tokens
  // result options
  unique?: "prints" | "cards" | "art";
  order?: "name" | "cmc" | "color" | "rarity" | "released" | "usd" | "tix" | "edhrec" | "power" | "toughness" | "set";
  dir?: "asc" | "desc";
}

/**
 * Quote a value the UI itself injects (an artist name, an oracle phrase).
 * This is deliberately NOT applied to `state.text`: that box is where the user
 * types Scryfall syntax, and quoting it turns `t:creature` into a literal name
 * search that matches nothing.
 */
const esc = (s: string) => (/[\s:"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);

const range = (key: string, r?: { min?: number; max?: number }) =>
  !r
    ? []
    : ([
        typeof r.min === "number" ? `${key}>=${r.min}` : null,
        typeof r.max === "number" ? `${key}<=${r.max}` : null,
      ].filter(Boolean) as string[]);

const WUBRG = new Set<string>(["W", "U", "B", "R", "G"]);

const COLOR_OPS: Record<ColorMatchMode, string> = {
  any: ":",
  exact: "=",
  atleast: ">=",
  atmost: "<=",
};

function colorTokens(
  key: "c" | "id",
  mode: ColorMatchMode,
  value: ColorOption[]
): string[] {
  const tokens: string[] = [];
  const letters = value.filter(v => WUBRG.has(v));
  const op = COLOR_OPS[mode] ?? ":";

  if (letters.length) tokens.push(`${key}${op}${letters.join("").toLowerCase()}`);
  if (value.includes("C")) tokens.push(`${key}:c`);
  // Multicolour is only meaningful on the card-colour axis, not colour identity.
  if (key === "c" && value.includes("M")) tokens.push("c:m");

  return tokens;
}

export function buildScryfallQuery(s: CardSearchState): { q: string; params: Record<string, string> } {
  const tokens: string[] = [];

  // The free-text box IS the Scryfall syntax box. Pass it through untouched so
  // `t:creature`, `mv<=3` and `o:"draw a card"` reach Scryfall's own parser.
  if (s.text && s.text.trim()) {
    tokens.push(s.text.trim());
  }

  if (s.oracle && s.oracle.trim()) tokens.push(`o:${esc(s.oracle.trim())}`);

  s.types?.forEach(t => tokens.push(`t:${esc(t)}`));
  s.supertypes?.forEach(t => tokens.push(`t:${esc(t)}`));
  s.subtypes?.forEach(t => tokens.push(`t:${esc(t)}`));

  if (s.colors && s.colors.value.length) {
    tokens.push(...colorTokens("c", s.colors.mode, s.colors.value));
  }
  if (s.identity?.length) {
    tokens.push(...colorTokens("id", s.identityMode ?? "any", s.identity));
  }

  tokens.push(...range("mv", s.mv));
  tokens.push(...range("pow", s.pow));
  tokens.push(...range("tou", s.tou));
  tokens.push(...range("loy", s.loy));

  if (s.rarities?.length) tokens.push(`( ${s.rarities.map(r => `r:${r}`).join(" OR ")} )`);
  if (s.sets?.length) tokens.push(`( ${s.sets.map(c => `set:${c.toLowerCase()}`).join(" OR ")} )`);

  s.legal?.forEach(l => {
    const key = l.state === "legal" ? "legal" : l.state === "banned" ? "banned" : "restricted";
    tokens.push(`${key}:${l.format}`);
  });

  if (s.game?.length) tokens.push(`( ${s.game.map(g => `game:${g}`).join(" OR ")} )`);

  if (s.price?.usdMax != null) tokens.push(`usd<=${s.price.usdMax}`);
  if (s.price?.usdMin != null) tokens.push(`usd>=${s.price.usdMin}`);

  if (s.extras?.foil) tokens.push("is:foil");
  if (s.extras?.nonfoil) tokens.push("is:nonfoil");
  if (s.extras?.showcase) tokens.push("is:showcase");
  if (s.extras?.reprint) tokens.push("is:reprint");
  if (s.extras?.reserved) tokens.push("is:reserved");
  if (s.extras?.promo) tokens.push("is:promo");

  if (s.language) tokens.push(`lang:${s.language.toLowerCase()}`);
  if (s.artist) tokens.push(`artist:${esc(s.artist)}`);

  s.is?.forEach(flag => tokens.push(`is:${flag}`));
  s.not?.forEach(raw => tokens.push(`-${raw}`));

  s.orGroups?.forEach(grp => {
    if (grp.length > 0) tokens.push(`( ${grp.join(" OR ")} )`);
  });

  let q = tokens.join(" ").replace(/\s+/g, " ").trim();
  if (!q) q = "*";

  const params: Record<string, string> = {};
  if (s.unique) params["unique"] = s.unique;
  if (s.order) params["order"] = s.order;
  if (s.dir) params["dir"] = s.dir;

  return { q, params };
}

/** True when the state expresses any real criteria (i.e. is not the empty `*`). */
export function hasSearchCriteria(s: CardSearchState): boolean {
  return buildScryfallQuery(s).q !== "*";
}

export function buildScryfallURL(
  state: CardSearchState,
  baseURL = "https://api.scryfall.com/cards/search"
): string {
  const { q, params } = buildScryfallQuery(state);
  const url = new URL(baseURL);
  url.searchParams.set("q", q);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

/** Count of facets the user has set, for the "Filters (3)" badge. */
export function countActiveFilters(s: CardSearchState): number {
  return [
    s.oracle?.trim(),
    s.types?.length,
    s.supertypes?.length,
    s.subtypes?.length,
    s.colors?.value.length,
    s.identity?.length,
    s.rarities?.length,
    s.legal?.length,
    s.sets?.length,
    s.game?.length,
    s.mv?.min != null || s.mv?.max != null,
    s.pow?.min != null || s.pow?.max != null,
    s.tou?.min != null || s.tou?.max != null,
    s.price?.usdMin != null || s.price?.usdMax != null,
    s.extras?.foil,
    s.extras?.nonfoil,
    s.extras?.showcase,
    s.extras?.reprint,
    s.extras?.reserved,
    s.extras?.promo,
    s.artist?.trim(),
    s.language,
  ].filter(Boolean).length;
}

/**
 * Preset queries. Every one of these is raw Scryfall syntax dropped into the
 * search box, so they only work because `text` is no longer escaped.
 */
export const PRESET_QUERIES: { name: string; query: string; description: string }[] = [
  {
    name: "Cheap removal",
    query: 't:instant mv<=2 o:"destroy target" f:modern',
    description: "Instant-speed removal for two mana or less, Modern legal",
  },
  {
    name: "Blue cantrips",
    query: 'c:u t:instant mv<=2 o:"draw a card"',
    description: "One- and two-mana blue instants that replace themselves",
  },
  {
    name: "Green ramp",
    query: 'c:g f:commander (o:"add {g}" or o:"search your library for a basic land")',
    description: "Commander-legal green mana acceleration",
  },
  {
    name: "Commander staples",
    query: "f:commander -t:land",
    // No em-dash: this line is read by a player, in the Presets popover on the
    // card page and on every other surface that mounts the shared search.
    description: "The most-played nonland cards in EDH, in EDHREC order",
  },
  {
    name: "Legendary creatures",
    query: "t:legendary t:creature f:commander",
    description: "Every card that can head a Commander deck",
  },
  {
    name: "Mana rocks",
    query: 't:artifact o:"add" mv<=3 -t:creature',
    description: "Cheap artifacts that produce mana",
  },
  {
    name: "Budget under $1",
    query: "usd<=1 f:commander -t:basic",
    description: "Commander-legal cards priced under a dollar",
  },
  {
    name: "Reserved list",
    query: "is:reserved",
    description: "Cards Wizards has promised never to reprint",
  },
];

/** Colour vocabulary for the filter UI. Pips are rendered by ManaPip. */
export const COLOR_SYMBOLS: Record<ColorOption, { symbol: string; name: string }> = {
  W: { symbol: "W", name: "White" },
  U: { symbol: "U", name: "Blue" },
  B: { symbol: "B", name: "Black" },
  R: { symbol: "R", name: "Red" },
  G: { symbol: "G", name: "Green" },
  C: { symbol: "C", name: "Colorless" },
  M: { symbol: "M", name: "Multicolor" },
};

export const COLOR_ORDER: ColorOption[] = ["W", "U", "B", "R", "G", "C", "M"];
/** Colour identity has no "multicolour" operator, so M is excluded. */
export const IDENTITY_ORDER: ColorOption[] = ["W", "U", "B", "R", "G", "C"];

export type SortField = NonNullable<CardSearchState["order"]>;

/** The sort axes the filter UI offers, in the order a Magic player reaches for them. */
export const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "released", label: "Release date" },
  { value: "cmc", label: "Mana value" },
  { value: "color", label: "Color" },
  { value: "rarity", label: "Rarity" },
  { value: "usd", label: "Price (USD)" },
  { value: "edhrec", label: "EDHREC rank" },
  { value: "power", label: "Power" },
  { value: "toughness", label: "Toughness" },
  { value: "set", label: "Set" },
  { value: "tix", label: "Price (MTGO tix)" },
];

export const RARITY_INFO: Record<Rarity, { name: string; code: string }> = {
  c: { name: "Common", code: "C" },
  u: { name: "Uncommon", code: "U" },
  r: { name: "Rare", code: "R" },
  m: { name: "Mythic", code: "M" },
};
