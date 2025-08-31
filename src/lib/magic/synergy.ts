// Advanced Synergy Detection and Archetype Analysis
// Analyzes card interactions and suggests archetypes based on Magic mechanics

import { Card as BaseCard } from '@/types/collection';
import { CARD_TYPES } from './types';

// Extend the base Card type to include quantity for deck analysis
interface Card extends BaseCard {
  quantity?: number;
}

export interface SynergyPair {
  cardA: string;
  cardB: string;
  synergyType: 'mechanical' | 'thematic' | 'combo' | 'tribal' | 'color' | 'curve';
  strength: number; // 1-10 scale
  description: string;
  examples?: string[];
}

export interface ArchetypeMatch {
  name: string;
  confidence: number; // 0-100 percentage
  description: string;
  keyCards: string[];
  missingCards: string[];
  synergyScore: number;
  category: 'aggro' | 'control' | 'midrange' | 'combo' | 'tribal' | 'ramp' | 'tempo';
  tags: string[];
}

export interface SynergyAnalysis {
  totalSynergyScore: number;
  strongestSynergies: SynergyPair[];
  archetypeMatches: ArchetypeMatch[];
  improvementSuggestions: Array<{
    type: 'add' | 'remove' | 'replace';
    cards: string[];
    reason: string;
    priority: number;
  }>;
  mechanicClusters: Array<{
    mechanic: string;
    cards: string[];
    coverage: number; // percentage of deck
    potential: number; // how well supported this mechanic could be
  }>;
}

export class SynergyEngine {
  // Magic mechanic synergies - which mechanics work well together
  private static MECHANIC_SYNERGIES: Record<string, { 
    synergies: string[]; 
    antiSynergies: string[];
    strength: number;
  }> = {
    // Artifact synergies
    'affinity': { synergies: ['artifact', 'metalcraft', 'improvise'], antiSynergies: [], strength: 8 },
    'metalcraft': { synergies: ['artifact', 'affinity', 'improvise'], antiSynergies: [], strength: 7 },
    'improvise': { synergies: ['artifact', 'affinity', 'metalcraft'], antiSynergies: [], strength: 7 },
    
    // Graveyard synergies
    'delve': { synergies: ['self-mill', 'flashback', 'escape'], antiSynergies: ['exile-graveyard'], strength: 8 },
    'flashback': { synergies: ['self-mill', 'delve', 'threshold'], antiSynergies: ['exile-graveyard'], strength: 7 },
    'escape': { synergies: ['self-mill', 'delve'], antiSynergies: ['exile-graveyard'], strength: 7 },
    'threshold': { synergies: ['self-mill', 'flashback'], antiSynergies: [], strength: 6 },
    
    // Creature synergies
    'tribal': { synergies: ['tribal-support', 'creature-based'], antiSynergies: ['board-wipe'], strength: 8 },
    'tokens': { synergies: ['tribal', 'go-wide', 'anthem'], antiSynergies: ['board-wipe'], strength: 7 },
    'counters': { synergies: ['proliferate', 'counter-support'], antiSynergies: [], strength: 7 },
    
    // Spell synergies
    'storm': { synergies: ['cheap-spells', 'ritual', 'cantrip'], antiSynergies: [], strength: 9 },
    'prowess': { synergies: ['cheap-spells', 'cantrip', 'instant-sorcery'], antiSynergies: [], strength: 7 },
    'spellslinger': { synergies: ['instant-sorcery', 'cantrip', 'cheap-spells'], antiSynergies: [], strength: 7 },
    
    // Energy and resource synergies
    'energy': { synergies: ['energy-generation', 'energy-payoff'], antiSynergies: [], strength: 8 },
    'landfall': { synergies: ['ramp', 'extra-lands', 'fetchlands'], antiSynergies: [], strength: 7 },
    'lifegain': { synergies: ['lifegain-payoff'], antiSynergies: [], strength: 6 },
    
    // Control synergies
    'control': { synergies: ['card-draw', 'removal', 'counterspell'], antiSynergies: ['aggro'], strength: 7 },
    'card-advantage': { synergies: ['control', 'midrange'], antiSynergies: ['aggro'], strength: 6 }
  };

