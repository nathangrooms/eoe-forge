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

// Deterministic card selection with weighted probability
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
      curves: {
        '0-1': { min: 4, max: 8 },
        '2': { min: 8, max: 12 },
        '3': { min: 6, max: 10 },
        '4': { min: 4, max: 8 },
        '5+': { min: 4, max: 8 }
      }
    },
    'blink-flicker': {
      deckSize: 100,
      quotas: {
        creatures: { min: 20, max: 30 },
        'blink-effects': { min: 8, max: 12 },
        'etb-creatures': { min: 8, max: 12 },
        removal: { min: 6, max: 8 },
        ramp: { min: 8, max: 10 },
        draw: { min: 8, max: 10 },
        lands: { min: 36, max: 38 }
      },
      curves: {
        '0-1': { min: 2, max: 6 },
        '2': { min: 8, max: 12 },
        '3': { min: 8, max: 12 },
        '4': { min: 6, max: 10 },
        '5+': { min: 6, max: 10 }
      }
    },
    'token-sacrifice': {
      deckSize: 100,
      quotas: {
        creatures: { min: 15, max: 25 },
        'token-generators': { min: 8, max: 12 },
        'sacrifice-outlets': { min: 4, max: 6 },
        'death-payoffs': { min: 4, max: 6 },
        removal: { min: 6, max: 8 },
        ramp: { min: 8, max: 10 },
        draw: { min: 8, max: 10 },
        lands: { min: 36, max: 38 }
      },
      curves: {
        '0-1': { min: 3, max: 8 },
        '2': { min: 8, max: 12 },
        '3': { min: 6, max: 10 },
        '4': { min: 4, max: 8 },
        '5+': { min: 4, max: 8 }
      }
    },
    'counter-voltron': {
      deckSize: 100,
      quotas: {
        creatures: { min: 15, max: 25 },
        'counter-support': { min: 8, max: 12 },
        protection: { min: 6, max: 8 },
        removal: { min: 6, max: 8 },
        ramp: { min: 8, max: 10 },
        draw: { min: 8, max: 10 },
        lands: { min: 36, max: 38 }
      },
      curves: {
        '0-1': { min: 4, max: 8 },
        '2': { min: 8, max: 12 },
        '3': { min: 6, max: 10 },
        '4': { min: 4, max: 8 },
        '5+': { min: 4, max: 8 }
      }
    },
    'commander-midrange': {
      deckSize: 100,
      quotas: {
        creatures: { min: 20, max: 30 },
        ramp: { min: 8, max: 12 },
        draw: { min: 8, max: 12 },
        removal: { min: 8, max: 12 },
        sweepers: { min: 2, max: 4 },
        tutors: { min: 0, max: 4 },
        wincons: { min: 2, max: 4 },
        lands: { min: 35, max: 40 }
      },
      curves: {
        '0-1': { min: 3, max: 8 },
        '2': { min: 6, max: 12 },
        '3': { min: 6, max: 12 },
        '4': { min: 4, max: 8 },
        '5': { min: 2, max: 6 },
        '6-7': { min: 2, max: 4 },
        '8+': { min: 0, max: 2 }
      }
    },
    'standard-aggro': {
      deckSize: 60,
      quotas: {
        creatures: { min: 20, max: 28 },
        removal: { min: 6, max: 10 },
        draw: { min: 2, max: 6 },
        finishers: { min: 3, max: 6 },
        lands: { min: 20, max: 26 }
      },
      curves: {
        '0-1': { min: 8, max: 12 },
        '2': { min: 8, max: 12 },
        '3': { min: 6, max: 10 },
        '4': { min: 2, max: 6 },
        '5+': { min: 0, max: 4 }
      }
    },
    'modern-control': {
      deckSize: 60,
      quotas: {
        counterspells: { min: 8, max: 12 },
        removal: { min: 8, max: 12 },
        sweepers: { min: 2, max: 4 },
        draw: { min: 6, max: 10 },
        wincons: { min: 2, max: 4 },
        lands: { min: 22, max: 26 }
      },
      curves: {
        '0-1': { min: 4, max: 8 },
        '2': { min: 8, max: 12 },
        '3': { min: 6, max: 10 },
        '4': { min: 4, max: 8 },
        '5+': { min: 2, max: 6 }
      }
    }
  };

  // Default template based on format
  const defaultKey = format === 'commander' ? 'commander-midrange' : 
                    format === 'standard' ? 'standard-aggro' : 'modern-control';
  
  return templates[themeId] || templates[defaultKey];
}

