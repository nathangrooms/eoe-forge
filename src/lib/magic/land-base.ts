// Advanced Land Base Calculator and Mana Base Optimization
// Provides comprehensive mana base analysis and recommendations

import { Card as BaseCard } from '@/types/collection';
import { BASIC_COLORS } from './colors';
import { ALL_FORMATS, Format } from './formats';

// Extend the base Card type to include quantity for deck analysis
interface Card extends BaseCard {
  quantity?: number;
}

export interface ColorRequirement {
  color: string;
  intensity: number; // 1-3 scale (splash, secondary, primary)
  earliestTurn: number; // When this color is first needed
  sources: number; // Recommended sources for this color
}

export interface LandRecommendation {
  name: string;
  type: 'basic' | 'dual' | 'fetch' | 'shock' | 'utility' | 'special';
  colors: string[];
  entersTapped: boolean;
  fetchable: boolean;
  priority: number; // 1-10 scale
  quantity: number;
  reason: string;
  alternatives?: string[];
}

export interface ManaBaseAnalysis {
  totalLands: number;
  colorRequirements: ColorRequirement[];
  recommendations: LandRecommendation[];
  statistics: {
    totalSources: Record<string, number>;
    untappedSources: Record<string, number>;
    fetchableSources: Record<string, number>;
    colorConsistency: Record<string, number>; // Probability of having color on curve
  };
  issues: string[];
  improvements: string[];
  budgetAlternatives: LandRecommendation[];
}

export class LandBaseCalculator {
  // Base land count recommendations by format and deck size
  private static LAND_COUNTS: Record<string, { min: number; max: number; optimal: number }> = {
    standard: { min: 22, max: 27, optimal: 24 },
    pioneer: { min: 22, max: 26, optimal: 24 },
    modern: { min: 19, max: 24, optimal: 21 },
    legacy: { min: 18, max: 23, optimal: 20 },
    vintage: { min: 16, max: 21, optimal: 18 },
    commander: { min: 35, max: 40, optimal: 37 },
    brawl: { min: 22, max: 26, optimal: 24 },
    pauper: { min: 20, max: 25, optimal: 22 },
  };

  // Color intensity thresholds (number of colored mana symbols)
  private static COLOR_INTENSITY = {
    splash: { min: 1, max: 3 },     // 1-3 symbols
    secondary: { min: 4, max: 8 },   // 4-8 symbols
    primary: { min: 9, max: 999 }    // 9+ symbols
  };

  static calculate(deck: Card[], format: string, budget: 'budget' | 'optimal' | 'premium' = 'optimal'): ManaBaseAnalysis {
    const nonLands = deck.filter(card => !this.isLand(card));
    const existingLands = deck.filter(card => this.isLand(card));
    
    // Analyze color requirements
    const colorRequirements = this.analyzeColorRequirements(nonLands);
    
    // Calculate optimal land count
    const totalLands = this.calculateOptimalLandCount(nonLands, format);
    
    // Generate land recommendations
    const recommendations = this.generateLandRecommendations(
      colorRequirements, 
      totalLands, 
      format, 
      budget
    );
    
    // Calculate statistics
    const statistics = this.calculateStatistics(recommendations, colorRequirements);
    
    // Analyze issues and improvements
    const { issues, improvements } = this.analyzeIssues(
      existingLands, 
      recommendations, 
      colorRequirements, 
      format
    );
    
    // Generate budget alternatives
    const budgetAlternatives = budget !== 'budget' 
      ? this.generateBudgetAlternatives(recommendations, colorRequirements, totalLands)
      : [];

    return {
      totalLands,
      colorRequirements,
      recommendations,
      statistics,
      issues,
      improvements,
      budgetAlternatives
    };
  }

