/**
 * Mana Curve Optimization Engine
 * Analyzes and provides recommendations for optimal mana curves
 */

export interface ManaCurveAnalysis {
  curve: { [cmc: number]: number };
  avgCMC: number;
  recommendations: string[];
  score: number; // 0-100
  issues: Array<{ severity: 'low' | 'medium' | 'high'; message: string }>;
}

export interface OptimalCurveTarget {
  cmc: number;
  min: number;
  max: number;
  ideal: number;
}

export class ManaCurveOptimizer {
  /**
   * Analyze the mana curve of a deck and provide optimization recommendations
   */
  static analyzeCurve(
    cards: Array<{ card_id: string; card_name: string; quantity: number }>,
    cardData: Map<string, any>,
    format: string = 'commander'
  ): ManaCurveAnalysis {
    const curve = this.calculateCurve(cards, cardData);
    const avgCMC = this.calculateAverageCMC(cards, cardData);
    const targets = this.getOptimalTargets(format);
    
    const issues: Array<{ severity: 'low' | 'medium' | 'high'; message: string }> = [];
    const recommendations: string[] = [];
    
    // Analyze each CMC slot
    for (const target of targets) {
      const count = curve[target.cmc] || 0;
      
      if (count < target.min) {
        issues.push({
          severity: 'high',
          message: `Too few ${target.cmc}-drops: ${count} (min: ${target.min})`
        });
        recommendations.push(`Add ${target.min - count} more ${target.cmc}-mana cards`);
      } else if (count > target.max) {
        issues.push({
          severity: 'medium',
          message: `Too many ${target.cmc}-drops: ${count} (max: ${target.max})`
        });
        recommendations.push(`Consider replacing ${count - target.max} ${target.cmc}-mana cards with lower CMC options`);
      }
    }
    
    // Check average CMC
    if (format === 'commander') {
      if (avgCMC < 2.5) {
        recommendations.push('Consider adding more mid-range threats (3-5 CMC)');
      } else if (avgCMC > 4.0) {
        issues.push({
          severity: 'high',
          message: 'Average CMC is too high, deck may be too slow'
        });
        recommendations.push('Add more early game interaction and ramp (1-3 CMC)');
      }
    }
    
    // Check for gaps in the curve
    const gaps = this.findCurveGaps(curve);
    if (gaps.length > 0) {
      issues.push({
        severity: 'medium',
        message: `Curve gaps at ${gaps.join(', ')} mana`
      });
      recommendations.push(`Fill curve gaps by adding cards at ${gaps.join(', ')} CMC`);
    }
    
    // Calculate score
    const score = this.calculateCurveScore(curve, targets, avgCMC, format);
    
    return {
      curve,
      avgCMC,
      recommendations,
      score,
      issues
    };
  }
  
  /**
   * Calculate the mana curve distribution
   */
  private static calculateCurve(
    cards: Array<{ card_id: string; card_name: string; quantity: number }>,
    cardData: Map<string, any>
  ): { [cmc: number]: number } {
    const curve: { [cmc: number]: number } = {};
    
    for (const card of cards) {
      const data = cardData.get(card.card_id);
      if (!data) continue;
      
      // Skip lands
      if (data.type_line?.toLowerCase().includes('land')) continue;
      
      const cmc = data.cmc || 0;
      curve[cmc] = (curve[cmc] || 0) + card.quantity;
    }
    
    return curve;
  }
  
  /**
   * Calculate average converted mana cost
   */
  private static calculateAverageCMC(
    cards: Array<{ card_id: string; card_name: string; quantity: number }>,
    cardData: Map<string, any>
  ): number {
    let totalCMC = 0;
    let totalCards = 0;
    
    for (const card of cards) {
      const data = cardData.get(card.card_id);
      if (!data) continue;
      
      // Skip lands
      if (data.type_line?.toLowerCase().includes('land')) continue;
      
      totalCMC += (data.cmc || 0) * card.quantity;
      totalCards += card.quantity;
    }
    
    return totalCards > 0 ? totalCMC / totalCards : 0;
  }
  
