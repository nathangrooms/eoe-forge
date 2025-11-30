/**
 * Archetype Detection System
 * Analyzes deck composition and strategy to classify into known MTG archetypes
 */

export interface ArchetypeSignature {
  name: string;
  description: string;
  minScore: number;
  indicators: {
    cardTypes?: { [key: string]: number };
    keywords?: string[];
    avgCMC?: { min: number; max: number };
    cardNames?: string[];
    strategies?: string[];
  };
}

export interface ArchetypeResult {
  archetype: string;
  confidence: number;
  description: string;
  recommendations: string[];
}

// Define archetype signatures for EDH/Commander
const ARCHETYPE_SIGNATURES: ArchetypeSignature[] = [
  {
    name: 'Voltron',
    description: 'Focuses on making a single creature extremely powerful through auras, equipment, and buffs',
    minScore: 0.6,
    indicators: {
      keywords: ['equip', 'aura', 'attach', 'double strike', 'hexproof', 'indestructible'],
      strategies: ['single-target-buffs', 'commander-damage']
    }
  },
  {
    name: 'Aristocrats',
    description: 'Sacrifices creatures for value through death triggers and sacrifice outlets',
    minScore: 0.65,
    indicators: {
      keywords: ['sacrifice', 'dies', 'death trigger', 'blood artist', 'aristocrat'],
      strategies: ['sacrifice-value', 'drain-life']
    }
  },
  {
    name: 'Combo',
    description: 'Seeks to win through specific card combinations and infinite loops',
    minScore: 0.7,
    indicators: {
      keywords: ['infinite', 'combo', 'untap', 'copy', 'flicker'],
      cardNames: ['thassa', 'deadeye navigator', 'kiki-jiki', 'splinter twin', 'dramatic reversal'],
      strategies: ['tutors', 'card-draw', 'protection']
    }
  },
  {
    name: 'Control',
    description: 'Controls the game through removal, counters, and card advantage',
    minScore: 0.65,
    indicators: {
      cardTypes: { instant: 15, sorcery: 10 },
      keywords: ['counter', 'destroy', 'exile', 'return to hand', 'draw'],
      avgCMC: { min: 2, max: 4 }
    }
  },
  {
    name: 'Aggro',
    description: 'Wins quickly through efficient creatures and combat damage',
    minScore: 0.6,
    indicators: {
      cardTypes: { creature: 30 },
      keywords: ['haste', 'first strike', 'double strike', 'menace', 'trample'],
      avgCMC: { min: 1, max: 3.5 }
    }
  },
  {
    name: 'Tokens',
    description: 'Creates many creature tokens to overwhelm opponents',
    minScore: 0.65,
    indicators: {
      keywords: ['token', 'create', 'populate', 'convoke', 'swarm'],
      strategies: ['token-generation', 'go-wide']
    }
  },
  {
    name: 'Reanimator',
    description: 'Puts powerful creatures from graveyard directly into play',
    minScore: 0.7,
    indicators: {
      keywords: ['reanimate', 'return from graveyard', 'unearth', 'embalm', 'persist'],
      strategies: ['mill', 'discard', 'big-creatures']
    }
  },
  {
    name: 'Stax',
    description: 'Slows down opponents through resource denial and hate pieces',
    minScore: 0.7,
    indicators: {
      keywords: ['can\'t', 'don\'t untap', 'sacrifice', 'tax', 'additional cost'],
      strategies: ['resource-denial', 'prison']
    }
  },
  {
    name: 'Lands Matter',
    description: 'Focuses on landfall triggers and land-based strategies',
    minScore: 0.65,
    indicators: {
      cardTypes: { land: 38 },
      keywords: ['landfall', 'ramp', 'land', 'fetch', 'cultivation'],
      strategies: ['land-ramp', 'value-lands']
    }
  },
  {
    name: 'Storm',
    description: 'Wins by casting many spells in one turn',
    minScore: 0.75,
    indicators: {
      keywords: ['storm', 'ritual', 'cost reduction', 'copy spell'],
      avgCMC: { min: 1, max: 2.5 },
      strategies: ['fast-mana', 'card-draw']
    }
  },
  {
    name: 'Tribal',
    description: 'Synergizes around a specific creature type',
    minScore: 0.6,
    indicators: {
      keywords: ['elf', 'goblin', 'zombie', 'dragon', 'vampire', 'wizard', 'merfolk', 'angel'],
      strategies: ['creature-synergy', 'tribal-lords']
    }
  },
  {
    name: 'Spellslinger',
    description: 'Wins through casting and copying instant and sorcery spells',
    minScore: 0.65,
    indicators: {
      cardTypes: { instant: 15, sorcery: 15 },
      keywords: ['cast', 'copy', 'magecraft', 'prowess', 'storm'],
      strategies: ['spell-copy', 'spell-value']
    }
  },
  {
    name: 'Midrange',
    description: 'Balanced strategy with good creatures and interaction',
    minScore: 0.5,
    indicators: {
      cardTypes: { creature: 25, instant: 8, sorcery: 8 },
      avgCMC: { min: 2.5, max: 4.5 }
    }
  }
];

