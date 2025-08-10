import { CollectionCard } from '@/stores/collectionStore';

export interface SynergyAnalysis {
  card: CollectionCard;
  synergyScore: number;
  synergyReasons: string[];
  confidence: number;
}

export interface DeckRequirements {
  colors: string[];
  format: 'standard' | 'commander' | 'modern' | 'legacy' | 'vintage' | 'custom';
  minCards?: number;
  maxCards?: number;
  powerLevel: number; // 1-10
  archetype?: string;
  themes?: string[];
  excludeCards?: string[];
  mustIncludeCards?: string[];
  budgetLimit?: number;
}

export interface GeneratedDeck {
  mainboard: CollectionCard[];
  sideboard?: CollectionCard[];
  commander?: CollectionCard;
  synergyScore: number;
  powerLevel: number;
  deckAnalysis: DeckAnalysis;
  suggestions: string[];
}

export interface DeckAnalysis {
  curve: { [cmc: number]: number };
  colorDistribution: { [color: string]: number };
  typeDistribution: { [type: string]: number };
  mechanicSynergies: { mechanic: string; count: number; score: number }[];
  weaknesses: string[];
  strengths: string[];
  totalValue: number;
}

export class SynergyEngine {
  private collection: CollectionCard[];
  
  constructor(collection: CollectionCard[]) {
    this.collection = collection;
  }

  // Main deck building function
  async generateDeck(requirements: DeckRequirements): Promise<GeneratedDeck> {
    const availableCards = this.filterAvailableCards(requirements);
    const coreCards = this.identifyCoreCards(availableCards, requirements);
    const synergyGroups = this.findSynergyGroups(availableCards, requirements);
    
    let deck = this.buildDeckFromCore(coreCards, requirements);
    deck = this.addSynergyCards(deck, synergyGroups, requirements);
    deck = this.optimizeManabase(deck, requirements);
    deck = this.balanceCurve(deck, requirements);
    
    const analysis = this.analyzeDeck(deck);
    const synergyScore = this.calculateDeckSynergy(deck);
    
    return {
      mainboard: deck,
      synergyScore,
      powerLevel: this.calculatePowerLevel(deck),
      deckAnalysis: analysis,
      suggestions: this.generateSuggestions(deck, analysis, requirements)
    };
  }

  // Filter cards based on requirements
  private filterAvailableCards(requirements: DeckRequirements): CollectionCard[] {
    return this.collection.filter(card => {
      // Color identity check
      if (requirements.colors.length > 0) {
        const hasValidColors = card.color_identity.every(color => 
          requirements.colors.includes(color)
        );
        if (!hasValidColors) return false;
      }

      // Exclude specific cards
      if (requirements.excludeCards?.includes(card.id)) return false;

      // Budget check
      if (requirements.budgetLimit && card.priceUsd && card.priceUsd > requirements.budgetLimit) {
        return false;
      }

      // Format legality (simplified)
      if (requirements.format === 'standard' && !this.isStandardLegal(card)) {
        return false;
      }

      return card.quantity > 0;
    });
  }

  // Identify core cards for the archetype
  private identifyCoreCards(availableCards: CollectionCard[], requirements: DeckRequirements): CollectionCard[] {
    let coreCards: CollectionCard[] = [];

    // Must include cards
    if (requirements.mustIncludeCards) {
      coreCards = availableCards.filter(card => 
        requirements.mustIncludeCards!.includes(card.id)
      );
    }

    // Add archetype staples
    if (requirements.archetype) {
      const archetypeCards = availableCards.filter(card =>
        card.archetype.includes(requirements.archetype!)
      ).sort((a, b) => b.synergyScore - a.synergyScore);
      
      coreCards.push(...archetypeCards.slice(0, 8));
    }

    // Add theme cards
    if (requirements.themes) {
      requirements.themes.forEach(theme => {
        const themeCards = availableCards.filter(card =>
          card.mechanics.includes(theme) || 
          card.keywords.includes(theme) ||
          card.synergyTags.includes(theme)
        ).sort((a, b) => b.synergyScore - a.synergyScore);
        
        coreCards.push(...themeCards.slice(0, 4));
      });
    }

    return this.removeDuplicates(coreCards);
  }

