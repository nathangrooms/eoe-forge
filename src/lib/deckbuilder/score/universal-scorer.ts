import { Card, DeckAnalysis, BuildContext } from '../types';

export class UniversalScorer {
  
  public static scoreDeck(deck: Card[], context: BuildContext): DeckAnalysis {
    const subscores = {
      speed: this.scoreSpeed(deck),
      interaction: this.scoreInteraction(deck),
      tutors: this.scoreTutors(deck),
      wincon: this.scoreWincons(deck),
      mana: this.scoreManabase(deck),
      consistency: this.scoreConsistency(deck)
    };
    
    // Overall power level (1-10 scale)
    const weights = {
      speed: 0.2,
      interaction: 0.15,
      tutors: 0.2,
      wincon: 0.2,
      mana: 0.15,
      consistency: 0.1
    };
    
    const power = Object.entries(subscores).reduce(
      (total, [key, score]) => total + score * weights[key as keyof typeof weights],
      0
    );
    
    return {
      power: Math.min(10, Math.max(1, power)),
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
    
    // Broad tutors are much more powerful
    score += broadTutors * 2;
    score += narrowTutors * 0.8;
    
    // Selection and card advantage
    const cardDraw = deck.filter(c => c.tags.has('draw')).length;
    score += cardDraw * 0.3;
    
    return Math.min(10, Math.max(1, score));
  }
  
  private static scoreWincons(deck: Card[]): number {
    let score = 2; // Base wincon power
    
    const wincons = deck.filter(c => c.tags.has('wincon')).length;
    const comboMatter = deck.filter(c => c.tags.has('combo-piece')).length;
    
    // Direct wincons
    score += wincons * 1.5;
    
    // Combo pieces enable powerful wins
    score += comboMatter * 1.2;
    
    // Instant-speed wins are more powerful
    const instantWins = deck.filter(c => 
      c.tags.has('wincon') && 
      (c.type_line.includes('Instant') || c.tags.has('flash'))
    ).length;
    score += instantWins * 0.5;
    
    // Multiple win conditions provide redundancy
    if (wincons >= 3) score += 1;
    if (wincons >= 5) score += 1;
    
    return Math.min(10, Math.max(1, score));
  }
  
  private static scoreManabase(deck: Card[]): number {
    const lands = deck.filter(c => c.type_line.includes('Land'));
    const nonLands = deck.filter(c => !c.type_line.includes('Land'));
    
    if (lands.length === 0) return 1;
    
    let score = 5; // Average manabase
    
    // Land ratio
    const landRatio = lands.length / deck.length;
    const optimalRatio = deck.length === 100 ? 0.37 : 0.4; // Commander vs 60-card
    const ratioDeviation = Math.abs(landRatio - optimalRatio);
    
    if (ratioDeviation < 0.05) score += 1;
    else if (ratioDeviation > 0.1) score -= 2;
    
    // Fixing quality
    const basics = lands.filter(c => c.type_line.includes('Basic')).length;
    const nonBasics = lands.length - basics;
    const colors = this.getUniqueColors(nonLands);
    
    if (colors <= 1) {
      // Mono-color: mostly basics is fine
      if (basics / lands.length > 0.6) score += 1;
    } else if (colors === 2) {
      // Two-color: good fixing needed
      if (nonBasics >= Math.min(8, lands.length * 0.5)) score += 1;
    } else {
      // Multicolor: excellent fixing required
      if (nonBasics >= Math.min(12, lands.length * 0.6)) score += 1;
      else if (nonBasics < lands.length * 0.4) score -= 2;
    }
    
    // Untapped sources
    const fastLands = lands.filter(c => 
      !c.tags.has('etb-tapped') && 
      !c.type_line.includes('Basic')
    ).length;
    
    if (colors > 1 && fastLands >= colors * 2) score += 1;
    
    // Utility lands (commander bonus)
    if (deck.length === 100) {
      const utilityLands = lands.filter(c => 
        !c.type_line.includes('Basic') && 
        c.color_identity.length === 0
      ).length;
      if (utilityLands >= 2) score += 0.5;
    }
    
    return Math.min(10, Math.max(1, score));
  }
  
  private static scoreConsistency(deck: Card[]): number {
    let score = 5; // Base consistency
    
    // Deck size penalty for oversized decks
    if (deck.length > 100) {
      score -= (deck.length - 100) * 0.1;
    } else if (deck.length > 60 && deck.length < 100) {
      score -= (deck.length - 60) * 0.05;
    }
    
    // Card selection and tutoring improve consistency
    const tutors = deck.filter(c => 
      c.tags.has('tutor-broad') || c.tags.has('tutor-narrow')
    ).length;
    const cardDraw = deck.filter(c => c.tags.has('draw')).length;
    
    score += tutors * 0.5;
    score += cardDraw * 0.2;
    
    // Redundancy in key effects
    const keyTags = ['ramp', 'draw', 'removal-spot'];
    for (const tag of keyTags) {
      const count = deck.filter(c => c.tags.has(tag)).length;
      if (count >= 4) score += 0.3;
      else if (count <= 1) score -= 0.5;
    }
    
    return Math.min(10, Math.max(1, score));
  }
  
  private static analyzeCurve(deck: Card[]): Record<string, number> {
    const curve: Record<string, number> = {
      '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7+': 0
    };
    
    const nonLands = deck.filter(c => !c.type_line.includes('Land'));
    
    for (const card of nonLands) {
      const cmc = card.cmc;
      if (cmc <= 6) {
        curve[cmc.toString()]++;
      } else {
        curve['7+']++;
      }
    }
    
    return curve;
  }
  
  private static analyzeColorDistribution(deck: Card[]): Record<string, number> {
    const distribution: Record<string, number> = {
      'W': 0, 'U': 0, 'B': 0, 'R': 0, 'G': 0, 'C': 0
    };
    
    for (const card of deck) {
      if (card.color_identity.length === 0) {
        distribution['C']++;
      } else {
        for (const color of card.color_identity) {
          distribution[color]++;
        }
      }
    }
    
    return distribution;
  }
  
  private static analyzeTagDistribution(deck: Card[]): Record<string, number> {
    const tagCounts: Record<string, number> = {};
    
    for (const card of deck) {
      for (const tag of card.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    
    // Return top 10 most common tags
    return Object.fromEntries(
      Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    );
  }
  
  private static getUniqueColors(cards: Card[]): number {
    const colors = new Set<string>();
    
    for (const card of cards) {
      for (const color of card.color_identity) {
        colors.add(color);
      }
    }
    
    return colors.size;
  }
}