import { Card, BuildContext, FormatRules } from '../types';

interface ManabaseRequirements {
  colors: string[];
  colorPips: Record<string, number>;
  totalLands: number;
  basics: number;
  nonBasics: number;
  utility: number;
}

interface LandCycle {
  name: string;
  formats: string[];
  colors: number; // How many colors it can produce
  etbTapped: boolean;
  fetchable: boolean;
  types: string[];
  priority: number;
}

// Land cycles available by format - filtered by legality
const LAND_CYCLES: LandCycle[] = [
  // Fetchlands - Premium
  { name: 'fetchland', formats: ['modern', 'legacy', 'vintage', 'commander'], colors: 2, etbTapped: false, fetchable: false, types: ['fetch'], priority: 10 },
  
  // Shocklands - Premium dual lands
  { name: 'shockland', formats: ['modern', 'pioneer', 'standard', 'commander'], colors: 2, etbTapped: false, fetchable: true, types: ['shock'], priority: 9 },
  
  // Triomes - 3-color lands
  { name: 'triome', formats: ['standard', 'pioneer', 'modern', 'commander'], colors: 3, etbTapped: true, fetchable: true, types: ['triome'], priority: 8 },
  
  // Checklands - Conditional duals
  { name: 'checkland', formats: ['standard', 'pioneer', 'modern', 'commander'], colors: 2, etbTapped: false, fetchable: false, types: ['check'], priority: 7 },
  
  // Fastlands - Early game duals
  { name: 'fastland', formats: ['pioneer', 'modern', 'commander'], colors: 2, etbTapped: false, fetchable: false, types: ['fast'], priority: 7 },
  
  // Painlands - Reliable duals
  { name: 'painland', formats: ['standard', 'pioneer', 'modern', 'commander'], colors: 2, etbTapped: false, fetchable: false, types: ['pain'], priority: 6 },
  
  // Pathways - Modal duals
  { name: 'pathway', formats: ['standard', 'pioneer', 'modern', 'commander'], colors: 2, etbTapped: false, fetchable: false, types: ['pathway'], priority: 6 },
  
  // Taplands - Budget options
  { name: 'tapland', formats: ['standard', 'pioneer', 'modern', 'pauper', 'commander'], colors: 2, etbTapped: true, fetchable: false, types: ['tap'], priority: 3 },
  
  // Basics - Always available
  { name: 'basic', formats: ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'pauper', 'commander'], colors: 1, etbTapped: false, fetchable: true, types: ['basic'], priority: 1 }
];

export class ManabaseBuilder {
  
  public static buildManabase(
    landPool: Card[],
    context: BuildContext,
    rules: FormatRules,
    colorRequirements: Record<string, number>
  ): Card[] {
    const requirements = this.calculateRequirements(context, rules, colorRequirements);
    const availableCycles = this.getAvailableCycles(context.format, landPool);
    
    const manabase: Card[] = [];
    let remainingSlots = requirements.totalLands;
    
    // 1. Add utility lands first (if commander format)
    if (rules.id === 'commander' && requirements.utility > 0) {
      const utilityLands = this.selectUtilityLands(landPool, context, requirements.utility);
      manabase.push(...utilityLands);
      remainingSlots -= utilityLands.length;
    }
    
    // 2. Add non-basic lands by priority
    const nonBasicSlots = Math.min(remainingSlots - requirements.basics, requirements.nonBasics);
    const nonBasics = this.selectNonBasicLands(
      landPool, 
      availableCycles, 
      context, 
      nonBasicSlots
    );
    manabase.push(...nonBasics);
    remainingSlots -= nonBasics.length;
    
    // 3. Fill remaining with basics
    const basics = this.selectBasicLands(landPool, context, remainingSlots);
    manabase.push(...basics);
    
    return manabase;
  }
  
  private static calculateRequirements(
    context: BuildContext,
    rules: FormatRules,
    colorRequirements: Record<string, number>
  ): ManabaseRequirements {
    const colors = context.colors || Object.keys(colorRequirements);
    const isMulticolor = colors.length > 1;
    
    // Base land count by format
    let totalLands: number;
    if (rules.id === 'commander') {
      totalLands = 37; // Typical commander land count
    } else {
      totalLands = Math.max(22, Math.min(26, 24 + colors.length)); // 60-card formats
    }
    
    // Calculate basic vs non-basic split
    let basics: number;
    let nonBasics: number;
    
    if (!isMulticolor) {
      // Mono-color: mostly basics
      basics = Math.floor(totalLands * 0.8);
      nonBasics = totalLands - basics;
    } else if (colors.length === 2) {
      // Two-color: balanced split
      basics = Math.floor(totalLands * 0.4);
      nonBasics = totalLands - basics;
    } else {
      // Three+ colors: mostly non-basics
      basics = Math.floor(totalLands * 0.2);
      nonBasics = totalLands - basics;
    }
    
    const utility = rules.id === 'commander' ? 2 : 0;
    
    return {
      colors,
      colorPips: colorRequirements,
      totalLands,
      basics,
      nonBasics,
      utility
    };
  }
  
