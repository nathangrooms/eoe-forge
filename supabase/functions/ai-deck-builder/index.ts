import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface BuildRequest {
  format: string;
  colors?: string[];
  identity?: string[];
  themeId?: string;
  powerTarget: number;
  budget?: 'low' | 'med' | 'high';
  seed?: number;
  constraints?: {
    allowSets?: string[];
    ban?: string[];
  };
}

interface Card {
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
  legalities: Record<string, string>;
  image_uris?: Record<string, string>;
  prices?: Record<string, string>;
  rarity: string;
  tags: string[];
  is_legendary: boolean;
}

interface ChangelogEntry {
  action: 'add' | 'remove' | 'swap';
  card: string;
  reason: string;
  stage: string;
}

interface BuildResult {
  decklist: Card[];
  power: number;
  subscores: Record<string, number>;
  analysis: string;
  changelog: ChangelogEntry[];
}

// Seeded RNG for deterministic builds
function mulberry32(seed: number) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Deterministic card selection with weighted probability - Enhanced for power
function pickWeighted<T>(items: T[], weights: number[], rng: () => number): T | null {
  if (items.length === 0) return null;
  
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) return items[0];
  
  let random = rng() * totalWeight;
  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) return items[i];
  }
  
  return items[items.length - 1];
}

// Load archetype templates
function getArchetypeTemplate(themeId: string, format: string) {
  const templates: Record<string, any> = {
    // === CREATURE-BASED ARCHETYPES ===
    'aggro': {
      deckSize: 100,
      quotas: {
        creatures: { min: 30, max: 40 },
        'low-cost': { min: 15, max: 20 },
        removal: { min: 4, max: 6 },
        ramp: { min: 6, max: 8 },
        draw: { min: 6, max: 8 },
        lands: { min: 34, max: 36 }
      },
      curves: { '0-1': { min: 8, max: 15 }, '2': { min: 10, max: 15 }, '3': { min: 8, max: 12 }, '4': { min: 4, max: 8 }, '5+': { min: 2, max: 6 } }
    },
    'tribal': {
      deckSize: 100,
      quotas: {
        creatures: { min: 25, max: 35 },
        'tribal-lords': { min: 4, max: 8 },
        'tribal-support': { min: 6, max: 10 },
        removal: { min: 6, max: 8 },
        ramp: { min: 8, max: 10 },
        draw: { min: 8, max: 10 },
        lands: { min: 36, max: 38 }
      },
      curves: { '0-1': { min: 4, max: 8 }, '2': { min: 8, max: 12 }, '3': { min: 8, max: 12 }, '4': { min: 6, max: 10 }, '5+': { min: 6, max: 10 } }
    },
    'voltron': {
      deckSize: 100,
      quotas: {
        creatures: { min: 10, max: 20 },
        equipment: { min: 8, max: 12 },
        auras: { min: 4, max: 8 },
        protection: { min: 8, max: 12 },
        removal: { min: 6, max: 8 },
        ramp: { min: 8, max: 10 },
        draw: { min: 6, max: 8 },
        lands: { min: 36, max: 38 }
      },
      curves: { '0-1': { min: 4, max: 8 }, '2': { min: 8, max: 12 }, '3': { min: 6, max: 10 }, '4': { min: 4, max: 8 }, '5+': { min: 4, max: 8 } }
    },
    'aristocrats': {
      deckSize: 100,
      quotas: {
        creatures: { min: 25, max: 35 },
        'sacrifice-outlets': { min: 4, max: 6 },
        'death-payoffs': { min: 6, max: 8 },
        removal: { min: 6, max: 8 },
        ramp: { min: 8, max: 10 },
        draw: { min: 8, max: 10 },
        lands: { min: 36, max: 38 }
      },
      curves: { '0-1': { min: 4, max: 8 }, '2': { min: 8, max: 12 }, '3': { min: 6, max: 10 }, '4': { min: 4, max: 8 }, '5+': { min: 4, max: 8 } }
    },
    'tokens': {
      deckSize: 100,
      quotas: {
        creatures: { min: 15, max: 25 },
        'token-generators': { min: 8, max: 12 },
        anthems: { min: 4, max: 8 },
        'sacrifice-outlets': { min: 2, max: 4 },
        removal: { min: 6, max: 8 },
        ramp: { min: 8, max: 10 },
        draw: { min: 8, max: 10 },
        lands: { min: 36, max: 38 }
      },
      curves: { '0-1': { min: 3, max: 8 }, '2': { min: 8, max: 12 }, '3': { min: 6, max: 10 }, '4': { min: 4, max: 8 }, '5+': { min: 4, max: 8 } }
    },
    'counters': {
      deckSize: 100,
      quotas: {
        creatures: { min: 20, max: 30 },
        'counter-support': { min: 8, max: 12 },
        'counter-payoffs': { min: 4, max: 8 },
        removal: { min: 6, max: 8 },
        ramp: { min: 8, max: 10 },
        draw: { min: 8, max: 10 },
        lands: { min: 36, max: 38 }
      },
      curves: { '0-1': { min: 4, max: 8 }, '2': { min: 8, max: 12 }, '3': { min: 6, max: 10 }, '4': { min: 4, max: 8 }, '5+': { min: 4, max: 8 } }
    },
    'reanimator': {
      deckSize: 100,
      quotas: {
        creatures: { min: 15, max: 25 },
        'reanimation-spells': { min: 6, max: 10 },
        'discard-outlets': { min: 4, max: 6 },
        'big-threats': { min: 6, max: 10 },
        removal: { min: 6, max: 8 },
        ramp: { min: 6, max: 8 },
        draw: { min: 8, max: 10 },
        lands: { min: 36, max: 38 }
      },
      curves: { '0-1': { min: 2, max: 6 }, '2': { min: 6, max: 10 }, '3': { min: 4, max: 8 }, '4': { min: 4, max: 8 }, '5+': { min: 8, max: 15 } }
    },

    // === SPELL-BASED ARCHETYPES ===
    'spellslinger': {
      deckSize: 100,
      quotas: {
        creatures: { min: 10, max: 20 },
        instants: { min: 15, max: 25 },
        sorceries: { min: 10, max: 20 },
        'spell-payoffs': { min: 6, max: 10 },
        removal: { min: 6, max: 8 },
        ramp: { min: 8, max: 10 },
        draw: { min: 10, max: 15 },
        lands: { min: 36, max: 38 }
      },
      curves: { '0-1': { min: 6, max: 12 }, '2': { min: 8, max: 15 }, '3': { min: 6, max: 12 }, '4': { min: 4, max: 8 }, '5+': { min: 4, max: 8 } }
    },
    'control': {
      deckSize: 100,
      quotas: {
        creatures: { min: 6, max: 12 },
        counterspells: { min: 10, max: 15 },   // More counters
        removal: { min: 12, max: 18 },         // More removal
        sweepers: { min: 6, max: 10 },
        'fast-mana': { min: 6, max: 10 },      // Fast mana for tempo
        tutors: { min: 6, max: 10 },           // Tutors for consistency
        wincons: { min: 4, max: 8 },
        draw: { min: 12, max: 18 },
        lands: { min: 35, max: 37 }            // Fewer lands
      },
      curves: { '0-1': { min: 8, max: 15 }, '2': { min: 10, max: 18 }, '3': { min: 6, max: 12 }, '4': { min: 4, max: 8 }, '5+': { min: 2, max: 6 } }
    },
    'combo': {
      deckSize: 100,
      quotas: {
        creatures: { min: 8, max: 15 },
        'combo-pieces': { min: 8, max: 15 },
        tutors: { min: 12, max: 20 },      // More tutors for consistency
        'fast-mana': { min: 8, max: 12 },  // Essential for speed
        protection: { min: 8, max: 12 },
        removal: { min: 6, max: 10 },
        ramp: { min: 6, max: 10 },         // Less ramp, more fast mana
        draw: { min: 8, max: 12 },
        lands: { min: 32, max: 34 }        // Fewer lands, more gas
      },
      curves: { '0-1': { min: 12, max: 20 }, '2': { min: 10, max: 15 }, '3': { min: 6, max: 10 }, '4': { min: 2, max: 6 }, '5+': { min: 1, max: 4 } }
    },
    'stax': {
      deckSize: 100,
      quotas: {
        creatures: { min: 10, max: 20 },
        'stax-pieces': { min: 8, max: 15 },
        removal: { min: 6, max: 10 },
        protection: { min: 4, max: 8 },
        wincons: { min: 3, max: 6 },
        ramp: { min: 8, max: 12 },
        draw: { min: 8, max: 12 },
        lands: { min: 36, max: 38 }
      },
      curves: { '0-1': { min: 4, max: 8 }, '2': { min: 6, max: 12 }, '3': { min: 6, max: 12 }, '4': { min: 4, max: 8 }, '5+': { min: 4, max: 10 } }
    },

    // === SYNERGY-BASED ARCHETYPES ===
    'artifacts': {
      deckSize: 100,
      quotas: {
        creatures: { min: 15, max: 25 },
        artifacts: { min: 20, max: 30 },
        'artifact-payoffs': { min: 6, max: 10 },
        removal: { min: 6, max: 8 },
        ramp: { min: 8, max: 12 },
        draw: { min: 8, max: 10 },
        lands: { min: 34, max: 36 }
      },
      curves: { '0-1': { min: 6, max: 12 }, '2': { min: 8, max: 15 }, '3': { min: 6, max: 12 }, '4': { min: 4, max: 8 }, '5+': { min: 4, max: 8 } }
    },
    'enchantments': {
      deckSize: 100,
      quotas: {
        creatures: { min: 15, max: 25 },
        enchantments: { min: 15, max: 25 },
        'enchantment-payoffs': { min: 6, max: 10 },
        removal: { min: 6, max: 8 },
        ramp: { min: 8, max: 10 },
        draw: { min: 8, max: 10 },
        lands: { min: 36, max: 38 }
      },
      curves: { '0-1': { min: 4, max: 8 }, '2': { min: 8, max: 12 }, '3': { min: 6, max: 12 }, '4': { min: 4, max: 8 }, '5+': { min: 4, max: 8 } }
    },
    'graveyard': {
      deckSize: 100,
      quotas: {
        creatures: { min: 20, max: 30 },
        'graveyard-fillers': { min: 6, max: 10 },
        'graveyard-payoffs': { min: 8, max: 12 },
        removal: { min: 6, max: 8 },
        ramp: { min: 8, max: 10 },
        draw: { min: 8, max: 10 },
        lands: { min: 36, max: 38 }
      },
      curves: { '0-1': { min: 4, max: 8 }, '2': { min: 8, max: 12 }, '3': { min: 6, max: 12 }, '4': { min: 4, max: 8 }, '5+': { min: 4, max: 8 } }
    },
    'lands-matter': {
      deckSize: 100,
      quotas: {
        creatures: { min: 15, max: 25 },
        'land-ramp': { min: 10, max: 15 },
        'landfall-payoffs': { min: 6, max: 10 },
        removal: { min: 6, max: 8 },
        draw: { min: 8, max: 10 },
        lands: { min: 40, max: 45 }
      },
      curves: { '0-1': { min: 4, max: 8 }, '2': { min: 8, max: 12 }, '3': { min: 6, max: 12 }, '4': { min: 4, max: 8 }, '5+': { min: 6, max: 12 } }
    },
    'blink': {
      deckSize: 100,
      quotas: {
        creatures: { min: 20, max: 30 },
        'blink-effects': { min: 8, max: 12 },
        'etb-creatures': { min: 10, max: 15 },
        removal: { min: 6, max: 8 },
        ramp: { min: 8, max: 10 },
        draw: { min: 8, max: 10 },
        lands: { min: 36, max: 38 }
      },
      curves: { '0-1': { min: 2, max: 6 }, '2': { min: 8, max: 12 }, '3': { min: 8, max: 12 }, '4': { min: 6, max: 10 }, '5+': { min: 6, max: 10 } }
    },

    // === RESOURCE-BASED ARCHETYPES ===
    'ramp': {
      deckSize: 100,
      quotas: {
        creatures: { min: 20, max: 30 },
        'big-threats': { min: 8, max: 15 },
        ramp: { min: 15, max: 20 },
        removal: { min: 6, max: 8 },
        draw: { min: 8, max: 10 },
        lands: { min: 38, max: 42 }
      },
      curves: { '0-1': { min: 6, max: 12 }, '2': { min: 8, max: 15 }, '3': { min: 6, max: 10 }, '4': { min: 4, max: 8 }, '5+': { min: 8, max: 15 } }
    },
    'group-hug': {
      deckSize: 100,
      quotas: {
        creatures: { min: 15, max: 25 },
        'group-hug-effects': { min: 10, max: 15 },
        'political-cards': { min: 6, max: 10 },
        removal: { min: 4, max: 6 },
        ramp: { min: 10, max: 15 },
        draw: { min: 12, max: 18 },
        lands: { min: 36, max: 38 }
      },
      curves: { '0-1': { min: 3, max: 8 }, '2': { min: 6, max: 12 }, '3': { min: 6, max: 12 }, '4': { min: 4, max: 8 }, '5+': { min: 6, max: 12 } }
    },
    'lifegain': {
      deckSize: 100,
      quotas: {
        creatures: { min: 20, max: 30 },
        'lifegain-sources': { min: 8, max: 12 },
        'lifegain-payoffs': { min: 6, max: 10 },
        removal: { min: 6, max: 8 },
        ramp: { min: 8, max: 10 },
        draw: { min: 8, max: 10 },
        lands: { min: 36, max: 38 }
      },
      curves: { '0-1': { min: 4, max: 8 }, '2': { min: 8, max: 12 }, '3': { min: 6, max: 12 }, '4': { min: 4, max: 8 }, '5+': { min: 4, max: 8 } }
    },

    // === FALLBACK ARCHETYPES ===
    'midrange': {
      deckSize: 100,
      quotas: {
        creatures: { min: 20, max: 30 },
        removal: { min: 8, max: 12 },
        ramp: { min: 8, max: 12 },
        draw: { min: 8, max: 12 },
        threats: { min: 6, max: 10 },
        lands: { min: 36, max: 38 }
      },
      curves: { '0-1': { min: 3, max: 8 }, '2': { min: 6, max: 12 }, '3': { min: 6, max: 12 }, '4': { min: 4, max: 8 }, '5': { min: 2, max: 6 }, '6+': { min: 2, max: 6 } }
    },

    // === LEGACY TEMPLATES ===
    'commander-midrange': {
      deckSize: 100,
      quotas: { creatures: { min: 20, max: 30 }, ramp: { min: 8, max: 12 }, draw: { min: 8, max: 12 }, removal: { min: 8, max: 12 }, lands: { min: 35, max: 40 } },
      curves: { '0-1': { min: 3, max: 8 }, '2': { min: 6, max: 12 }, '3': { min: 6, max: 12 }, '4': { min: 4, max: 8 }, '5+': { min: 4, max: 8 } }
    }
  };

  // Default template based on format
  const defaultKey = format === 'commander' ? 'midrange' : 
                    format === 'standard' ? 'standard-aggro' : 'modern-control';
  
  return templates[themeId] || templates[defaultKey];
}

