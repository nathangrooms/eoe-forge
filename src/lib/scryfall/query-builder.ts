export type Color = "W" | "U" | "B" | "R" | "G";
export type Rarity = "c" | "u" | "r" | "m";
export type Format = "standard" | "modern" | "pioneer" | "legacy" | "vintage" | "commander" | "pauper" | "penny" | "historic" | "explorer";

export interface CardSearchState {
  text?: string;                 // free text (name or oracle)
  types?: string[];              // ['creature','artifact', ...]
  supertypes?: string[];         // ['legendary','basic', ...]
  subtypes?: string[];           // ['elf','warrior', ...]
  colors?: { mode: "any" | "exact" | "atleast"; value: Color[] }; // c, c=, c>=
  identity?: Color[];            // id:...
  mv?: { min?: number; max?: number };
  pow?: { min?: number; max?: number };
  tou?: { min?: number; max?: number };
  loy?: { min?: number; max?: number };
  rarities?: Rarity[];
  sets?: string[];               // set codes
  legal?: { format: Format; state: "legal" | "banned" | "restricted" }[];
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
  unique?: "prints" | "cards";
  order?: "name" | "cmc" | "color" | "rarity" | "released" | "usd" | "tix" | "edhrec";
  dir?: "asc" | "desc";
}

const esc = (s: string) => /[\s:"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;

const range = (key: string, r?: { min?: number, max?: number }) =>
  !r ? [] : [
    typeof r.min === "number" ? `${key}>=${r.min}` : null,
    typeof r.max === "number" ? `${key}<=${r.max}` : null
  ].filter(Boolean) as string[];

export function buildScryfallQuery(s: CardSearchState): { q: string, params: Record<string, string> } {
  const tokens: string[] = [];

  // text: treat as name or oracle, prefer quoted if spaces
  if (s.text && s.text.trim()) tokens.push(esc(s.text.trim()));

  s.types?.forEach(t => tokens.push(`t:${esc(t)}`));
  s.supertypes?.forEach(t => tokens.push(`t:${esc(t)}`));
  s.subtypes?.forEach(t => tokens.push(`t:${esc(t)}`));

  if (s.colors && s.colors.value.length) {
    const v = s.colors.value.join('').toLowerCase();
    tokens.push(
      s.colors.mode === "exact" ? `c=${v}` :
      s.colors.mode === "atleast" ? `c>=${v}` : `c:${v}`
    );
  }
  if (s.identity?.length) { 
    tokens.push(`id:${s.identity.join('').toLowerCase()}`); 
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

  // cleanup double spaces and ensure we have a valid query
  let q = tokens.join(" ").replace(/\s+/g, " ").trim();
  
  // If no query was built, use a default to prevent API errors
  if (!q) {
    q = "*"; // Search all cards
  }

  const params: Record<string, string> = {};
  if (s.unique) params["unique"] = s.unique;
  if (s.order) params["order"] = s.order;
  if (s.dir) params["dir"] = s.dir;

  return { q, params };
}

// Utility to build URL from search state
export function buildScryfallURL(state: CardSearchState, baseURL = "https://api.scryfall.com/cards/search"): string {
  const { q, params } = buildScryfallQuery(state);
  const url = new URL(baseURL);
  url.searchParams.set("q", q);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

// Preset queries for common searches
export const PRESET_QUERIES = [
  {
    name: "Cheap Removal",
    query: "t:instant mv<=2 o:\"destroy target\" f:modern"
  },
  {
    name: "Blue Cantrips", 
    query: "c:u t:instant mv<=2 o:\"draw a card\""
  },
  {
    name: "Green Ramp",
    query: "c:g f:commander (o:\"add {g}\" or o:\"search your library for a basic land\")"
  },
  {
    name: "Vehicles",
    query: "t:vehicle f:standard"
  },
  {
    name: "Planeswalkers",
    query: "t:planeswalker"
  },
  {
    name: "Artifacts",
    query: "t:artifact -t:creature"
  },
  {
    name: "Legendary Creatures",
    query: "t:legendary t:creature"
  },
  {
    name: "Budget Cards",
    query: "usd<=1"
  }
];

// Helper to get color symbol for UI
export const COLOR_SYMBOLS: Record<Color, { symbol: string; name: string; className: string }> = {
  W: { 
    symbol: "W", 
    name: "White", 
    className: "bg-gradient-to-br from-yellow-50 to-orange-50 text-yellow-900 border-yellow-200" 
  },
  U: { 
    symbol: "U", 
    name: "Blue", 
    className: "bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-900 border-blue-200" 
  },
  B: { 
    symbol: "B", 
    name: "Black", 
    className: "bg-gradient-to-br from-gray-50 to-slate-50 text-gray-900 border-gray-300" 
  },
  R: { 
    symbol: "R", 
    name: "Red", 
    className: "bg-gradient-to-br from-red-50 to-pink-50 text-red-900 border-red-200" 
  },
  G: { 
    symbol: "G", 
    name: "Green", 
    className: "bg-gradient-to-br from-green-50 to-emerald-50 text-green-900 border-green-200" 
  }
};

// Helper to get rarity info for UI
export const RARITY_INFO: Record<Rarity, { name: string; className: string }> = {
  c: { name: "Common", className: "text-gray-600" },
  u: { name: "Uncommon", className: "text-gray-400" },
  r: { name: "Rare", className: "text-yellow-500" },
  m: { name: "Mythic", className: "text-orange-500" }
};