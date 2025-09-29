import { Card } from '@/lib/deckbuilder/types';

export interface PlayabilityMetrics {
  keepable7_pct: number;
  t1_color_hit_pct: number;
  t2_two_colors_hit_pct: number;
  untapped_land_ratio: number;
  avg_cmc: number;
  rocks_dorks_count: number;
}

export interface GoldfishMetrics {
  exp_win_turn: number;
  combo_presence: boolean;
  compact_combo_count: number;
}

export class PlayabilitySimulator {
  private static seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
  }

  static simulatePlayability(cards: Card[], seed: number = 42, iterations: number = 10000): PlayabilityMetrics {
    const rng = this.seededRandom(seed);
    
    let keepableHands = 0;
    let t1ColorHits = 0;
    let t2TwoColorHits = 0;
    
    // Pre-calculate deck composition
    const lands = cards.filter(c => c.type_line.includes('Land'));
    const nonLands = cards.filter(c => !c.type_line.includes('Land'));
    const rocksAndDorks = this.identifyRocksAndDorks(cards);
    const untappedLands = this.identifyUntappedLands(lands);
    
    // Calculate static metrics
    const untappedLandRatio = untappedLands.length / Math.max(lands.length, 1);
    const totalCmc = nonLands.reduce((sum, card) => sum + card.cmc, 0);
    const avgCmc = nonLands.length > 0 ? totalCmc / nonLands.length : 0;
    
    // Monte Carlo simulation
    for (let i = 0; i < iterations; i++) {
      const hand = this.drawHand(cards, rng);
      
      if (this.isKeepableHand(hand)) {
        keepableHands++;
      }
      
      if (this.hasT1ColorHit(hand)) {
        t1ColorHits++;
      }
      
      if (this.hasT2TwoColorHit(hand)) {
        t2TwoColorHits++;
      }
    }
    
    return {
      keepable7_pct: (keepableHands / iterations) * 100,
      t1_color_hit_pct: (t1ColorHits / iterations) * 100,
      t2_two_colors_hit_pct: (t2TwoColorHits / iterations) * 100,
      untapped_land_ratio: untappedLandRatio * 100,
      avg_cmc: avgCmc,
      rocks_dorks_count: rocksAndDorks.length
    };
  }

  static calculateGoldfishMetrics(cards: Card[], features: any): GoldfishMetrics {
    // Estimate expected win turn based on deck composition
    const baseWinTurn = 10;
    const speedReduction = 
      (features.fastManaIndex * 0.06) +
      (features.tutorDensity * 0.05) +
      (features.winconCompactness * 0.1) +
      (features.speedProxy * 0.03);
    
    const expWinTurn = Math.max(3, baseWinTurn - speedReduction);
    
    // Detect combo presence
    const comboPresence = features.winconCompactness > 20;
    const compactComboCount = Math.floor(features.winconCompactness / 25);
    
    return {
      exp_win_turn: expWinTurn,
      combo_presence: comboPresence,
      compact_combo_count: compactComboCount
    };
  }

  private static drawHand(cards: Card[], rng: () => number): Card[] {
    const expandedDeck = this.expandDeck(cards);
    const shuffled = this.shuffleDeck(expandedDeck, rng);
    return shuffled.slice(0, 7);
  }

  private static expandDeck(cards: Card[]): Card[] {
    // For now, assume each card appears once since Card type doesn't have quantity
    return [...cards];
  }

  private static shuffleDeck(deck: Card[], rng: () => number): Card[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private static isKeepableHand(hand: Card[]): boolean {
    const lands = hand.filter(c => c.type_line.includes('Land'));
    const rocks = hand.filter(c => this.isRockOrDork(c));
    const spells = hand.filter(c => !c.type_line.includes('Land') && c.cmc <= 3);
    
    // Commander keepable hand heuristic
    const hasColorAccess = this.hasBasicColorAccess(hand);
    
    // Keep if: 2+ lands OR (1 land + rock/cantrip) AND color access AND playable spells
    const keepCondition = 
      (lands.length >= 2 || (lands.length >= 1 && rocks.length > 0)) &&
      hasColorAccess &&
      spells.length >= 2;
    
    return keepCondition;
  }

  private static hasT1ColorHit(hand: Card[]): boolean {
    const untappedLands = hand.filter(c => 
      c.type_line.includes('Land') && 
      !c.oracle_text?.toLowerCase().includes('enters the battlefield tapped')
    );
    
    return untappedLands.length > 0;
  }

  private static hasT2TwoColorHit(hand: Card[]): boolean {
    const colorSources = new Set<string>();
    
    hand.forEach(card => {
      if (card.type_line.includes('Land')) {
        const text = card.oracle_text?.toLowerCase() || '';
        
        // Basic lands
        if (card.type_line.includes('Plains')) colorSources.add('W');
        if (card.type_line.includes('Island')) colorSources.add('U');
        if (card.type_line.includes('Swamp')) colorSources.add('B');
        if (card.type_line.includes('Mountain')) colorSources.add('R');
        if (card.type_line.includes('Forest')) colorSources.add('G');
        
        // Multi-color sources
        if (text.includes('any color') || text.includes('add one mana of any color')) {
          colorSources.add('W').add('U').add('B').add('R').add('G');
        }
      }
    });
    
    return colorSources.size >= 2;
  }

  private static hasBasicColorAccess(hand: Card[]): boolean {
    const hasLand = hand.some(c => c.type_line.includes('Land'));
    const hasRock = hand.some(c => this.isRockOrDork(c));
    
    return hasLand || hasRock;
  }

  private static isRockOrDork(card: Card): boolean {
    const text = card.oracle_text?.toLowerCase() || '';
    const typeLine = card.type_line.toLowerCase();
    
    // Mana rocks (artifacts that produce mana)
    if (typeLine.includes('artifact') && text.includes('add') && text.includes('mana')) {
      return true;
    }
    
    // Mana dorks (creatures that produce mana)
    if (typeLine.includes('creature') && text.includes('add') && text.includes('mana')) {
      return true;
    }
    
    return false;
  }

  private static identifyRocksAndDorks(cards: Card[]): Card[] {
    return cards.filter(card => this.isRockOrDork(card));
  }

  private static identifyUntappedLands(lands: Card[]): Card[] {
    return lands.filter(land => 
      !land.oracle_text?.toLowerCase().includes('enters the battlefield tapped') &&
      !land.name.toLowerCase().includes('guildgate')
    );
  }
}
