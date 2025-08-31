export type ListingStatus = "draft" | "active" | "sold" | "removed";
export type ListingVisibility = "private" | "public";

export interface Listing {
  id: string;
  user_id: string;
  card_id: string;
  qty: number;
  foil: boolean;
  condition: string;
  price_usd: number;
  currency: string;
  note?: string;
  visibility: ListingVisibility;
  status: ListingStatus;
  created_at: string;
  updated_at: string;
  card?: any;
}

export interface Sale {
  id: string;
  user_id: string;
  listing_id: string;
  card_id: string;
  qty: number;
  foil: boolean;
  condition: string;
  sale_price_usd: number;
  platform: string;
  buyer_info?: string;
  shipped: boolean;
  shipped_at?: string;
  tracking_number?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  card?: any;
  listing?: Listing;
}

export interface ListingFormData {
  card_id: string;
  qty: number;
  foil: boolean;
  condition: string;
  price_usd: number;
  note?: string;
  visibility: ListingVisibility;
  status: ListingStatus;
}

export interface SaleFormData {
  listing_id: string;
  sale_price_usd: number;
  platform: string;
  buyer_info?: string;
  notes?: string;
}