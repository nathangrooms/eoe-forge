// Deck builder orchestrator that coordinates all phases
// This properly uses the UniversalDeckBuilder with AI planning integration
import type { Card, BuildContext, BuildResult } from './types.ts';

// Import the real deck builder components
// We need to inline critical logic since we can't import from src/ in edge functions

interface ArchetypeTemplate {
  id: string;
  name: string;
  formats: string[];
  colors?: string[];
  weights: {
    synergy: Record<string, number>;
    roles: Record<string, number>;
  };
  quotas: {
    counts: Record<string, { min: number; max: number }>;
    creatures_curve: Record<string, string>;
  };
  packages: Array<{
    name: string;
    require: Array<{ tag: string; count: number }>;
    prefer?: Array<{ tag: string; count: number }>;
  }>;
  bans: string[];
  requires: string[];
  power_gates: {
    low: { cap: Record<string, number> };
    high: { floor: Record<string, number> };
  };
}

export class BuilderOrchestrator {
  /**
   * Build a deck with all phases coordinated and AI planning integrated
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
    console.log('AI Plan available:', !!plan);
    
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
    
    // Get archetype template (enhanced with AI planning if available)
    const template = this.getTemplate(context.themeId, plan);
    console.log('Template loaded:', template.name);
    
    // Build deck with proper algorithm
    const deck = await this.advancedBuild(formattedPool, context, template, plan);
    
    return deck;
  }
  
  /**
   * Get template for archetype (enhanced with AI planning)
   */
  private static getTemplate(themeId: string, plan?: any): ArchetypeTemplate {
    // Use AI plan to enhance template if available
    const baseQuotas = plan?.cardQuotas || {};
    
    return {
      id: themeId,
      name: themeId,
      formats: ['commander'],
      weights: {
        synergy: { 
          'counters': plan?.synergies?.includes('counters') ? 3.0 : 1.5,
          'tokens': plan?.synergies?.includes('tokens') ? 3.0 : 1.5,
          'aristocrats': plan?.synergies?.includes('sacrifice') ? 3.0 : 1.5,
          'spellslinger': plan?.synergies?.includes('spells') ? 3.0 : 1.5,
          'tribal': plan?.synergies?.includes('tribal') ? 3.0 : 1.5,
        },
        roles: {
          'ramp': 2.0,
          'draw': 2.0,
          'removal-spot': 1.8,
          'removal-sweeper': 1.6,
          'protection': 1.4,
          'wincon': 2.2
        }
      },
      quotas: {
        counts: {
          'ramp': baseQuotas.ramp || { min: 10, max: 14 },
          'draw': baseQuotas.card_draw || { min: 10, max: 15 },
          'removal-spot': baseQuotas.spot_removal || { min: 6, max: 10 },
          'removal-sweeper': baseQuotas.board_wipes || { min: 2, max: 4 },
          'counterspell': baseQuotas.counterspells || { min: 0, max: 8 },
          'protection': { min: 3, max: 6 },
          'wincon': { min: 3, max: 6 }
        },
        creatures_curve: {
          '1': '2-4',
          '2': '6-10',
          '3': '8-12',
          '4': '6-10',
          '5': '4-8',
          '6+': '4-8'
        }
      },
      packages: [],
      bans: [],
      requires: [],
      power_gates: {
        low: { cap: {} },
        high: { floor: {} }
      }
    };
  }

