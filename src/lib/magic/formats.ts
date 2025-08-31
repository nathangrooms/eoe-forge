// Magic: The Gathering Format Definitions
// Comprehensive format support with validation rules

export interface Format {
  name: string;
  code: string;
  description: string;
  deckSize: {
    min: number;
    max: number;
    exactSize?: number;
  };
  cardLimits: {
    defaultLimit: number;
    basicLandLimit?: number;
    exceptions?: Record<string, number>; // Card name -> limit
  };
  bannedCards?: string[];
  restrictedCards?: string[];
  allowedSets?: string[];
  rotationDate?: string;
  isEternal: boolean;
  isSingleton: boolean;
  commandZone?: {
    required: boolean;
    cardCount: number;
    types: string[];
  };
}

// Current competitive formats
export const STANDARD_FORMAT: Format = {
  name: 'Standard',
  code: 'standard',
  description: 'The most recent two years of Magic sets',
  deckSize: { min: 60, max: Infinity },
  cardLimits: { defaultLimit: 4 },
  isEternal: false,
  isSingleton: false
};

export const PIONEER_FORMAT: Format = {
  name: 'Pioneer',
  code: 'pioneer',
  description: 'Return to Ravnica forward',
  deckSize: { min: 60, max: Infinity },
  cardLimits: { defaultLimit: 4 },
  isEternal: true,
  isSingleton: false
};

export const MODERN_FORMAT: Format = {
  name: 'Modern',
  code: 'modern',
  description: 'Eighth Edition/Mirrodin forward',
  deckSize: { min: 60, max: Infinity },
  cardLimits: { defaultLimit: 4 },
  isEternal: true,
  isSingleton: false
};

export const LEGACY_FORMAT: Format = {
  name: 'Legacy',
  code: 'legacy',
  description: 'All Magic cards except banned list',
  deckSize: { min: 60, max: Infinity },
  cardLimits: { 
    defaultLimit: 4,
    basicLandLimit: Infinity,
    exceptions: {
      // Restricted cards would go here but Legacy doesn't have restricted list
    }
  },
  isEternal: true,
  isSingleton: false
};

export const VINTAGE_FORMAT: Format = {
  name: 'Vintage',
  code: 'vintage',
  description: 'All Magic cards with restricted list',
  deckSize: { min: 60, max: Infinity },
  cardLimits: { 
    defaultLimit: 4,
    basicLandLimit: Infinity,
    exceptions: {
      // Restricted cards - limit 1
      'Black Lotus': 1,
      'Mox Pearl': 1,
      'Mox Sapphire': 1,
      'Mox Jet': 1,
      'Mox Ruby': 1,
      'Mox Emerald': 1,
      'Time Walk': 1,
      'Ancestral Recall': 1,
      'Timetwister': 1,
      'Sol Ring': 1,
      'Mana Crypt': 1,
      'Demonic Tutor': 1,
      'Vampiric Tutor': 1,
      'Mystical Tutor': 1,
      'Imperial Seal': 1,
      'Tinker': 1,
      'Yawgmoth\'s Will': 1,
      'Channel': 1,
      'Regrowth': 1,
      'Brainstorm': 1,
      'Ponder': 1,
      'Preordain': 1,
      'Gitaxian Probe': 1,
      'Gush': 1,
      'Fastbond': 1,
      'Strip Mine': 1,
      'Wasteland': 1,
      'Crucible of Worlds': 1,
      'Lodestone Golem': 1,
      'Thorn of Amethyst': 1,
      'Chalice of the Void': 1
    }
  },
  restrictedCards: [
    'Black Lotus', 'Mox Pearl', 'Mox Sapphire', 'Mox Jet', 'Mox Ruby', 'Mox Emerald',
    'Time Walk', 'Ancestral Recall', 'Timetwister', 'Sol Ring', 'Mana Crypt',
    'Demonic Tutor', 'Vampiric Tutor', 'Mystical Tutor', 'Imperial Seal',
    'Tinker', 'Yawgmoth\'s Will', 'Channel', 'Regrowth', 'Brainstorm',
    'Ponder', 'Preordain', 'Gitaxian Probe', 'Gush', 'Fastbond',
    'Strip Mine', 'Wasteland', 'Crucible of Worlds', 'Lodestone Golem',
    'Thorn of Amethyst', 'Chalice of the Void'
  ],
  isEternal: true,
  isSingleton: false
};

