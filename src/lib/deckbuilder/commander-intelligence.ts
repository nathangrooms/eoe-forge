import { Card } from './types';

/**
 * Commander Intelligence - Analyzes commanders to suggest optimal archetypes
 * and card priorities based on their abilities and characteristics
 */
export class CommanderIntelligence {
  /**
   * Detect the optimal archetype for a commander based on their abilities
   */
  static detectArchetype(commander: Card): {
    primary: string;
    secondary: string[];
    keyTags: string[];
    avoidTags: string[];
  } {
    const text = (commander.oracle_text || '').toLowerCase();
    const type = commander.type_line.toLowerCase();
    const colors = commander.color_identity;
    
    // Counter/Proliferate commanders
    if (text.includes('proliferate') || text.includes('+1/+1 counter')) {
      return {
        primary: 'commander-counters',
        secondary: ['commander-tokens'],
        keyTags: ['counters', 'proliferate', 'planeswalker', 'draw', 'ramp'],
        avoidTags: ['storm', 'fast-mana']
      };
    }
    
    // Token commanders
    if (text.includes('create') && (text.includes('token') || text.includes('creature token'))) {
      return {
        primary: 'commander-tokens',
        secondary: ['commander-aristocrats'],
        keyTags: ['tokens', 'aristocrats', 'sac-outlet', 'draw', 'ramp'],
        avoidTags: ['storm', 'combo-piece']
      };
    }
    
    // Sacrifice/Aristocrats commanders
    if (text.includes('sacrifice') || text.includes('dies') || text.includes('death trigger')) {
      return {
        primary: 'commander-aristocrats',
        secondary: ['commander-tokens', 'commander-reanimator'],
        keyTags: ['aristocrats', 'sac-outlet', 'tokens', 'recursion', 'draw'],
        avoidTags: ['voltron', 'equipment']
      };
    }
    
    // Spellslinger commanders
    if (text.includes('instant') || text.includes('sorcery') || 
        text.includes('spell') || text.includes('cast')) {
      return {
        primary: 'commander-spellslinger',
        secondary: ['commander-control'],
        keyTags: ['instant', 'sorcery', 'draw', 'counterspell', 'spellslinger'],
        avoidTags: ['creature', 'tribal']
      };
    }
    
    // Control commanders (typically with counterspell/bounce abilities)
    if (text.includes('counter target') || text.includes('return') || 
        (colors.includes('U') && text.includes('draw'))) {
      return {
        primary: 'commander-control',
        secondary: ['commander-spellslinger'],
        keyTags: ['counterspell', 'draw', 'removal-spot', 'removal-sweeper', 'protection'],
        avoidTags: ['aggro', 'tokens']
      };
    }
    
    // Voltron commanders (equipment/aura focused)
    if (text.includes('equip') || text.includes('aura') || 
        text.includes('attached') || type.includes('knight')) {
      return {
        primary: 'commander-voltron',
        secondary: [],
        keyTags: ['equipment', 'auras', 'protection', 'tutor-narrow', 'ramp'],
        avoidTags: ['tokens', 'aristocrats']
      };
    }
    
    // Reanimator commanders
    if (text.includes('graveyard') || text.includes('return') && text.includes('battlefield')) {
      return {
        primary: 'commander-reanimator',
        secondary: ['commander-aristocrats'],
        keyTags: ['reanimator', 'recursion', 'self-mill', 'ramp', 'tutor-narrow'],
        avoidTags: ['tokens', 'voltron']
      };
    }
    
    // Default to midrange/value
    return {
      primary: 'midrange-value',
      secondary: [],
      keyTags: ['draw', 'ramp', 'removal-spot', 'creature'],
      avoidTags: []
    };
  }
  
  /**
   * Get priority multipliers for card tags based on commander
   */
  static getPriorityMultipliers(commander: Card): Record<string, number> {
    const archetype = this.detectArchetype(commander);
    const multipliers: Record<string, number> = {};
    
    // Boost key tags
    archetype.keyTags.forEach(tag => {
      multipliers[tag] = 1.5;
    });
    
    // Penalize avoid tags
    archetype.avoidTags.forEach(tag => {
      multipliers[tag] = 0.5;
    });
    
    // Always prioritize staples
    multipliers['draw'] = Math.max(multipliers['draw'] || 1, 1.3);
    multipliers['ramp'] = Math.max(multipliers['ramp'] || 1, 1.3);
    multipliers['removal-spot'] = Math.max(multipliers['removal-spot'] || 1, 1.2);
    
    return multipliers;
  }
  
  /**
   * Get recommended card quotas for a commander
   */
  static getRecommendedQuotas(commander: Card, powerLevel: number): Record<string, { min: number; max: number }> {
    const archetype = this.detectArchetype(commander);
    
    // Base quotas for Commander format (EDH best practices)
    const baseQuotas = {
      'ramp': { min: 10, max: 14 },
      'draw': { min: 10, max: 15 },
      'removal-spot': { min: 8, max: 12 },
      'removal-sweeper': { min: 2, max: 4 },
      'protection': { min: 3, max: 6 },
      'wincon': { min: 3, max: 5 }
    };
    
    // Adjust based on power level
    if (powerLevel >= 8) {
      baseQuotas['tutor-broad'] = { min: 4, max: 8 };
      baseQuotas['fast-mana'] = { min: 3, max: 6 };
      baseQuotas['draw'].min = 12;
    } else if (powerLevel <= 4) {
      baseQuotas['draw'].min = 8;
      baseQuotas['ramp'].min = 8;
    }
    
    return baseQuotas;
  }
}