// Enhanced power score calculation for competitive accuracy
function calculatePowerScore(deck: Card[], format: string): { power: number; subscores: Record<string, number> } {
  const subscores = {
    speed: calculateSpeedScore(deck),
    interaction: calculateInteractionScore(deck), 
    ramp: calculateRampScore(deck),
    cardAdvantage: calculateCardAdvantageScore(deck),
    tutors: calculateTutorScore(deck),
    wincons: calculateWinconScore(deck),
    resilience: calculateResilienceScore(deck),
    mana: calculateManaScore(deck, format),
    synergy: calculateSynergyScore(deck),
    efficiency: calculateEfficiencyScore(deck),
    combo: calculateComboScore(deck)
  };

  // Enhanced format-specific weights prioritizing competitive metrics
  const weights = getFormatWeights(format);
  const weightedScore = Object.entries(subscores).reduce((total, [key, score]) => {
    return total + (score * (weights[key] || 1));
  }, 0) / Object.values(weights).reduce((a, b) => a + b, 0);

  // More aggressive power scaling - competitive decks should score higher
  const power = Math.max(1, Math.min(10, 2 + (weightedScore / 100) * 8));
  
  return { power, subscores };
}

function calculateSpeedScore(deck: Card[]): number {
  const lowCost = deck.filter(c => c.cmc <= 2 && !isLand(c)).length;
  const zeroCost = deck.filter(c => c.cmc === 0 && !isLand(c)).length;
  const oneCost = deck.filter(c => c.cmc === 1 && !isLand(c)).length;
  const fastMana = deck.filter(c => isFastMana(c)).length;
  
  // Enhanced speed calculation emphasizing early game explosiveness
  const speedScore = (zeroCost * 8) + (oneCost * 4) + (lowCost * 2) + (fastMana * 20);
  return Math.min(100, speedScore);
}