  /**
   * Advanced build using proper deck building algorithm
   */
  private static async advancedBuild(
    pool: Card[],
    context: BuildContext,
    template: ArchetypeTemplate,
    plan?: any
  ): Promise<BuildResult> {
    console.log('Executing advanced build algorithm...');
    
    // Filter pool for commander colors and quality
    const filteredPool = pool.filter(c => {
      if (!context.identity || context.identity.length === 0) return true;
      const inIdentity = c.color_identity.every(color => context.identity!.includes(color));
      if (!inIdentity) return false;
      
      // Quality filtering
      return this.meetsQualityThreshold(c);
    });
    
    console.log('Filtered pool:', filteredPool.length, 'cards');
    
    // Tag all cards
    filteredPool.forEach(card => this.tagCard(card));
    
    // Phase 1: Core Infrastructure (Ramp, Draw, Removal)
    const deck: Card[] = [];
    const rampTarget = template.quotas.counts['ramp']?.min || 10;
    const drawTarget = template.quotas.counts['draw']?.min || 10;
    const removalTarget = (template.quotas.counts['removal-spot']?.min || 6) + 
                          (template.quotas.counts['removal-sweeper']?.min || 2);
    
    // Select ramp (prioritize quality and CMC efficiency)
    const rampCards = filteredPool
      .filter(c => c.tags.has('ramp'))
      .sort((a, b) => this.scoreCardAdvanced(b, template, plan) - this.scoreCardAdvanced(a, template, plan))
      .slice(0, rampTarget);
    deck.push(...rampCards);
    console.log(`Added ${rampCards.length} ramp cards (target: ${rampTarget})`);
    
    // Select card draw
    const drawCards = filteredPool
      .filter(c => c.tags.has('draw') && !deck.includes(c))
      .sort((a, b) => this.scoreCardAdvanced(b, template, plan) - this.scoreCardAdvanced(a, template, plan))
      .slice(0, drawTarget);
    deck.push(...drawCards);
    console.log(`Added ${drawCards.length} draw cards (target: ${drawTarget})`);
    
    // Select removal (mix of spot and sweepers)
    const spotRemoval = filteredPool
      .filter(c => c.tags.has('removal-spot') && !deck.includes(c))
      .sort((a, b) => this.scoreCardAdvanced(b, template, plan) - this.scoreCardAdvanced(a, template, plan))
      .slice(0, template.quotas.counts['removal-spot']?.min || 6);
    deck.push(...spotRemoval);
    
    const sweepers = filteredPool
      .filter(c => c.tags.has('removal-sweeper') && !deck.includes(c))
      .sort((a, b) => this.scoreCardAdvanced(b, template, plan) - this.scoreCardAdvanced(a, template, plan))
      .slice(0, template.quotas.counts['removal-sweeper']?.min || 2);
    deck.push(...sweepers);
    console.log(`Added ${spotRemoval.length} spot removal + ${sweepers.length} sweepers (target: ${removalTarget})`);
    
    // Phase 2: Synergy & Theme Cards
    const synergyTags = plan?.synergies || ['counters', 'tokens', 'etb', 'blink'];
    const synergyCards = filteredPool
      .filter(c => !deck.includes(c) && synergyTags.some((tag: string) => c.tags.has(tag)))
      .sort((a, b) => this.scoreCardAdvanced(b, template, plan) - this.scoreCardAdvanced(a, template, plan))
      .slice(0, 20);
    deck.push(...synergyCards);
    console.log(`Added ${synergyCards.length} synergy cards`);
    
    // Phase 3: Creatures (filling curve)
    const creaturesByMV = this.groupByManaCost(
      filteredPool.filter(c => c.type_line.includes('Creature') && !c.is_legendary && !deck.includes(c))
    );
    
    const creatureCurve = [
      { mv: 1, count: 2 },
      { mv: 2, count: 8 },
      { mv: 3, count: 10 },
      { mv: 4, count: 8 },
      { mv: 5, count: 5 },
      { mv: 6, count: 3 }
    ];
    
    for (const { mv, count } of creatureCurve) {
      const creatures = (creaturesByMV[mv] || [])
        .filter(c => !deck.includes(c))
        .sort((a, b) => this.scoreCardAdvanced(b, template, plan) - this.scoreCardAdvanced(a, template, plan))
        .slice(0, count);
      deck.push(...creatures);
    }
    console.log(`Added ${deck.filter(c => c.type_line.includes('Creature')).length} creatures`);
    
    // Phase 4: Win Conditions
    const wincons = filteredPool
      .filter(c => !deck.includes(c) && (c.tags.has('wincon') || c.tags.has('combo-piece')))
      .sort((a, b) => this.scoreCardAdvanced(b, template, plan) - this.scoreCardAdvanced(a, template, plan))
      .slice(0, 5);
    deck.push(...wincons);
    console.log(`Added ${wincons.length} win conditions`);
    
    // Phase 5: Protection & Utility
    const protection = filteredPool
      .filter(c => !deck.includes(c) && c.tags.has('protection'))
      .sort((a, b) => this.scoreCardAdvanced(b, template, plan) - this.scoreCardAdvanced(a, template, plan))
      .slice(0, 4);
    deck.push(...protection);
    console.log(`Added ${protection.length} protection cards`);
    
    // Phase 6: Fill remaining non-land slots
    const nonLandTarget = 63; // 99 - 36 lands
    const remaining = nonLandTarget - deck.length;
    if (remaining > 0) {
      const fillers = filteredPool
        .filter(c => !deck.includes(c) && !c.type_line.includes('Land'))
        .sort((a, b) => this.scoreCardAdvanced(b, template, plan) - this.scoreCardAdvanced(a, template, plan))
        .slice(0, remaining);
      deck.push(...fillers);
      console.log(`Added ${fillers.length} filler cards`);
    }
    
    // Phase 7: Manabase
    const lands = this.buildManabase(filteredPool, context, deck);
    deck.push(...lands);
    console.log(`Added ${lands.length} lands`);
    
    console.log(`Final deck size: ${deck.length} cards`);
    
    // Analyze deck
    const analysis = this.analyzeDeck(deck, context);
    
    return {
      deck,
      commander: undefined,
      sideboard: [],
      analysis,
      changeLog: [
        'AI-guided deck build with advanced algorithm',
        `Ramp: ${rampCards.length}/${rampTarget}`,
        `Draw: ${drawCards.length}/${drawTarget}`,
        `Removal: ${spotRemoval.length + sweepers.length}/${removalTarget}`,
        `Synergy pieces: ${synergyCards.length}`,
        `Win conditions: ${wincons.length}`
      ],
      validation: {
        isLegal: deck.length === 99,
        errors: deck.length !== 99 ? [`Deck has ${deck.length} cards, needs 99`] : [],
        warnings: this.validateDeckQuality(deck, template, plan)
      }
    };
  }
  
