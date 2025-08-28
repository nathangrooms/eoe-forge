// Collection TypeScript Types
export type CardId = string;     // scryfall id (printing)
export type OracleId = string;   // scryfall oracle id

export interface Card {
  id: CardId;
  oracle_id: OracleId;
  name: string;
  set_code: string;
  collector_number?: string;
  colors: string[];
  color_identity: string[];
  cmc: number;
  type_line: string;
  oracle_text?: string;
  keywords: string[];
  legalities: Record<string, "legal"|"not_legal"|"restricted"|"banned">;
  image_uris?: { 
    small?: string; 
    normal?: string; 
    large?: string;
    art_crop?: string;
    border_crop?: string;
  };
  is_legendary: boolean;
  prices?: { 
    usd?: string|null; 
    usd_foil?: string|null; 
    usd_etched?: string|null;
    eur?: string|null;
    eur_foil?: string|null;
  };
  rarity: 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus';
  updated_at?: string;
}

export interface CollectionCard {
  id: string;              // user_collections.id
  user_id: string;
  card_id: CardId;         // references cards.id
  card_name: string;
  set_code: string;
  quantity: number;
  foil: number;
  condition: 'mint' | 'near_mint' | 'excellent' | 'good' | 'light_played' | 'played' | 'poor';
  price_usd?: number;
  created_at: string;
  updated_at: string;
  card?: Card;             // joined card data
}

export interface CollectionSnapshot {
  id: string;
  user_id: string;
  items: CollectionCard[];
  totals: { 
    unique: number; 
    count: number; 
    valueUSD: number;
    avgCmc: number;
  };
}

export interface CollectionFilters {
  search?: string;
  sets?: string[];
  colors?: string[];
  types?: string[];
  rarity?: string;
  cmcMin?: number;
  cmcMax?: number;
  format?: string;
  owned?: boolean;
  foilOnly?: boolean;
  condition?: string[];
}

export interface ImportResult {
  total: number;
  added: number;
  updated: number;
  errors: string[];
  warnings: string[];
}

export interface CardSearchResult {
  cards: Card[];
  has_more: boolean;
  total_cards?: number;
  next_page?: string;
}

// API response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface CollectionStats {
  totalCards: number;
  uniqueCards: number;
  totalValue: number;
  avgCmc: number;
  colorDistribution: Record<string, number>;
  typeDistribution: Record<string, number>;
  rarityDistribution: Record<string, number>;
  setDistribution: Record<string, number>;
  topValueCards: CollectionCard[];
  recentlyAdded: CollectionCard[];
}