function calculateInteractionScore(deck: Card[]): number {
  const removal = deck.filter(c => isRemoval(c)).length;
  const counterspells = deck.filter(c => isCounterspell(c)).length;
  return Math.min(100, (removal * 8) + (counterspells * 10));
}

function calculateRampScore(deck: Card[]): number {
  const ramp = deck.filter(c => isRamp(c)).length;
  return Math.min(100, ramp * 12);
}

function calculateCardAdvantageScore(deck: Card[]): number {
  const draw = deck.filter(c => isCardDraw(c)).length;
  return Math.min(100, draw * 10);
}

function calculateTutorScore(deck: Card[]): number {
  const tutors = deck.filter(c => isTutor(c)).length;
  const broadTutors = deck.filter(c => {
    const text = c.oracle_text?.toLowerCase() || '';
    return text.includes('search') && text.includes('library') && text.includes('any card');
  }).length;
  
  // Weight broad tutors more heavily as they're more powerful
  return Math.min(100, (tutors * 15) + (broadTutors * 10));
}

function calculateWinconScore(deck: Card[]): number {
  const wincons = deck.filter(c => isWincon(c)).length;
  return Math.min(100, wincons * 25);
}

function calculateResilienceScore(deck: Card[]): number {
  const protection = deck.filter(c => isProtection(c)).length;
  return Math.min(100, protection * 15);
}

function calculateManaScore(deck: Card[], format: string): number {
  const lands = deck.filter(c => isLand(c)).length;
  const deckSize = deck.length;
  const ratio = lands / deckSize;
  const optimal = format === 'commander' ? 0.36 : 0.4;
  const deviation = Math.abs(ratio - optimal);
  return Math.max(20, 100 - (deviation * 200));
}

function calculateSynergyScore(deck: Card[]): number {
  const tagCounts = new Map<string, number>();
  deck.forEach(card => {
    card.tags.forEach(tag => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });
  });
  
  const maxSynergy = Math.max(...Array.from(tagCounts.values()), 0);
  return Math.min(100, (maxSynergy / deck.length) * 200);
}

function getFormatWeights(format: string): Record<string, number> {
  switch (format) {
    case 'commander':
      return { 
        speed: 1.4,           // Fast mana and low curve are critical
        interaction: 1.3,     // Removal and counters essential 
        ramp: 1.0,           // Important but not as critical as speed
        cardAdvantage: 1.2,   // Card draw engines matter
        tutors: 1.5,         // Tutors are power multipliers
        wincons: 1.3,        // Compact win conditions
        resilience: 1.1,     // Protection matters
        mana: 1.0,           // Manabase important but baseline
        synergy: 1.0,        // Nice but not as important as raw power
        efficiency: 1.4,     // New: CMC efficiency critical
        combo: 1.3           // New: Combo potential
      };
    case 'modern':
      return { speed: 1.3, interaction: 1.1, ramp: 0.8, cardAdvantage: 1.0, tutors: 1.2, wincons: 1.2, resilience: 0.9, mana: 1.1, synergy: 1.0, efficiency: 1.2, combo: 1.1 };
    case 'standard':
      return { speed: 1.1, interaction: 1.0, ramp: 0.9, cardAdvantage: 1.1, tutors: 0.8, wincons: 1.0, resilience: 0.9, mana: 1.0, synergy: 1.0, efficiency: 1.0, combo: 0.8 };
    default:
      return { speed: 1.0, interaction: 1.0, ramp: 1.0, cardAdvantage: 1.0, tutors: 1.0, wincons: 1.0, resilience: 1.0, mana: 1.0, synergy: 1.0, efficiency: 1.0, combo: 1.0 };
  }
}

// Card type detection functions
function isLand(card: Card): boolean {
  return card.type_line.toLowerCase().includes('land');
}