// Calculate power score for a deck
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
    synergy: calculateSynergyScore(deck)
  };

  // Format-specific weights
  const weights = getFormatWeights(format);
  const weightedScore = Object.entries(subscores).reduce((total, [key, score]) => {
    return total + (score * (weights[key] || 1));
  }, 0) / Object.values(weights).reduce((a, b) => a + b, 0);

  const power = Math.max(1, Math.min(10, 1 + (weightedScore / 100) * 9));
  
  return { power, subscores };
}

function calculateSpeedScore(deck: Card[]): number {
  const lowCost = deck.filter(c => c.cmc <= 2 && !isLand(c)).length;
  const fastMana = deck.filter(c => isFastMana(c)).length;
  return Math.min(100, (lowCost * 2) + (fastMana * 15));
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
  return Math.min(100, tutors * 20);
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
      return { speed: 0.8, interaction: 1.2, ramp: 1.1, cardAdvantage: 1.3, tutors: 0.9, wincons: 1.0, resilience: 1.1, mana: 1.0, synergy: 1.4 };
    case 'modern':
      return { speed: 1.3, interaction: 1.1, ramp: 0.8, cardAdvantage: 1.0, tutors: 1.2, wincons: 1.2, resilience: 0.9, mana: 1.1, synergy: 1.0 };
    case 'standard':
      return { speed: 1.1, interaction: 1.0, ramp: 0.9, cardAdvantage: 1.1, tutors: 0.8, wincons: 1.0, resilience: 0.9, mana: 1.0, synergy: 1.0 };
    default:
      return { speed: 1.0, interaction: 1.0, ramp: 1.0, cardAdvantage: 1.0, tutors: 1.0, wincons: 1.0, resilience: 1.0, mana: 1.0, synergy: 1.0 };
  }
}

// Card type detection functions
function isLand(card: Card): boolean {
  return card.type_line.toLowerCase().includes('land');
}

function isFastMana(card: Card): boolean {
  return card.cmc <= 2 && !!card.oracle_text?.toLowerCase().includes('add') && !!card.oracle_text?.toLowerCase().includes('mana');
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
  
  // Step 6: Add lands
  const landCount = template.quotas.lands?.min || (format === 'commander' ? 36 : 24);
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
  
  // Step 7: Power tuning loop
  let iterations = 0;
  const maxIterations = 5;
  
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
    
    // Archetype-specific roles
    case 'sacrifice-outlets': return !!(card.oracle_text?.toLowerCase().includes('sacrifice') && !card.oracle_text?.toLowerCase().includes('target'));
    case 'death-payoffs': return !!(card.oracle_text?.toLowerCase().includes('dies') || card.oracle_text?.toLowerCase().includes('death'));
    case 'blink-effects': return !!(card.oracle_text?.toLowerCase().includes('exile') && card.oracle_text?.toLowerCase().includes('return'));
    case 'etb-creatures': return !!(card.type_line.toLowerCase().includes('creature') && card.oracle_text?.toLowerCase().includes('enters'));
    case 'token-generators': return !!(card.oracle_text?.toLowerCase().includes('token'));
    case 'counter-support': return !!(card.oracle_text?.toLowerCase().includes('+1/+1 counter'));
    
    default: return false;
  }
}

function selectCards(cards: Card[], count: number, powerTarget: number, rng: () => number): Card[] {
  if (cards.length === 0) return [];
  
  // Weight cards by power level appropriateness
  const weights = cards.map(card => {
    let weight = 1;
    
    // Prefer cards with appropriate power level
    if (powerTarget >= 8 && isFastMana(card)) weight += 2;
    if (powerTarget <= 4 && card.cmc > 5) weight -= 1;
    if (powerTarget >= 7 && isTutor(card)) weight += 1;
    
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
  // Add more powerful cards: fast mana, tutors, efficient threats
  const powerCards = cardPool.filter(card => isFastMana(card) || isTutor(card) || (isWincon(card) && card.cmc <= 4));
  
  if (powerCards.length > 0) {
    const toAdd = Math.min(Math.ceil(powerDiff), 3);
    const selected = selectCards(powerCards, toAdd, 8, rng);
    
    // Remove less powerful cards
    const toRemove = deck.filter(card => !isLand(card) && card.cmc > 5).slice(0, selected.length);
    
    toRemove.forEach(card => {
      const index = deck.indexOf(card);
      if (index > -1) {
        deck.splice(index, 1);
        changelog.push({
          action: 'remove',
          card: card.name,
          reason: 'Power escalation - remove high CMC',
          stage: 'tuning'
        });
      }
    });
    
    deck.push(...selected);
    selected.forEach(card => {
      changelog.push({
        action: 'add',
        card: card.name,
        reason: 'Power escalation - add efficient threat',
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
      deck: result.decklist,
      analysis: result.analysis,
      power: result.power,
      subscores: result.subscores,
      changelog: result.changelog,
      metadata: {
        powerLevel: result.power,
        cardCount: result.decklist.length
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