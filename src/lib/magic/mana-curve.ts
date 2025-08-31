// Advanced Mana Curve Analysis and Optimization
// Provides comprehensive mana curve analysis with format-specific recommendations

import { Card as BaseCard } from '@/types/collection';
import { Format, ALL_FORMATS } from './formats';

// Extend the base Card type to include quantity for deck analysis
interface Card extends BaseCard {
  quantity?: number;
}

export interface ManaCurveData {
  cmc: number;
  count: number;
  percentage: number;
  isOptimal: boolean;
  recommendation?: string;
}

export interface ManaCurveAnalysis {
  curve: ManaCurveData[];
  averageCMC: number;
  totalNonLands: number;
  peakCMC: number;
  distribution: {
    earlyGame: number; // CMC 0-2
    midGame: number;   // CMC 3-5
    lateGame: number;  // CMC 6+
  };
  optimality: {
    score: number; // 0-100
    issues: string[];
    suggestions: string[];
  };
  formatSpecificMetrics: {
    format: string;
    idealCurve: ManaCurveData[];
    deviations: Array<{ cmc: number; actual: number; ideal: number; severity: 'low' | 'medium' | 'high' }>;
  };
}

export class ManaCurveAnalyzer {
  // Ideal curve distributions by format
  private static IDEAL_CURVES: Record<string, number[]> = {
    // Index 0-10+ representing CMC distribution percentages
    standard: [5, 25, 20, 15, 15, 10, 5, 3, 2, 0, 0], // Aggressive curve
    pioneer: [3, 22, 18, 17, 16, 12, 7, 3, 2, 0, 0],   // Slightly higher
    modern: [8, 20, 18, 15, 15, 12, 7, 3, 2, 0, 0],    // More 0-cost spells
    legacy: [12, 18, 16, 14, 14, 12, 8, 4, 2, 0, 0],   // Higher power level
    vintage: [15, 15, 14, 13, 13, 12, 8, 6, 4, 0, 0],  // Even higher power
    commander: [8, 12, 15, 18, 16, 12, 8, 6, 3, 1, 1], // Higher curve for multiplayer
    brawl: [5, 20, 18, 16, 15, 12, 8, 4, 2, 0, 0],     // Similar to standard
    draft: [2, 15, 22, 20, 18, 12, 8, 2, 1, 0, 0],     // Limited curve
    sealed: [2, 12, 20, 22, 20, 14, 8, 2, 0, 0, 0],    // Slower limited
    pauper: [8, 22, 25, 20, 15, 8, 2, 0, 0, 0, 0],     // Low power level
  };

  static analyze(deck: Card[], format: string): ManaCurveAnalysis {
    const nonLands = deck.filter(card => !this.isLand(card));
    const totalNonLands = nonLands.reduce((sum, card) => sum + (card.quantity || 1), 0);

    // Build mana curve
    const curve = this.buildManaCurve(nonLands, totalNonLands);
    
    // Calculate metrics
    const averageCMC = this.calculateAverageCMC(nonLands);
    const peakCMC = this.findPeakCMC(curve);
    const distribution = this.calculateDistribution(curve);
    
    // Analyze optimality
    const optimality = this.analyzeOptimality(curve, format);
    
    // Format-specific analysis
    const formatSpecificMetrics = this.analyzeFormatSpecific(curve, format);

    return {
      curve,
      averageCMC,
      totalNonLands,
      peakCMC,
      distribution,
      optimality,
      formatSpecificMetrics
    };
  }

  private static buildManaCurve(nonLands: Card[], totalNonLands: number): ManaCurveData[] {
    const cmcCounts: Record<number, number> = {};
    
    // Count cards by CMC
    nonLands.forEach(card => {
      const cmc = card.cmc || 0;
      const quantity = card.quantity || 1;
      cmcCounts[cmc] = (cmcCounts[cmc] || 0) + quantity;
    });

    // Build curve data (0-10+)
    const curve: ManaCurveData[] = [];
    for (let cmc = 0; cmc <= 10; cmc++) {
      const count = cmcCounts[cmc] || 0;
      const percentage = totalNonLands > 0 ? (count / totalNonLands) * 100 : 0;
      
      curve.push({
        cmc: cmc === 10 ? 99 : cmc, // 99 represents 10+
        count,
        percentage,
        isOptimal: false // Will be set in optimality analysis
      });
    }

    // Add 10+ CMC cards
    const highCMCCount = Object.entries(cmcCounts)
      .filter(([cmc]) => parseInt(cmc) >= 10)
      .reduce((sum, [_, count]) => sum + count, 0);
    
    if (highCMCCount > 0) {
      const lastEntry = curve[curve.length - 1];
      lastEntry.count = highCMCCount;
      lastEntry.percentage = totalNonLands > 0 ? (highCMCCount / totalNonLands) * 100 : 0;
    }

    return curve;
  }

