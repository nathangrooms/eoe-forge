import { Card as DeckCard } from '@/stores/deckStore';

export interface ValidationWarning {
  severity: 'error' | 'warning' | 'info';
  category: 'mana' | 'curve' | 'synergy' | 'power' | 'legality' | 'balance';
  message: string;
  suggestion?: string;
  affectedCards?: string[];
}

/**
 * Comprehensive deck validation system that provides actionable warnings
 * Helps users identify potential issues and improvements in their decks
 */
export class DeckValidator {
  /**
   * Validate deck and return all warnings
   */
  static validate(
    cards: DeckCard[],
    format: string,
    commander?: DeckCard
  ): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Run all validation checks
    warnings.push(...this.checkManaBase(cards, format));
    warnings.push(...this.checkManaCurve(cards, format));
    warnings.push(...this.checkCardDrawSources(cards));
    warnings.push(...this.checkRemoval(cards, format));
    warnings.push(...this.checkRamp(cards, format));
    warnings.push(...this.checkWinConditions(cards, format));
    warnings.push(...this.checkSynergy(cards, commander));
    warnings.push(...this.checkBalance(cards));

    return warnings;
  }

  /**
   * Check mana base quality
   */
  private static checkManaBase(cards: DeckCard[], format: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    const lands = cards.filter(card => 
      card.type_line?.toLowerCase().includes('land')
    );
    
    const totalCards = cards.reduce((sum, card) => sum + (card.quantity || 1), 0);
    const landCount = lands.reduce((sum, card) => sum + (card.quantity || 1), 0);
    const landPercentage = (landCount / totalCards) * 100;

    // Check land count for format
    if (format.toLowerCase() === 'commander') {
      if (landCount < 33) {
        warnings.push({
          severity: 'warning',
          category: 'mana',
          message: `Only ${landCount} lands (${landPercentage.toFixed(1)}%)`,
          suggestion: 'Commander decks typically run 35-40 lands. Consider adding more lands or mana rocks.'
        });
      } else if (landCount < 35) {
        warnings.push({
          severity: 'info',
          category: 'mana',
          message: `${landCount} lands may be slightly low`,
          suggestion: 'Most Commander decks run 35-40 lands unless heavily focused on artifacts/ramp.'
        });
      }
    } else {
      // Standard/Modern/etc
      if (landCount < 22 && totalCards >= 60) {
        warnings.push({
          severity: 'warning',
          category: 'mana',
          message: `Only ${landCount} lands (${landPercentage.toFixed(1)}%)`,
          suggestion: 'Most 60-card decks run 22-26 lands. Consider adding more.'
        });
      }
    }

    // Check for fixing in multicolor decks
    const colorIdentity = new Set<string>();
    cards.forEach(card => {
      (card.color_identity || []).forEach(color => colorIdentity.add(color));
    });

    if (colorIdentity.size >= 3) {
      const fixingLands = lands.filter(land => 
        land.oracle_text?.toLowerCase().includes('add') && 
        (land.oracle_text.includes('{') || land.oracle_text.includes('any color'))
      );
      
      if (fixingLands.length < 10) {
        warnings.push({
          severity: 'warning',
          category: 'mana',
          message: `${colorIdentity.size}-color deck with limited fixing`,
          suggestion: 'Add more dual lands, fetch lands, or mana fixing to ensure consistent colors.'
        });
      }
    }

    return warnings;
  }

  /**
   * Check mana curve distribution
   */
  private static checkManaCurve(cards: DeckCard[], format: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    const nonLands = cards.filter(card => 
      !card.type_line?.toLowerCase().includes('land')
    );

    const curveBins = {
      '0-1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
      '6+': 0
    };

    nonLands.forEach(card => {
      const cmc = card.cmc || 0;
      const quantity = card.quantity || 1;
      
      if (cmc <= 1) curveBins['0-1'] += quantity;
      else if (cmc === 2) curveBins['2'] += quantity;
      else if (cmc === 3) curveBins['3'] += quantity;
      else if (cmc === 4) curveBins['4'] += quantity;
      else if (cmc === 5) curveBins['5'] += quantity;
      else curveBins['6+'] += quantity;
    });

    const totalNonLands = nonLands.reduce((sum, card) => sum + (card.quantity || 1), 0);
    
    // Check for top-heavy curve
    const highCmcPercentage = (curveBins['6+'] / totalNonLands) * 100;
    if (highCmcPercentage > 25 && format.toLowerCase() !== 'commander') {
      warnings.push({
        severity: 'warning',
        category: 'curve',
        message: 'Curve is very top-heavy',
        suggestion: `${Math.round(highCmcPercentage)}% of spells cost 6+ mana. Consider adding more low-cost cards.`
      });
    }

    // Check for lack of early plays
    const earlyGamePercentage = (curveBins['0-1'] + curveBins['2']) / totalNonLands * 100;
    if (earlyGamePercentage < 20 && format.toLowerCase() !== 'commander') {
      warnings.push({
        severity: 'warning',
        category: 'curve',
        message: 'Few early game plays',
        suggestion: 'Add more 1-2 mana spells for early game consistency.'
      });
    }

    return warnings;
  }

  /**
   * Check card draw sources
   */
  private static checkCardDrawSources(cards: DeckCard[]): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    
    const drawSources = cards.filter(card => {
      const text = card.oracle_text?.toLowerCase() || '';
      return text.includes('draw') && 
             (text.includes('card') || text.includes('cards'));
    });

    if (drawSources.length < 5) {
      warnings.push({
        severity: 'warning',
        category: 'balance',
        message: 'Limited card draw',
        suggestion: 'Add more card draw sources to maintain card advantage and prevent running out of resources.',
        affectedCards: drawSources.map(c => c.name)
      });
    }

    return warnings;
  }

  /**
   * Check removal spells
   */
  private static checkRemoval(cards: DeckCard[], format: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    
    const removal = cards.filter(card => {
      const text = card.oracle_text?.toLowerCase() || '';
      const type = card.type_line?.toLowerCase() || '';
      
      return (text.includes('destroy') || 
              text.includes('exile') || 
              text.includes('remove') ||
              text.includes('counter') ||
              (type.includes('instant') && text.includes('target')));
    });

    const minRemoval = format.toLowerCase() === 'commander' ? 8 : 6;
    
    if (removal.length < minRemoval) {
      warnings.push({
        severity: 'warning',
        category: 'balance',
        message: 'Insufficient removal',
        suggestion: `Only ${removal.length} removal spells found. Add more interaction to deal with opponents' threats.`
      });
    }

    return warnings;
  }

  /**
   * Check ramp/acceleration
   */
  private static checkRamp(cards: DeckCard[], format: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    
    if (format.toLowerCase() === 'commander') {
      const rampSources = cards.filter(card => {
        const text = card.oracle_text?.toLowerCase() || '';
        const type = card.type_line?.toLowerCase() || '';
        
        return (text.includes('search your library for') && text.includes('land')) ||
               text.includes('add {') ||
               (type.includes('artifact') && text.includes('add')) ||
               text.includes('treasure') ||
               text.includes('ramp');
      });

      if (rampSources.length < 8) {
        warnings.push({
          severity: 'info',
          category: 'mana',
          message: 'Limited ramp',
          suggestion: 'Commander benefits from 10-15 ramp sources for consistent acceleration.'
        });
      }
    }

    return warnings;
  }

  /**
   * Check for win conditions
   */
  private static checkWinConditions(cards: DeckCard[], format: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    
    const wincons = cards.filter(card => {
      const text = card.oracle_text?.toLowerCase() || '';
      return text.includes('you win the game') ||
             text.includes('loses the game') ||
             text.includes('commander damage') ||
             (card.power && parseInt(card.power) >= 5);
    });

    if (wincons.length < 3 && format.toLowerCase() === 'commander') {
      warnings.push({
        severity: 'warning',
        category: 'power',
        message: 'Unclear win conditions',
        suggestion: 'Add more threats or combo pieces to close out games.',
        affectedCards: wincons.map(c => c.name)
      });
    }

    return warnings;
  }

  /**
   * Check synergy with commander
   */
  private static checkSynergy(cards: DeckCard[], commander?: DeckCard): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    
    if (!commander) return warnings;

    const commanderTypes = commander.type_line?.toLowerCase() || '';
    const commanderText = commander.oracle_text?.toLowerCase() || '';

    // Check for tribal synergy
    if (commanderTypes.includes('elf') || commanderTypes.includes('goblin') || 
        commanderTypes.includes('zombie') || commanderTypes.includes('dragon')) {
      const tribalType = commanderTypes.split(' ').find(t => 
        ['elf', 'goblin', 'zombie', 'dragon', 'warrior', 'wizard'].includes(t)
      );
      
      if (tribalType) {
        const tribalCards = cards.filter(card => 
          card.type_line?.toLowerCase().includes(tribalType)
        );
        
        if (tribalCards.length < 15) {
          warnings.push({
            severity: 'info',
            category: 'synergy',
            message: `Limited ${tribalType} tribal synergy`,
            suggestion: `Commander appears to be ${tribalType} tribal. Consider adding more ${tribalType}s for better synergy.`
          });
        }
      }
    }

    return warnings;
  }

  /**
   * Check overall deck balance
   */
  private static checkBalance(cards: DeckCard[]): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    
    // Check creature count
    const creatures = cards.filter(card => 
      card.type_line?.toLowerCase().includes('creature')
    );
    const creatureCount = creatures.reduce((sum, card) => sum + (card.quantity || 1), 0);
    const totalCards = cards.reduce((sum, card) => sum + (card.quantity || 1), 0);
    const creaturePercentage = (creatureCount / totalCards) * 100;

    if (creaturePercentage < 15) {
      warnings.push({
        severity: 'info',
        category: 'balance',
        message: 'Very few creatures',
        suggestion: 'Deck has limited creature presence. Ensure you have alternate win conditions.'
      });
    } else if (creaturePercentage > 60) {
      warnings.push({
        severity: 'info',
        category: 'balance',
        message: 'Heavily creature-based',
        suggestion: 'Deck is very creature-heavy. Consider adding more spells for interaction and card advantage.'
      });
    }

    return warnings;
  }

  /**
   * Get warnings by severity
   */
  static getWarningsBySeverity(
    warnings: ValidationWarning[],
    severity: 'error' | 'warning' | 'info'
  ): ValidationWarning[] {
    return warnings.filter(w => w.severity === severity);
  }

  /**
   * Get warnings by category
   */
  static getWarningsByCategory(
    warnings: ValidationWarning[],
    category: ValidationWarning['category']
  ): ValidationWarning[] {
    return warnings.filter(w => w.category === category);
  }
}