  // Archetype definitions with key mechanics and cards
  private static ARCHETYPES: Record<string, {
    category: ArchetypeMatch['category'];
    description: string;
    keyMechanics: string[];
    requiredEffects: string[];
    cardTypes: string[];
    cmcRange: { min: number; max: number; peak: number };
    tags: string[];
  }> = {
    'Aggro Burn': {
      category: 'aggro',
      description: 'Fast damage-based strategy with efficient creatures and burn spells',
      keyMechanics: ['haste', 'direct-damage', 'cheap-creatures'],
      requiredEffects: ['Lightning Bolt', 'efficient creatures', 'reach'],
      cardTypes: ['Creature', 'Instant', 'Sorcery'],
      cmcRange: { min: 1, max: 4, peak: 2 },
      tags: ['red', 'fast', 'linear']
    },
    
    'Control': {
      category: 'control',
      description: 'Long-game strategy with removal, card draw, and powerful finishers',
      keyMechanics: ['counterspell', 'removal', 'card-draw'],
      requiredEffects: ['board control', 'card advantage', 'win condition'],
      cardTypes: ['Instant', 'Sorcery', 'Planeswalker'],
      cmcRange: { min: 2, max: 8, peak: 4 },
      tags: ['blue', 'white', 'reactive', 'late-game']
    },
    
    'Midrange': {
      category: 'midrange',
      description: 'Balanced strategy with efficient threats and interaction',
      keyMechanics: ['versatile-removal', 'efficient-threats', 'card-advantage'],
      requiredEffects: ['2-for-1s', 'threat density', 'interaction'],
      cardTypes: ['Creature', 'Instant', 'Sorcery', 'Planeswalker'],
      cmcRange: { min: 2, max: 6, peak: 3 },
      tags: ['balanced', 'flexible', 'threat-dense']
    },
    
    'Combo': {
      category: 'combo',
      description: 'Strategy focused on specific card combinations for instant wins',
      keyMechanics: ['combo-piece', 'tutor', 'protection'],
      requiredEffects: ['combo pieces', 'consistency', 'protection'],
      cardTypes: ['Instant', 'Sorcery', 'Artifact', 'Enchantment'],
      cmcRange: { min: 0, max: 6, peak: 2 },
      tags: ['linear', 'all-in', 'explosive']
    },
    
    'Tribal Aggro': {
      category: 'tribal',
      description: 'Creature-based strategy leveraging tribal synergies',
      keyMechanics: ['tribal', 'lord-effects', 'tribal-support'],
      requiredEffects: ['creature density', 'tribal payoffs', 'anthems'],
      cardTypes: ['Creature', 'Tribal'],
      cmcRange: { min: 1, max: 4, peak: 2 },
      tags: ['creature-based', 'synergistic', 'tribal']
    },
    
    'Ramp': {
      category: 'ramp',
      description: 'Strategy focused on accelerating mana to cast powerful spells',
      keyMechanics: ['ramp', 'big-mana', 'expensive-payoffs'],
      requiredEffects: ['mana acceleration', 'big threats', 'card selection'],
      cardTypes: ['Creature', 'Sorcery', 'Artifact'],
      cmcRange: { min: 1, max: 10, peak: 6 },
      tags: ['green', 'big-mana', 'late-game']
    },
    
    'Artifacts': {
      category: 'combo',
      description: 'Strategy built around artifact synergies and interactions',
      keyMechanics: ['artifact', 'affinity', 'metalcraft'],
      requiredEffects: ['artifact density', 'artifact synergies', 'cheap artifacts'],
      cardTypes: ['Artifact', 'Creature'],
      cmcRange: { min: 0, max: 6, peak: 2 },
      tags: ['artifact-based', 'synergistic', 'explosive']
    },
    
    'Tempo': {
      category: 'tempo',
      description: 'Strategy focused on efficient threats backed by disruption',
      keyMechanics: ['efficient-creatures', 'cheap-interaction', 'flash'],
      requiredEffects: ['pressure', 'disruption', 'efficiency'],
      cardTypes: ['Creature', 'Instant'],
      cmcRange: { min: 1, max: 4, peak: 2 },
      tags: ['blue', 'efficient', 'disruptive']
    }
  };

