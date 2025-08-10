import { FormatRules } from '../types';

// Format rules registry - extensible and maintainable
export const FORMAT_RULES: Record<string, FormatRules> = {
  standard: {
    id: 'standard',
    name: 'Standard',
    deckSize: { min: 60, max: 60 },
    sideboardSize: 15,
    singleton: false,
    colorIdentityEnforced: false,
    hasCommander: false,
    banList: [],
    restrictedList: [],
    specialRules: {}
  },

  pioneer: {
    id: 'pioneer',
    name: 'Pioneer',
    deckSize: { min: 60, max: 60 },
    sideboardSize: 15,
    singleton: false,
    colorIdentityEnforced: false,
    hasCommander: false,
    banList: [],
    restrictedList: [],
    specialRules: {}
  },

  modern: {
    id: 'modern',
    name: 'Modern',
    deckSize: { min: 60, max: 60 },
    sideboardSize: 15,
    singleton: false,
    colorIdentityEnforced: false,
    hasCommander: false,
    banList: [],
    restrictedList: [],
    specialRules: {}
  },

  legacy: {
    id: 'legacy',
    name: 'Legacy',
    deckSize: { min: 60, max: 60 },
    sideboardSize: 15,
    singleton: false,
    colorIdentityEnforced: false,
    hasCommander: false,
    banList: [],
    restrictedList: [],
    specialRules: {}
  },

  vintage: {
    id: 'vintage',
    name: 'Vintage',
    deckSize: { min: 60, max: 60 },
    sideboardSize: 15,
    singleton: false,
    colorIdentityEnforced: false,
    hasCommander: false,
    banList: [],
    restrictedList: [
      'Black Lotus', 'Mox Pearl', 'Mox Sapphire', 'Mox Jet', 
      'Mox Ruby', 'Mox Emerald', 'Ancestral Recall', 'Time Walk'
    ],
    specialRules: {}
  },

  commander: {
    id: 'commander',
    name: 'Commander',
    deckSize: { min: 100, max: 100 },
    sideboardSize: 0,
    singleton: true,
    colorIdentityEnforced: true,
    hasCommander: true,
    banList: [
      'Ancestral Recall', 'Balance', 'Biorhythm', 'Black Lotus',
      'Braids, Cabal Minion', 'Chaos Orb', 'Coalition Victory',
      'Channel', 'Emrakul, the Aeons Torn', 'Fastbond'
    ],
    restrictedList: [],
    specialRules: {
      partners: true,
      backgrounds: true
    }
  },

  brawl: {
    id: 'brawl',
    name: 'Brawl',
    deckSize: { min: 100, max: 100 },
    sideboardSize: 0,
    singleton: true,
    colorIdentityEnforced: true,
    hasCommander: true,
    banList: [],
    restrictedList: [],
    specialRules: {}
  },

  pauper: {
    id: 'pauper',
    name: 'Pauper',
    deckSize: { min: 60, max: 60 },
    sideboardSize: 15,
    singleton: false,
    colorIdentityEnforced: false,
    hasCommander: false,
    banList: [],
    restrictedList: [],
    specialRules: {}
  }
};

export function getFormatRules(formatId: string): FormatRules | null {
  return FORMAT_RULES[formatId] || null;
}

export function isLegalCommander(card: Card): boolean {
  // CR 903.3a: Legendary creature OR card that explicitly says "can be your commander"
  const isLegendaryCreature = card.is_legendary && 
    card.type_line.toLowerCase().includes('creature');
  
  const hasCommanderText = card.oracle_text && 
    card.oracle_text.toLowerCase().includes('can be your commander');
  
  return isLegendaryCreature || !!hasCommanderText;
}

export function validateColorIdentity(card: Card, identity: string[]): boolean {
  if (!identity || identity.length === 0) return true;
  
  return card.color_identity.every(color => identity.includes(color));
}

export function isLegalInFormat(card: Card, formatId: string): boolean {
  const legality = card.legalities[formatId];
  return legality === 'legal' || legality === 'restricted';
}