  // Find synergistic card groups
  private findSynergyGroups(availableCards: CollectionCard[], requirements: DeckRequirements): CollectionCard[][] {
    const groups: CollectionCard[][] = [];
    const usedCards = new Set<string>();

    // Group by mechanics
    const mechanicGroups = new Map<string, CollectionCard[]>();
    availableCards.forEach(card => {
      card.mechanics.forEach(mechanic => {
        if (!mechanicGroups.has(mechanic)) {
          mechanicGroups.set(mechanic, []);
        }
        mechanicGroups.get(mechanic)!.push(card);
      });
    });

    // Create synergy groups from mechanics
    mechanicGroups.forEach((cards, mechanic) => {
      if (cards.length >= 3) {
        const sortedCards = cards.sort((a, b) => b.synergyScore - a.synergyScore);
        groups.push(sortedCards.slice(0, Math.min(8, sortedCards.length)));
      }
    });

    // Group by creature types
    const creatureTypeGroups = new Map<string, CollectionCard[]>();
    availableCards.filter(card => card.type_line.includes('Creature')).forEach(card => {
      const types = card.type_line.split(' — ')[1]?.split(' ') || [];
      types.forEach(type => {
        if (!creatureTypeGroups.has(type)) {
          creatureTypeGroups.set(type, []);
        }
        creatureTypeGroups.get(type)!.push(card);
      });
    });

    creatureTypeGroups.forEach((cards, type) => {
      if (cards.length >= 4) {
        const sortedCards = cards.sort((a, b) => b.synergyScore - a.synergyScore);
        groups.push(sortedCards.slice(0, Math.min(6, sortedCards.length)));
      }
    });

    return groups;
  }

  // Build initial deck from core cards
  private buildDeckFromCore(coreCards: CollectionCard[], requirements: DeckRequirements): CollectionCard[] {
    const deck: CollectionCard[] = [];
    
    // Add core cards with appropriate quantities
    coreCards.forEach(card => {
      const quantity = this.determineCardQuantity(card, requirements);
      for (let i = 0; i < quantity; i++) {
        deck.push({ ...card });
      }
    });

    return deck;
  }

  // Add synergistic cards to fill out the deck
  private addSynergyCards(deck: CollectionCard[], synergyGroups: CollectionCard[][], requirements: DeckRequirements): CollectionCard[] {
    const targetSize = this.getTargetDeckSize(requirements);
    const currentCards = new Set(deck.map(card => card.id));
    
    // Score and rank synergy groups
    const scoredGroups = synergyGroups.map(group => ({
      cards: group,
      score: this.calculateGroupSynergy(group, deck),
      relevance: this.calculateGroupRelevance(group, requirements)
    })).sort((a, b) => (b.score * b.relevance) - (a.score * a.relevance));

    // Add cards from best synergy groups
    for (const group of scoredGroups) {
      if (deck.length >= targetSize) break;
      
      for (const card of group.cards) {
        if (deck.length >= targetSize) break;
        if (currentCards.has(card.id)) continue;
        
        const quantity = this.determineCardQuantity(card, requirements);
        const spaceLeft = targetSize - deck.length;
        const actualQuantity = Math.min(quantity, spaceLeft);
        
        for (let i = 0; i < actualQuantity; i++) {
          deck.push({ ...card });
          currentCards.add(card.id);
        }
      }
    }

    return deck;
  }