  private static analyzeColorRequirements(nonLands: Card[]): ColorRequirement[] {
    const colorData: Record<string, { symbols: number; earliestTurn: number; totalCost: number }> = {};
    
    // Initialize color data
    Object.keys(BASIC_COLORS).forEach(color => {
      colorData[color] = { symbols: 0, earliestTurn: 10, totalCost: 0 };
    });

    // Analyze each card's color requirements
    nonLands.forEach(card => {
      const cmc = card.cmc || 0;
      const colors = card.color_identity || card.colors || [];
      const quantity = card.quantity || 1;
      
      colors.forEach(color => {
        if (color in colorData) {
          // Count colored symbols (approximation based on colors)
          const symbolsPerCard = colors.length === 1 ? Math.min(cmc, 3) : 1;
          colorData[color].symbols += symbolsPerCard * quantity;
          colorData[color].earliestTurn = Math.min(colorData[color].earliestTurn, cmc);
          colorData[color].totalCost += cmc * quantity;
        }
      });
    });

    // Convert to color requirements
    const requirements: ColorRequirement[] = [];
    
    Object.entries(colorData).forEach(([color, data]) => {
      if (data.symbols > 0) {
        let intensity: number;
        
        if (data.symbols <= this.COLOR_INTENSITY.splash.max) {
          intensity = 1; // Splash
        } else if (data.symbols <= this.COLOR_INTENSITY.secondary.max) {
          intensity = 2; // Secondary
        } else {
          intensity = 3; // Primary
        }

        // Calculate recommended sources using Karsten's formula
        const sources = this.calculateSourcesNeeded(intensity, data.earliestTurn, data.symbols);

        requirements.push({
          color,
          intensity,
          earliestTurn: data.earliestTurn,
          sources
        });
      }
    });

    return requirements.sort((a, b) => b.intensity - a.intensity);
  }

  private static calculateSourcesNeeded(intensity: number, earliestTurn: number, totalSymbols: number): number {
    // Karsten's hypergeometric formula adapted
    let baseSources: number;
    
    switch (intensity) {
      case 1: // Splash
        baseSources = Math.max(3, Math.ceil(totalSymbols * 0.6));
        break;
      case 2: // Secondary
        baseSources = Math.max(5, Math.ceil(totalSymbols * 0.8));
        break;
      case 3: // Primary
        baseSources = Math.max(8, Math.ceil(totalSymbols * 1.0));
        break;
      default:
        baseSources = 3;
    }

    // Adjust for timing requirements
    if (earliestTurn <= 1) baseSources += 2;
    else if (earliestTurn <= 2) baseSources += 1;
    else if (earliestTurn >= 5) baseSources = Math.max(1, baseSources - 1);

    return Math.min(baseSources, 15); // Cap at 15 sources
  }

  private static calculateOptimalLandCount(nonLands: Card[], format: string): number {
    const formatLands = this.LAND_COUNTS[format] || this.LAND_COUNTS.standard;
    
    // Calculate average CMC of non-lands
    const totalCMC = nonLands.reduce((sum, card) => {
      const quantity = card.quantity || 1;
      const cmc = card.cmc || 0;
      return sum + (cmc * quantity);
    }, 0);
    
    const totalCards = nonLands.reduce((sum, card) => sum + (card.quantity || 1), 0);
    const avgCMC = totalCards > 0 ? totalCMC / totalCards : 3;
    
    // Adjust based on curve
    let adjustment = 0;
    if (avgCMC < 2.5) adjustment = -1; // Aggressive deck
    else if (avgCMC > 4) adjustment = +1; // Controlling deck
    
    return Math.max(formatLands.min, Math.min(formatLands.max, formatLands.optimal + adjustment));
  }

