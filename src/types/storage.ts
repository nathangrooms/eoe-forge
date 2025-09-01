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

export interface StorageOverview {
  containers: (StorageContainer & {
    itemCount: number;
    valueUSD: number;
    uniqueCards: number;
  })[];
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