export class ArchetypeDetector {
  /**
   * Detect the archetype of a deck based on its card composition
   */
  static detectArchetype(
    cards: Array<{ card_id: string; card_name: string; quantity: number }>,
    cardData: Map<string, any>
  ): ArchetypeResult {
    const scores = new Map<string, number>();
    
    // Calculate scores for each archetype
    for (const signature of ARCHETYPE_SIGNATURES) {
      const score = this.calculateArchetypeScore(signature, cards, cardData);
      scores.set(signature.name, score);
    }
    
    // Find best matching archetype
    let bestArchetype = 'Midrange';
    let bestScore = 0;
    
    for (const [archetype, score] of scores.entries()) {
      const signature = ARCHETYPE_SIGNATURES.find(s => s.name === archetype);
      if (signature && score >= signature.minScore && score > bestScore) {
        bestArchetype = archetype;
        bestScore = score;
      }
    }
    
    const archetypeSignature = ARCHETYPE_SIGNATURES.find(s => s.name === bestArchetype);
    
    return {
      archetype: bestArchetype,
      confidence: Math.min(bestScore * 100, 100),
      description: archetypeSignature?.description || 'Balanced strategy',
      recommendations: this.getArchetypeRecommendations(bestArchetype, cards, cardData)
    };
  }
  
  /**
   * Calculate how well a deck matches an archetype signature
   */
  private static calculateArchetypeScore(
    signature: ArchetypeSignature,
    cards: Array<{ card_id: string; card_name: string; quantity: number }>,
    cardData: Map<string, any>
  ): number {
    let score = 0;
    let maxScore = 0;
    
    // Check card type distribution
    if (signature.indicators.cardTypes) {
      const typeScores = this.checkCardTypes(signature.indicators.cardTypes, cards, cardData);
      score += typeScores.score;
      maxScore += typeScores.max;
    }
    
    // Check keywords in card text
    if (signature.indicators.keywords) {
      const keywordScores = this.checkKeywords(signature.indicators.keywords, cards, cardData);
      score += keywordScores.score;
      maxScore += keywordScores.max;
    }
    
    // Check average CMC range
    if (signature.indicators.avgCMC) {
      const cmcScores = this.checkAverageCMC(signature.indicators.avgCMC, cards, cardData);
      score += cmcScores.score;
      maxScore += cmcScores.max;
    }
    
    // Check for specific card names
    if (signature.indicators.cardNames) {
      const nameScores = this.checkCardNames(signature.indicators.cardNames, cards);
      score += nameScores.score;
      maxScore += nameScores.max;
    }
    
    return maxScore > 0 ? score / maxScore : 0;
  }
  