  // Optimize manabase for the deck
  private optimizeManabase(deck: CollectionCard[], requirements: DeckRequirements): CollectionCard[] {
    const nonLands = deck.filter(card => !card.type_line.includes('Land'));
    const colorRequirements = this.analyzeColorRequirements(nonLands);
    const targetLandCount = this.calculateOptimalLandCount(nonLands, requirements);
    
    const lands = this.selectOptimalLands(colorRequirements, targetLandCount, requirements);
    
    return [...nonLands, ...lands];
  }

  // Balance the mana curve
  private balanceCurve(deck: CollectionCard[], requirements: DeckRequirements): CollectionCard[] {
    const curve = this.analyzeCurve(deck);
    const targetCurve = this.getTargetCurve(requirements);
    
    // Simple curve balancing - replace high-cost cards with lower-cost alternatives
    const optimizedDeck = [...deck];
    
    Object.keys(targetCurve).forEach(cmcStr => {
      const cmc = parseInt(cmcStr);
      const current = curve[cmc] || 0;
      const target = targetCurve[cmc];
      
      if (current > target) {
        // Remove excess high-cost cards
        const excess = current - target;
        const cardsToRemove = optimizedDeck
          .filter(card => card.cmc === cmc)
          .slice(0, excess);
        
        cardsToRemove.forEach(card => {
          const index = optimizedDeck.findIndex(c => c.id === card.id);
          if (index !== -1) optimizedDeck.splice(index, 1);
        });
      }
    });

    return optimizedDeck;
  }

  // Calculate synergy between card groups
  private calculateGroupSynergy(group: CollectionCard[], existingDeck: CollectionCard[]): number {
    let totalSynergy = 0;
    let comparisons = 0;

    group.forEach(groupCard => {
      existingDeck.forEach(deckCard => {
        totalSynergy += this.calculateCardSynergy(groupCard, deckCard);
        comparisons++;
      });
    });

    return comparisons > 0 ? totalSynergy / comparisons : 0;
  }

  // Calculate relevance of a group to requirements
  private calculateGroupRelevance(group: CollectionCard[], requirements: DeckRequirements): number {
    let relevance = 0;

    group.forEach(card => {
      // Archetype relevance
      if (requirements.archetype && card.archetype.includes(requirements.archetype)) {
        relevance += 0.3;
      }

      // Theme relevance
      if (requirements.themes) {
        requirements.themes.forEach(theme => {
          if (card.mechanics.includes(theme) || card.keywords.includes(theme)) {
            relevance += 0.2;
          }
        });
      }

      // Color relevance
      const colorMatch = card.color_identity.some(color => 
        requirements.colors.includes(color)
      );
      if (colorMatch) relevance += 0.1;
    });

    return Math.min(relevance / group.length, 1.0);
  }

  // Analyze deck composition
  private analyzeDeck(deck: CollectionCard[]): DeckAnalysis {
    const curve: { [cmc: number]: number } = {};
    const colorDistribution: { [color: string]: number } = {};
    const typeDistribution: { [type: string]: number } = {};
    const mechanicCounts = new Map<string, number>();

    deck.forEach(card => {
      // Curve
      curve[card.cmc] = (curve[card.cmc] || 0) + 1;

      // Colors
      card.colors.forEach(color => {
        colorDistribution[color] = (colorDistribution[color] || 0) + 1;
      });

      // Types
      const mainType = card.type_line.split(' — ')[0];
      typeDistribution[mainType] = (typeDistribution[mainType] || 0) + 1;

      // Mechanics
      card.mechanics.forEach(mechanic => {
        mechanicCounts.set(mechanic, (mechanicCounts.get(mechanic) || 0) + 1);
      });
    });

    const mechanicSynergies = Array.from(mechanicCounts.entries()).map(([mechanic, count]) => ({
      mechanic,
      count,
      score: this.calculateMechanicSynergy(mechanic, deck)
    })).sort((a, b) => b.score - a.score);

    return {
      curve,
      colorDistribution,
      typeDistribution,
      mechanicSynergies,
      weaknesses: this.identifyWeaknesses(deck),
      strengths: this.identifyStrengths(deck),
      totalValue: deck.reduce((sum, card) => sum + (card.priceUsd || 0), 0)
    };
  }

