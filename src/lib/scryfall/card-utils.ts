/**
 * One place that knows the shape of a Scryfall card object.
 *
 * The card-browse area previously read `card.image_uris` / `card.set_code` /
 * `card.mana_cost` directly in a dozen components, which broke every
 * double-faced card (art lives on `card_faces[n]`) and every card sourced from
 * Supabase (which stores `set_code`, while Scryfall returns `set`). Every
 * accessor a card view needs lives here so those two shapes are reconciled
 * exactly once.
 */

export type ScryfallImageSize =
  | 'small'
  | 'normal'
  | 'large'
  | 'png'
  | 'art_crop'
  | 'border_crop';

/** Layouts where the back face is a genuinely different card, not a rotation. */
const TWO_SIDED_LAYOUTS = new Set([
  'transform',
  'modal_dfc',
  'double_faced_token',
  'reversible_card',
  'art_series',
]);

export function getCardFaces(card: any): any[] {
  if (Array.isArray(card?.card_faces)) return card.card_faces;
  // The Supabase `cards` table stores the same per-face payload in a `faces`
  // jsonb column, so a row read straight from Postgres has no `card_faces`.
  if (Array.isArray(card?.faces)) return card.faces;
  return [];
}

/**
 * Image URL for a card, falling back to `card_faces[face].image_uris`.
 * Split/adventure cards carry a top-level image and no per-face images, so the
 * face lookup is tried first and silently falls through.
 */
export function getCardImage(
  card: any,
  size: ScryfallImageSize = 'normal',
  faceIndex = 0
): string | undefined {
  if (!card) return undefined;

  const faces = getCardFaces(card);
  if (faces.length > 0) {
    const face = faces[Math.min(faceIndex, faces.length - 1)];
    const fromFace = face?.image_uris?.[size] ?? face?.image_uris?.normal;
    if (fromFace) return fromFace;
  }

  return card.image_uris?.[size] ?? card.image_uris?.normal ?? card.image_url ?? undefined;
}

/**
 * Resolutions in descending quality. `art_crop` is deliberately absent: it is a
 * crop, not a card, so it is never an acceptable substitute for one.
 */
const QUALITY_LADDER: ScryfallImageSize[] = ['png', 'large', 'border_crop', 'normal', 'small'];

/** Raw lookup with no fallbacks — face first, then the card's own `image_uris`. */
function rawImage(card: any, size: ScryfallImageSize, faceIndex: number): string | undefined {
  const faces = getCardFaces(card);
  if (faces.length > 0) {
    const face = faces[Math.min(faceIndex, faces.length - 1)];
    const url = face?.image_uris?.[size];
    if (typeof url === 'string' && url) return url;
  }
  const url = card?.image_uris?.[size];
  return typeof url === 'string' && url ? url : undefined;
}

/**
 * The best available image at or below the requested resolution.
 *
 * Cards used to render from `small` (146px wide) at 200px+ on screen, which is
 * why they looked soft everywhere. Callers ask for the resolution the card is
 * actually being *drawn* at and this walks down the ladder only if the printing
 * genuinely lacks it.
 */
export function getBestCardImage(
  card: any,
  preferred: ScryfallImageSize = 'large',
  faceIndex = 0
): string | undefined {
  if (!card) return undefined;

  const order: ScryfallImageSize[] = [
    preferred,
    ...QUALITY_LADDER.filter(s => s !== preferred),
  ];
  for (const size of order) {
    const url = rawImage(card, size, faceIndex);
    if (url) return url;
  }
  return typeof card.image_url === 'string' && card.image_url ? card.image_url : undefined;
}

/** True when the card has a real, separately-illustrated back face. */
export function hasBackFace(card: any): boolean {
  const faces = getCardFaces(card);
  if (faces.length < 2) return false;
  if (!faces[1]?.image_uris) return false;
  return TWO_SIDED_LAYOUTS.has(card?.layout) || Boolean(faces[1]?.image_uris?.normal);
}

/**
 * Scryfall cost string. Split and double-faced cards carry the cost per face,
 * so those are joined the way Scryfall prints them.
 */
