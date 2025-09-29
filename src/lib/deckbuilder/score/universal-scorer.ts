import { Card } from '../types';
import { BuildContext, DeckAnalysis } from '../types';
import { EDHPowerCalculator } from './edh-power-calculator';

export class UniversalScorer {
  static scoreDeck(deck: Card[], context: BuildContext): DeckAnalysis {
    // Use the new EDH power calculator
    const edhScore = EDHPowerCalculator.calculatePower(
      deck, 
      context.format,
      42, // seed
      undefined, // commander - context doesn't have this
      context.powerTarget
    );
    
    // Map to existing DeckAnalysis format for backward compatibility
    const subscores = {
      speed: edhScore.subscores.speed / 100 * 10,
      interaction: edhScore.subscores.interaction / 100 * 10,
      tutors: edhScore.subscores.tutors / 100 * 10,
      wincon: edhScore.subscores.stax_pressure / 100 * 10, // Map stax to wincon for compatibility
      mana: edhScore.subscores.mana / 100 * 10,
      consistency: edhScore.subscores.consistency / 100 * 10
    };
    
    return {
      power: edhScore.power,
      subscores,
      curve: this.analyzeCurve(deck),
      colorDistribution: this.analyzeColorDistribution(deck),
      tags: this.analyzeTagDistribution(deck)
    };
  }
  
  private static scoreSpeed(deck: Card[]): number {
    let score = 3; // Base speed
    
    // Fast mana increases speed dramatically
    const fastMana = deck.filter(c => c.tags.has('fast-mana')).length;
    score += fastMana * 1.5;
    
    // Low curve increases speed
    const lowCurve = deck.filter(c => c.cmc <= 2 && !c.type_line.includes('Land')).length;
    const deckSize = deck.filter(c => !c.type_line.includes('Land')).length;
    const lowCurveRatio = lowCurve / Math.max(1, deckSize);
    
    if (lowCurveRatio > 0.4) score += 2;
    else if (lowCurveRatio > 0.3) score += 1;
    
    // Ramp can increase speed in different way
    const ramp = deck.filter(c => c.tags.has('ramp')).length;
    score += Math.min(ramp * 0.3, 1.5);
    
    // Aggressive creatures
    const hastyCreatures = deck.filter(c => 
      c.type_line.includes('Creature') && 
      (c.tags.has('haste') || c.cmc <= 1)
    ).length;
    score += hastyCreatures * 0.2;
    
    return Math.min(10, Math.max(1, score));
  }
  
  private static scoreInteraction(deck: Card[]): number {
    let score = 1; // Base interaction
    
    // Count different types of interaction
    const spotRemoval = deck.filter(c => c.tags.has('removal-spot')).length;
    const sweepers = deck.filter(c => c.tags.has('removal-sweeper')).length;
    const counterspells = deck.filter(c => c.tags.has('counterspell')).length;
    const protection = deck.filter(c => c.tags.has('protection')).length;
    
    // Quality bonus for cheap interaction
    const cheapInteraction = deck.filter(c => 
      (c.tags.has('removal-spot') || c.tags.has('counterspell')) && 
      c.cmc <= 2
    ).length;
    
    score += spotRemoval * 0.3;
    score += sweepers * 0.5;
    score += counterspells * 0.4;
    score += protection * 0.2;
    score += cheapInteraction * 0.3; // Bonus for cheap interaction
    
    // Versatility bonus
    const interactionTypes = [spotRemoval, sweepers, counterspells, protection]
      .filter(count => count > 0).length;
    score += interactionTypes * 0.5;
    
    return Math.min(10, Math.max(1, score));
  }
  
  private static scoreTutors(deck: Card[]): number {
    let score = 1; // Base tutoring
    
    const broadTutors = deck.filter(c => c.tags.has('tutor-broad')).length;
    const narrowTutors = deck.filter(c => c.tags.has('tutor-narrow')).length;
    const cardDraw = deck.filter(c => c.tags.has('draw')).length;
    
    score += broadTutors * 1.2;
    score += narrowTutors * 0.8;
    score += cardDraw * 0.3;
    
    return Math.min(10, Math.max(1, score));
  }
  