  private static calculateAverageCMC(nonLands: Card[]): number {
    const totalCMC = nonLands.reduce((sum, card) => {
      const quantity = card.quantity || 1;
      const cmc = card.cmc || 0;
      return sum + (cmc * quantity);
    }, 0);
    
    const totalCards = nonLands.reduce((sum, card) => sum + (card.quantity || 1), 0);
    
    return totalCards > 0 ? totalCMC / totalCards : 0;
  }

  private static findPeakCMC(curve: ManaCurveData[]): number {
    let maxCount = 0;
    let peakCMC = 0;
    
    curve.forEach(point => {
      if (point.count > maxCount) {
        maxCount = point.count;
        peakCMC = point.cmc === 99 ? 10 : point.cmc;
      }
    });
    
    return peakCMC;
  }

  private static calculateDistribution(curve: ManaCurveData[]): {
    earlyGame: number;
    midGame: number;
    lateGame: number;
  } {
    const earlyGame = curve.slice(0, 3).reduce((sum, point) => sum + point.percentage, 0);
    const midGame = curve.slice(3, 6).reduce((sum, point) => sum + point.percentage, 0);
    const lateGame = curve.slice(6).reduce((sum, point) => sum + point.percentage, 0);
    
    return { earlyGame, midGame, lateGame };
  }

  private static analyzeOptimality(curve: ManaCurveData[], format: string): {
    score: number;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    const idealCurve = this.IDEAL_CURVES[format] || this.IDEAL_CURVES.standard;
    
    let deviationScore = 0;
    
    // Compare actual vs ideal curve
    curve.forEach((point, index) => {
      if (index < idealCurve.length) {
        const idealPercentage = idealCurve[index];
        const deviation = Math.abs(point.percentage - idealPercentage);
        deviationScore += deviation;
        
        // Mark as optimal if within 5% of ideal
        point.isOptimal = deviation <= 5;
        
        // Generate specific feedback
        if (deviation > 10) {
          const cmc = point.cmc === 99 ? '10+' : point.cmc.toString();
          if (point.percentage > idealPercentage) {
            issues.push(`Too many ${cmc}-cost spells (${point.percentage.toFixed(1)}% vs ideal ${idealPercentage}%)`);
            suggestions.push(`Consider reducing ${cmc}-cost spells and adding more variety`);
          } else {
            issues.push(`Too few ${cmc}-cost spells (${point.percentage.toFixed(1)}% vs ideal ${idealPercentage}%)`);
            suggestions.push(`Consider adding more ${cmc}-cost spells for better curve`);
          }
        }
      }
    });
    
    // Calculate final score (0-100)
    const maxPossibleDeviation = 100 * curve.length;
    const score = Math.max(0, 100 - (deviationScore / maxPossibleDeviation) * 100);
    
    // Add format-specific suggestions
    this.addFormatSpecificSuggestions(curve, format, suggestions);
    
    return { score, issues, suggestions };
  }

  private static analyzeFormatSpecific(curve: ManaCurveData[], format: string): {
    format: string;
    idealCurve: ManaCurveData[];
    deviations: Array<{ cmc: number; actual: number; ideal: number; severity: 'low' | 'medium' | 'high' }>;
  } {
    const idealCurve = this.IDEAL_CURVES[format] || this.IDEAL_CURVES.standard;
    const idealCurveData: ManaCurveData[] = idealCurve.map((percentage, index) => ({
      cmc: index === 10 ? 99 : index,
      count: 0, // Not relevant for ideal curve
      percentage,
      isOptimal: true
    }));
    
    const deviations = curve.map((point, index) => {
      const idealPercentage = idealCurve[index] || 0;
      const deviation = Math.abs(point.percentage - idealPercentage);
      
      let severity: 'low' | 'medium' | 'high' = 'low';
      if (deviation > 15) severity = 'high';
      else if (deviation > 8) severity = 'medium';
      
      return {
        cmc: point.cmc === 99 ? 10 : point.cmc,
        actual: point.percentage,
        ideal: idealPercentage,
        severity
      };
    });
    
    return {
      format,
      idealCurve: idealCurveData,
      deviations
    };
  }

