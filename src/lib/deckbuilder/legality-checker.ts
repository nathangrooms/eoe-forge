import { Card as DeckCard } from '@/stores/deckStore';

export interface LegalityIssue {
  type: 'error' | 'warning';
  message: string;
  card?: string;
}

export interface LegalityResult {
  isLegal: boolean;
  issues: LegalityIssue[];
  warnings: LegalityIssue[];
}

/**
 * Comprehensive deck legality checker for various formats
 */
export class DeckLegalityChecker {
  /**
   * Check if a deck is legal for the specified format
   */
  static checkDeck(
    cards: DeckCard[],
    format: string,
    commander?: DeckCard
  ): LegalityResult {
    const issues: LegalityIssue[] = [];
    const warnings: LegalityIssue[] = [];

    switch (format.toLowerCase()) {
      case 'commander':
      case 'edh':
        return this.checkCommanderLegality(cards, commander);
      case 'standard':
        return this.checkStandardLegality(cards);
      case 'modern':
        return this.checkModernLegality(cards);
      case 'legacy':
        return this.checkLegacyLegality(cards);
      case 'vintage':
        return this.checkVintageLegality(cards);
      case 'pauper':
        return this.checkPauperLegality(cards);
      default:
        warnings.push({
          type: 'warning',
          message: `Format '${format}' is not recognized. Skipping legality checks.`
        });
        return { isLegal: true, issues, warnings };
    }
  }

  /**
   * Check Commander/EDH format legality
   */
  private static checkCommanderLegality(
    cards: DeckCard[],
    commander?: DeckCard
  ): LegalityResult {
    const issues: LegalityIssue[] = [];
    const warnings: LegalityIssue[] = [];

    // Check for commander
    if (!commander) {
      issues.push({
        type: 'error',
        message: 'Commander format requires a legendary creature or planeswalker as commander'
      });
    } else if (!this.isValidCommander(commander)) {
      issues.push({
        type: 'error',
        message: `${commander.name} cannot be a commander`,
        card: commander.name
      });
    }

    // Check deck size
    const totalCards = cards.reduce((sum, card) => sum + (card.quantity || 1), 0);
    if (totalCards !== 99 && totalCards !== 100) {
      issues.push({
        type: 'error',
        message: `Commander deck must have exactly ${commander ? '99' : '100'} cards. Current: ${totalCards}`
      });
    }

    // Check singleton rule (except basic lands)
    const cardCounts = new Map<string, number>();
    const basicLands = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'];
    
    cards.forEach(card => {
      const isBasic = basicLands.includes(card.name);
      if (!isBasic) {
        const count = cardCounts.get(card.name) || 0;
        cardCounts.set(card.name, count + (card.quantity || 1));
      }
    });

    cardCounts.forEach((count, name) => {
      if (count > 1) {
        issues.push({
          type: 'error',
          message: `${name} appears ${count} times (violates singleton rule)`,
          card: name
        });
      }
    });

    // Check color identity
    if (commander) {
      const commanderColors = new Set(commander.color_identity || []);
      
      cards.forEach(card => {
        const cardColors = card.color_identity || [];
        const invalidColors = cardColors.filter(color => !commanderColors.has(color));
        
        if (invalidColors.length > 0) {
          issues.push({
            type: 'error',
            message: `${card.name} has colors outside commander's identity: ${invalidColors.join(', ')}`,
            card: card.name
          });
        }
      });
    }

    // Check format legality for each card
    cards.forEach(card => {
      if (!this.isLegalInCommander(card)) {
        issues.push({
          type: 'error',
          message: `${card.name} is banned or not legal in Commander`,
          card: card.name
        });
      }
    });

    return {
      isLegal: issues.length === 0,
      issues,
      warnings
    };
  }

  /**
   * Check Standard format legality
   */
  private static checkStandardLegality(cards: DeckCard[]): LegalityResult {
    const issues: LegalityIssue[] = [];
    const warnings: LegalityIssue[] = [];

    // Check deck size (minimum 60)
    const totalCards = cards.reduce((sum, card) => sum + (card.quantity || 1), 0);
    if (totalCards < 60) {
      issues.push({
        type: 'error',
        message: `Standard deck must have at least 60 cards. Current: ${totalCards}`
      });
    }

    // Check 4-copy limit (except basic lands)
    const basicLands = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
    const cardCounts = new Map<string, number>();
    
    cards.forEach(card => {
      const isBasic = basicLands.includes(card.name);
      if (!isBasic) {
        const count = cardCounts.get(card.name) || 0;
        cardCounts.set(card.name, count + (card.quantity || 1));
      }
    });

    cardCounts.forEach((count, name) => {
      if (count > 4) {
        issues.push({
          type: 'error',
          message: `${name} appears ${count} times (maximum 4 copies allowed)`,
          card: name
        });
      }
    });

    // Check format legality
    cards.forEach(card => {
      if (card.legalities && card.legalities.standard === 'not_legal') {
        issues.push({
          type: 'error',
          message: `${card.name} is not legal in Standard`,
          card: card.name
        });
      }
    });

    return {
      isLegal: issues.length === 0,
      issues,
      warnings
    };
  }