  // Helper methods
  private calculateCardSynergy(card1: CollectionCard, card2: CollectionCard): number {
    // Implement detailed synergy calculation
    let synergy = 0;

    // Shared mechanics
    const sharedMechanics = card1.mechanics.filter(m => card2.mechanics.includes(m));
    synergy += sharedMechanics.length * 0.3;

    // Shared keywords
    const sharedKeywords = card1.keywords.filter(k => card2.keywords.includes(k));
    synergy += sharedKeywords.length * 0.2;

    // Color synergy
    const sharedColors = card1.colors.filter(c => card2.colors.includes(c));
    synergy += sharedColors.length * 0.1;

    // Type synergy
    const type1 = card1.type_line.split(' — ')[0];
    const type2 = card2.type_line.split(' — ')[0];
    if (type1 === type2) synergy += 0.15;

    return Math.min(synergy, 1.0);
  }

  private calculateDeckSynergy(deck: CollectionCard[]): number {
    if (deck.length < 2) return 0;
    
    let totalSynergy = 0;
    let comparisons = 0;

    for (let i = 0; i < deck.length; i++) {
      for (let j = i + 1; j < deck.length; j++) {
        totalSynergy += this.calculateCardSynergy(deck[i], deck[j]);
        comparisons++;
      }
    }

    return comparisons > 0 ? totalSynergy / comparisons : 0;
  }

  private calculatePowerLevel(deck: CollectionCard[]): number {
    // Simplified power level calculation
    let powerLevel = 5; // Base

    // High-value cards increase power
    const avgValue = deck.reduce((sum, card) => sum + (card.priceUsd || 0), 0) / deck.length;
    if (avgValue > 10) powerLevel += 1;
    if (avgValue > 25) powerLevel += 1;

    // Low mana curve increases power
    const avgCmc = deck.reduce((sum, card) => sum + card.cmc, 0) / deck.length;
    if (avgCmc < 3) powerLevel += 1;
    if (avgCmc < 2.5) powerLevel += 1;

    return Math.min(Math.max(powerLevel, 1), 10);
  }

  private determineCardQuantity(card: CollectionCard, requirements: DeckRequirements): number {
    if (requirements.format === 'commander') return 1; // Singleton
    
    // Base quantity on card power and deck needs
    if (card.synergyScore > 0.8) return Math.min(4, card.quantity);
    if (card.synergyScore > 0.6) return Math.min(3, card.quantity);
    if (card.synergyScore > 0.4) return Math.min(2, card.quantity);
    return 1;
  }

  private getTargetDeckSize(requirements: DeckRequirements): number {
    if (requirements.format === 'commander') return 100;
    return requirements.maxCards || 60;
  }

  private isStandardLegal(card: CollectionCard): boolean {
    // Simplified - in reality would check against current Standard sets
    const standardSets = ['EOE', 'EOC', 'EOS', 'DMU', 'BRO', 'ONE', 'MOM', 'WOE', 'LTR'];
    return standardSets.includes(card.setCode);
  }

  private analyzeColorRequirements(cards: CollectionCard[]): { [color: string]: number } {
    const requirements: { [color: string]: number } = {};
    
    cards.forEach(card => {
      card.colors.forEach(color => {
        requirements[color] = (requirements[color] || 0) + 1;
      });
    });

    return requirements;
  }

  private calculateOptimalLandCount(nonLands: CollectionCard[], requirements: DeckRequirements): number {
    const avgCmc = nonLands.reduce((sum, card) => sum + card.cmc, 0) / nonLands.length;
    const baseCount = Math.round(24 + (avgCmc - 3) * 2);
    return Math.max(20, Math.min(30, baseCount));
  }