  /**
   * Quality threshold check
   */
  private static meetsQualityThreshold(card: Card): boolean {
    // Always include lands
    if (card.type_line.includes('Land')) return true;
    
    const price = parseFloat(card.prices?.usd || '0');
    const text = card.oracle_text || '';
    
    // Reject obvious bulk junk
    if (price < 0.10 && card.rarity === 'common') {
      // Weak equipment
      if (card.type_line.includes('Equipment') && 
          /^equipped creature gets \+[01]\/\+[01]\.?$/i.test(text.trim())) {
        return false;
      }
      // Vanilla cantrips
      if (/^(tap: draw a card|sacrifice.*: draw a card)\.?$/i.test(text.trim())) {
        return false;
      }
    }
    
    // Reject overcosted vanilla creatures
    if (card.type_line.includes('Creature') && !text && card.cmc > 3) {
      const stats = parseInt(card.power || '0') + parseInt(card.toughness || '0');
      if (stats < card.cmc * 2) return false;
    }
    
    return true;
  }
  
  /**
   * Group cards by mana value
   */
  private static groupByManaCost(cards: Card[]): Record<number, Card[]> {
    const groups: Record<number, Card[]> = {};
    for (const card of cards) {
      const mv = Math.floor(card.cmc);
      if (!groups[mv]) groups[mv] = [];
      groups[mv].push(card);
    }
    return groups;
  }
  