function isFastMana(card: Card): boolean {
  const text = card.oracle_text?.toLowerCase() || '';
  const name = card.name.toLowerCase();
  
  // Explicit fast mana staples
  const fastManaNames = [
    'sol ring', 'mana crypt', 'mana vault', 'chrome mox', 'mox diamond', 
    'mox opal', 'lotus petal', 'ancient tomb', 'city of traitors',
    'grim monolith', 'basalt monolith', 'thran dynamo'
  ];
  
  if (fastManaNames.some(staple => name.includes(staple))) return true;
  
  // Heuristic: low CMC mana producers
  return card.cmc <= 2 && 
         !card.type_line.toLowerCase().includes('land') &&
         text.includes('add') && 
         text.includes('mana');
}

function isRemoval(card: Card): boolean {
  const text = card.oracle_text?.toLowerCase() || '';
  return text.includes('destroy') || text.includes('exile') || text.includes('damage');
}

function isCounterspell(card: Card): boolean {
  return card.oracle_text?.toLowerCase().includes('counter target') || false;
}

function isRamp(card: Card): boolean {
  const text = card.oracle_text?.toLowerCase() || '';
  return (text.includes('search') && text.includes('land')) || 
         (text.includes('add') && text.includes('mana')) ||
         text.includes('ramp');
}

function isCardDraw(card: Card): boolean {
  const text = card.oracle_text?.toLowerCase() || '';
  return text.includes('draw') && text.includes('card');
}

function isTutor(card: Card): boolean {
  const text = card.oracle_text?.toLowerCase() || '';
  return text.includes('search') && text.includes('library') && !text.includes('basic land');
}

function isWincon(card: Card): boolean {
  const text = card.oracle_text?.toLowerCase() || '';
  const type = card.type_line.toLowerCase();
  return type.includes('planeswalker') || 
         text.includes('win the game') ||
         text.includes('damage to any target') ||
         (!!card.power && parseInt(card.power) >= 5);
}

function isProtection(card: Card): boolean {
  const text = card.oracle_text?.toLowerCase() || '';
  return text.includes('protection') || text.includes('hexproof') || text.includes('ward') || text.includes('indestructible');
}

// New efficiency scoring function
function calculateEfficiencyScore(deck: Card[]): number {
  let efficiency = 0;
  const nonLands = deck.filter(c => !isLand(c));
  
  nonLands.forEach(card => {
    const cmc = card.cmc;
    const text = card.oracle_text?.toLowerCase() || '';
    
    // High efficiency: powerful effects at low CMC
    if (cmc <= 1) {
      if (isFastMana(card) || isTutor(card) || isRemoval(card) || isCounterspell(card)) {
        efficiency += 15;
      } else {
        efficiency += 5;
      }
    } else if (cmc === 2) {
      if (isTutor(card) || isRemoval(card) || isCounterspell(card) || isCardDraw(card)) {
        efficiency += 10;
      } else {
        efficiency += 3;
      }
    } else if (cmc === 3) {
      if (isTutor(card) || text.includes('draw') || text.includes('destroy all')) {
        efficiency += 6;
      } else {
        efficiency += 1;
      }
    } else if (cmc >= 4) {
      // High CMC cards need to be very impactful
      if (text.includes('win the game') || text.includes('destroy all') || 
          text.includes('extra turn') || isWincon(card)) {
        efficiency += 3;
      } else {
        efficiency -= 2; // Penalty for expensive cards without huge impact
      }
    }
  });
  
  return Math.max(0, Math.min(100, efficiency));
}

// New combo potential scoring function  
function calculateComboScore(deck: Card[]): number {
  let comboScore = 0;
  const cardNames = deck.map(c => c.name.toLowerCase());
  
  // Known two-card combos
  const combos = [
    ['thassa\'s oracle', 'demonic consultation'],
    ['thassa\'s oracle', 'tainted pact'],
    ['isochron scepter', 'dramatic reversal'],
    ['kiki-jiki', 'zealous conscripts'],
    ['splinter twin', 'deceiver exarch'],
    ['dockside extortionist', 'temur sabertooth'],
    ['hermit druid', 'laboratory maniac'],
    ['rings of brighthearth', 'basalt monolith'],
    ['food chain', 'eternal scourge'],
    ['worldgorger dragon', 'animate dead']
  ];
  
  combos.forEach(combo => {
    const hasAllPieces = combo.every(piece => 
      cardNames.some(name => name.includes(piece))
    );
    if (hasAllPieces) {
      comboScore += 25; // Two-card combos are very powerful
    }
  });
  
  // Check for instant win cards
  deck.forEach(card => {
    const text = card.oracle_text?.toLowerCase() || '';
    if (text.includes('win the game') || text.includes('wins the game')) {
      comboScore += 15;
    }
    if (text.includes('infinite') && card.cmc <= 6) {
      comboScore += 10;
    }
  });
  
  return Math.min(100, comboScore);
}

