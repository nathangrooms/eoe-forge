import { GameCard, Zone } from './types';
import { Card } from '@/lib/deckbuilder/types';

export interface TokenDefinition {
  name: string;
  power?: string;
  toughness?: string;
  type_line: string;
  colors?: string[];
  keywords?: string[];
  abilities?: string;
}

/**
 * Common token definitions used in Magic
 */
export const COMMON_TOKENS: Record<string, TokenDefinition> = {
  'treasure': {
    name: 'Treasure Token',
    type_line: 'Artifact — Treasure',
    abilities: '{T}, Sacrifice this artifact: Add one mana of any color.',
    colors: [],
  },
  'soldier': {
    name: 'Soldier Token',
    power: '1',
    toughness: '1',
    type_line: 'Creature — Soldier',
    colors: ['W'],
  },
  'goblin': {
    name: 'Goblin Token',
    power: '1',
    toughness: '1',
    type_line: 'Creature — Goblin',
    colors: ['R'],
  },
  'zombie': {
    name: 'Zombie Token',
    power: '2',
    toughness: '2',
    type_line: 'Creature — Zombie',
    colors: ['B'],
  },
  'saproling': {
    name: 'Saproling Token',
    power: '1',
    toughness: '1',
    type_line: 'Creature — Saproling',
    colors: ['G'],
  },
  'spirit': {
    name: 'Spirit Token',
    power: '1',
    toughness: '1',
    type_line: 'Creature — Spirit',
    colors: ['W'],
    keywords: ['Flying'],
  },
  'beast': {
    name: 'Beast Token',
    power: '3',
    toughness: '3',
    type_line: 'Creature — Beast',
    colors: ['G'],
  },
  'dragon': {
    name: 'Dragon Token',
    power: '5',
    toughness: '5',
    type_line: 'Creature — Dragon',
    colors: ['R'],
    keywords: ['Flying'],
  },
};

/**
 * Create a token card instance
 */
export function createToken(
  definition: TokenDefinition,
  controller: 'player1' | 'player2',
  instanceSuffix: string
): GameCard {
  const baseCard: Card = {
    id: `token-${definition.name.toLowerCase().replace(/\s+/g, '-')}`,
    name: definition.name,
    type_line: definition.type_line,
    oracle_text: definition.abilities || '',
    mana_cost: '',
    cmc: 0,
    colors: definition.colors || [],
    color_identity: definition.colors || [],
    power: definition.power,
    toughness: definition.toughness,
    keywords: definition.keywords || [],
    set: 'TOKEN',
    set_name: 'Token',
    collector_number: '0',
    rarity: 'common',
    image_uris: undefined,
    prices: undefined,
    legalities: {},
    layout: 'token',
    oracle_id: `token-${Math.random()}`,
    is_legendary: false,
    tags: new Set(),
  };

  return {
    ...baseCard,
    instanceId: `${controller}-token-${instanceSuffix}`,
    zone: 'battlefield' as Zone,
    controller,
    owner: controller,
    isTapped: false,
    isPhasedOut: false,
    counters: {},
    damageMarked: 0,
    summoningSick: true,
    wasPlayedThisTurn: true,
    powerModifier: 0,
    toughnessModifier: 0,
    abilitiesUsedThisTurn: [],
  };
}

/**
 * Parse token creation from card text
 * Returns array of token definitions to create
 */
export function parseTokenCreation(oracleText: string): Array<{ count: number; tokenType: string }> {
  const tokens: Array<{ count: number; tokenType: string }> = [];
  const text = oracleText.toLowerCase();

  // Pattern: "create X [token type] token(s)"
  const createPattern = /create (?:(\d+|a|an|one|two|three|four|five)) (\w+)(?: creature)? tokens?/gi;
  let match;
  
  while ((match = createPattern.exec(text)) !== null) {
    const countStr = match[1];
    const tokenType = match[2];
    
    let count = 1;
    if (countStr === 'a' || countStr === 'an' || countStr === 'one') count = 1;
    else if (countStr === 'two') count = 2;
    else if (countStr === 'three') count = 3;
    else if (countStr === 'four') count = 4;
    else if (countStr === 'five') count = 5;
    else if (/^\d+$/.test(countStr)) count = parseInt(countStr);

    // Map common token names
    const normalizedType = tokenType.replace(/s$/, ''); // Remove plural
    if (COMMON_TOKENS[normalizedType]) {
      tokens.push({ count, tokenType: normalizedType });
    }
  }

  return tokens;
}