  static analyze(deck: Card[], format: string): SynergyAnalysis {
    // Extract mechanics and themes from deck
    const deckMechanics = this.extractMechanics(deck);
    const deckThemes = this.extractThemes(deck);
    
    // Find synergistic card pairs
    const synergies = this.findSynergies(deck, deckMechanics);
    
    // Calculate total synergy score
    const totalSynergyScore = this.calculateTotalSynergyScore(synergies);
    
    // Match to known archetypes
    const archetypeMatches = this.matchArchetypes(deck, deckMechanics, deckThemes, format);
    
    // Generate improvement suggestions
    const improvementSuggestions = this.generateImprovementSuggestions(
      deck, 
      deckMechanics, 
      archetypeMatches
    );
    
    // Analyze mechanic clusters
    const mechanicClusters = this.analyzeMechanicClusters(deck, deckMechanics);
    
    return {
      totalSynergyScore,
      strongestSynergies: synergies.slice(0, 10), // Top 10 synergies
      archetypeMatches: archetypeMatches.slice(0, 5), // Top 5 matches
      improvementSuggestions,
      mechanicClusters
    };
  }

  private static extractMechanics(deck: Card[]): Record<string, number> {
    const mechanics: Record<string, number> = {};
    
    deck.forEach(card => {
      const quantity = card.quantity || 1;
      
      // Extract from keywords
      (card.keywords || []).forEach(keyword => {
        const mechanic = keyword.toLowerCase();
        mechanics[mechanic] = (mechanics[mechanic] || 0) + quantity;
      });
      
      // Extract from oracle text analysis
      const oracleText = (card.oracle_text || '').toLowerCase();
      
      // Common Magic mechanics patterns
      const mechanicPatterns = [
        { pattern: /\baffinity\b/, mechanic: 'affinity' },
        { pattern: /\bmetalcraft\b/, mechanic: 'metalcraft' },
        { pattern: /\bdelve\b/, mechanic: 'delve' },
        { pattern: /\bflashback\b/, mechanic: 'flashback' },
        { pattern: /\bstorm\b/, mechanic: 'storm' },
        { pattern: /\bprowess\b/, mechanic: 'prowess' },
        { pattern: /\blandfall\b/, mechanic: 'landfall' },
        { pattern: /\benergy\b/, mechanic: 'energy' },
        { pattern: /enters the battlefield/, mechanic: 'etb' },
        { pattern: /when .* dies/, mechanic: 'death-trigger' },
        { pattern: /sacrifice/, mechanic: 'sacrifice' },
        { pattern: /draw.*card/, mechanic: 'card-draw' },
        { pattern: /counter target/, mechanic: 'counterspell' },
        { pattern: /destroy target/, mechanic: 'removal' },
        { pattern: /deal.*damage/, mechanic: 'direct-damage' },
        { pattern: /gain.*life/, mechanic: 'lifegain' },
        { pattern: /search.*library/, mechanic: 'tutor' },
        { pattern: /\+1\/\+1 counter/, mechanic: 'counters' },
        { pattern: /token/, mechanic: 'tokens' }
      ];
      
      mechanicPatterns.forEach(({ pattern, mechanic }) => {
        if (pattern.test(oracleText)) {
          mechanics[mechanic] = (mechanics[mechanic] || 0) + quantity;
        }
      });
      
      // Artifact detection
      if (card.type_line?.toLowerCase().includes('artifact')) {
        mechanics['artifact'] = (mechanics['artifact'] || 0) + quantity;
      }
      
      // Tribal detection
      const creatureTypes = this.extractCreatureTypes(card.type_line || '');
      if (creatureTypes.length > 0) {
        creatureTypes.forEach(type => {
          mechanics[`tribal-${type}`] = (mechanics[`tribal-${type}`] || 0) + quantity;
        });
      }
    });
    
    return mechanics;
  }

  private static extractThemes(deck: Card[]): string[] {
    const themes: string[] = [];
    const typeDistribution = this.getTypeDistribution(deck);
    const colorDistribution = this.getColorDistribution(deck);
    const cmcDistribution = this.getCMCDistribution(deck);
    
    // Determine themes based on distributions
    if (typeDistribution['Creature'] > 0.6) themes.push('creature-based');
    if (typeDistribution['Instant'] + typeDistribution['Sorcery'] > 0.5) themes.push('spell-based');
    if (typeDistribution['Artifact'] > 0.3) themes.push('artifact-based');
    
    // Color themes
    const dominantColors = Object.entries(colorDistribution)
      .filter(([_, count]) => count > deck.length * 0.3)
      .map(([color]) => color);
    
    if (dominantColors.length === 1) themes.push('mono-color');
    else if (dominantColors.length === 2) themes.push('two-color');
    else if (dominantColors.length >= 3) themes.push('multicolor');
    
    // Curve themes
    const avgCMC = this.calculateAverageCMC(deck);
    if (avgCMC < 2.5) themes.push('low-curve');
    else if (avgCMC > 4) themes.push('high-curve');
    
    return themes;
  }