// Deterministic deck building pipeline
async function buildDeck(request: BuildRequest): Promise<BuildResult> {
  const { format, colors, identity, themeId, powerTarget, budget = 'med', seed = 42 } = request;
  const rng = mulberry32(seed);
  const changelog: ChangelogEntry[] = [];
  
  // Step 1: Input validation
  if (format === 'commander' && (!identity || identity.length === 0)) {
    throw new Error('Commander format requires color identity');
  }
  
  const targetColors = identity || colors || [];
  const template = getArchetypeTemplate(themeId || 'default', format);
  
  // Step 2: Get card pool
  const cardPool = await getCardPool(format, targetColors, request.constraints);
  
  // Step 3: Build skeleton
  const deck: Card[] = [];
  
  // Step 4: Fill role quotas
  for (const [role, quota] of Object.entries(template.quotas)) {
    // Skip land quota here; manabase is handled in a dedicated step
    if (role === 'lands') continue;

    const roleCards = cardPool.filter(card => matchesRole(card, role));
    let target: number;
    if (typeof quota === 'object' && quota && 'min' in (quota as any)) {
      target = Number((quota as any).min);
    } else {
      target = Number(quota as any);
    }
    const selected = selectCards(roleCards, target, powerTarget, rng);
    
    deck.push(...selected);
    selected.forEach(card => {
      changelog.push({
        action: 'add',
        card: card.name,
        reason: `${role} quota requirement`,
        stage: 'role-fill'
      });
    });
  }
  
  // Step 5: Fill curve distribution
  const nonLands = deck.filter(card => !isLand(card));
  fillCurveDistribution(deck, cardPool, template.curves, nonLands.length, rng, changelog);
  
  // Step 6: Calculate required deck size before adding lands
  const targetSize = format === 'commander' ? 99 : 60;
  const landCount = template.quotas.lands?.min || (format === 'commander' ? 36 : 24);
  const nonLandTarget = targetSize - landCount;
  
  // Step 6a: Trim non-lands to make room for lands
  let currentNonLands = deck.filter(card => !isLand(card));
  while (currentNonLands.length > nonLandTarget) {
    // Remove excess non-lands, prioritizing highest CMC creatures first
    const sortedByPriority = currentNonLands.sort((a, b) => {
      // Prioritize removal of high CMC creatures
      if (a.type_line?.toLowerCase().includes('creature') && b.type_line?.toLowerCase().includes('creature')) {
        return b.cmc - a.cmc;
      }
      // Then high CMC non-creatures
      if (!a.type_line?.toLowerCase().includes('creature') && !b.type_line?.toLowerCase().includes('creature')) {
        return b.cmc - a.cmc;
      }
      // Prefer removing creatures over spells
      if (a.type_line?.toLowerCase().includes('creature')) return 1;
      if (b.type_line?.toLowerCase().includes('creature')) return -1;
      return 0;
    });
    
    const toRemove = sortedByPriority[0];
    if (toRemove) {
      const deckIndex = deck.indexOf(toRemove);
      const nonLandIndex = currentNonLands.indexOf(toRemove);
      if (deckIndex > -1) deck.splice(deckIndex, 1);
      if (nonLandIndex > -1) currentNonLands.splice(nonLandIndex, 1);
      
      changelog.push({
        action: 'remove',
        card: toRemove.name,
        reason: `Deck size optimization - making room for manabase`,
        stage: 'sizing'
      });
    } else {
      break;
    }
  }
  
  // Step 6b: Add lands
  const lands = buildManabase(cardPool, targetColors, landCount, format, rng);
  deck.push(...lands);
  
  lands.forEach(land => {
    changelog.push({
      action: 'add',
      card: land.name,
      reason: 'Manabase construction',
      stage: 'manabase'
    });
  });
  
  // Step 8: Power tuning loop
  let iterations = 0;
  const maxIterations = 3;
  
  while (iterations < maxIterations) {
    const { power } = calculatePowerScore(deck, format);
    const powerDiff = power - powerTarget;
    
    if (Math.abs(powerDiff) <= 1) break;
    
    if (powerDiff > 0) {
      // Too powerful - de-escalate
      deescalateDeck(deck, cardPool, powerDiff, rng, changelog);
    } else {
      // Too weak - escalate
      escalateDeck(deck, cardPool, Math.abs(powerDiff), rng, changelog);
    }
    
    iterations++;
  }
  
  // Step 7: Final exact size enforcement (lands and non-lands)
  {
    const finalTargetSize = format === 'commander' ? 99 : 60;
    const desiredLandCount = landCount; // from earlier calculation

    // Split deck
    let landsArr = deck.filter(isLand);
    let nonLandsArr = deck.filter(c => !isLand(c));

    // Adjust lands to desired count
    if (landsArr.length > desiredLandCount) {
      const excess = landsArr.length - desiredLandCount;
      for (let i = 0; i < excess; i++) {
        const landToRemove = landsArr.pop();
        if (!landToRemove) break;
        const idx = deck.lastIndexOf(landToRemove);
        if (idx > -1) deck.splice(idx, 1);
        changelog.push({ action: 'remove', card: landToRemove.name, reason: 'Reduce land count to target', stage: 'sizing' });
      }
    } else if (landsArr.length < desiredLandCount) {
      const need = desiredLandCount - landsArr.length;
      const extra = buildManabase(cardPool, targetColors, need, format, rng);
      deck.push(...extra);
      extra.forEach(land => changelog.push({ action: 'add', card: land.name, reason: 'Increase land count to target', stage: 'sizing' }));
      landsArr = deck.filter(isLand);
    }

    // Adjust non-lands to fill remaining slots exactly
    const desiredNonLandCount = finalTargetSize - desiredLandCount;
    const deckIds = new Set(deck.map(c => c.id));

    while (nonLandsArr.length > desiredNonLandCount) {
      // remove highest CMC non-land first
      nonLandsArr.sort((a, b) => b.cmc - a.cmc);
      const remove = nonLandsArr.shift();
      if (!remove) break;
      const idx = deck.indexOf(remove);
      if (idx > -1) deck.splice(idx, 1);
      changelog.push({ action: 'remove', card: remove.name, reason: 'Trim to exact deck size', stage: 'sizing' });
    }

    while (nonLandsArr.length < desiredNonLandCount) {
      const needed = desiredNonLandCount - nonLandsArr.length;
      const candidates = cardPool.filter(c => !isLand(c) && !deckIds.has(c.id));
      const additions = selectCards(candidates, needed, powerTarget, rng);
      deck.push(...additions);
      additions.forEach(card => changelog.push({ action: 'add', card: card.name, reason: 'Pad to exact deck size', stage: 'sizing' }));
      nonLandsArr = deck.filter(c => !isLand(c));
      additions.forEach(c => deckIds.add(c.id));
      if (additions.length === 0) break;
    }
  }

  // Step 8: Final analysis
  const { power, subscores } = calculatePowerScore(deck, format);
  const analysis = generateAnalysis(deck, subscores, powerTarget);
  
  return {
    decklist: deck,
    power,
    subscores,
    analysis,
    changelog
  };
}


async function getCardPool(format: string, colors: string[], constraints?: any): Promise<Card[]> {
  try {
    let query = supabase.from('cards').select('*');
    
    // Format legality filter
    if (format !== 'casual') {
      query = query.contains('legalities', { [format]: 'legal' });
    }
    
    // Color identity filter for Commander
    if (format === 'commander' && colors.length > 0) {
      query = query.overlaps('color_identity', colors);
    }
    
    // Apply constraints
    if (constraints?.ban) {
      query = query.not('name', 'in', `(${constraints.ban.join(',')})`);
    }
    
    const { data, error } = await query.limit(5000);
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('Error fetching card pool:', error);
    return [];
  }
}

