// Deck builder orchestrator that coordinates all phases
import type { Card, BuildContext, BuildResult } from './types.ts';

export class BuilderOrchestrator {
  /**
   * Build a deck with all phases coordinated
   */
  static async buildDeck(
    cardPool: any[],
    context: BuildContext,
    plan?: any
  ): Promise<BuildResult> {
    console.log('Starting deck build orchestration...');
    console.log('Pool size:', cardPool.length);
    console.log('Target archetype:', context.themeId);
    console.log('Target power:', context.powerTarget);
    
    // Transform card pool to proper format with tags
    const formattedPool: Card[] = cardPool.map(c => ({
      id: c.id,
      oracle_id: c.oracle_id,
      name: c.name,
      mana_cost: c.mana_cost || '',
      cmc: c.cmc || 0,
      type_line: c.type_line,
      oracle_text: c.oracle_text || '',
      colors: c.colors || [],
      color_identity: c.color_identity || [],
      power: c.power,
      toughness: c.toughness,
      keywords: c.keywords || [],
      legalities: c.legalities || {},
      image_uris: c.image_uris || {},
      prices: c.prices || {},
      set: c.set_code || '',
      set_name: '',
      collector_number: c.collector_number || '',
      rarity: c.rarity || 'common',
      layout: c.layout || 'normal',
      is_legendary: c.type_line?.toLowerCase().includes('legendary') || false,
      tags: new Set<string>()
    }));
    
    console.log('Formatted pool ready');
    
    // Use simplified build logic here
    // In production, this would import the full UniversalDeckBuilder
    const deck = this.simpleBuild(formattedPool, context, plan);
    
    return deck;
  }
  
  /**
   * Simplified build for edge function (avoids complex imports)
   */
  private static simpleBuild(
    pool: Card[],
    context: BuildContext,
    plan?: any
  ): BuildResult {
    console.log('Executing simplified build...');
    
    // Filter pool for commander colors
    const filteredPool = pool.filter(c => {
      if (!context.identity || context.identity.length === 0) return true;
      return c.color_identity.every(color => context.identity!.includes(color));
    });
    
    console.log('Filtered pool:', filteredPool.length);
    
    // Select cards based on plan or defaults
    const deck: Card[] = [];
    const quotas = plan?.cardQuotas || {
      ramp: { min: 10, max: 14 },
      card_draw: { min: 10, max: 15 },
      spot_removal: { min: 6, max: 10 },
      board_wipes: { min: 2, max: 4 },
      creatures: { min: 20, max: 30 }
    };
    
    // Tag all cards
    filteredPool.forEach(card => {
      this.tagCard(card);
    });
    
    // Select ramp
    const rampCards = filteredPool
      .filter(c => c.tags.has('ramp'))
      .sort((a, b) => this.scoreCard(b) - this.scoreCard(a))
      .slice(0, quotas.ramp?.min || 10);
    deck.push(...rampCards);
    console.log('Added ramp:', rampCards.length);
    
    // Select card draw
    const drawCards = filteredPool
      .filter(c => c.tags.has('draw') && !deck.includes(c))
      .sort((a, b) => this.scoreCard(b) - this.scoreCard(a))
      .slice(0, quotas.card_draw?.min || 10);
    deck.push(...drawCards);
    console.log('Added draw:', drawCards.length);
    
    // Select removal
    const removalCards = filteredPool
      .filter(c => (c.tags.has('removal-spot') || c.tags.has('removal-sweeper')) && !deck.includes(c))
      .sort((a, b) => this.scoreCard(b) - this.scoreCard(a))
      .slice(0, 10);
    deck.push(...removalCards);
    console.log('Added removal:', removalCards.length);
    
    // Select creatures
    const creatureCards = filteredPool
      .filter(c => c.type_line.includes('Creature') && !c.is_legendary && !deck.includes(c))
      .sort((a, b) => this.scoreCard(b) - this.scoreCard(a))
      .slice(0, quotas.creatures?.min || 25);
    deck.push(...creatureCards);
    console.log('Added creatures:', creatureCards.length);
    
    // Fill remaining slots with best available cards
    const remaining = 99 - deck.length - 36; // Reserve 36 lands
    const fillerCards = filteredPool
      .filter(c => !deck.includes(c) && !c.type_line.includes('Land'))
      .sort((a, b) => this.scoreCard(b) - this.scoreCard(a))
      .slice(0, remaining);
    deck.push(...fillerCards);
    console.log('Added filler:', fillerCards.length);
    
    // Add lands (simplified - add basics)
    const landCount = 36;
    const landsToAdd = filteredPool
      .filter(c => c.type_line.includes('Land'))
      .sort((a, b) => this.scoreCard(b) - this.scoreCard(a))
      .slice(0, landCount);
    deck.push(...landsToAdd);
    console.log('Added lands:', landsToAdd.length);
    
    console.log('Total deck size:', deck.length);
    
    return {
      deck,
      commander: undefined,
      sideboard: [],
      analysis: {
        power: context.powerTarget,
        subscores: {},
        curve: {},
        colorDistribution: {},
        tags: {}
      },
      changeLog: ['AI-guided deck build complete'],
      validation: {
        isLegal: deck.length === 99,
        errors: deck.length !== 99 ? [`Deck has ${deck.length} cards, needs 99`] : [],
        warnings: []
      }
    };
  }
  
  private static tagCard(card: Card): void {
    const text = (card.oracle_text || '').toLowerCase();
    
    // Basic tagging
    if (text.includes('add') && text.includes('mana')) card.tags.add('ramp');
    if (text.includes('draw')) card.tags.add('draw');
    if (text.includes('destroy') || text.includes('exile')) {
      if (text.includes('all')) card.tags.add('removal-sweeper');
      else card.tags.add('removal-spot');
    }
    if (text.includes('counter target')) card.tags.add('counterspell');
    if (text.includes('token')) card.tags.add('tokens');
    if (text.includes('counter') && text.includes('+1/+1')) card.tags.add('counters');
    if (text.includes('proliferate')) card.tags.add('proliferate');
  }
  
  private static scoreCard(card: Card): number {
    let score = 0;
    
    // Rarity
    if (card.rarity === 'mythic') score += 3;
    else if (card.rarity === 'rare') score += 2;
    else if (card.rarity === 'uncommon') score += 1;
    
    // Price
    const price = parseFloat(card.prices?.usd || '0');
    if (price > 10) score += 3;
    else if (price > 5) score += 2;
    else if (price > 1) score += 1;
    else if (price < 0.1) score -= 3; // Penalize bulk
    
    // CMC sweet spot
    if (card.cmc >= 2 && card.cmc <= 4) score += 2;
    
    return score;
  }
}
