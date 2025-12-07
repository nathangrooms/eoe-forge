// Deck validation and iteration logic
// Builds, validates, and rebuilds decks until they meet specifications

import type { AdminConfig } from './admin-config.ts';

export interface ValidationResult {
  isValid: boolean;
  powerLevel: number | null;
  totalCost: number;
  cardCount: number;
  landCount: number;
  issues: string[];
  suggestions: string[];
}

export interface DeckCard {
  id: string;
  name: string;
  cmc: number;
  type_line: string;
  colors?: string[];
  color_identity?: string[];
  prices?: { usd?: string };
  oracle_text?: string;
  quantity?: number;
}

export class DeckValidator {
  /**
   * Validate a built deck against target specifications
   */
  static validate(
    deck: DeckCard[],
    commander: any,
    targetPower: number,
    targetBudget: number,
    config: AdminConfig,
    edhPowerLevel: number | null
  ): ValidationResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    
    // Count cards
    const cardCount = deck.length;
    if (cardCount !== 99) {
      issues.push(`Deck has ${cardCount} cards, needs exactly 99`);
    }
    
    // Check singleton (non-basic lands)
    const basicLands = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
    const nonBasicNames = deck.filter(c => !basicLands.includes(c.name)).map(c => c.name);
    const duplicates = nonBasicNames.filter((name, idx) => nonBasicNames.indexOf(name) !== idx);
    if (duplicates.length > 0 && config.strictSingleton) {
      issues.push(`Duplicate cards found: ${[...new Set(duplicates)].slice(0, 5).join(', ')}`);
    }
    
    // Check color identity
    const commanderColors = new Set(commander?.color_identity || []);
    const colorViolations = deck.filter(card => {
      const cardColors = card.color_identity || [];
      return cardColors.some(c => !commanderColors.has(c));
    });
    if (colorViolations.length > 0) {
      issues.push(`${colorViolations.length} cards violate color identity`);
      suggestions.push(`Replace: ${colorViolations.slice(0, 3).map(c => c.name).join(', ')}`);
    }
    
    // Count lands
    const landCount = deck.filter(c => c.type_line?.toLowerCase().includes('land')).length;
    if (landCount < config.minLandCount) {
      issues.push(`Only ${landCount} lands, need at least ${config.minLandCount}`);
      suggestions.push(`Add ${config.minLandCount - landCount} more lands`);
    } else if (landCount > config.maxLandCount) {
      issues.push(`Too many lands: ${landCount}, max is ${config.maxLandCount}`);
      suggestions.push(`Remove ${landCount - config.maxLandCount} lands`);
    }
    
    // Calculate total cost
    const totalCost = deck.reduce((sum, card) => {
      const price = parseFloat(card.prices?.usd || '0');
      return sum + (price * (card.quantity || 1));
    }, 0);
    
    const budgetMax = targetBudget * (1 + config.budgetTolerance);
    if (totalCost > budgetMax) {
      issues.push(`Deck cost $${totalCost.toFixed(0)} exceeds budget $${targetBudget} (+${(config.budgetTolerance * 100).toFixed(0)}% tolerance)`);
      
      // Find expensive cards that could be replaced
      const expensiveCards = deck
        .filter(c => parseFloat(c.prices?.usd || '0') > 20)
        .sort((a, b) => parseFloat(b.prices?.usd || '0') - parseFloat(a.prices?.usd || '0'))
        .slice(0, 3);
      if (expensiveCards.length > 0) {
        suggestions.push(`Consider replacing expensive cards: ${expensiveCards.map(c => `${c.name} ($${parseFloat(c.prices?.usd || '0').toFixed(0)})`).join(', ')}`);
      }
    }
    
    // Check power level if available
    const powerMin = targetPower - config.powerLevelTolerance;
    const powerMax = targetPower + config.powerLevelTolerance;
    
    if (edhPowerLevel !== null) {
      if (edhPowerLevel < powerMin) {
        issues.push(`Power level ${edhPowerLevel.toFixed(1)} below target ${targetPower} (min: ${powerMin.toFixed(1)})`);
        suggestions.push('Add more tutors, fast mana, or combo pieces to increase power');
      } else if (edhPowerLevel > powerMax) {
        issues.push(`Power level ${edhPowerLevel.toFixed(1)} above target ${targetPower} (max: ${powerMax.toFixed(1)})`);
        suggestions.push('Remove tutors or combos, add more casual/fun cards');
      }
    }
    
