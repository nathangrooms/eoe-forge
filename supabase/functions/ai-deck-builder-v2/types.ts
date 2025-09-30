// Shared types for deck builder edge function
export interface Card {
  id: string;
  oracle_id: string;
  name: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  colors: string[];
  color_identity: string[];
  power?: string;
  toughness?: string;
  keywords: string[];
  legalities: Record<string, 'legal' | 'not_legal' | 'restricted' | 'banned'>;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    art_crop?: string;
  };
  prices?: {
    usd?: string;
    usd_foil?: string;
  };
  set: string;
  set_name: string;
  collector_number: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus';
  layout: string;
  is_legendary: boolean;
  tags: Set<string>;
}

export interface BuildContext {
  format: string;
  colors?: string[];
  identity?: string[];
  themeId: string;
  powerTarget: number;
  budget: 'low' | 'med' | 'high';
  seed: number;
}

export interface BuildResult {
  deck: Card[];
  commander?: Card;
  sideboard: Card[];
  analysis: {
    power: number;
    subscores: Record<string, number>;
    curve: Record<string, number>;
    colorDistribution: Record<string, number>;
    tags: Record<string, number>;
  };
  changeLog: string[];
  validation: {
    isLegal: boolean;
    errors: string[];
    warnings: string[];
  };
}