export function getManaCost(card: any, faceIndex?: number): string {
  if (!card) return '';
  const faces = getCardFaces(card);

  if (typeof faceIndex === 'number' && faces[faceIndex]?.mana_cost) {
    return faces[faceIndex].mana_cost;
  }
  if (card.mana_cost) return card.mana_cost;
  if (faces.length > 0) {
    const costs = faces.map((f: any) => f?.mana_cost).filter(Boolean);
    if (costs.length) return costs.join(' // ');
  }
  return '';
}

export function getTypeLine(card: any, faceIndex?: number): string {
  if (!card) return '';
  const faces = getCardFaces(card);
  if (typeof faceIndex === 'number' && faces[faceIndex]?.type_line) {
    return faces[faceIndex].type_line;
  }
  if (card.type_line) return card.type_line;
  const lines = faces.map((f: any) => f?.type_line).filter(Boolean);
  return lines.join(' // ');
}

export function getOracleText(card: any, faceIndex?: number): string {
  if (!card) return '';
  const faces = getCardFaces(card);
  if (typeof faceIndex === 'number' && faces[faceIndex]?.oracle_text != null) {
    return faces[faceIndex].oracle_text;
  }
  if (card.oracle_text) return card.oracle_text;
  const texts = faces.map((f: any) => f?.oracle_text).filter(Boolean);
  return texts.join('\n\n//\n\n');
}

/**
 * Power/toughness as printed. Returns null when the card genuinely has none —
 * `'0'` and `'*'` are both real printed values, so this deliberately tests for
 * null rather than truthiness.
 */
export function getPowerToughness(
  card: any
): { power: string; toughness: string } | null {
  if (!card) return null;
  if (card.power != null && card.toughness != null) {
    return { power: String(card.power), toughness: String(card.toughness) };
  }
  const face = getCardFaces(card).find((f: any) => f?.power != null && f?.toughness != null);
  if (face) return { power: String(face.power), toughness: String(face.toughness) };
  return null;
}

export function getLoyalty(card: any): string | null {
  if (card?.loyalty != null) return String(card.loyalty);
  const face = getCardFaces(card).find((f: any) => f?.loyalty != null);
  return face ? String(face.loyalty) : null;
}

/** Scryfall calls it `set`; the Supabase `cards` table calls it `set_code`. */
export function getSetCode(card: any): string {
  return (card?.set ?? card?.set_code ?? '').toString();
}

export function getSetName(card: any): string {
  return (card?.set_name ?? '').toString();
}

export function getColorIdentity(card: any): string[] {
  const ci = card?.color_identity;
  if (Array.isArray(ci)) return ci.map((c: string) => c.toUpperCase());
  const colors = card?.colors;
  return Array.isArray(colors) ? colors.map((c: string) => c.toUpperCase()) : [];
}

export function getColors(card: any): string[] {
  const colors = card?.colors;
  if (Array.isArray(colors) && colors.length) return colors.map((c: string) => c.toUpperCase());
  const faceColors = getCardFaces(card).flatMap((f: any) => f?.colors ?? []);
  return faceColors.map((c: string) => String(c).toUpperCase());
}

/** Lowest listed USD price, normal or foil, as a number. `null` when unpriced. */
export function getUsdPrice(card: any): number | null {
  const usd = parseFloat(card?.prices?.usd ?? '');
  if (!isNaN(usd)) return usd;
  const foil = parseFloat(card?.prices?.usd_foil ?? '');
  if (!isNaN(foil)) return foil;
  const etched = parseFloat(card?.prices?.usd_etched ?? '');
  if (!isNaN(etched)) return etched;
  return null;
}

export function formatUsd(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '—';
  return `$${value.toFixed(2)}`;
}

/* ------------------------------------------------------------------ *
 * Rarity
 *
 * The palette is monochrome, so rarity is expressed typographically —
 * a single-letter code plus a weight/contrast ramp — rather than the
 * gold/orange treatment that would smuggle non-MTG colour back in.
 * ------------------------------------------------------------------ */

export const RARITY_CODE: Record<string, string> = {
  common: 'C',
  uncommon: 'U',
  rare: 'R',
  mythic: 'M',
  special: 'S',
  bonus: 'B',
};