  private static generateLandRecommendations(
    colorRequirements: ColorRequirement[], 
    totalLands: number, 
    format: string,
    budget: 'budget' | 'optimal' | 'premium'
  ): LandRecommendation[] {
    const recommendations: LandRecommendation[] = [];
    const colorsNeeded = colorRequirements.map(req => req.color);
    const isMulticolor = colorsNeeded.length > 1;
    
    if (colorsNeeded.length === 0) {
      // Colorless deck
      recommendations.push({
        name: 'Wastes',
        type: 'basic',
        colors: [],
        entersTapped: false,
        fetchable: false,
        priority: 10,
        quantity: totalLands,
        reason: 'Colorless mana base'
      });
      return recommendations;
    }

    if (colorsNeeded.length === 1) {
      // Mono-color deck
      const color = colorsNeeded[0];
      const basicName = this.getBasicLandName(color);
      
      recommendations.push({
        name: basicName,
        type: 'basic',
        colors: [color],
        entersTapped: false,
        fetchable: true,
        priority: 10,
        quantity: Math.max(totalLands - 3, Math.floor(totalLands * 0.8)),
        reason: 'Primary mana source'
      });

      // Add utility lands for mono-color
      const utilityCount = Math.min(3, Math.floor(totalLands * 0.2));
      if (utilityCount > 0) {
        recommendations.push({
          name: 'Utility Lands',
          type: 'utility',
          colors: [],
          entersTapped: true,
          fetchable: false,
          priority: 6,
          quantity: utilityCount,
          reason: 'Additional utility effects',
          alternatives: this.getUtilityLandSuggestions(format, budget)
        });
      }
    } else {
      // Multi-color deck
      this.generateMulticolorRecommendations(
        recommendations, 
        colorRequirements, 
        totalLands, 
        format, 
        budget
      );
    }

    return recommendations.sort((a, b) => b.priority - a.priority);
  }

  private static generateMulticolorRecommendations(
    recommendations: LandRecommendation[], 
    colorRequirements: ColorRequirement[], 
    totalLands: number, 
    format: string,
    budget: 'budget' | 'optimal' | 'premium'
  ): void {
    const colors = colorRequirements.map(req => req.color);
    const isThreeOrMore = colors.length >= 3;
    
    // Calculate dual land needs
    const dualLandSlots = Math.floor(totalLands * (isThreeOrMore ? 0.7 : 0.6));
    const basicLandSlots = totalLands - dualLandSlots;
    
    // Generate dual land recommendations based on budget
    if (budget === 'premium' || budget === 'optimal') {
      this.addPremiumDualLands(recommendations, colors, dualLandSlots, format);
    }
    
    if (budget === 'budget' || budget === 'optimal') {
      this.addBudgetDualLands(recommendations, colors, dualLandSlots, format);
    }
    
    // Add basics
    if (basicLandSlots > 0) {
      this.distributeBasicLands(recommendations, colorRequirements, basicLandSlots);
    }
    
    // Add utility lands for multicolor
    if (colors.length >= 3 && totalLands > 30) {
      const utilityCount = Math.min(2, Math.floor(totalLands * 0.1));
      recommendations.push({
        name: 'Multicolor Utility',
        type: 'utility',
        colors: [],
        entersTapped: true,
        fetchable: false,
        priority: 5,
        quantity: utilityCount,
        reason: 'Multicolor utility effects',
        alternatives: this.getMulticolorUtilityLands(format)
      });
    }
  }

  private static addPremiumDualLands(
    recommendations: LandRecommendation[], 
    colors: string[], 
    slots: number, 
    format: string
  ): void {
    const colorPairs = this.generateColorPairs(colors);
    const slotsPerPair = Math.floor(slots / colorPairs.length);
    
    // Fetch lands (if format allows)
    if (this.formatAllowsFetches(format) && slotsPerPair >= 2) {
      colorPairs.forEach(pair => {
        recommendations.push({
          name: `${this.getColorNames(pair).join('-')} Fetchland`,
          type: 'fetch',
          colors: pair,
          entersTapped: false,
          fetchable: false,
          priority: 9,
          quantity: Math.min(4, slotsPerPair),
          reason: 'Perfect mana fixing and deck thinning',
          alternatives: this.getFetchlandNames(pair)
        });
      });
    }
    
    // Shock lands or equivalent
    if (slotsPerPair >= 1) {
      colorPairs.forEach(pair => {
        recommendations.push({
          name: `${this.getColorNames(pair).join('-')} Shock/Dual`,
          type: 'shock',
          colors: pair,
          entersTapped: false,
          fetchable: true,
          priority: 8,
          quantity: Math.min(3, slotsPerPair),
          reason: 'High-quality dual lands',
          alternatives: this.getShocklandNames(pair)
        });
      });
    }
  }

