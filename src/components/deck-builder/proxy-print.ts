/**
 * Data preparation for printable proxies.
 *
 * Split out of `DeckProxyGenerator` because three consumers have to agree or
 * the printed card comes out the wrong size: the print stylesheet
 * (`proxy-sheet.css`), the on-screen preview, and the jsPDF export. Before this
 * they did not agree: the PDF drew 2.5 x 3.5 in *text boxes* and the preview
 * had no physical geometry at all, because no card image was ever placed on a
 * page.
 *
 * The millimetres themselves now live one file over in `proxy-geometry.ts`,
 * which imports nothing so it can be unit tested, and are re-exported below so
 * that this file is still the only import a consumer needs.
 */

import { supabase } from '@/integrations/supabase/client';
import { getBestCardImage, hasBackFace, type ScryfallImageSize } from '@/lib/scryfall/card-utils';

/* ------------------------------------------------------------------ *
 * Physical geometry
 *
 * Lives in `proxy-geometry.ts`, which imports nothing so that the millimetres
 * can be unit tested under `node --test`. Re-exported here so every existing
 * consumer keeps its single import.
 * ------------------------------------------------------------------ */

export {
  BLEED_MM,
  BLOCK_H_MM,
  BLOCK_W_MM,
  CARD_H_MM,
  CARD_W_MM,
  EDGE_CLEARANCE_MM,
  MARK_OUT_MM,
  MARK_W_MM,
  MM_TO_PT,
  MM_TO_PX,
  PAPER,
  PRINT_DIALOG_HINT,
  PROXY_COLS,
  PROXY_PER_PAGE,
  PROXY_ROWS,
  bleedRect,
  chunkIntoPages,
  cropMarkSegments,
  sheetMargins,
  sheetPlan,
  showSheetPlan,
} from './proxy-geometry';
export type { MarkTone, PaperSize, SheetPlan, SheetRect } from './proxy-geometry';

import { CARD_W_MM } from './proxy-geometry';

/* ------------------------------------------------------------------ *
 * Resolution
 * ------------------------------------------------------------------ */

/**
 * The three Scryfall resolutions worth printing, with their pixel sizes.
 *
 * The pixel dimensions are fixed properties of the Scryfall asset and are what
 * {@link proxyDpi} computes from: `png` is 745 x 1040, which over a 63 x 88 mm
 * card is 300 DPI — Scryfall's PNG is, to within rounding, exactly a 300 DPI
 * print asset at true card size. `large` is 271 DPI and is the default.
 * `normal` is 197 DPI, visibly soft on paper, offered as a toner-saving draft.
 *
 * **No byte size is stated here, deliberately.** An earlier version of this
 * table carried an `approxKb` per tier and the resolution picker printed it as
 * the cost of the option. It was one card's file size generalised to every
 * card, and it does not generalise: sampled across ten printings, `normal` ran
 * 65-104 kB, `large` 101-164 kB and `png` 316-1549 kB — so the two JPEG figures
 * understated the real median by a third and the PNG figure was wrong by up to
 * 2x in both directions. A per-card download size is not knowable before the
 * printing is known, so the UI states none. `note` carries only what is true of
 * the format itself.
 *
 * The old PDF path never used any of these, so `quality` was a control that
 * changed nothing.
 */
export const PROXY_QUALITY = {
  normal: { label: 'Draft', size: 'normal' as ScryfallImageSize, px: 488, note: '' },
  large: { label: 'High', size: 'large' as ScryfallImageSize, px: 672, note: '' },
  png: { label: 'Max', size: 'png' as ScryfallImageSize, px: 745, note: 'lossless' },
} as const;

export type ProxyQuality = keyof typeof PROXY_QUALITY;

/** Horizontal DPI a given resolution lands at once printed at true card size. */
export function proxyDpi(quality: ProxyQuality): number {
  return Math.round(PROXY_QUALITY[quality].px / (CARD_W_MM / 25.4));
}

/* ------------------------------------------------------------------ *
 * Hydration — deck cards do not carry what a proxy needs
 * ------------------------------------------------------------------ */

/**
 * The deck store's `Card` has an `image_uris` of `{small,normal,large,art_crop}`
 * and **no `faces`/`card_faces` at all** (see `deckStore.ts`), so a deck card
 * cannot answer either question a proxy asks: "what is the large/png image for
 * the printing the user owns" and "what is on the back". For transform cards it
 * is worse than incomplete — the store writes `image_uris: apiCard.image_uris || {}`
 * and Scryfall puts no top-level images on a transform card, so those arrive
 * with no image whatsoever.
 *
 * So proxies re-read the printing from our own `cards` table, which does hold
 * both (`image_uris` and `faces` jsonb, and unlike raw Scryfall the sync
 * flattens the front face up to the top level).
 *
 * Matched on `id` first — that is the Scryfall *printing* id, so the user gets
 * the art of the printing in their deck, not an arbitrary reprint. Anything
 * unmatched is retried by name, which is how decks imported as plain text
 * (`card_id` not a Scryfall id) still get art; those fall back to whichever
 * printing the name resolves to, because there is nothing better to go on.
 */