  private static scoreWincons(deck: Card[]): number {
    let score = 1; // Base wincon
    
    const wincons = deck.filter(c => c.tags.has('wincon')).length;
    const comboPieces = deck.filter(c => c.tags.has('combo')).length;
    const finishers = deck.filter(c => 
      c.type_line.includes('Creature') && 
      (parseInt(c.power || '0') >= 5 || c.tags.has('evasion'))
    ).length;
    
    score += wincons * 1.0;
    score += comboPieces * 0.8;
    score += finishers * 0.3;
    
    return Math.min(10, Math.max(1, score));
  }
  
  private static scoreManabase(deck: Card[]): number {
    const lands = deck.filter(c => c.type_line.includes('Land'));
    const deckSize = deck.length;
    const landRatio = lands.length / deckSize;
    
    // Optimal land ratios by format
    const optimalRatio = 0.36; // Commander default
    const deviation = Math.abs(landRatio - optimalRatio);
    let score = Math.max(2, 8 - (deviation * 20));
    
    // Fixing quality bonus
    const dualLands = lands.filter(c => 
      c.oracle_text?.includes('any color') || 
      c.type_line.includes('Dual')
    ).length;
    score += Math.min(dualLands / lands.length * 3, 2);
    
    return Math.min(10, Math.max(1, score));
  }
  
  private static scoreConsistency(deck: Card[]): number {
    let score = 3; // Base consistency
    
    const nonLands = deck.filter(c => !c.type_line.includes('Land'));
    const deckSize = nonLands.length;
    
    // Curve analysis
    const lowCurve = nonLands.filter(c => c.cmc <= 2).length;
    const midCurve = nonLands.filter(c => c.cmc >= 3 && c.cmc <= 5).length;
    const highCurve = nonLands.filter(c => c.cmc > 5).length;
    
    const curveScore = (lowCurve * 2 + midCurve - highCurve * 0.5) / deckSize;
    score += Math.min(curveScore * 3, 3);
    
    // Redundancy bonus
    const tutors = deck.filter(c => c.tags.has('tutor-broad') || c.tags.has('tutor-narrow')).length;
    score += Math.min(tutors * 0.5, 2);
    
    return Math.min(10, Math.max(1, score));
  }
  
  private static analyzeCurve(deck: Card[]): Record<string, number> {
    const curve: Record<string, number> = {
      '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7+': 0
    };
    
    deck.filter(c => !c.type_line.includes('Land')).forEach(card => {
      const cmc = card.cmc;
      if (cmc <= 6) {
        curve[cmc.toString()]++;
      } else {
        curve['7+']++;
      }
    });
    
    return curve;
  }
  
  private static analyzeColorDistribution(deck: Card[]): Record<string, number> {
    const colors: Record<string, number> = {
      'W': 0, 'U': 0, 'B': 0, 'R': 0, 'G': 0, 'C': 0
    };
    
    deck.forEach(card => {
      if (card.colors.length === 0) {
        colors['C']++;
      } else {
        card.colors.forEach(color => {
          colors[color] = (colors[color] || 0) + 1;
        });
      }
    });
    
    return colors;
  }
  
  private static analyzeTagDistribution(deck: Card[]): Record<string, number> {
    const tagCounts: Record<string, number> = {};
    
    deck.forEach(card => {
      card.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    
    // Return top 10 most common tags
    return Object.fromEntries(
      Object.entries(tagCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
    );
  }
  
  private static getUniqueColors(cards: Card[]): number {
    const colors = new Set<string>();
    cards.forEach(card => {
      card.colors.forEach(color => colors.add(color));
    });
    return colors.size;
  }
}