    // Check card role quotas
    const rampCount = this.countByRole(deck, ['ramp']);
    const drawCount = this.countByRole(deck, ['draw']);
    const removalCount = this.countByRole(deck, ['removal', 'destroy', 'exile']);
    
    if (rampCount < config.minRampCount) {
      issues.push(`Only ${rampCount} ramp cards, need ${config.minRampCount}`);
    }
    if (drawCount < config.minDrawCount) {
      issues.push(`Only ${drawCount} draw effects, need ${config.minDrawCount}`);
    }
    if (removalCount < config.minRemovalCount) {
      issues.push(`Only ${removalCount} removal, need ${config.minRemovalCount}`);
    }
    
    return {
      isValid: issues.length === 0,
      powerLevel: edhPowerLevel,
      totalCost,
      cardCount,
      landCount,
      issues,
      suggestions
    };
  }
  
  /**
   * Count cards by role based on oracle text patterns
   */
  private static countByRole(deck: DeckCard[], keywords: string[]): number {
    return deck.filter(card => {
      const text = (card.oracle_text || '').toLowerCase();
      const type = (card.type_line || '').toLowerCase();
      
      for (const keyword of keywords) {
        if (keyword === 'ramp') {
          if (text.includes('add') && text.includes('mana')) return true;
          if (text.includes('search') && text.includes('land')) return true;
          if (type.includes('land') && text.includes('add')) return true;
        }
        if (keyword === 'draw') {
          if (text.includes('draw') && text.includes('card')) return true;
        }
        if (keyword === 'removal' || keyword === 'destroy' || keyword === 'exile') {
          if (text.includes('destroy target')) return true;
          if (text.includes('exile target')) return true;
          if (text.includes('destroy all')) return true;
        }
      }
      return false;
    }).length;
  }
  
  /**
   * Get cards to swap out based on validation issues
   */
  static getCardsToReplace(
    deck: DeckCard[],
    validation: ValidationResult,
    targetBudget: number
  ): DeckCard[] {
    const toReplace: DeckCard[] = [];
    const basicLands = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
    
    // If over budget, find expensive non-essential cards
    if (validation.totalCost > targetBudget * 1.2) {
      const expensiveCards = deck
        .filter(c => {
          const price = parseFloat(c.prices?.usd || '0');
          const type = (c.type_line || '').toLowerCase();
          // Don't remove lands, ramp, or draw
          if (type.includes('land')) return false;
          if ((c.oracle_text || '').toLowerCase().includes('add') && (c.oracle_text || '').toLowerCase().includes('mana')) return false;
          return price > 10;
        })
        .sort((a, b) => parseFloat(b.prices?.usd || '0') - parseFloat(a.prices?.usd || '0'))
        .slice(0, 5);
      toReplace.push(...expensiveCards);
    }
    
    // If under-powered, find weak cards to replace
    if (validation.powerLevel !== null && validation.powerLevel < 5) {
      const weakCards = deck
        .filter(c => {
          const price = parseFloat(c.prices?.usd || '0');
          const type = (c.type_line || '').toLowerCase();
          if (type.includes('land')) return false;
          if (basicLands.includes(c.name)) return false;
          // Low-value cards are likely weak
          return price < 0.50 && c.cmc > 3;
        })
        .slice(0, 5);
      toReplace.push(...weakCards);
    }
    
    // Find duplicate cards
    const nonBasicNames = deck.filter(c => !basicLands.includes(c.name)).map(c => c.name);
    const duplicateNames = [...new Set(nonBasicNames.filter((name, idx) => nonBasicNames.indexOf(name) !== idx))];
    const duplicateCards = deck.filter(c => duplicateNames.includes(c.name));
    // Add all but one of each duplicate
    for (const name of duplicateNames) {
      const dupes = duplicateCards.filter(c => c.name === name);
      toReplace.push(...dupes.slice(1));
    }
    
    return [...new Set(toReplace)];
  }
}