export interface HydratedPrinting {
  id: string;
  name: string;
  image_uris: any;
  faces: any;
  layout: string | null;
}

const HYDRATE_COLUMNS = 'id,name,image_uris,faces,layout';

/** Supabase caps URL length, so `.in()` lists are chunked rather than sent whole. */
const CHUNK = 150;

async function fetchIn(column: 'id' | 'name', values: string[]): Promise<HydratedPrinting[]> {
  const out: HydratedPrinting[] = [];
  for (let i = 0; i < values.length; i += CHUNK) {
    const slice = values.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('cards')
      .select(HYDRATE_COLUMNS)
      .in(column, slice);
    if (error) throw error;
    if (data) out.push(...(data as unknown as HydratedPrinting[]));
  }
  return out;
}

export interface HydrateResult {
  /** Keyed by both printing id and lowercased name so lookup can try either. */
  byId: Map<string, HydratedPrinting>;
  byName: Map<string, HydratedPrinting>;
}

export async function hydrateProxyPrintings(cards: any[]): Promise<HydrateResult> {
  const byId = new Map<string, HydratedPrinting>();
  const byName = new Map<string, HydratedPrinting>();

  const ids = Array.from(
    new Set(cards.map(c => c?.id).filter((v): v is string => typeof v === 'string' && v.length > 0))
  );
  if (ids.length) {
    for (const row of await fetchIn('id', ids)) byId.set(row.id, row);
  }

  // Only the cards the id pass could not place are worth a name round trip.
  const unmatched = Array.from(
    new Set(
      cards
        .filter(c => !(typeof c?.id === 'string' && byId.has(c.id)))
        .map(c => c?.name)
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    )
  );
  if (unmatched.length) {
    for (const row of await fetchIn('name', unmatched)) {
      const key = row.name.toLowerCase();
      if (!byName.has(key)) byName.set(key, row);
    }
  }

  return { byId, byName };
}

/**
 * Deck card merged with its printing row.
 *
 * The printing wins on image/face/layout and only those, so quantity,
 * commander-ness and any locally edited text stay with the deck's own object.
 */
export function mergePrinting(card: any, hydrated: HydrateResult): any {
  const row =
    (typeof card?.id === 'string' ? hydrated.byId.get(card.id) : undefined) ??
    (typeof card?.name === 'string' ? hydrated.byName.get(card.name.toLowerCase()) : undefined);
  if (!row) return card;
  return {
    ...card,
    image_uris: row.image_uris ?? card.image_uris,
    faces: row.faces ?? card.faces,
    layout: row.layout ?? card.layout,
  };
}

/* ------------------------------------------------------------------ *
 * Slots — one printed card face per grid cell
 * ------------------------------------------------------------------ */

export interface ProxySlot {
  key: string;
  card: any;
  faceIndex: number;
  isCommander: boolean;
  /** `undefined` means no printing image exists → the text fallback renders. */
  imageUrl: string | undefined;
  /** Only set for genuinely two-sided cards; screen-only label, never printed. */
  faceLabel?: 'Front' | 'Back';
}

/**
 * Expands the selection into physical cards to print.
 *
 * Two expansions happen here, and both change the page count, which is why the
 * count shown in the UI is derived from this array rather than from
 * `sum(quantity)`:
 *
 * 1. **Quantity.** Four Lightning Bolts are four printed cards.
 * 2. **Faces.** A transform/MDFC card is printed as two separate cards, because
 *    paper does not flip. `hasBackFace` is the right test rather than
 *    `faces.length > 1`: adventure, split, flip and prepare cards also carry two
 *    entries in `faces`, but they are one physical card printed with both halves
 *    on one side, and giving them a second slot would waste a ninth of a sheet
 *    each and hand the player a card that does not exist.
 *
 *    Counted on the live `cards` table on 2026-08-19, by layout:
 *
 *    | layout              | printings | slots each |
 *    |---------------------|-----------|------------|
 *    | transform           |       988 |          2 |
 *    | modal_dfc           |       262 |          2 |
 *    | double_faced_token  |         2 |          2 |
 *    | adventure           |       388 |          1 |
 *    | split               |       284 |          1 |
 *    | prepare             |        91 |          1 |
 *    | meld                |        63 |          1 |
 *    | flip                |        37 |          1 |
 *
 *    All 1,252 rows in the two-slot group carry a real image URL on the back
 *    face, so no back slot is left with nothing to print. All 863 rows in the
 *    one-slot group carry no per-face images at all, only the single top-level
 *    card image, which is the shape that proves they are one physical card.
 *
 *    Meld is the one to be plain about. A meld pair is three separate rows in
 *    the catalogue: the two halves, and the melded result, whose own row is a
 *    normal single-image card. So the halves print as normal cards and the
 *    result prints as a normal card. The real melded card is two cards wide, so
 *    a 63 mm proxy of it is a reminder rather than a replica, and the player has
 *    to add it to the list themselves.
 *
 * A back slot is never emitted unless the back has its own image. Without that
 * guard `getBestCardImage(card, size, 1)` would fall through the face and reach
 * the card's top-level `image_uris`, which is the FRONT, and quietly print the
 * front of the card twice. No row in the catalogue does that today; the guard
 * is here so that no row ever can.
 */