function matchesRole(card: Card, role: string): boolean {
  switch (role) {
    case 'creatures': return card.type_line.toLowerCase().includes('creature');
    case 'ramp': return isRamp(card);
    case 'draw': return isCardDraw(card);
    case 'removal': return isRemoval(card);
    case 'counterspells': return isCounterspell(card);
    case 'tutors': return isTutor(card);
    case 'wincons': return isWincon(card);
    case 'lands': return isLand(card);
    case 'sweepers': return card.oracle_text?.toLowerCase().includes('destroy all') || false;
    case 'finishers': return isWincon(card);
    case 'protection': return isProtection(card);
    
    // Enhanced archetype-specific roles with power considerations
    case 'fast-mana': return isFastMana(card);
    case 'sacrifice-outlets': return !!(card.oracle_text?.toLowerCase().includes('sacrifice') && !card.oracle_text?.toLowerCase().includes('target'));
    case 'death-payoffs': return !!(card.oracle_text?.toLowerCase().includes('dies') || card.oracle_text?.toLowerCase().includes('death'));
    case 'blink-effects': return !!(card.oracle_text?.toLowerCase().includes('exile') && card.oracle_text?.toLowerCase().includes('return'));
    case 'etb-creatures': return !!(card.type_line.toLowerCase().includes('creature') && card.oracle_text?.toLowerCase().includes('enters'));
    case 'token-generators': return !!(card.oracle_text?.toLowerCase().includes('token'));
    case 'counter-support': return !!(card.oracle_text?.toLowerCase().includes('+1/+1 counter'));
    case 'counter-payoffs': return !!(card.oracle_text?.toLowerCase().includes('+1/+1 counter') && card.oracle_text?.toLowerCase().includes('power'));
    case 'anthems': return !!(card.oracle_text?.toLowerCase().includes('creatures you control get +'));
    case 'reanimation-spells': return !!(card.oracle_text?.toLowerCase().includes('return') && card.oracle_text?.toLowerCase().includes('graveyard') && card.oracle_text?.toLowerCase().includes('battlefield'));
    case 'discard-outlets': return !!(card.oracle_text?.toLowerCase().includes('discard'));
    case 'big-threats': return !!(card.cmc >= 6 && (card.type_line.toLowerCase().includes('creature') || card.type_line.toLowerCase().includes('planeswalker')));
    case 'spell-payoffs': return !!(card.oracle_text?.toLowerCase().includes('instant') || card.oracle_text?.toLowerCase().includes('sorcery'));
    case 'combo-pieces': return !!(card.oracle_text?.toLowerCase().includes('infinite') || 
                                   card.oracle_text?.toLowerCase().includes('each') || 
                                   card.oracle_text?.toLowerCase().includes('whenever') ||
                                   card.oracle_text?.toLowerCase().includes('win the game'));
    case 'stax-pieces': return !!(card.oracle_text?.toLowerCase().includes('can\'t') || card.oracle_text?.toLowerCase().includes('additional cost'));
    case 'artifacts': return !!(card.type_line.toLowerCase().includes('artifact'));
    case 'enchantments': return !!(card.type_line.toLowerCase().includes('enchantment'));
    case 'artifact-payoffs': return !!(card.oracle_text?.toLowerCase().includes('artifact'));
    case 'enchantment-payoffs': return !!(card.oracle_text?.toLowerCase().includes('enchantment'));
    case 'graveyard-fillers': return !!(card.oracle_text?.toLowerCase().includes('mill') || card.oracle_text?.toLowerCase().includes('graveyard'));
    case 'graveyard-payoffs': return !!(card.oracle_text?.toLowerCase().includes('graveyard') && !card.oracle_text?.toLowerCase().includes('mill'));
    case 'land-ramp': return !!(card.oracle_text?.toLowerCase().includes('search') && card.oracle_text?.toLowerCase().includes('land'));
    case 'landfall-payoffs': return !!(card.oracle_text?.toLowerCase().includes('landfall') || card.oracle_text?.toLowerCase().includes('land enters'));
    case 'group-hug-effects': return !!(card.oracle_text?.toLowerCase().includes('each player') || card.oracle_text?.toLowerCase().includes('all players'));
    case 'political-cards': return !!(card.oracle_text?.toLowerCase().includes('target opponent') || card.oracle_text?.toLowerCase().includes('choose'));
    case 'lifegain-sources': return !!(card.oracle_text?.toLowerCase().includes('gain') && card.oracle_text?.toLowerCase().includes('life'));
    case 'lifegain-payoffs': return !!(card.oracle_text?.toLowerCase().includes('life you gained') || card.oracle_text?.toLowerCase().includes('whenever you gain life'));
    case 'equipment': return !!(card.type_line.toLowerCase().includes('equipment'));
    case 'auras': return !!(card.type_line.toLowerCase().includes('aura'));
    case 'low-cost': return !!(card.cmc <= 2 && !isLand(card));
    case 'tribal-lords': return !!(card.oracle_text?.toLowerCase().includes('get +') && card.type_line.toLowerCase().includes('creature'));
    case 'tribal-support': return !!(card.oracle_text?.toLowerCase().includes('creature type') || card.oracle_text?.toLowerCase().includes('tribal'));
    case 'threats': return !!(card.type_line.toLowerCase().includes('creature') && card.cmc >= 4);
    case 'instants': return !!(card.type_line.toLowerCase().includes('instant'));
    case 'sorceries': return !!(card.type_line.toLowerCase().includes('sorcery'));
    
    default: return false;
  }
}

