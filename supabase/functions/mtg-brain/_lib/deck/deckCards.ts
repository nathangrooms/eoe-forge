/**
 * GENERATED FILE — do not edit. Written by scripts/vendor-engine.mjs.
 *
 * `_lib/deck/deckLegality.ts` is a byte-identical copy of
 * `src/lib/deck/deckLegality.ts`, and that file names its row type as
 * `./deckCards.ts`. The real `deckCards.ts` reaches the Supabase client
 * through Vite's `@/` alias and cannot be mirrored into a Deno function, so
 * this declares the part of the row the legality rules read and nothing else.
 *
 * Narrower on purpose: a field that is not here cannot drift from the field it
 * would have copied. `src/lib/tutor/mirror-types.test.ts` asserts this shape
 * against the real one at compile time in both directions.
 */

/** The joined card columns the legality rules read. */
export interface DeckCardDetail {
  name: string;
  legalities: Record<string, string> | null;
  color_identity: string[];
}

export interface DeckCardRow {
  card_name: string;
  quantity: number;
  /** `null` when the printing is missing from the local card table. */
  card: DeckCardDetail | null;
}
