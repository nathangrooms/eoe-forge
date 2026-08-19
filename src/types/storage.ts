// Storage TypeScript Types
export type StorageType = "box" | "binder" | "deckbox" | "shelf" | "other" | "deck-linked";

export interface StorageContainer {
  id: string;
  user_id: string;
  name: string;
  type: StorageType;
  color?: string;
  icon?: string;
  is_default?: boolean;
  deck_id?: string;
  created_at: string;
  updated_at: string;
}

/**
 * One subdivision of a container: a binder page, a box divider, a shelf level.
 *
 * Six of these have sat in the database since the first storage migration and
 * nothing ever drew them. What one is CALLED for a given container type is
 * decided in `src/lib/storage/subdivision.ts`, not here, because the answer
 * comes from what the object is rather than from what the row holds.
 */
export interface StorageSlot {
  id: string;
  container_id: string;
  name: string;
  position: number;
}

export interface StorageItem {
  id: string;
  container_id: string;
  slot_id?: string | null;
  /**
   * Which of the nine pockets on the binder page named by `slot_id`.
   *
   * Null is the normal case and means "filed here, in no particular pocket".
   * The database enforces 1-9, one card per pocket, and `qty = 1` whenever this
   * is set, because a pocket holds one card.
   */
  pocket?: number | null;
  card_id: string;
  qty: number;
  foil: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * A real card from a container, shaped for `CardImage`.
 *
 * Storage is the one thing this product knows that Moxfield and Archidekt do
 * not — *where a card physically is* — and it was being drawn as three numbers
 * in a definition list. A binder is a thing you look at cards through, so the
 * overview now carries the actual cards to put in the pockets. `id` and
 * `image_uris` keep the Scryfall shape so `CardImage` and `/cards/:id` each
 * take one of these unmodified.
 */
export interface StoragePreviewCard {
  id: string;
  name: string;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    png?: string;
    border_crop?: string;
    art_crop?: string;
  };
  /** Copies of this exact printing and finish in the container. */
  qty: number;
  foil: boolean;
  /** Unit price in USD, foil-aware. 0 when the printing carries no price. */
  usd: number;
}

export interface StorageContainerSummary extends StorageContainer {
  itemCount: number;
  valueUSD: number;
  uniqueCards: number;
  /**
   * The most valuable cards actually in this container, most valuable first.
   * Capped — a bulk box holds thousands and a binder page shows nine.
   */
  preview: StoragePreviewCard[];
}

export interface StorageOverview {
  containers: StorageContainerSummary[];
  unassigned: {
    count: number;
    valueUSD: number;
    uniqueCards: number;
  };
}

export interface StorageTemplate {
  id: string;
  name: string;
  type: StorageType;
  icon?: string;
  color?: string;
  slots?: { name: string; position: number }[];
}

export interface StorageItemWithCard extends StorageItem {
  /** The page or divider this row is filed under, when it is filed at all. */
  slot?: { id: string; name: string; position: number } | null;
  card?: {
    id: string;
    name: string;
    image_uris?: { small?: string; normal?: string };
    prices?: { usd?: string };
    set_code: string;
    rarity: string;
    type_line: string;
    cmc?: number;
    colors?: string[];
  };
}

export interface StorageAssignRequest {
  container_id: string;
  slot_id?: string | null;
  /** A binder pocket, 1-9. Only ever set alongside `slot_id`, and only for qty 1. */
  pocket?: number | null;
  card_id: string;
  qty: number;
  foil: boolean;
}

export interface StorageUnassignRequest {
  item_id: string;
  qty: number;
}

/**
 * Move copies of one stored row somewhere else.
 *
 * This is ONE action, not a remove followed by an add: `StorageAPI.moveCards`
 * calls the `storage_move_cards` database function, which carries the printing
 * and the finish across and splits the stack when only part of it is moving. A
 * container holding 3 copies can send 1 elsewhere and keep 2.
 */
export interface StorageMoveRequest {
  item_id: string;
  qty: number;
  to_container_id: string;
  /** Omit to file the cards in the container without a page or divider. */
  to_slot_id?: string | null;
  /** Binder pocket 1-9. Needs `to_slot_id`, and moves exactly one card. */
  to_pocket?: number | null;
}

// Feature flags
export interface FeatureFlags {
  storage: boolean;
  dashboardLive: boolean;
}