  private static checkCardTypes(
    requiredTypes: { [key: string]: number },
    cards: Array<{ card_id: string; card_name: string; quantity: number }>,
    cardData: Map<string, any>
  ): { score: number; max: number } {
    let score = 0;
    let max = 0;
    
    for (const [type, minCount] of Object.entries(requiredTypes)) {
      max += 10;
      let count = 0;
      
      for (const card of cards) {
        const data = cardData.get(card.card_id);
        if (data?.type_line?.toLowerCase().includes(type.toLowerCase())) {
          count += card.quantity;
        }
      }
      
      if (count >= minCount) {
        score += 10;
      } else {
        score += (count / minCount) * 10;
      }
    }
    
    return { score, max };
  }
  
  private static checkKeywords(
    keywords: string[],
    cards: Array<{ card_id: string; card_name: string; quantity: number }>,
    cardData: Map<string, any>
  ): { score: number; max: number } {
    let matches = 0;
    const max = keywords.length * 5;
    
    for (const card of cards) {
      const data = cardData.get(card.card_id);
      const text = (data?.oracle_text || '').toLowerCase();
      const name = card.card_name.toLowerCase();
      
      for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase()) || name.includes(keyword.toLowerCase())) {
          matches += card.quantity;
        }
      }
    }
    
    return { score: Math.min(matches, max), max };
  }
  
  private static checkAverageCMC(
    range: { min: number; max: number },
    cards: Array<{ card_id: string; card_name: string; quantity: number }>,
    cardData: Map<string, any>
  ): { score: number; max: number } {
    let totalCMC = 0;
    let totalCards = 0;
    
    for (const card of cards) {
      const data = cardData.get(card.card_id);
      if (data?.cmc !== undefined && !data.type_line?.toLowerCase().includes('land')) {
        totalCMC += (data.cmc || 0) * card.quantity;
        totalCards += card.quantity;
      }
    }
    
    const avgCMC = totalCards > 0 ? totalCMC / totalCards : 3;
    const max = 10;
    
    if (avgCMC >= range.min && avgCMC <= range.max) {
      return { score: 10, max };
    }
    
    const distance = Math.min(
      Math.abs(avgCMC - range.min),
      Math.abs(avgCMC - range.max)
    );
    
    return { score: Math.max(0, 10 - distance * 2), max };
  }
  
  private static checkCardNames(
    cardNames: string[],
    cards: Array<{ card_id: string; card_name: string; quantity: number }>
  ): { score: number; max: number } {
    let matches = 0;
    const max = cardNames.length * 3;
    
    for (const card of cards) {
      const name = card.card_name.toLowerCase();
      for (const searchName of cardNames) {
        if (name.includes(searchName.toLowerCase())) {
          matches += 3;
        }
      }
    }
    
    return { score: Math.min(matches, max), max };
  }
  
  /**
   * Get recommendations for improving archetype focus
   */
  private static getArchetypeRecommendations(
    archetype: string,
    cards: Array<{ card_id: string; card_name: string; quantity: number }>,
    cardData: Map<string, any>
  ): string[] {
    const recommendations: string[] = [];
    
    // General recommendations based on archetype
    switch (archetype) {
      case 'Voltron':
        recommendations.push('Consider adding more protection spells for your commander');
        recommendations.push('Equipment and auras with totem armor are valuable');
        break;
      case 'Combo':
        recommendations.push('Add more tutors to find combo pieces consistently');
        recommendations.push('Include protection and backup plans');
        break;
      case 'Control':
        recommendations.push('Balance removal with card draw to maintain resources');
        recommendations.push('Consider board wipes for multiple threats');
        break;
      case 'Aggro':
        recommendations.push('Keep the curve low for faster starts');
        recommendations.push('Add haste enablers for immediate impact');
        break;
      case 'Tokens':
        recommendations.push('Include anthems to boost token power');
        recommendations.push('Add sacrifice outlets for value');
        break;
      case 'Reanimator':
        recommendations.push('Balance mill/discard with reanimation spells');
        recommendations.push('Include graveyard protection');
        break;
    }
    
    return recommendations;
  }
}