  private static addBudgetDualLands(
    recommendations: LandRecommendation[], 
    colors: string[], 
    slots: number, 
    format: string
  ): void {
    const colorPairs = this.generateColorPairs(colors);
    const slotsPerPair = Math.floor(slots / colorPairs.length);
    
    // Budget dual lands
    colorPairs.forEach(pair => {
      recommendations.push({
        name: `${this.getColorNames(pair).join('-')} Budget Dual`,
        type: 'dual',
        colors: pair,
        entersTapped: true,
        fetchable: false,
        priority: 6,
        quantity: Math.min(4, slotsPerPair + 1),
        reason: 'Budget-friendly color fixing',
        alternatives: this.getBudgetDualNames(pair, format)
      });
    });
  }

  private static distributeBasicLands(
    recommendations: LandRecommendation[], 
    colorRequirements: ColorRequirement[], 
    slots: number
  ): void {
    const totalIntensity = colorRequirements.reduce((sum, req) => sum + req.intensity, 0);
    
    colorRequirements.forEach(req => {
      const proportion = req.intensity / totalIntensity;
      const quantity = Math.max(1, Math.floor(slots * proportion));
      
      recommendations.push({
        name: this.getBasicLandName(req.color),
        type: 'basic',
        colors: [req.color],
        entersTapped: false,
        fetchable: true,
        priority: 7,
        quantity,
        reason: `Basic ${this.getColorNames([req.color])[0]} sources`
      });
    });
  }

  private static calculateStatistics(
    recommendations: LandRecommendation[], 
    colorRequirements: ColorRequirement[]
  ): {
    totalSources: Record<string, number>;
    untappedSources: Record<string, number>;
    fetchableSources: Record<string, number>;
    colorConsistency: Record<string, number>;
  } {
    const stats = {
      totalSources: {} as Record<string, number>,
      untappedSources: {} as Record<string, number>,
      fetchableSources: {} as Record<string, number>,
      colorConsistency: {} as Record<string, number>
    };

    // Initialize
    colorRequirements.forEach(req => {
      stats.totalSources[req.color] = 0;
      stats.untappedSources[req.color] = 0;
      stats.fetchableSources[req.color] = 0;
      stats.colorConsistency[req.color] = 0;
    });

    // Count sources from recommendations
    recommendations.forEach(rec => {
      rec.colors.forEach(color => {
        if (color in stats.totalSources) {
          stats.totalSources[color] += rec.quantity;
          
          if (!rec.entersTapped) {
            stats.untappedSources[color] += rec.quantity;
          }
          
          if (rec.fetchable) {
            stats.fetchableSources[color] += rec.quantity;
          }
        }
      });
    });

    // Calculate color consistency (simplified hypergeometric)
    colorRequirements.forEach(req => {
      const sources = stats.totalSources[req.color];
      const totalLands = recommendations.reduce((sum, rec) => sum + rec.quantity, 0);
      
      // Probability of having the color by turn X (simplified)
      const turn = req.earliestTurn;
      const cardsDrawn = 7 + turn - 1; // Starting hand + draws
      const probability = this.hypergeometric(sources, totalLands, cardsDrawn, 1);
      
      stats.colorConsistency[req.color] = probability * 100;
    });

    return stats;
  }

