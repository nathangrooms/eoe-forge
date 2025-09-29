import { Card } from '@/lib/deckbuilder/types';
import staplesData from './staples.json';
import combosData from './combos.json';

export interface FeatureExtraction {
  fastManaIndex: number;
  tutorDensity: number;
  interactionDensity: number;
  winconCompactness: number;
  speedProxy: number;
  resilienceIndex: number;
  manaQuality: number;
  consistencyMetrics: number;
  synergyScore: number;
  staxPressure: number;
  cardAdvantageEngines: number;
}

export class FeatureExtractor {
  static extractFeatures(deck: Card[], commander?: Card): FeatureExtraction {
    const allCards = commander ? [commander, ...deck] : deck;
    
    return {
      fastManaIndex: this.calculateFastManaIndex(allCards),
      tutorDensity: this.calculateTutorDensity(allCards),
      interactionDensity: this.calculateInteractionDensity(allCards),
      winconCompactness: this.calculateWinconCompactness(allCards),
      speedProxy: this.calculateSpeedProxy(allCards),
      resilienceIndex: this.calculateResilienceIndex(allCards),
      manaQuality: this.calculateManaQuality(allCards),
      consistencyMetrics: this.calculateConsistencyMetrics(allCards),
      synergyScore: this.calculateSynergyScore(allCards, commander),
      staxPressure: this.calculateStaxPressure(allCards),
      cardAdvantageEngines: this.calculateCardAdvantageEngines(allCards)
    };
  }

  private static calculateFastManaIndex(cards: Card[]): number {
    let index = 0;
    const fastMana = staplesData.fast_mana;
    
    cards.forEach(card => {
      const name = card.name.toLowerCase();
      
      // Check each tier
      Object.entries(fastMana).forEach(([tier, data]) => {
        const tierCards = data.cards.map(c => c.toLowerCase());
        if (tierCards.includes(name)) {
          index += data.weight;
        }
      });
      
      // Additional heuristic for unlisted fast mana
      if (card.cmc <= 2 && card.oracle_text?.toLowerCase().includes('add') && 
          card.oracle_text?.toLowerCase().includes('mana') && 
          !card.type_line.toLowerCase().includes('land')) {
        index += 2;
      }
    });

    return Math.min(index, 100);
  }

  private static calculateTutorDensity(cards: Card[]): number {
    let density = 0;
    const tutors = staplesData.tutors;
    
    cards.forEach(card => {
      const name = card.name.toLowerCase();
      const text = card.oracle_text?.toLowerCase() || '';
      
      // Check staples database
      Object.entries(tutors).forEach(([category, data]) => {
        const categoryCards = data.cards.map(c => c.toLowerCase());
        if (categoryCards.includes(name)) {
          density += data.weight;
        }
      });
      
      // Heuristic detection for unlisted tutors
      if (text.includes('search') && text.includes('library') && 
          !text.includes('basic land')) {
        if (text.includes('any card')) {
          density += 8;
        } else if (text.includes('creature') || text.includes('artifact') || 
                   text.includes('enchantment')) {
          density += 6;
        } else {
          density += 4;
        }
      }
    });

    return Math.min(density, 100);
  }

  private static calculateInteractionDensity(cards: Card[]): number {
    let density = 0;
    const interaction = staplesData.interaction;
    
    cards.forEach(card => {
      const name = card.name.toLowerCase();
      const text = card.oracle_text?.toLowerCase() || '';
      
      // Check staples database
      Object.entries(interaction).forEach(([category, data]) => {
        const categoryCards = data.cards.map(c => c.toLowerCase());
        if (categoryCards.includes(name)) {
          density += data.weight;
        }
      });
      
      // Heuristic detection
      if (text.includes('counter target')) {
        density += card.cmc <= 2 ? 6 : 4;
      }
      if (text.includes('destroy') || text.includes('exile')) {
        if (card.cmc <= 2) density += 5;
        else if (card.cmc <= 4) density += 3;
        else density += 2;
      }
      if (text.includes('all creatures') || text.includes('each creature')) {
        density += 6;
      }
    });

    return Math.min(density, 100);
  }