  /**
   * Check Modern format legality
   */
  private static checkModernLegality(cards: DeckCard[]): LegalityResult {
    const issues: LegalityIssue[] = [];
    const warnings: LegalityIssue[] = [];

    const totalCards = cards.reduce((sum, card) => sum + (card.quantity || 1), 0);
    if (totalCards < 60) {
      issues.push({
        type: 'error',
        message: `Modern deck must have at least 60 cards. Current: ${totalCards}`
      });
    }

    const basicLands = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
    const cardCounts = new Map<string, number>();
    
    cards.forEach(card => {
      const isBasic = basicLands.includes(card.name);
      if (!isBasic) {
        const count = cardCounts.get(card.name) || 0;
        cardCounts.set(card.name, count + (card.quantity || 1));
      }
    });

    cardCounts.forEach((count, name) => {
      if (count > 4) {
        issues.push({
          type: 'error',
          message: `${name} appears ${count} times (maximum 4 copies allowed)`,
          card: name
        });
      }
    });

    cards.forEach(card => {
      if (card.legalities && card.legalities.modern === 'banned') {
        issues.push({
          type: 'error',
          message: `${card.name} is banned in Modern`,
          card: card.name
        });
      } else if (card.legalities && card.legalities.modern === 'not_legal') {
        issues.push({
          type: 'error',
          message: `${card.name} is not legal in Modern`,
          card: card.name
        });
      }
    });

    return {
      isLegal: issues.length === 0,
      issues,
      warnings
    };
  }

  /**
   * Check Legacy format legality
   */
  private static checkLegacyLegality(cards: DeckCard[]): LegalityResult {
    const issues: LegalityIssue[] = [];
    const warnings: LegalityIssue[] = [];

    const totalCards = cards.reduce((sum, card) => sum + (card.quantity || 1), 0);
    if (totalCards < 60) {
      issues.push({
        type: 'error',
        message: `Legacy deck must have at least 60 cards. Current: ${totalCards}`
      });
    }

    cards.forEach(card => {
      if (card.legalities && card.legalities.legacy === 'banned') {
        issues.push({
          type: 'error',
          message: `${card.name} is banned in Legacy`,
          card: card.name
        });
      }
    });

    return {
      isLegal: issues.length === 0,
      issues,
      warnings
    };
  }

  /**
   * Check Vintage format legality
   */
  private static checkVintageLegality(cards: DeckCard[]): LegalityResult {
    const issues: LegalityIssue[] = [];
    const warnings: LegalityIssue[] = [];

    const totalCards = cards.reduce((sum, card) => sum + (card.quantity || 1), 0);
    if (totalCards < 60) {
      issues.push({
        type: 'error',
        message: `Vintage deck must have at least 60 cards. Current: ${totalCards}`
      });
    }

    cards.forEach(card => {
      if (card.legalities && card.legalities.vintage === 'banned') {
        issues.push({
          type: 'error',
          message: `${card.name} is banned in Vintage`,
          card: card.name
        });
      } else if (card.legalities && card.legalities.vintage === 'restricted') {
        const count = card.quantity || 1;
        if (count > 1) {
          issues.push({
            type: 'error',
            message: `${card.name} is restricted to 1 copy in Vintage`,
            card: card.name
          });
        }
      }
    });

    return {
      isLegal: issues.length === 0,
      issues,
      warnings
    };
  }

  /**
   * Check Pauper format legality
   */
  private static checkPauperLegality(cards: DeckCard[]): LegalityResult {
    const issues: LegalityIssue[] = [];
    const warnings: LegalityIssue[] = [];

    const totalCards = cards.reduce((sum, card) => sum + (card.quantity || 1), 0);
    if (totalCards < 60) {
      issues.push({
        type: 'error',
        message: `Pauper deck must have at least 60 cards. Current: ${totalCards}`
      });
    }

    // Check all cards are common
    cards.forEach(card => {
      if (card.rarity && card.rarity.toLowerCase() !== 'common') {
        issues.push({
          type: 'error',
          message: `${card.name} is not common rarity (Pauper allows only commons)`,
          card: card.name
        });
      }
    });

    return {
      isLegal: issues.length === 0,
      issues,
      warnings
    };
  }

  /**
   * Check if a card can be a commander
   */
  private static isValidCommander(card: DeckCard): boolean {
    const typeLine = card.type_line?.toLowerCase() || '';
    
    // Must be legendary
    if (!typeLine.includes('legendary')) {
      return false;
    }

    // Must be creature or planeswalker (or have "can be your commander" text)
    const isCreature = typeLine.includes('creature');
    const isPlaneswalker = typeLine.includes('planeswalker');
    const hasCommanderAbility = card.oracle_text?.toLowerCase().includes('can be your commander');

    return isCreature || isPlaneswalker || !!hasCommanderAbility;
  }

  /**
   * Check if card is legal in Commander
   */
  private static isLegalInCommander(card: DeckCard): boolean {
    // Check legalities from card data
    if (card.legalities) {
      return card.legalities.commander !== 'banned' && card.legalities.commander !== 'not_legal';
    }
    
    // If no legality data, assume legal (will be checked by actual data)
    return true;
  }

  /**
   * Calculate deck color identity from all cards
   */
  static calculateColorIdentity(cards: DeckCard[], commander?: DeckCard): string[] {
    const colors = new Set<string>();

    // Add commander colors first
    if (commander?.color_identity) {
      commander.color_identity.forEach(color => colors.add(color));
    }

    // Add all card colors
    cards.forEach(card => {
      (card.color_identity || []).forEach(color => colors.add(color));
    });

    return Array.from(colors).sort();
  }
}