  private selectOptimalLands(colorReqs: { [color: string]: number }, count: number, requirements: DeckRequirements): CollectionCard[] {
    // Simplified land selection - would be more sophisticated in practice
    const availableLands = this.collection.filter(card => 
      card.type_line.includes('Land') && card.quantity > 0
    );

    const selectedLands: CollectionCard[] = [];
    
    // Add dual lands first
    const dualLands = availableLands.filter(land => 
      Object.keys(colorReqs).length > 1 && 
      land.colors.length > 1
    );
    
    selectedLands.push(...dualLands.slice(0, Math.min(12, count)));
    
    // Fill with basics
    const basicsNeeded = count - selectedLands.length;
    const basics = availableLands.filter(land => 
      land.type_line.includes('Basic Land')
    );
    
    selectedLands.push(...basics.slice(0, basicsNeeded));
    
    return selectedLands;
  }

  private analyzeCurve(deck: CollectionCard[]): { [cmc: number]: number } {
    const curve: { [cmc: number]: number } = {};
    deck.forEach(card => {
      curve[card.cmc] = (curve[card.cmc] || 0) + 1;
    });
    return curve;
  }

  private getTargetCurve(requirements: DeckRequirements): { [cmc: number]: number } {
    // Target curves based on archetype and format
    if (requirements.format === 'commander') {
      return { 1: 8, 2: 12, 3: 15, 4: 12, 5: 8, 6: 6, 7: 4 };
    }
    
    // Aggressive curve for Standard
    return { 1: 12, 2: 16, 3: 12, 4: 8, 5: 4, 6: 2 };
  }

  private calculateMechanicSynergy(mechanic: string, deck: CollectionCard[]): number {
    const mechanicCards = deck.filter(card => card.mechanics.includes(mechanic));
    return mechanicCards.length / deck.length;
  }

  private identifyWeaknesses(deck: CollectionCard[]): string[] {
    const weaknesses: string[] = [];
    
    const curve = this.analyzeCurve(deck);
    const avgCmc = deck.reduce((sum, card) => sum + card.cmc, 0) / deck.length;
    
    if (avgCmc > 4) weaknesses.push('High mana curve may cause slow starts');
    if ((curve[1] || 0) + (curve[2] || 0) < 12) weaknesses.push('Not enough early game');
    if ((curve[6] || 0) + (curve[7] || 0) > 8) weaknesses.push('Too many expensive spells');
    
    return weaknesses;
  }

  private identifyStrengths(deck: CollectionCard[]): string[] {
    const strengths: string[] = [];
    
    const mechanicCounts = new Map<string, number>();
    deck.forEach(card => {
      card.mechanics.forEach(mechanic => {
        mechanicCounts.set(mechanic, (mechanicCounts.get(mechanic) || 0) + 1);
      });
    });

    mechanicCounts.forEach((count, mechanic) => {
      if (count >= 8) {
        strengths.push(`Strong ${mechanic} synergy with ${count} cards`);
      }
    });

    return strengths;
  }

  private generateSuggestions(deck: CollectionCard[], analysis: DeckAnalysis, requirements: DeckRequirements): string[] {
    const suggestions: string[] = [];
    
    analysis.weaknesses.forEach(weakness => {
      if (weakness.includes('early game')) {
        suggestions.push('Consider adding more 1-2 mana spells for better curve');
      }
      if (weakness.includes('expensive spells')) {
        suggestions.push('Replace some high-cost cards with cheaper alternatives');
      }
    });

    if (analysis.mechanicSynergies.length > 0) {
      const topMechanic = analysis.mechanicSynergies[0];
      if (topMechanic.count < 8) {
        suggestions.push(`Consider adding more ${topMechanic.mechanic} cards for better synergy`);
      }
    }

    return suggestions;
  }

  private removeDuplicates(cards: CollectionCard[]): CollectionCard[] {
    const seen = new Set<string>();
    return cards.filter(card => {
      if (seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    });
  }
}