  private static calculateWinconCompactness(cards: Card[]): number {
    let compactness = 0;
    const cardNames = cards.map(c => c.name.toLowerCase());
    
    // Check for known combos
    combosData.two_card_combos.forEach(combo => {
      const comboCards = combo.cards.map(c => c.toLowerCase());
      const hasAllPieces = comboCards.every(piece => 
        cardNames.some(cardName => cardName.includes(piece.toLowerCase()))
      );
      
      if (hasAllPieces) {
        if (combo.total_mv <= 7) {
          compactness += 25; // Early combo
        } else {
          compactness += 15; // Late combo
        }
      }
    });

    // Check for instant win cards
    cards.forEach(card => {
      const text = card.oracle_text?.toLowerCase() || '';
      if (text.includes('win the game') || text.includes('wins the game')) {
        compactness += 10;
      }
      if (text.includes('combat damage to a player') && card.type_line.includes('Creature')) {
        const power = parseInt(card.power || '0');
        if (power >= 21) compactness += 8;
      }
    });

    return Math.min(compactness, 100);
  }

  private static calculateSpeedProxy(cards: Card[]): number {
    const fastMana = this.calculateFastManaIndex(cards);
    const tutors = this.calculateTutorDensity(cards);
    const lowCurveCount = cards.filter(c => c.cmc <= 2 && !c.type_line.includes('Land')).length;
    const combos = this.calculateWinconCompactness(cards);
    
    const speed = (fastMana * 0.3) + (tutors * 0.25) + (lowCurveCount * 1.5) + (combos * 0.2);
    return Math.min(speed, 100);
  }

  private static calculateResilienceIndex(cards: Card[]): number {
    let resilience = 0;
    
    cards.forEach(card => {
      const text = card.oracle_text?.toLowerCase() || '';
      const name = card.name.toLowerCase();
      
      // Protection effects
      if (text.includes('protection') || text.includes('hexproof') || 
          text.includes('ward') || text.includes('indestructible')) {
        resilience += 6;
      }
      
      // Recursion
      if (text.includes('return') && text.includes('graveyard') && 
          text.includes('hand')) {
        resilience += 5;
      }
      
      // Free spells
      if (card.cmc === 0 || text.includes('without paying')) {
        resilience += 4;
      }
      
      // Check protection staples
      const protectionCards = staplesData.protection.premium.cards.map(c => c.toLowerCase());
      if (protectionCards.includes(name)) {
        resilience += 8;
      }
    });

    return Math.min(resilience, 100);
  }

  private static calculateManaQuality(cards: Card[]): number {
    const lands = cards.filter(c => c.type_line.includes('Land'));
    const totalLands = lands.length;
    const nonLands = cards.filter(c => !c.type_line.includes('Land'));
    
    if (totalLands === 0) return 0;
    
    // Calculate ETB tapped ratio
    const etbTappedLands = lands.filter(land => 
      land.oracle_text?.toLowerCase().includes('enters the battlefield tapped') ||
      land.name.toLowerCase().includes('guildgate')
    ).length;
    
    const etbTappedRatio = etbTappedLands / totalLands;
    const targetETBRatio = 0.3; // 30% is reasonable
    const etbPenalty = Math.max(0, (etbTappedRatio - targetETBRatio) * 30);
    
    // Land ratio check
    const deckSize = cards.length;
    const landRatio = totalLands / deckSize;
    const targetLandRatio = 0.36; // 36% for Commander
    const ratioScore = Math.max(0, 100 - Math.abs(landRatio - targetLandRatio) * 200);
    
    // Fixing quality (dual lands, fetches)
    const fixingLands = lands.filter(land => {
      const text = land.oracle_text?.toLowerCase() || '';
      return text.includes('any color') || 
             text.includes('add one mana of any color') ||
             land.type_line.includes('Dual') ||
             text.includes('search') && text.includes('land');
    }).length;
    
    const fixingScore = Math.min((fixingLands / totalLands) * 100, 40);
    
    return Math.max(0, ratioScore + fixingScore - etbPenalty);
  }

  private static calculateConsistencyMetrics(cards: Card[]): number {
    const deckSize = cards.length;
    const nonLands = cards.filter(c => !c.type_line.includes('Land'));
    
    // Curve distribution
    const curve = {
      low: nonLands.filter(c => c.cmc <= 2).length,
      mid: nonLands.filter(c => c.cmc >= 3 && c.cmc <= 5).length,
      high: nonLands.filter(c => c.cmc > 5).length
    };
    
    const curveScore = Math.min(100, (curve.low * 2) + curve.mid - (curve.high * 0.5));
    
    // Redundancy (cards with similar effects)
    const redundancyScore = this.calculateRedundancy(cards);
    
    // Dead card risk (very narrow effects)
    const deadCardPenalty = this.calculateDeadCardRisk(cards);
    
    return Math.max(0, (curveScore + redundancyScore - deadCardPenalty) / 2);
  }