export const COMMANDER_FORMAT: Format = {
  name: 'Commander',
  code: 'commander',
  description: '100-card singleton with legendary commander',
  deckSize: { min: 100, max: 100, exactSize: 100 },
  cardLimits: { 
    defaultLimit: 1,
    basicLandLimit: Infinity
  },
  commandZone: {
    required: true,
    cardCount: 1,
    types: ['Legendary Creature', 'Planeswalker Commander']
  },
  isEternal: true,
  isSingleton: true
};

export const BRAWL_FORMAT: Format = {
  name: 'Brawl',
  code: 'brawl',
  description: '60-card singleton with legendary commander, Standard cards only',
  deckSize: { min: 60, max: 60, exactSize: 60 },
  cardLimits: { 
    defaultLimit: 1,
    basicLandLimit: Infinity
  },
  commandZone: {
    required: true,
    cardCount: 1,
    types: ['Legendary Creature', 'Planeswalker']
  },
  isEternal: false,
  isSingleton: true
};

// Limited formats
export const DRAFT_FORMAT: Format = {
  name: 'Draft',
  code: 'draft',
  description: 'Limited format with drafted cards',
  deckSize: { min: 40, max: Infinity },
  cardLimits: { 
    defaultLimit: Infinity,
    basicLandLimit: Infinity
  },
  isEternal: false,
  isSingleton: false
};

export const SEALED_FORMAT: Format = {
  name: 'Sealed',
  code: 'sealed',
  description: 'Limited format with sealed product',
  deckSize: { min: 40, max: Infinity },
  cardLimits: { 
    defaultLimit: Infinity,
    basicLandLimit: Infinity
  },
  isEternal: false,
  isSingleton: false
};

// Casual formats
export const PENNY_DREADFUL_FORMAT: Format = {
  name: 'Penny Dreadful',
  code: 'penny',
  description: 'Budget format using cards under $0.02',
  deckSize: { min: 60, max: Infinity },
  cardLimits: { defaultLimit: 4 },
  isEternal: true,
  isSingleton: false
};

export const PAUPER_FORMAT: Format = {
  name: 'Pauper',
  code: 'pauper',
  description: 'Common cards only',
  deckSize: { min: 60, max: Infinity },
  cardLimits: { defaultLimit: 4 },
  isEternal: true,
  isSingleton: false
};

export const HISTORIC_FORMAT: Format = {
  name: 'Historic',
  code: 'historic',
  description: 'MTG Arena eternal format',
  deckSize: { min: 60, max: Infinity },
  cardLimits: { defaultLimit: 4 },
  isEternal: true,
  isSingleton: false
};

export const ALCHEMY_FORMAT: Format = {
  name: 'Alchemy',
  code: 'alchemy',
  description: 'Digital-only cards with rebalancing',
  deckSize: { min: 60, max: Infinity },
  cardLimits: { defaultLimit: 4 },
  isEternal: false,
  isSingleton: false
};

export const EXPLORER_FORMAT: Format = {
  name: 'Explorer',
  code: 'explorer',
  description: 'Pioneer-equivalent on MTG Arena',
  deckSize: { min: 60, max: Infinity },
  cardLimits: { defaultLimit: 4 },
  isEternal: true,
  isSingleton: false
};

// Comprehensive format registry
export const ALL_FORMATS: Record<string, Format> = {
  standard: STANDARD_FORMAT,
  pioneer: PIONEER_FORMAT,
  modern: MODERN_FORMAT,
  legacy: LEGACY_FORMAT,
  vintage: VINTAGE_FORMAT,
  commander: COMMANDER_FORMAT,
  brawl: BRAWL_FORMAT,
  draft: DRAFT_FORMAT,
  sealed: SEALED_FORMAT,
  penny: PENNY_DREADFUL_FORMAT,
  pauper: PAUPER_FORMAT,
  historic: HISTORIC_FORMAT,
  alchemy: ALCHEMY_FORMAT,
  explorer: EXPLORER_FORMAT
};