  /**
   * Get optimal curve targets for different formats
   */
  private static getOptimalTargets(format: string): OptimalCurveTarget[] {
    const targets: { [format: string]: OptimalCurveTarget[] } = {
      commander: [
        { cmc: 1, min: 8, max: 15, ideal: 12 },
        { cmc: 2, min: 10, max: 18, ideal: 14 },
        { cmc: 3, min: 10, max: 16, ideal: 13 },
        { cmc: 4, min: 8, max: 14, ideal: 11 },
        { cmc: 5, min: 5, max: 12, ideal: 8 },
        { cmc: 6, min: 3, max: 8, ideal: 5 },
        { cmc: 7, min: 0, max: 5, ideal: 2 }
      ],
      standard: [
        { cmc: 1, min: 8, max: 16, ideal: 12 },
        { cmc: 2, min: 12, max: 20, ideal: 16 },
        { cmc: 3, min: 8, max: 16, ideal: 12 },
        { cmc: 4, min: 4, max: 12, ideal: 8 },
        { cmc: 5, min: 2, max: 8, ideal: 4 },
        { cmc: 6, min: 0, max: 4, ideal: 2 }
      ],
      modern: [
        { cmc: 1, min: 10, max: 20, ideal: 15 },
        { cmc: 2, min: 10, max: 18, ideal: 14 },
        { cmc: 3, min: 8, max: 14, ideal: 11 },
        { cmc: 4, min: 4, max: 10, ideal: 7 },
        { cmc: 5, min: 0, max: 6, ideal: 3 }
      ]
    };
    
    return targets[format] || targets.commander;
  }
  
  /**
   * Find gaps in the mana curve
   */
  private static findCurveGaps(curve: { [cmc: number]: number }): number[] {
    const gaps: number[] = [];
    
    for (let cmc = 1; cmc <= 5; cmc++) {
      if (!curve[cmc] || curve[cmc] < 3) {
        gaps.push(cmc);
      }
    }
    
    return gaps;
  }
  
  /**
   * Calculate a score for the mana curve (0-100)
   */
  private static calculateCurveScore(
    curve: { [cmc: number]: number },
    targets: OptimalCurveTarget[],
    avgCMC: number,
    format: string
  ): number {
    let score = 100;
    
    // Check each CMC slot against targets
    for (const target of targets) {
      const count = curve[target.cmc] || 0;
      const deviation = Math.abs(count - target.ideal);
      const maxDeviation = Math.max(target.ideal, target.max - target.ideal);
      
      if (count < target.min || count > target.max) {
        score -= 15; // Major penalty for being outside range
      } else {
        score -= (deviation / maxDeviation) * 5; // Minor penalty for deviation from ideal
      }
    }
    
    // Penalty for suboptimal average CMC
    const idealAvg = format === 'commander' ? 3.2 : 2.5;
    const avgDeviation = Math.abs(avgCMC - idealAvg);
    score -= avgDeviation * 5;
    
    // Penalty for curve gaps
    const gaps = this.findCurveGaps(curve);
    score -= gaps.length * 5;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  
  /**
   * Suggest specific card replacements to improve curve
   */
  static suggestReplacements(
    cards: Array<{ card_id: string; card_name: string; quantity: number }>,
    cardData: Map<string, any>,
    targetCMC: number
  ): string[] {
    const suggestions: string[] = [];
    
    // Find cards that are too high/low CMC and could be replaced
    for (const card of cards) {
      const data = cardData.get(card.card_id);
      if (!data) continue;
      
      if (data.type_line?.toLowerCase().includes('land')) continue;
      
      const cmc = data.cmc || 0;
      
      if (Math.abs(cmc - targetCMC) >= 2) {
        suggestions.push(
          `Consider replacing ${card.card_name} (${cmc} CMC) with a ${targetCMC} CMC alternative`
        );
      }
    }
    
    return suggestions.slice(0, 5); // Return top 5 suggestions
  }
}