  private static calculateRedundancy(cards: Card[]): number {
    const effects = new Map<string, number>();
    
    cards.forEach(card => {
      const text = card.oracle_text?.toLowerCase() || '';
      
      // Categorize effects
      if (text.includes('draw') && text.includes('card')) {
        effects.set('draw', (effects.get('draw') || 0) + 1);
      }
      if (text.includes('destroy') || text.includes('exile')) {
        effects.set('removal', (effects.get('removal') || 0) + 1);
      }
      if (text.includes('counter target')) {
        effects.set('counter', (effects.get('counter') || 0) + 1);
      }
      if (text.includes('search') && text.includes('library')) {
        effects.set('tutor', (effects.get('tutor') || 0) + 1);
      }
    });
    
    let redundancyScore = 0;
    effects.forEach(count => {
      if (count >= 2) redundancyScore += Math.min(count * 5, 20);
    });
    
    return Math.min(redundancyScore, 40);
  }

  private static calculateDeadCardRisk(cards: Card[]): number {
    let risk = 0;
    
    cards.forEach(card => {
      const text = card.oracle_text?.toLowerCase() || '';
      
      // Very narrow or situational effects
      if (text.includes('if you control') && text.includes('with')) {
        risk += 2;
      }
      if (card.cmc > 8 && !text.includes('win the game')) {
        risk += 3;
      }
      if (text.includes('only if') || text.includes('only during')) {
        risk += 2;
      }
    });
    
    return Math.min(risk, 30);
  }

  private static calculateSynergyScore(cards: Card[], commander?: Card): number {
    if (!commander) return 50; // Base score without commander
    
    const commanderTags = this.extractCardTags(commander);
    let synergyCount = 0;
    
    cards.forEach(card => {
      const cardTags = this.extractCardTags(card);
      const overlap = commanderTags.filter(tag => cardTags.includes(tag)).length;
      synergyCount += overlap;
    });
    
    return Math.min((synergyCount / cards.length) * 100, 100);
  }

  private static extractCardTags(card: Card): string[] {
    const tags = [];
    const text = card.oracle_text?.toLowerCase() || '';
    const typeLine = card.type_line.toLowerCase();
    
    // Mechanical tags
    if (text.includes('+1/+1 counter')) tags.push('counters');
    if (text.includes('tribal') || typeLine.includes('tribal')) tags.push('tribal');
    if (text.includes('spell') && text.includes('cast')) tags.push('spellslinger');
    if (text.includes('treasure')) tags.push('treasures');
    if (text.includes('enter') && text.includes('battlefield')) tags.push('etb');
    if (text.includes('sacrifice')) tags.push('sacrifice');
    if (text.includes('graveyard')) tags.push('graveyard');
    if (text.includes('artifact')) tags.push('artifacts');
    if (text.includes('enchantment')) tags.push('enchantments');
    
    return tags;
  }

  private static calculateStaxPressure(cards: Card[]): number {
    let pressure = 0;
    const stax = staplesData.stax;
    
    cards.forEach(card => {
      const name = card.name.toLowerCase();
      const text = card.oracle_text?.toLowerCase() || '';
      
      // Check stax staples
      Object.entries(stax).forEach(([category, data]) => {
        const categoryCards = data.cards.map(c => c.toLowerCase());
        if (categoryCards.includes(name)) {
          pressure += data.weight;
        }
      });
      
      // Heuristic detection
      if (text.includes('cost') && text.includes('more') && text.includes('mana')) {
        pressure += 4;
      }
      if (text.includes("can't") || text.includes("don't untap")) {
        pressure += 5;
      }
    });

    return Math.min(pressure, 100);
  }

  private static calculateCardAdvantageEngines(cards: Card[]): number {
    let engines = 0;
    const cardAdvantage = staplesData.card_advantage;
    
    cards.forEach(card => {
      const name = card.name.toLowerCase();
      const text = card.oracle_text?.toLowerCase() || '';
      
      // Check staples
      Object.entries(cardAdvantage).forEach(([category, data]) => {
        const categoryCards = data.cards.map(c => c.toLowerCase());
        if (categoryCards.includes(name)) {
          engines += data.weight;
        }
      });
      
      // Heuristic detection
      if (text.includes('draw') && text.includes('card') && 
          (text.includes('each') || text.includes('whenever'))) {
        engines += 6;
      }
      if (text.includes('draw') && text.includes('additional')) {
        engines += 5;
      }
    });

    return Math.min(engines, 100);
  }
}