function selectCards(cards: Card[], count: number, powerTarget: number, rng: () => number): Card[] {
  if (cards.length === 0) return [];
  
  // Enhanced weighting system for competitive power levels
  const weights = cards.map(card => {
    let weight = 1;
    const name = card.name.toLowerCase();
    const text = card.oracle_text?.toLowerCase() || '';
    const price = parseFloat(card.prices?.usd || '0');
    
    // Tier 0/1 cEDH staples get massive bonuses
    const cEDHStaples = [
      'sol ring', 'mana crypt', 'mana vault', 'chrome mox', 'mox diamond', 'mox opal',
      'lotus petal', 'grim monolith', 'ancient tomb', 'city of traitors',
      'demonic tutor', 'vampiric tutor', 'imperial seal', 'grim tutor', 'diabolic intent',
      'mystical tutor', 'enlightened tutor', 'worldly tutor', 'survival of the fittest',
      'force of will', 'force of negation', 'mana drain', 'fierce guardianship',
      'counterspell', 'swan song', 'flusterstorm', 'mental misstep',
      'swords to plowshares', 'path to exile', 'assassin\'s trophy', 'abrupt decay',
      'cyclonic rift', 'toxic deluge', 'wrath of god', 'damnation',
      'dockside extortionist', 'ragavan nimble pilferer', 'esper sentinel',
      'thassa\'s oracle', 'jace wielder of mysteries', 'laboratory maniac',
      'demonic consultation', 'tainted pact', 'ad nauseam', 'necropotence',
      'rhystic study', 'mystic remora', 'sylvan library', 'smothering tithe',
      'deflecting swat', 'teferi\'s protection', 'heroic intervention',
      'gaea\'s cradle', 'tolarian academy', 'bazaar of baghdad', 'strip mine',
      'craterhoof behemoth', 'eldrazi monument', 'finale of devastation'
    ];
    
    // Ultra-high-power combo pieces
    const comboStaples = [
      'isochron scepter', 'dramatic reversal', 'rings of brighthearth',
      'basalt monolith', 'grim monolith', 'thopter foundry', 'sword of the meek',
      'kiki-jiki mirror breaker', 'zealous conscripts', 'splinter twin',
      'deceiver exarch', 'twin flame', 'heat shimmer', 'food chain',
      'eternal scourge', 'squee the immortal', 'wordgorger dragon',
      'animate dead', 'necromancy', 'dance of the dead', 'hermit druid',
      'laboratory maniac', 'leveler', 'phyrexian devourer', 'necrotic ooze',
      'walking ballista', 'mikaeus the unhallowed', 'triskelion'
    ];
    
    // Powerful interaction and disruption
    const premiumInteraction = [
      'force of will', 'force of negation', 'mana drain', 'counterspell',
      'negate', 'dispel', 'swan song', 'pyroblast', 'red elemental blast',
      'silence', 'orim\'s chant', 'grand abolisher', 'teferi time raveler',
      'null rod', 'stony silence', 'collector ouphe', 'kataki war\'s wage',
      'winter orb', 'static orb', 'sphere of resistance', 'thorn of amethyst'
    ];
    
    // Apply tier-based weighting
    if (cEDHStaples.some(staple => name.includes(staple.replace('\'', '')))) {
      weight += powerTarget >= 8 ? 8 : powerTarget >= 7 ? 5 : powerTarget >= 6 ? 3 : 2;
    }
    
    if (comboStaples.some(staple => name.includes(staple.replace('\'', '')))) {
      weight += powerTarget >= 8 ? 6 : powerTarget >= 7 ? 4 : powerTarget >= 6 ? 2 : 1;
    }
    
    if (premiumInteraction.some(staple => name.includes(staple.replace('\'', '')))) {
      weight += powerTarget >= 8 ? 5 : powerTarget >= 7 ? 3 : powerTarget >= 6 ? 2 : 1;
    }
    
    // Enhanced fast mana detection and weighting
    if (isFastMana(card) || (card.cmc <= 2 && text.includes('add') && text.includes('mana'))) {
      if (card.cmc === 0) weight += powerTarget >= 7 ? 6 : 4;
      else if (card.cmc === 1) weight += powerTarget >= 7 ? 4 : 3;
      else if (card.cmc === 2) weight += powerTarget >= 7 ? 3 : 2;
    }
    
    // Tutors are extremely powerful - weight heavily
    if (isTutor(card) || (text.includes('search') && text.includes('library') && !text.includes('basic land'))) {
      if (text.includes('any card')) weight += powerTarget >= 7 ? 5 : 3;
      else weight += powerTarget >= 7 ? 4 : 2;
    }
    
    // Instant-win conditions
    if (text.includes('win the game') || text.includes('wins the game')) {
      weight += powerTarget >= 7 ? 4 : powerTarget >= 6 ? 3 : 2;
    }
    
    // Free spells and alternative costs
    if (card.cmc === 0 || text.includes('without paying') || text.includes('you may cast') ||
        text.includes('alternative cost') || text.includes('exile') && text.includes('hand')) {
      weight += powerTarget >= 7 ? 3 : 2;
    }
    
    // Efficiency-based weighting (low CMC high impact)
    if (card.cmc <= 1 && !card.type_line.includes('Land')) {
      weight += powerTarget >= 7 ? 2 : 1;
    } else if (card.cmc === 2 && (isRemoval(card) || isCounterspell(card) || isCardDraw(card))) {
      weight += powerTarget >= 7 ? 1.5 : 1;
    }
    
    // Price correlation (expensive cards often powerful)
    if (powerTarget >= 7) {
      if (price > 100) weight += 4;
      else if (price > 50) weight += 3;
      else if (price > 20) weight += 2;
      else if (price > 10) weight += 1;
    } else if (powerTarget >= 6) {
      if (price > 50) weight += 2;
      else if (price > 20) weight += 1;
    }
    
    // Penalize high CMC cards heavily unless they're game-ending
    if (card.cmc >= 7) {
      const isGameEnder = text.includes('win the game') || 
                         text.includes('extra turn') ||
                         name.includes('eldrazi') ||
                         name.includes('blightsteel') ||
                         name.includes('ulamog') ||
                         name.includes('kozilek') ||
                         name.includes('emrakul');
      if (!isGameEnder && powerTarget >= 7) {
        weight *= 0.3;
      } else if (!isGameEnder && powerTarget >= 6) {
        weight *= 0.5;
      }
    } else if (card.cmc >= 5 && powerTarget >= 8) {
      // Even 5-6 CMC cards get penalized at highest power levels
      const isHighImpact = text.includes('draw') && text.includes('card') ||
                          isWincon(card) ||
                          text.includes('destroy all') ||
                          text.includes('each opponent');
      if (!isHighImpact) {
        weight *= 0.7;
      }
    }
    
    // Legendary creatures that aren't commanders get bonus if powerful
    if (card.type_line.includes('Legendary') && card.type_line.includes('Creature') && card.cmc <= 4) {
      weight += powerTarget >= 7 ? 1 : 0.5;
    }
    
    return Math.max(0.1, weight);
  });
  
  const selected: Card[] = [];
  const used = new Set<string>();
  
  for (let i = 0; i < count && selected.length < cards.length; i++) {
    const availableCards = cards.filter(card => !used.has(card.id));
    const availableWeights = availableCards.map((_, idx) => weights[cards.indexOf(availableCards[idx])]);
    
    const pick = pickWeighted(availableCards, availableWeights, rng);
    if (pick) {
      selected.push(pick);
      used.add(pick.id);
    }
  }
  
  return selected;
}

function fillCurveDistribution(deck: Card[], cardPool: Card[], curves: any, currentNonLands: number, rng: () => number, changelog: ChangelogEntry[]) {
  // Implementation for curve filling would go here
  // This is a simplified version
}

function buildManabase(cardPool: Card[], colors: string[], landCount: number, format: string, rng: () => number): Card[] {
  const lands = cardPool.filter(isLand);
  
  // Basic manabase construction
  const basics = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
  const colorToBasic: Record<string, string> = {
    'W': 'Plains', 'U': 'Island', 'B': 'Swamp', 'R': 'Mountain', 'G': 'Forest'
  };
  
  const manabase: Card[] = [];
  
  // Add basics proportionally
  const basicsPerColor = Math.floor(landCount * 0.6 / colors.length);
  colors.forEach(color => {
    const basicName = colorToBasic[color];
    if (basicName) {
      for (let i = 0; i < basicsPerColor; i++) {
        const basic = lands.find(land => land.name === basicName);
        if (basic) manabase.push(basic);
      }
    }
  });
  
  // Fill remaining with dual lands or utility lands
  const remaining = landCount - manabase.length;
  const nonBasics = lands.filter(land => !basics.includes(land.name));
  const selectedNonBasics = selectCards(nonBasics, remaining, 5, rng);
  manabase.push(...selectedNonBasics);
  
  return manabase.slice(0, landCount);
}