// Format categories for UI
export const FORMAT_CATEGORIES = {
  constructed: {
    name: 'Constructed',
    formats: ['standard', 'pioneer', 'modern', 'legacy', 'vintage']
  },
  multiplayer: {
    name: 'Multiplayer',
    formats: ['commander', 'brawl']
  },
  limited: {
    name: 'Limited',
    formats: ['draft', 'sealed']
  },
  digital: {
    name: 'Digital',
    formats: ['historic', 'alchemy', 'explorer']
  },
  casual: {
    name: 'Casual',
    formats: ['pauper', 'penny']
  }
} as const;

// Format validation utilities
export class FormatValidator {
  static isLegalDeckSize(format: Format, deckSize: number): boolean {
    if (format.deckSize.exactSize) {
      return deckSize === format.deckSize.exactSize;
    }
    return deckSize >= format.deckSize.min && deckSize <= format.deckSize.max;
  }

  static getCardLimit(format: Format, cardName: string, isBasicLand: boolean = false): number {
    if (isBasicLand && format.cardLimits.basicLandLimit !== undefined) {
      return format.cardLimits.basicLandLimit;
    }
    
    if (format.cardLimits.exceptions?.[cardName] !== undefined) {
      return format.cardLimits.exceptions[cardName];
    }
    
    return format.cardLimits.defaultLimit;
  }

  static isCardLegal(format: Format, cardName: string): boolean {
    if (format.bannedCards?.includes(cardName)) {
      return false;
    }
    return true;
  }

  static isCardRestricted(format: Format, cardName: string): boolean {
    return format.restrictedCards?.includes(cardName) || false;
  }

  static validateDeck(format: Format, deck: Array<{ name: string; quantity: number; isBasicLand?: boolean }>): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check deck size
    const totalCards = deck.reduce((sum, card) => sum + card.quantity, 0);
    if (!this.isLegalDeckSize(format, totalCards)) {
      if (format.deckSize.exactSize) {
        errors.push(`Deck must be exactly ${format.deckSize.exactSize} cards (currently ${totalCards})`);
      } else {
        errors.push(`Deck must be between ${format.deckSize.min} and ${format.deckSize.max} cards (currently ${totalCards})`);
      }
    }

    // Check individual card limits
    for (const card of deck) {
      const limit = this.getCardLimit(format, card.name, card.isBasicLand);
      
      if (card.quantity > limit) {
        if (limit === 0) {
          errors.push(`${card.name} is banned in ${format.name}`);
        } else {
          errors.push(`${card.name}: maximum ${limit} allowed (currently ${card.quantity})`);
        }
      }

      if (this.isCardRestricted(format, card.name) && card.quantity > 1) {
        errors.push(`${card.name} is restricted to 1 copy in ${format.name}`);
      }
    }

    // Check commander requirements
    if (format.commandZone?.required) {
      const commanderCards = deck.filter(card => 
        format.commandZone!.types.some(type => 
          card.name.toLowerCase().includes('legendary') || 
          type.toLowerCase().includes('planeswalker')
        )
      );

      if (commanderCards.length === 0) {
        errors.push(`${format.name} requires a commander in the command zone`);
      } else if (commanderCards.length > format.commandZone.cardCount) {
        errors.push(`${format.name} allows only ${format.commandZone.cardCount} commander(s)`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// Get format by code
export function getFormat(code: string): Format | undefined {
  return ALL_FORMATS[code];
}

// Get all formats in a category
export function getFormatsByCategory(category: keyof typeof FORMAT_CATEGORIES): Format[] {
  return FORMAT_CATEGORIES[category].formats.map(code => ALL_FORMATS[code]);
}

// Check if a format is rotating
export function isRotatingFormat(format: Format): boolean {
  return !format.isEternal;
}

// Get format legality for a card
export function getCardLegality(cardLegalities: Record<string, string>, formatCode: string): 'legal' | 'not_legal' | 'restricted' | 'banned' {
  return cardLegalities[formatCode] as 'legal' | 'not_legal' | 'restricted' | 'banned' || 'not_legal';
}