  /**
   * Build optimized manabase
   */
  private static buildManabase(pool: Card[], context: BuildContext, deck: Card[]): Card[] {
    const lands: Card[] = [];
    const identity = context.identity || [];
    const landPool = pool.filter(c => c.type_line.includes('Land'));
    
    // Calculate color requirements from deck
    const colorPips: Record<string, number> = {};
    for (const card of deck) {
      const cost = card.mana_cost || '';
      for (const color of ['W', 'U', 'B', 'R', 'G']) {
        const matches = cost.match(new RegExp(`{${color}}`, 'g'));
        colorPips[color] = (colorPips[color] || 0) + (matches?.length || 0);
      }
    }
    
    // Sort colors by requirement
    const sortedColors = identity.sort((a, b) => (colorPips[b] || 0) - (colorPips[a] || 0));
    
    // Add high-quality lands first
    const utilityLands = landPool
      .filter(l => !this.isBasicLand(l) && (l.oracle_text?.length || 0) > 10)
      .sort((a, b) => this.scoreCard(b) - this.scoreCard(a))
      .slice(0, 8);
    lands.push(...utilityLands);
    
    // Add dual lands
    const dualLands = landPool
      .filter(l => !lands.includes(l) && this.isDualLand(l, identity))
      .sort((a, b) => this.scoreCard(b) - this.scoreCard(a))
      .slice(0, 10);
    lands.push(...dualLands);
    
    // Fill with basics proportionally
    const basicsNeeded = 36 - lands.length;
    const basicNames = {
      'W': 'Plains',
      'U': 'Island',
      'B': 'Swamp',
      'R': 'Mountain',
      'G': 'Forest'
    };
    
    for (let i = 0; i < basicsNeeded; i++) {
      const color = sortedColors[i % sortedColors.length];
      const basic = landPool.find(l => l.name === basicNames[color]);
      if (basic && !lands.some(l => l.id === basic.id)) {
        lands.push({ ...basic, id: `${basic.id}-${i}` }); // Allow duplicates
      }
    }
    
    return lands;
  }
  