function escalateDeck(deck: Card[], cardPool: Card[], powerDiff: number, rng: () => number, changelog: ChangelogEntry[]) {
  // Aggressively add the highest-power cards available
  const ultraPowerCards = cardPool.filter(card => {
    const name = card.name.toLowerCase();
    const text = card.oracle_text?.toLowerCase() || '';
    const price = parseFloat(card.prices?.usd || '0');
    
    // Tier 0/1 cEDH staples - the most powerful cards in the format
    const tier0Cards = [
      'mana crypt', 'sol ring', 'ancient tomb', 'mana vault', 'chrome mox',
      'demonic tutor', 'vampiric tutor', 'imperial seal', 'grim tutor',
      'force of will', 'force of negation', 'mana drain', 'counterspell',
      'thassa\'s oracle', 'jace wielder of mysteries', 'laboratory maniac',
      'demonic consultation', 'tainted pact', 'ad nauseam', 'necropotence',
      'dockside extortionist', 'ragavan nimble pilferer', 'esper sentinel',
      'fierce guardianship', 'deflecting swat', 'cyclonic rift',
      'rhystic study', 'mystic remora', 'sylvan library', 'smothering tithe',
      'gaea\'s cradle', 'tolarian academy', 'bazaar of baghdad'
    ];
    
    // High-powered combo pieces
    const comboPieces = [
      'isochron scepter', 'dramatic reversal', 'rings of brighthearth',
      'basalt monolith', 'grim monolith', 'thopter foundry', 'sword of the meek',
      'kiki-jiki mirror breaker', 'zealous conscripts', 'splinter twin',
      'deceiver exarch', 'food chain', 'eternal scourge', 'worldgorger dragon',
      'animate dead', 'necromancy', 'hermit druid', 'walking ballista',
      'mikaeus the unhallowed', 'triskelion', 'finale of devastation'
    ];
    
    // Premium interaction
    const premiumRemoval = [
      'swords to plowshares', 'path to exile', 'assassin\'s trophy',
      'abrupt decay', 'toxic deluge', 'wrath of god', 'damnation',
      'teferi\'s protection', 'heroic intervention', 'silence', 'grand abolisher'
    ];
    
    return tier0Cards.some(staple => name.includes(staple.replace('\'', ''))) ||
           comboPieces.some(piece => name.includes(piece.replace('\'', ''))) ||
           premiumRemoval.some(removal => name.includes(removal.replace('\'', ''))) ||
           (isFastMana(card) && card.cmc <= 2) ||
           (isTutor(card) && card.cmc <= 4) ||
           (text.includes('win the game') && card.cmc <= 6) ||
           (card.cmc === 0 && !card.type_line.includes('Land')) ||
           (text.includes('infinite') && card.cmc <= 5) ||
           (price > 50 && card.cmc <= 4) ||
           (text.includes('without paying') && card.cmc <= 3);
  });
  
  if (ultraPowerCards.length > 0) {
    const toAdd = Math.min(Math.ceil(powerDiff * 1.5), 5); // More aggressive additions
    const selected = selectCards(ultraPowerCards, toAdd, 9, rng); // Target power 9
    
    // Remove the weakest cards first - prioritize high CMC, low impact cards
    const toRemove = deck.filter(card => {
      if (isLand(card)) return false; // Don't remove lands
      
      const text = card.oracle_text?.toLowerCase() || '';
      const name = card.name.toLowerCase();
      
      // Remove high CMC cards that aren't game-enders
      if (card.cmc >= 6) {
        const isGameEnder = text.includes('win the game') || 
                           text.includes('extra turn') ||
                           name.includes('craterhoof') ||
                           name.includes('eldrazi');
        return !isGameEnder;
      }
      
      // Remove low-impact cards
      if (card.cmc >= 4) {
        const hasImpact = text.includes('draw') && text.includes('card') ||
                         text.includes('destroy') ||
                         text.includes('counter') ||
                         text.includes('search') ||
                         isWincon(card);
        return !hasImpact;
      }
      
      return false;
    }).slice(0, selected.length);
    
    toRemove.forEach(card => {
      const index = deck.indexOf(card);
      if (index > -1) {
        deck.splice(index, 1);
        changelog.push({
          action: 'remove',
          card: card.name,
          reason: 'Power escalation - remove inefficient card',
          stage: 'tuning'
        });
      }
    });
    
    deck.push(...selected);
    selected.forEach(card => {
      changelog.push({
        action: 'add',
        card: card.name,
        reason: 'Power escalation - add cEDH staple',
        stage: 'tuning'
      });
    });
  }
}

function deescalateDeck(deck: Card[], cardPool: Card[], powerDiff: number, rng: () => number, changelog: ChangelogEntry[]) {
  // Remove powerful cards: fast mana, tutors, replace with fair alternatives
  const powerCards = deck.filter(card => isFastMana(card) || isTutor(card));
  
  if (powerCards.length > 0) {
    const toRemove = Math.min(Math.ceil(powerDiff), powerCards.length);
    const toRemoveCards = powerCards.slice(0, toRemove);
    
    toRemoveCards.forEach(card => {
      const index = deck.indexOf(card);
      if (index > -1) {
        deck.splice(index, 1);
        changelog.push({
          action: 'remove',
          card: card.name,
          reason: 'Power de-escalation - remove fast mana/tutors',
          stage: 'tuning'
        });
      }
    });
    
    // Replace with fair alternatives
    const fairCards = cardPool.filter(card => !isFastMana(card) && !isTutor(card) && card.cmc >= 3);
    const replacements = selectCards(fairCards, toRemove, 4, rng);
    
    deck.push(...replacements);
    replacements.forEach(card => {
      changelog.push({
        action: 'add',
        card: card.name,
        reason: 'Power de-escalation - add fair alternative',
        stage: 'tuning'
      });
    });
  }
}

function generateAnalysis(deck: Card[], subscores: Record<string, number>, powerTarget: number): string {
  const strengths = Object.entries(subscores).filter(([_, score]) => score >= 70).map(([key]) => key);
  const weaknesses = Object.entries(subscores).filter(([_, score]) => score <= 40).map(([key]) => key);
  
  let analysis = `This deck is built for power level ${powerTarget}. `;
  
  if (strengths.length > 0) {
    analysis += `Strengths include ${strengths.join(', ')}. `;
  }
  
  if (weaknesses.length > 0) {
    analysis += `Areas for improvement: ${weaknesses.join(', ')}. `;
  }
  
  return analysis;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request = await req.json();
    console.log('Building deck with request:', request);
    
    // Convert frontend request format to backend format
    const buildRequest: BuildRequest = {
      format: request.format || 'commander',
      colors: request.colors || request.commander?.color_identity || [],
      identity: request.identity || request.commander?.color_identity || [],
      themeId: request.themeId || request.archetype || 'commander-midrange',
      powerTarget: request.powerTarget || request.powerLevel || 6,
      budget: request.budget,
      seed: request.seed || Math.floor(Math.random() * 10000)
    };
    
    const result = await buildDeck(buildRequest);
    
    return new Response(JSON.stringify({
      success: true,
      deck: result.decklist.map(card => ({
        id: card.id,
        name: card.name,
        quantity: 1,
        cmc: card.cmc || 0,
        type_line: card.type_line || '',
        colors: card.colors || [],
        mana_cost: card.mana_cost || '',
        oracle_text: card.oracle_text || '',
        image_uris: card.image_uris || {},
        prices: card.prices || {},
        rarity: card.rarity || 'common',
        reason: `Added for ${buildRequest.themeId} synergy`
      })),
      analysis: {
        powerLevel: result.power,
        strengths: Object.entries(result.subscores || {}).filter(([_, score]) => score >= 70).map(([key]) => key),
        weaknesses: Object.entries(result.subscores || {}).filter(([_, score]) => score <= 40).map(([key]) => key),
        suggestions: [`Optimize for power level ${buildRequest.powerTarget}`, "Consider adding more synergistic pieces", "Balance your mana curve"]
      },
      power: result.power,
      subscores: result.subscores,
      changelog: result.changelog,
      metadata: {
        powerLevel: result.power,
        cardCount: result.decklist.length,
        totalValue: result.decklist.reduce((sum, card) => sum + (parseFloat(card.prices?.usd || '0') || 0), 0)
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('AI deck builder error:', error);
    return new Response(JSON.stringify({ 
      error: (error as any).message || 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});