  private static findSynergies(deck: Card[], mechanics: Record<string, number>): SynergyPair[] {
    const synergies: SynergyPair[] = [];
    
    // Check mechanic synergies
    Object.entries(mechanics).forEach(([mechanicA, countA]) => {
      if (countA === 0) return;
      
      const mechanicSynergies = this.MECHANIC_SYNERGIES[mechanicA];
      if (!mechanicSynergies) return;
      
      mechanicSynergies.synergies.forEach(mechanicB => {
        const countB = mechanics[mechanicB] || 0;
        if (countB > 0) {
          const strength = Math.min(10, 
            mechanicSynergies.strength * 
            Math.min(countA, countB) / 
            Math.max(countA, countB)
          );
          
          synergies.push({
            cardA: mechanicA,
            cardB: mechanicB,
            synergyType: 'mechanical',
            strength,
            description: `${mechanicA} synergizes with ${mechanicB}`,
            examples: [`Cards with ${mechanicA}`, `Cards with ${mechanicB}`]
          });
        }
      });
    });
    
    // Check individual card synergies
    for (let i = 0; i < deck.length; i++) {
      for (let j = i + 1; j < deck.length; j++) {
        const cardA = deck[i];
        const cardB = deck[j];
        const synergy = this.calculateCardSynergy(cardA, cardB);
        
        if (synergy.strength > 5) {
          synergies.push(synergy);
        }
      }
    }
    
    return synergies.sort((a, b) => b.strength - a.strength);
  }

  private static calculateCardSynergy(cardA: Card, cardB: Card): SynergyPair {
    let strength = 0;
    let synergyType: SynergyPair['synergyType'] = 'thematic';
    let description = '';
    
    // Color synergy
    const sharedColors = (cardA.colors || []).filter(color => 
      (cardB.colors || []).includes(color)
    );
    if (sharedColors.length > 0) {
      strength += 1;
      synergyType = 'color';
      description = `Shared colors: ${sharedColors.join(', ')}`;
    }
    
    // Type synergy
    const typeA = this.getPrimaryType(cardA.type_line || '');
    const typeB = this.getPrimaryType(cardB.type_line || '');
    
    if (typeA === typeB && typeA === 'Creature') {
      strength += 2;
      synergyType = 'tribal';
      description = 'Both are creatures';
    }
    
    // CMC curve synergy
    const cmcDiff = Math.abs((cardA.cmc || 0) - (cardB.cmc || 0));
    if (cmcDiff <= 1) {
      strength += 1;
      synergyType = 'curve';
      description += ' Similar mana costs';
    }
    
    // Keyword synergy
    const sharedKeywords = (cardA.keywords || []).filter(keyword =>
      (cardB.keywords || []).includes(keyword)
    );
    if (sharedKeywords.length > 0) {
      strength += sharedKeywords.length;
      synergyType = 'mechanical';
      description += ` Shared mechanics: ${sharedKeywords.join(', ')}`;
    }
    
    return {
      cardA: cardA.name,
      cardB: cardB.name,
      synergyType,
      strength: Math.min(10, strength),
      description: description.trim() || 'Generic synergy'
    };
  }

