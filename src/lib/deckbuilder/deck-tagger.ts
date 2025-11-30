/**
 * Automatic Deck Tagging System
 * Analyzes deck composition to generate relevant tags
 */

export interface DeckTag {
  name: string;
  category: 'strategy' | 'speed' | 'interaction' | 'theme' | 'mechanic';
  confidence: number;
}

export class DeckTagger {
  /**
   * Generate tags for a deck based on its cards and composition
   */
  static generateTags(
    cards: Array<{ card_id: string; card_name: string; quantity: number }>,
    cardData: Map<string, any>
  ): DeckTag[] {
    const tags: DeckTag[] = [];
    
    // Analyze card types and counts
    const typeCounts = this.analyzeCardTypes(cards, cardData);
    const keywords = this.extractKeywords(cards, cardData);
    const themes = this.detectThemes(cards, cardData);
    
    // Strategy tags
    tags.push(...this.generateStrategyTags(typeCounts, keywords));
    
    // Speed tags
    tags.push(...this.generateSpeedTags(cards, cardData));
    
    // Interaction tags
    tags.push(...this.generateInteractionTags(typeCounts, keywords));
    
    // Theme tags
    tags.push(...this.generateThemeTags(themes, keywords));
    
    // Mechanic tags
    tags.push(...this.generateMechanicTags(keywords));
    
    // Sort by confidence and return top tags
    return tags
      .filter(tag => tag.confidence >= 0.4)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);
  }
  
  private static analyzeCardTypes(
    cards: Array<{ card_id: string; card_name: string; quantity: number }>,
    cardData: Map<string, any>
  ): Map<string, number> {
    const counts = new Map<string, number>();
    
    for (const card of cards) {
      const data = cardData.get(card.card_id);
      if (!data) continue;
      
      const typeLine = (data.type_line || '').toLowerCase();
      
      if (typeLine.includes('creature')) {
        counts.set('creature', (counts.get('creature') || 0) + card.quantity);
      }
      if (typeLine.includes('instant')) {
        counts.set('instant', (counts.get('instant') || 0) + card.quantity);
      }
      if (typeLine.includes('sorcery')) {
        counts.set('sorcery', (counts.get('sorcery') || 0) + card.quantity);
      }
      if (typeLine.includes('artifact')) {
        counts.set('artifact', (counts.get('artifact') || 0) + card.quantity);
      }
      if (typeLine.includes('enchantment')) {
        counts.set('enchantment', (counts.get('enchantment') || 0) + card.quantity);
      }
      if (typeLine.includes('planeswalker')) {
        counts.set('planeswalker', (counts.get('planeswalker') || 0) + card.quantity);
      }
      if (typeLine.includes('land')) {
        counts.set('land', (counts.get('land') || 0) + card.quantity);
      }
    }
    
    return counts;
  }
  
  private static extractKeywords(
    cards: Array<{ card_id: string; card_name: string; quantity: number }>,
    cardData: Map<string, any>
  ): Set<string> {
    const keywords = new Set<string>();
    
    for (const card of cards) {
      const data = cardData.get(card.card_id);
      if (!data) continue;
      
      const text = (data.oracle_text || '').toLowerCase();
      const cardKeywords = data.keywords || [];
      
      cardKeywords.forEach((kw: string) => keywords.add(kw.toLowerCase()));
      
      // Extract common patterns
      if (text.includes('draw') || text.includes('draws')) keywords.add('card-draw');
      if (text.includes('counter target')) keywords.add('counterspell');
      if (text.includes('destroy')) keywords.add('removal');
      if (text.includes('exile')) keywords.add('exile');
      if (text.includes('sacrifice')) keywords.add('sacrifice');
      if (text.includes('token')) keywords.add('tokens');
      if (text.includes('graveyard')) keywords.add('graveyard');
      if (text.includes('search your library')) keywords.add('tutor');
      if (text.includes('extra turn')) keywords.add('extra-turns');
      if (text.includes('copy')) keywords.add('copy');
      if (text.includes('ramp') || text.includes('search for a land')) keywords.add('ramp');
    }
    
    return keywords;
  }
  
  private static detectThemes(
    cards: Array<{ card_id: string; card_name: string; quantity: number }>,
    cardData: Map<string, any>
  ): Set<string> {
    const themes = new Set<string>();
    const creatureTypes = new Map<string, number>();
    
    for (const card of cards) {
      const data = cardData.get(card.card_id);
      if (!data) continue;
      
      const typeLine = (data.type_line || '').toLowerCase();
      
      // Detect tribal themes
      const tribes = ['elf', 'goblin', 'zombie', 'dragon', 'vampire', 'wizard', 'merfolk', 'angel', 'demon', 'spirit'];
      for (const tribe of tribes) {
        if (typeLine.includes(tribe)) {
          creatureTypes.set(tribe, (creatureTypes.get(tribe) || 0) + card.quantity);
        }
      }
    }
    
    // If 20+ cards of one type, it's a tribal deck
    for (const [type, count] of creatureTypes.entries()) {
      if (count >= 15) {
        themes.add(`${type}-tribal`);
      }
    }
    
    return themes;
  }
  
  private static generateStrategyTags(
    typeCounts: Map<string, number>,
    keywords: Set<string>
  ): DeckTag[] {
    const tags: DeckTag[] = [];
    
    const creatureCount = typeCounts.get('creature') || 0;
    const instantCount = typeCounts.get('instant') || 0;
    const sorceryCount = typeCounts.get('sorcery') || 0;
    
    if (creatureCount >= 30) {
      tags.push({ name: 'Creature-Heavy', category: 'strategy', confidence: 0.8 });
    }
    
    if (instantCount + sorceryCount >= 25) {
      tags.push({ name: 'Spell-Heavy', category: 'strategy', confidence: 0.8 });
    }
    
    if (keywords.has('tokens')) {
      tags.push({ name: 'Token Strategy', category: 'strategy', confidence: 0.7 });
    }
    
    if (keywords.has('sacrifice')) {
      tags.push({ name: 'Sacrifice Matters', category: 'strategy', confidence: 0.7 });
    }
    
    if (keywords.has('graveyard')) {
      tags.push({ name: 'Graveyard Matters', category: 'strategy', confidence: 0.7 });
    }
    
    return tags;
  }
  
  private static generateSpeedTags(
    cards: Array<{ card_id: string; card_name: string; quantity: number }>,
    cardData: Map<string, any>
  ): DeckTag[] {
    const tags: DeckTag[] = [];
    
    let totalCMC = 0;
    let nonLandCount = 0;
    
    for (const card of cards) {
      const data = cardData.get(card.card_id);
      if (!data) continue;
      
      if (!data.type_line?.toLowerCase().includes('land')) {
        totalCMC += (data.cmc || 0) * card.quantity;
        nonLandCount += card.quantity;
      }
    }
    
    const avgCMC = nonLandCount > 0 ? totalCMC / nonLandCount : 3;
    
    if (avgCMC <= 2.5) {
      tags.push({ name: 'Fast', category: 'speed', confidence: 0.8 });
    } else if (avgCMC >= 4.5) {
      tags.push({ name: 'Slow/Late Game', category: 'speed', confidence: 0.7 });
    } else {
      tags.push({ name: 'Mid-Speed', category: 'speed', confidence: 0.6 });
    }
    
    return tags;
  }
  
  private static generateInteractionTags(
    typeCounts: Map<string, number>,
    keywords: Set<string>
  ): DeckTag[] {
    const tags: DeckTag[] = [];
    
    if (keywords.has('counterspell')) {
      tags.push({ name: 'Counterspells', category: 'interaction', confidence: 0.8 });
    }
    
    if (keywords.has('removal')) {
      tags.push({ name: 'Removal Heavy', category: 'interaction', confidence: 0.7 });
    }
    
    if (keywords.has('exile')) {
      tags.push({ name: 'Exile Effects', category: 'interaction', confidence: 0.6 });
    }
    
    const instantCount = typeCounts.get('instant') || 0;
    if (instantCount >= 15) {
      tags.push({ name: 'Instant Speed', category: 'interaction', confidence: 0.7 });
    }
    
    return tags;
  }
  
  private static generateThemeTags(
    themes: Set<string>,
    keywords: Set<string>
  ): DeckTag[] {
    const tags: DeckTag[] = [];
    
    for (const theme of themes) {
      if (theme.includes('tribal')) {
        const tribeName = theme.replace('-tribal', '');
        tags.push({
          name: `${tribeName.charAt(0).toUpperCase() + tribeName.slice(1)} Tribal`,
          category: 'theme',
          confidence: 0.9
        });
      }
    }
    
    if (keywords.has('equipment') || keywords.has('equip')) {
      tags.push({ name: 'Equipment Matters', category: 'theme', confidence: 0.7 });
    }
    
    return tags;
  }
  
  private static generateMechanicTags(keywords: Set<string>): DeckTag[] {
    const tags: DeckTag[] = [];
    
    const mechanicMap: { [key: string]: string } = {
      'flying': 'Flying',
      'haste': 'Haste',
      'trample': 'Trample',
      'lifelink': 'Lifelink',
      'deathtouch': 'Deathtouch',
      'card-draw': 'Card Draw',
      'ramp': 'Ramp',
      'tutor': 'Tutors',
      'extra-turns': 'Extra Turns',
      'copy': 'Copy Effects'
    };
    
    for (const [keyword, tagName] of Object.entries(mechanicMap)) {
      if (keywords.has(keyword)) {
        tags.push({ name: tagName, category: 'mechanic', confidence: 0.6 });
      }
    }
    
    return tags;
  }
}