export function buildProxySlots(cards: any[], quality: ProxyQuality): ProxySlot[] {
  const size = PROXY_QUALITY[quality].size;
  const slots: ProxySlot[] = [];

  cards.forEach((card, cardIndex) => {
    const qty = Math.max(1, Number(card?.quantity) || 1);

    /*
     * `getBestCardImage` walks down from the requested resolution and only
     * reaches the flat `image_url` string after exhausting every real printing
     * image, so asking for `png`/`large` here can never silently downgrade a
     * card that has the asset.
     */
    const frontUrl = getBestCardImage(card, size, 0);
    const backUrl = hasBackFace(card) ? getBestCardImage(card, size, 1) : undefined;
    /* Its own art, or it is not a back. Equality is the test that catches the
       fall-through to the card's top-level image, which is the front. */
    const twoSided = Boolean(backUrl) && backUrl !== frontUrl;
    const faces = [frontUrl, ...(twoSided ? [backUrl] : [])];

    for (let copy = 0; copy < qty; copy++) {
      faces.forEach((imageUrl, face) => {
        slots.push({
          key: `${card?.id ?? card?.name ?? 'card'}-${cardIndex}-${copy}-${face}`,
          card,
          faceIndex: face,
          isCommander: Boolean(card?.isCommander),
          imageUrl,
          faceLabel: twoSided ? (face === 0 ? 'Front' : 'Back') : undefined,
        });
      });
    }
  });

  return slots;
}

/* ------------------------------------------------------------------ *
 * Decoding before printing
 * ------------------------------------------------------------------ */

/**
 * Decode every image before the page is handed to the printer.
 *
 * `loading="eager"` starts the fetches but guarantees nothing about when they
 * finish, and the print rasteriser does not wait. On a 12-page sheet almost
 * every card is off-screen, so without this the likely outcome is a stack of
 * paper with blank slots, discovered only after the ink is spent. Concurrency
 * is capped so a 100-card list does not open 100 sockets at once.
 *
 * It lives here rather than inside one component because two surfaces now print
 * this sheet — the deck builder's generator and the standalone proxy list — and
 * a second copy would eventually drift into a second answer about when a sheet
 * is safe to print.
 */
export async function preloadProxyImages(
  urls: string[],
  onProgress?: (percent: number) => void
): Promise<void> {
  const queue = [...urls];
  let done = 0;
  const worker = async () => {
    for (;;) {
      const url = queue.shift();
      if (!url) return;
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
      } catch {
        // A card that will not decode still prints its slot; the "no art" count
        // in the hint line already tells the user how many there are.
      }
      done += 1;
      onProgress?.(Math.round((done / Math.max(1, urls.length)) * 100));
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, urls.length) }, worker));
}

/* ------------------------------------------------------------------ *
 * Print isolation
 * ------------------------------------------------------------------ */

const HIDDEN = 'proxy-print-hidden';
const ANCESTOR = 'proxy-print-ancestor';

/**
 * Makes `el` the only thing on the printed page, and returns the undo.
 *
 * The obvious implementations both fail here. `body > *:not(#sheet)` only works
 * if the sheet is a direct child of `<body>`, which would mean portalling it
 * out of the tab and rendering the whole sheet twice. `visibility: hidden` on
 * everything else keeps the app's layout boxes, so a tall page prints several
 * blank sheets before the cards.
 *
 * Instead, walk from the sheet up to `<body>` and `display: none` every sibling
 * on the way. That leaves exactly one spine of ancestors, which are then
 * neutralised — the app's scroll containers, `overflow: hidden`, fixed heights
 * and the preview's own `transform: scale()` would all otherwise clip or
 * rescale the sheet.
 */
export function isolateForPrint(el: HTMLElement | null): () => void {
  if (!el || typeof document === 'undefined') return () => {};

  const touched: HTMLElement[] = [];
  let node: HTMLElement | null = el;

  while (node && node !== document.body) {
    const parent = node.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children)) {
      if (sibling !== node && sibling instanceof HTMLElement) {
        sibling.classList.add(HIDDEN);
        touched.push(sibling);
      }
    }
    parent.classList.add(ANCESTOR);
    touched.push(parent);
    node = parent;
  }

  return () => {
    for (const n of touched) n.classList.remove(HIDDEN, ANCESTOR);
  };
}
