// Core types for the universal deck builder system

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
  derived?: {
    mv: number;
    colorPips: Record<string, number>;
    producesMana: boolean;
    etbTapped: boolean;
  };
}

export interface FormatRules {
  id: string;
  name: string;
  deckSize: { min: number; max: number };
  sideboardSize: number;
  singleton: boolean;
  colorIdentityEnforced: boolean;
  hasCommander: boolean;
  banList: string[];
  restrictedList: string[];
  specialRules: {
    companions?: boolean;
    partners?: boolean;
    backgrounds?: boolean;
  };
}

export interface ArchetypeTemplate {
  id: string;
  name: string;
  formats: string[];
  colors?: string[];
  weights: {
    synergy: Record<string, number>;
    roles: Record<string, number>;
  };
  quotas: {
    counts: Record<string, { min: number; max: number }>;
    creatures_curve: Record<string, string>; // "1": "7-10", etc.
  };
  packages: Array<{
    name: string;
    require: Array<{ tag: string; count: number }>;
    prefer?: Array<{ tag: string; count: number }>;
  }>;
  bans: string[];
  requires: string[];
  power_gates: {
    low: { cap: Record<string, number> };
    high: { floor: Record<string, number> };
  };
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

export interface Pick {
  card: Card;
  reason: string;
  stage: string;
  priority: number;
}

export interface DeckAnalysis {
  power: number;
  subscores: {
    speed: number;
    interaction: number;
    tutors: number;
    wincon: number;
    mana: number;
    consistency: number;
  };
  curve: Record<string, number>;
  colorDistribution: Record<string, number>;
  tags: Record<string, number>;
}

export interface BuildResult {
  deck: Card[];
  commander?: Card;
  sideboard: Card[];
  analysis: DeckAnalysis;
  changeLog: string[];
  validation: {
    isLegal: boolean;
    errors: string[];
    warnings: string[];
  };
}

export type Role = 'land' | 'creature' | 'instant' | 'sorcery' | 'enchantment' | 'artifact' | 'planeswalker' | 'battle' | 'commander';

// Tag categories for the universal tagger
export const ROLE_TAGS = [
  'ramp', 'fixing', 'removal-spot', 'removal-sweeper', 'counterspell', 
  'discard', 'draw', 'tutor-broad', 'tutor-narrow', 'protection', 
  'recursion', 'graveyard-hate', 'artifact-hate', 'enchant-hate', 
  'wincon', 'combo-piece', 'fast-mana'
] as const;

export const SYNERGY_TAGS = [
  'tribal', 'tokens', 'aristocrats', 'sac-outlet', 'blink', 'etb',
  'spellslinger', 'prowess', 'counters', 'auras', 'equipment',
  'artifacts-matter', 'enchantments-matter', 'lands-matter', 'landfall',
  'domain', 'gates', 'treasure', 'devotion', 'storm', 'reanimator',
  'stax', 'vehicle', 'energy', 'snow', 'transform', 'adventure'
] as const;

export type RoleTag = typeof ROLE_TAGS[number];
export type SynergyTag = typeof SYNERGY_TAGS[number];