  private static matchArchetypes(
    deck: Card[], 
    mechanics: Record<string, number>, 
    themes: string[], 
    format: string
  ): ArchetypeMatch[] {
    const matches: ArchetypeMatch[] = [];
    
    Object.entries(this.ARCHETYPES).forEach(([archetypeName, archetype]) => {
      let confidence = 0;
      const keyCards: string[] = [];
      const missingCards: string[] = [];
      
      // Check mechanic alignment
      const mechanicAlignment = archetype.keyMechanics.reduce((score, mechanic) => {
        const mechanicCount = mechanics[mechanic] || 0;
        if (mechanicCount > 0) {
          keyCards.push(`${mechanicCount} cards with ${mechanic}`);
          return score + Math.min(20, mechanicCount * 2);
        } else {
          missingCards.push(`Cards with ${mechanic}`);
          return score;
        }
      }, 0);
      
      confidence += mechanicAlignment;
      
      // Check card type distribution
      const typeDistribution = this.getTypeDistribution(deck);
      const typeAlignment = archetype.cardTypes.reduce((score, cardType) => {
        const typePercentage = typeDistribution[cardType] || 0;
        return score + (typePercentage * 20);
      }, 0);
      
      confidence += typeAlignment;
      
      // Check CMC alignment
      const avgCMC = this.calculateAverageCMC(deck);
      const cmcAlignment = archetype.cmcRange;
      let cmcScore = 0;
      
      if (avgCMC >= cmcAlignment.min && avgCMC <= cmcAlignment.max) {
        cmcScore = 20;
        if (Math.abs(avgCMC - cmcAlignment.peak) <= 0.5) {
          cmcScore = 30; // Bonus for perfect curve match
        }
      }
      
      confidence += cmcScore;
      
      // Check theme alignment
      const themeAlignment = themes.filter(theme => 
        archetype.tags.includes(theme)
      ).length * 10;
      
      confidence += themeAlignment;
      
      // Calculate synergy score for this archetype
      const synergyScore = this.calculateArchetypeSynergyScore(deck, archetype);
      confidence += synergyScore;
      
      // Cap confidence at 100
      confidence = Math.min(100, confidence);
      
      if (confidence > 10) { // Only include viable matches
        matches.push({
          name: archetypeName,
          confidence,
          description: archetype.description,
          keyCards,
          missingCards,
          synergyScore,
          category: archetype.category,
          tags: archetype.tags
        });
      }
    });
    
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  private static generateImprovementSuggestions(
    deck: Card[], 
    mechanics: Record<string, number>, 
    archetypeMatches: ArchetypeMatch[]
  ): Array<{
    type: 'add' | 'remove' | 'replace';
    cards: string[];
    reason: string;
    priority: number;
  }> {
    const suggestions: Array<{
      type: 'add' | 'remove' | 'replace';
      cards: string[];
      reason: string;
      priority: number;
    }> = [];
    
    // Suggestions based on best archetype match
    const topArchetype = archetypeMatches[0];
    if (topArchetype && topArchetype.confidence > 30) {
      // Suggest adding missing key components
      if (topArchetype.missingCards.length > 0) {
        suggestions.push({
          type: 'add',
          cards: topArchetype.missingCards.slice(0, 3),
          reason: `Strengthen ${topArchetype.name} strategy`,
          priority: 8
        });
      }
    }
    
    // Suggestions based on mechanic clustering
    const strongMechanics = Object.entries(mechanics)
      .filter(([_, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1]);
    
    strongMechanics.forEach(([mechanic, count]) => {
      if (count < 6 && this.MECHANIC_SYNERGIES[mechanic]) {
        suggestions.push({
          type: 'add',
          cards: [`More ${mechanic} cards`],
          reason: `Increase ${mechanic} density for better synergy`,
          priority: Math.min(7, count)
        });
      }
    });
    
    // Suggest removing inconsistent elements
    const weakMechanics = Object.entries(mechanics)
      .filter(([_, count]) => count === 1)
      .map(([mechanic]) => mechanic);
    
    if (weakMechanics.length > 0) {
      suggestions.push({
        type: 'remove',
        cards: weakMechanics.slice(0, 2),
        reason: 'Remove inconsistent one-offs for better focus',
        priority: 5
      });
    }
    
    return suggestions.sort((a, b) => b.priority - a.priority);
  }

  private static analyzeMechanicClusters(
    deck: Card[], 
    mechanics: Record<string, number>
  ): Array<{
    mechanic: string;
    cards: string[];
    coverage: number;
    potential: number;
  }> {
    const clusters: Array<{
      mechanic: string;
      cards: string[];
      coverage: number;
      potential: number;
    }> = [];
    
    const totalDeckSize = deck.reduce((sum, card) => sum + (card.quantity || 1), 0);
    
    Object.entries(mechanics).forEach(([mechanic, count]) => {
      if (count > 0) {
        const cardsWithMechanic = deck
          .filter(card => this.cardHasMechanic(card, mechanic))
          .map(card => card.name);
        
        const coverage = (count / totalDeckSize) * 100;
        
        // Calculate potential based on synergies
        const synergies = this.MECHANIC_SYNERGIES[mechanic];
        let potential = coverage;
        
        if (synergies) {
          const synergyBonus = synergies.synergies.reduce((bonus, synergyMechanic) => {
            const synergyCount = mechanics[synergyMechanic] || 0;
            return bonus + (synergyCount > 0 ? synergies.strength : 0);
          }, 0);
          
          potential += synergyBonus;
        }
        
        clusters.push({
          mechanic,
          cards: cardsWithMechanic,
          coverage,
          potential: Math.min(100, potential)
        });
      }
    });
    
    return clusters.sort((a, b) => b.potential - a.potential);
  }

  // Helper methods
  private static extractCreatureTypes(typeLine: string): string[] {
    const types: string[] = [];
    const creatureTypeLine = typeLine.toLowerCase();
    
    // Common creature types
    const creatureTypes = [
      'human', 'elf', 'goblin', 'zombie', 'soldier', 'wizard', 'warrior',
      'angel', 'demon', 'dragon', 'beast', 'elemental', 'spirit', 'vampire',
      'werewolf', 'knight', 'rogue', 'cleric', 'shaman', 'druid', 'artificer'
    ];
    
    creatureTypes.forEach(type => {
      if (creatureTypeLine.includes(type)) {
        types.push(type);
      }
    });
    
    return types;
  }

  private static getPrimaryType(typeLine: string): string {
    const types = typeLine.toLowerCase();
    if (types.includes('creature')) return 'Creature';
    if (types.includes('instant')) return 'Instant';
    if (types.includes('sorcery')) return 'Sorcery';
    if (types.includes('artifact')) return 'Artifact';
    if (types.includes('enchantment')) return 'Enchantment';
    if (types.includes('planeswalker')) return 'Planeswalker';
    if (types.includes('land')) return 'Land';
    return 'Other';
  }

  private static getTypeDistribution(deck: Card[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    const totalCards = deck.reduce((sum, card) => sum + (card.quantity || 1), 0);
    
    deck.forEach(card => {
      const primaryType = this.getPrimaryType(card.type_line || '');
      const quantity = card.quantity || 1;
      distribution[primaryType] = (distribution[primaryType] || 0) + quantity;
    });
    
    // Convert to percentages
    Object.keys(distribution).forEach(type => {
      distribution[type] = distribution[type] / totalCards;
    });
    
    return distribution;
  }

  private static getColorDistribution(deck: Card[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    deck.forEach(card => {
      const colors = card.color_identity || card.colors || [];
      const quantity = card.quantity || 1;
      
      colors.forEach(color => {
        distribution[color] = (distribution[color] || 0) + quantity;
      });
    });
    
    return distribution;
  }

  private static getCMCDistribution(deck: Card[]): Record<number, number> {
    const distribution: Record<number, number> = {};
    
    deck.forEach(card => {
      const cmc = card.cmc || 0;
      const quantity = card.quantity || 1;
      distribution[cmc] = (distribution[cmc] || 0) + quantity;
    });
    
    return distribution;
  }

  private static calculateAverageCMC(deck: Card[]): number {
    const totalCMC = deck.reduce((sum, card) => {
      const quantity = card.quantity || 1;
      const cmc = card.cmc || 0;
      return sum + (cmc * quantity);
    }, 0);
    
    const totalCards = deck.reduce((sum, card) => sum + (card.quantity || 1), 0);
    
    return totalCards > 0 ? totalCMC / totalCards : 0;
  }

  private static calculateTotalSynergyScore(synergies: SynergyPair[]): number {
    return synergies.reduce((total, synergy) => total + synergy.strength, 0);
  }

  private static calculateArchetypeSynergyScore(deck: Card[], archetype: any): number {
    // Simplified scoring based on archetype alignment
    return Math.min(30, deck.length * 0.5); // Placeholder calculation
  }

  private static cardHasMechanic(card: Card, mechanic: string): boolean {
    const keywords = (card.keywords || []).map(k => k.toLowerCase());
    const oracleText = (card.oracle_text || '').toLowerCase();
    
    return keywords.includes(mechanic) || oracleText.includes(mechanic);
  }
}