  private static analyzeIssues(
    existingLands: Card[], 
    recommendations: LandRecommendation[], 
    colorRequirements: ColorRequirement[], 
    format: string
  ): { issues: string[]; improvements: string[] } {
    const issues: string[] = [];
    const improvements: string[] = [];

    // Analyze existing vs recommended
    const existingCount = existingLands.reduce((sum, land) => sum + (land.quantity || 1), 0);
    const recommendedCount = recommendations.reduce((sum, rec) => sum + rec.quantity, 0);

    if (existingCount < recommendedCount - 2) {
      issues.push(`Too few lands: ${existingCount} vs recommended ${recommendedCount}`);
      improvements.push(`Add ${recommendedCount - existingCount} more lands`);
    } else if (existingCount > recommendedCount + 2) {
      issues.push(`Too many lands: ${existingCount} vs recommended ${recommendedCount}`);
      improvements.push(`Remove ${existingCount - recommendedCount} lands`);
    }

    // Check color requirements vs existing lands
    colorRequirements.forEach(req => {
      const existingSources = existingLands.filter(land => 
        (land.colors || []).includes(req.color) || 
        (land.color_identity || []).includes(req.color)
      ).reduce((sum, land) => sum + (land.quantity || 1), 0);

      if (existingSources < req.sources - 1) {
        issues.push(`Insufficient ${req.color} sources: ${existingSources} vs needed ${req.sources}`);
        improvements.push(`Add ${req.sources - existingSources} more ${req.color} sources`);
      }
    });

    return { issues, improvements };
  }

  private static generateBudgetAlternatives(
    recommendations: LandRecommendation[], 
    colorRequirements: ColorRequirement[], 
    totalLands: number
  ): LandRecommendation[] {
    return recommendations.map(rec => {
      if (rec.type === 'fetch' || rec.type === 'shock') {
        return {
          ...rec,
          name: rec.name.replace('Fetchland', 'Tapland').replace('Shock/Dual', 'Tapland'),
          type: 'dual' as const,
          entersTapped: true,
          priority: rec.priority - 2,
          alternatives: this.getBudgetDualNames(rec.colors, 'standard')
        };
      }
      return rec;
    });
  }

  // Helper methods
  private static isLand(card: Card): boolean {
    return card.type_line?.toLowerCase().includes('land') || false;
  }

  private static getBasicLandName(color: string): string {
    const names: Record<string, string> = {
      W: 'Plains',
      U: 'Island', 
      B: 'Swamp',
      R: 'Mountain',
      G: 'Forest'
    };
    return names[color] || 'Plains';
  }

  private static getColorNames(colors: string[]): string[] {
    const names: Record<string, string> = {
      W: 'White',
      U: 'Blue',
      B: 'Black', 
      R: 'Red',
      G: 'Green'
    };
    return colors.map(c => names[c] || c);
  }

  private static generateColorPairs(colors: string[]): string[][] {
    const pairs: string[][] = [];
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        pairs.push([colors[i], colors[j]]);
      }
    }
    return pairs;
  }

  private static formatAllowsFetches(format: string): boolean {
    return ['modern', 'legacy', 'vintage', 'commander'].includes(format);
  }

  private static getFetchlandNames(colors: string[]): string[] {
    // Simplified - would include actual fetchland names
    return [`${this.getColorNames(colors).join('-')} Fetchland`];
  }

  private static getShocklandNames(colors: string[]): string[] {
    // Simplified - would include actual shockland names  
    return [`${this.getColorNames(colors).join('-')} Shockland`];
  }

  private static getBudgetDualNames(colors: string[], format: string): string[] {
    return [
      `${this.getColorNames(colors).join('-')} Tapland`,
      `${this.getColorNames(colors).join('-')} Checkland`,
      `${this.getColorNames(colors).join('-')} Scry Land`
    ];
  }

  private static getUtilityLandSuggestions(format: string, budget: 'budget' | 'optimal' | 'premium'): string[] {
    const suggestions = ['Colorless Utility Land', 'Creature Land', 'Card Draw Land'];
    if (format === 'commander') {
      suggestions.push('Command Tower', 'Exotic Orchard');
    }
    return suggestions;
  }

  private static getMulticolorUtilityLands(format: string): string[] {
    return ['Command Tower', 'Exotic Orchard', 'City of Brass', 'Mana Confluence'];
  }

  // Hypergeometric probability calculation
  private static hypergeometric(successes: number, population: number, draws: number, want: number): number {
    if (successes < want || draws < want || population < successes) return 0;
    if (draws >= population) return successes >= want ? 1 : 0;
    
    // Simplified calculation - in practice would use more accurate hypergeometric formula
    const p = successes / population;
    return 1 - Math.pow(1 - p, draws);
  }
}