  private static addFormatSpecificSuggestions(curve: ManaCurveData[], format: string, suggestions: string[]): void {
    const distribution = this.calculateDistribution(curve);
    
    switch (format) {
      case 'standard':
      case 'pioneer':
        if (distribution.earlyGame < 40) {
          suggestions.push('Add more early game cards (1-2 CMC) for faster starts');
        }
        if (distribution.lateGame > 15) {
          suggestions.push('Consider reducing high-cost cards for more consistency');
        }
        break;
        
      case 'modern':
      case 'legacy':
      case 'vintage':
        if (distribution.earlyGame < 35) {
          suggestions.push('Fast formats require strong early game presence');
        }
        if (curve[0].percentage < 5) {
          suggestions.push('Consider adding 0-cost spells for explosive starts');
        }
        break;
        
      case 'commander':
        if (distribution.earlyGame < 25) {
          suggestions.push('Add more early ramp and interaction for multiplayer games');
        }
        if (distribution.lateGame < 25) {
          suggestions.push('Commander benefits from powerful late-game threats');
        }
        break;
        
      case 'draft':
      case 'sealed':
        if (distribution.midGame < 50) {
          suggestions.push('Limited formats favor strong 3-5 CMC cards');
        }
        break;
    }
  }

  private static isLand(card: Card): boolean {
    return card.type_line?.toLowerCase().includes('land') || false;
  }

  // Optimization suggestions
  static generateOptimizationSuggestions(analysis: ManaCurveAnalysis, availableCards?: Card[]): {
    swapSuggestions: Array<{
      remove: { cmc: number; count: number };
      add: { cmc: number; count: number };
      reason: string;
    }>;
    addSuggestions: Array<{
      cmc: number;
      count: number;
      cardTypes: string[];
      reason: string;
    }>;
  } {
    const swapSuggestions: Array<{
      remove: { cmc: number; count: number };
      add: { cmc: number; count: number };
      reason: string;
    }> = [];
    
    const addSuggestions: Array<{
      cmc: number;
      count: number;
      cardTypes: string[];
      reason: string;
    }> = [];

    // Analyze deviations and suggest improvements
    analysis.formatSpecificMetrics.deviations.forEach(deviation => {
      if (deviation.severity === 'high') {
        if (deviation.actual > deviation.ideal) {
          // Too many cards at this CMC
          const excess = Math.ceil((deviation.actual - deviation.ideal) / 100 * analysis.totalNonLands);
          
          // Find a CMC slot that needs more cards
          const needsMore = analysis.formatSpecificMetrics.deviations.find(d => 
            d.severity === 'high' && d.actual < d.ideal
          );
          
          if (needsMore) {
            swapSuggestions.push({
              remove: { cmc: deviation.cmc, count: excess },
              add: { cmc: needsMore.cmc, count: excess },
              reason: `Rebalance curve: move from ${deviation.cmc} CMC to ${needsMore.cmc} CMC`
            });
          }
        } else {
          // Too few cards at this CMC
          const needed = Math.ceil((deviation.ideal - deviation.actual) / 100 * analysis.totalNonLands);
          
          addSuggestions.push({
            cmc: deviation.cmc,
            count: needed,
            cardTypes: this.suggestCardTypesForCMC(deviation.cmc, analysis.formatSpecificMetrics.format),
            reason: `Strengthen ${deviation.cmc} CMC slot for better curve`
          });
        }
      }
    });

    return { swapSuggestions, addSuggestions };
  }

  private static suggestCardTypesForCMC(cmc: number, format: string): string[] {
    const suggestions: string[] = [];
    
    if (cmc <= 1) {
      suggestions.push('Cheap removal', 'One-mana creatures', 'Cantrips');
      if (format === 'modern' || format === 'legacy' || format === 'vintage') {
        suggestions.push('Fast mana', 'Cheap disruption');
      }
    } else if (cmc <= 2) {
      suggestions.push('Efficient creatures', 'Cheap interaction', 'Card selection');
    } else if (cmc <= 3) {
      suggestions.push('Versatile spells', 'Three-mana creatures', 'Planeswalkers');
    } else if (cmc <= 5) {
      suggestions.push('Midrange threats', 'Removal spells', 'Card advantage');
    } else {
      suggestions.push('Finishers', 'Board wipes', 'Powerful late game');
      if (format === 'commander') {
        suggestions.push('High-impact multiplayer cards');
      }
    }
    
    return suggestions;
  }
}