  private static isBasicLand(card: Card): boolean {
    return ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].includes(card.name);
  }
  
  private static isDualLand(card: Card, identity: string[]): boolean {
    const producedColors = (card.oracle_text || '').match(/{([WUBRG])}/g) || [];
    return producedColors.length >= 2 && 
           producedColors.every(c => identity.includes(c.charAt(1)));
  }
  
  /**
   * Validate deck quality
   */
  private static validateDeckQuality(deck: Card[], template: ArchetypeTemplate, plan?: any): string[] {
    const warnings: string[] = [];
    
    // Check quotas
    const rampCount = deck.filter(c => c.tags.has('ramp')).length;
    const drawCount = deck.filter(c => c.tags.has('draw')).length;
    const removalCount = deck.filter(c => c.tags.has('removal-spot') || c.tags.has('removal-sweeper')).length;
    
    if (rampCount < 8) warnings.push(`Low ramp count: ${rampCount} (recommend 10-14)`);
    if (drawCount < 8) warnings.push(`Low draw count: ${drawCount} (recommend 10-15)`);
    if (removalCount < 8) warnings.push(`Low removal count: ${removalCount} (recommend 10-15)`);
    
    // Check mana curve
    const avgCMC = deck.reduce((sum, c) => sum + c.cmc, 0) / deck.length;
    if (avgCMC < 2.5) warnings.push(`Mana curve too low: ${avgCMC.toFixed(2)} avg CMC`);
    if (avgCMC > 4.0) warnings.push(`Mana curve too high: ${avgCMC.toFixed(2)} avg CMC`);
    
    return warnings;
  }
  
  /**
   * Analyze completed deck
   */
  private static analyzeDeck(deck: Card[], context: BuildContext): any {
    const curve: Record<string, number> = {};
    const colors: Record<string, number> = {};
    const tags: Record<string, number> = {};
    
    for (const card of deck) {
      // Curve
      const mv = Math.floor(card.cmc);
      curve[mv] = (curve[mv] || 0) + 1;
      
      // Colors
      for (const color of card.colors) {
        colors[color] = (colors[color] || 0) + 1;
      }
      
      // Tags
      card.tags.forEach(tag => {
        tags[tag] = (tags[tag] || 0) + 1;
      });
    }
    
    return {
      power: context.powerTarget,
      subscores: {
        speed: 0,
        interaction: 0,
        tutors: 0,
        wincon: 0,
        mana: 0,
        consistency: 0
      },
      curve,
      colorDistribution: colors,
      tags
    };
  }
  
  /**
   * Advanced card scoring with template and plan awareness
   */
  private static scoreCardAdvanced(card: Card, template: ArchetypeTemplate, plan?: any): number {
    let score = 0;
    
    // Base quality score
    score += this.scoreCard(card);
    
    // Template synergy
    for (const [tag, weight] of Object.entries(template.weights.synergy)) {
      if (card.tags.has(tag)) {
        score += weight * 10;
      }
    }
    
    for (const [tag, weight] of Object.entries(template.weights.roles)) {
      if (card.tags.has(tag)) {
        score += weight * 8;
      }
    }
    
    // AI plan synergy
    if (plan?.keyCards?.includes(card.name)) {
      score += 50; // Huge bonus for AI-identified key cards
    }
    
    if (plan?.synergies?.some((s: string) => card.tags.has(s))) {
      score += 15;
    }
    
    // CMC efficiency (sweet spot 2-4)
    if (card.cmc >= 2 && card.cmc <= 4) {
      score += 10;
    } else if (card.cmc > 6) {
      score -= 5;
    }
    
    return score;
  }
  
  /**
   * Enhanced tagging system for comprehensive card categorization
   */
  private static tagCard(card: Card): void {
    const text = (card.oracle_text || '').toLowerCase();
    const type = card.type_line.toLowerCase();
    
    // RAMP - Mana acceleration
    if (type.includes('land') && !['plains', 'island', 'swamp', 'mountain', 'forest'].includes(card.name.toLowerCase())) {
      card.tags.add('ramp');
    }
    if (text.match(/add .* mana|search .* land|put .* land .* battlefield/)) {
      card.tags.add('ramp');
    }
    if (type.includes('artifact') && text.match(/tap: add|{t}: add/)) {
      card.tags.add('ramp');
    }
    
    // CARD DRAW - Card advantage
    if (text.match(/draw (a|one|two|three|\d+) card/)) {
      card.tags.add('draw');
    }
    if (text.match(/whenever .* draw|when .* enters .* draw/)) {
      card.tags.add('draw');
    }
    
    // TUTORS - Card search
    if (text.match(/search your library/)) {
      if (text.match(/search your library for (a|any) card/)) {
        card.tags.add('tutor-broad');
      } else {
        card.tags.add('tutor-narrow');
      }
    }
    
    // REMOVAL - Interaction
    if (text.match(/destroy (target|all|each)/)) {
      if (text.match(/destroy all|destroy each/)) {
        card.tags.add('removal-sweeper');
      } else {
        card.tags.add('removal-spot');
      }
    }
    if (text.match(/exile (target|all|each)/)) {
      if (text.match(/exile all|exile each/)) {
        card.tags.add('removal-sweeper');
      } else {
        card.tags.add('removal-spot');
      }
    }
    if (text.includes('counter target spell')) {
      card.tags.add('counterspell');
    }
    
    // PROTECTION
    if (text.match(/indestructible|hexproof|protection from|shroud/)) {
      card.tags.add('protection');
    }
    if (text.match(/regenerate|prevent all damage/)) {
      card.tags.add('protection');
    }
    
    // RECURSION
    if (text.match(/return .* from .* graveyard/)) {
      card.tags.add('recursion');
    }
    
    // SYNERGY PATTERNS
    if (text.match(/\+1\/\+1 counter/)) card.tags.add('counters');
    if (text.includes('proliferate')) card.tags.add('proliferate');
    if (text.match(/create .* token/)) card.tags.add('tokens');
    if (text.match(/when .* dies|whenever .* dies/)) card.tags.add('aristocrats');
    if (text.match(/sacrifice|sac\b/)) card.tags.add('sac-outlet');
    if (text.match(/when .* enters|whenever .* enters/)) card.tags.add('etb');
    if (text.match(/blink|flicker|exile .* return/)) card.tags.add('blink');
    if (text.match(/instant.*sorcery|cast.*spell/)) card.tags.add('spellslinger');
    if (text.includes('equipment') || type.includes('equipment')) card.tags.add('equipment');
    if (text.includes('aura') || type.includes('aura')) card.tags.add('auras');
    
    // WIN CONDITIONS
    if (text.match(/you win the game|each opponent loses|target opponent loses \d+ life/)) {
      card.tags.add('wincon');
    }
    if (text.match(/infinite|untap all|extra turn/)) {
      card.tags.add('combo-piece');
    }
    
    // FAST MANA (powerful acceleration)
    if ((type.includes('artifact') || type.includes('land')) && card.cmc <= 1 && 
        text.match(/add .* mana/)) {
      if (card.name.match(/mox|lotus|crypt|vault|ring/i)) {
        card.tags.add('fast-mana');
      }
    }
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