  private static getAvailableCycles(format: string, landPool: Card[]): LandCycle[] {
    return LAND_CYCLES
      .filter(cycle => cycle.formats.includes(format))
      .sort((a, b) => b.priority - a.priority);
  }
  
  private static selectNonBasicLands(
    landPool: Card[],
    availableCycles: LandCycle[],
    context: BuildContext,
    slots: number
  ): Card[] {
    const selected: Card[] = [];
    const colors = context.colors || [];
    
    // Generate color pairs for dual lands
    const colorPairs: string[][] = [];
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        colorPairs.push([colors[i], colors[j]]);
      }
    }
    
    // Select lands by cycle priority
    for (const cycle of availableCycles) {
      if (selected.length >= slots) break;
      
      if (cycle.colors === 1) {
        // Utility lands or mono-color lands
        continue;
      } else if (cycle.colors === 2) {
        // Dual lands - pick for each color pair
        for (const pair of colorPairs) {
          if (selected.length >= slots) break;
          
          const dualLand = this.findDualLand(landPool, cycle, pair);
          if (dualLand && !selected.some(card => card.name === dualLand.name)) {
            selected.push(dualLand);
          }
        }
      } else if (cycle.colors === 3 && colors.length >= 3) {
        // Triomes - for 3+ color decks
        const triomes = this.findTriomes(landPool, cycle, colors);
        for (const triome of triomes) {
          if (selected.length >= slots) break;
          if (!selected.some(card => card.name === triome.name)) {
            selected.push(triome);
          }
        }
      }
    }
    
    return selected.slice(0, slots);
  }
  
  private static selectBasicLands(
    landPool: Card[],
    context: BuildContext,
    slots: number
  ): Card[] {
    const colors = context.colors || [];
    const basics: Card[] = [];
    
    // Find basic lands for each color
    const basicsByColor: Record<string, Card> = {};
    for (const color of colors) {
      const basic = landPool.find(card => 
        card.type_line.includes('Basic Land') &&
        card.color_identity.includes(color)
      );
      if (basic) {
        basicsByColor[color] = basic;
      }
    }
    
    // Distribute slots among colors
    const slotsPerColor = Math.floor(slots / colors.length);
    const remainder = slots % colors.length;
    
    colors.forEach((color, index) => {
      const basic = basicsByColor[color];
      if (basic) {
        const count = slotsPerColor + (index < remainder ? 1 : 0);
        for (let i = 0; i < count; i++) {
          basics.push({ ...basic });
        }
      }
    });
    
    return basics;
  }
  
  private static selectUtilityLands(
    landPool: Card[],
    context: BuildContext,
    count: number
  ): Card[] {
    // Common utility lands for commander
    const utilityNames = [
      'Command Tower', 'Bojuka Bog', 'Reliquary Tower', 'Strip Mine',
      'Wasteland', 'Nykthos, Shrine to Nyx', 'Cavern of Souls'
    ];
    
    const utilityLands: Card[] = [];
    
    for (const name of utilityNames) {
      if (utilityLands.length >= count) break;
      
      const land = landPool.find(card => card.name === name);
      if (land) {
        utilityLands.push(land);
      }
    }
    
    return utilityLands;
  }
  
  private static findDualLand(
    landPool: Card[],
    cycle: LandCycle,
    colorPair: string[]
  ): Card | null {
    return landPool.find(card => 
      card.type_line.includes('Land') &&
      !card.type_line.includes('Basic') &&
      colorPair.every(color => card.color_identity.includes(color)) &&
      card.color_identity.length === colorPair.length
    ) || null;
  }
  
  private static findTriomes(
    landPool: Card[],
    cycle: LandCycle,
    colors: string[]
  ): Card[] {
    const triomes: Card[] = [];
    
    // Find all 3-color combinations
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        for (let k = j + 1; k < colors.length; k++) {
          const tripleColors = [colors[i], colors[j], colors[k]];
          
          const triome = landPool.find(card =>
            card.type_line.includes('Land') &&
            tripleColors.every(color => card.color_identity.includes(color)) &&
            card.color_identity.length === 3
          );
          
          if (triome) {
            triomes.push(triome);
          }
        }
      }
    }
    
    return triomes;
  }
  
  // Hypergeometric probability calculator for color requirements
  public static calculateColorHitProbability(
    manabase: Card[],
    requiredColors: string[],
    turn: number
  ): number {
    const totalLands = manabase.length;
    const sourcesForColors = requiredColors.map(color =>
      manabase.filter(land => land.color_identity.includes(color)).length
    );
    
    const cardsDrawn = 7 + turn - 1; // Opening hand + draws
    
    // Simplified calculation - in practice you'd use proper hypergeometric
    let probability = 1;
    for (const sources of sourcesForColors) {
      const hitProb = 1 - this.hypergeometric(totalLands - sources, cardsDrawn, totalLands);
      probability *= hitProb;
    }
    
    return probability;
  }
  
  private static hypergeometric(
    populationSize: number,
    sampleSize: number,
    successStates: number
  ): number {
    // Simplified hypergeometric calculation
    // In a real implementation, use a proper math library
    if (sampleSize >= successStates) return 1;
    return Math.max(0, Math.min(1, sampleSize / populationSize));
  }
}