export function rarityCode(rarity?: string): string {
  if (!rarity) return '?';
  return RARITY_CODE[rarity.toLowerCase()] ?? rarity.charAt(0).toUpperCase();
}

export function rarityClass(rarity?: string): string {
  switch ((rarity ?? '').toLowerCase()) {
    case 'mythic':
      return 'text-foreground font-bold';
    case 'rare':
      return 'text-foreground font-semibold';
    case 'uncommon':
      return 'text-muted-foreground font-medium';
    case 'common':
    default:
      return 'text-muted-foreground font-normal';
  }
}

/* ------------------------------------------------------------------ *
 * Format legality
 * ------------------------------------------------------------------ */

/** The formats players actually care about, in the order Scryfall lists them. */
export const CURATED_FORMATS: { key: string; label: string }[] = [
  { key: 'standard', label: 'Standard' },
  { key: 'pioneer', label: 'Pioneer' },
  { key: 'modern', label: 'Modern' },
  { key: 'legacy', label: 'Legacy' },
  { key: 'vintage', label: 'Vintage' },
  { key: 'commander', label: 'Commander' },
  { key: 'oathbreaker', label: 'Oathbreaker' },
  { key: 'pauper', label: 'Pauper' },
  { key: 'brawl', label: 'Brawl' },
  { key: 'historic', label: 'Historic' },
  { key: 'timeless', label: 'Timeless' },
  { key: 'alchemy', label: 'Alchemy' },
];

export type LegalityState = 'legal' | 'not_legal' | 'banned' | 'restricted';

export const LEGALITY_LABEL: Record<string, string> = {
  legal: 'Legal',
  not_legal: 'Not legal',
  banned: 'Banned',
  restricted: 'Restricted',
};

/**
 * Four visually distinct states. Only `banned` earns colour — it is the one
 * that changes what a player can do, so it uses the destructive signal.
 *
 * Weight and tone only. Each state used to carry a `border-*` colour as well,
 * which painted nothing (the helper lands on a `<span>` of text, and preflight
 * zeroes border-width) while reading as four more hairlines to anyone
 * grepping the tree.
 */
export function legalityClass(state: string): string {
  switch (state) {
    case 'legal':
      return 'font-semibold text-foreground';
    case 'banned':
      return 'font-semibold text-destructive';
    case 'restricted':
      return 'text-foreground/80';
    case 'not_legal':
    default:
      return 'text-muted-foreground/70';
  }
}

/* ------------------------------------------------------------------ *
 * Commander eligibility — Legendary Creature, or explicit permission.
 * ------------------------------------------------------------------ */

export function canBeCommander(card: any): boolean {
  const typeLine = getTypeLine(card).toLowerCase();
  if (typeLine.includes('legendary') && typeLine.includes('creature')) return true;
  return getOracleText(card).toLowerCase().includes('can be your commander');
}

/* ------------------------------------------------------------------ *
 * External links — all built from the same normalized object so none of
 * them can drift into `/card/undefined/…`.
 * ------------------------------------------------------------------ */

export function scryfallUrl(card: any): string {
  if (card?.scryfall_uri) return card.scryfall_uri;
  const set = getSetCode(card).toLowerCase();
  if (set && card?.collector_number) {
    return `https://scryfall.com/card/${set}/${card.collector_number}`;
  }
  return `https://scryfall.com/search?q=${encodeURIComponent(`!"${card?.name ?? ''}"`)}`;
}

export function edhrecUrl(card: any): string {
  if (card?.related_uris?.edhrec) return card.related_uris.edhrec;
  const slug = (card?.name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `https://edhrec.com/cards/${slug}`;
}

export function tcgplayerUrl(card: any): string {
  if (card?.purchase_uris?.tcgplayer) return card.purchase_uris.tcgplayer;
  return `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(card?.name ?? '')}`;
}

export function gathererUrl(card: any): string | null {
  if (card?.related_uris?.gatherer) return card.related_uris.gatherer;
  if (card?.multiverse_ids?.length) {
    return `https://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=${card.multiverse_ids[0]}`;
  }
  return null;
}
