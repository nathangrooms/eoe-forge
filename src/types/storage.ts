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

export interface StorageSlot {
  id: string;
  container_id: string;
  name: string;
  position: number;
}

export interface StorageItem {
  id: string;
  container_id: string;
  slot_id?: string;
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
  slot_id?: string;
  card_id: string;
  qty: number;
  foil: boolean;
}

export interface StorageUnassignRequest {
  item_id: string;
  qty: number;
}

// Feature flags
export interface FeatureFlags {
  storage: boolean;
  dashboardLive: boolean;
}