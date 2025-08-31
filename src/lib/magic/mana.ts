// Comprehensive Magic: The Gathering Mana System
// Based on official Magic rules and Scryfall syntax

// Basic mana symbols
export const BASIC_MANA_SYMBOLS = ['W', 'U', 'B', 'R', 'G'] as const;

// Generic mana symbols
export const GENERIC_MANA_SYMBOLS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', 'X', 'Y', 'Z'] as const;

// Hybrid mana symbols
export const HYBRID_SYMBOLS = [
  'W/U', 'W/B', 'U/B', 'U/R', 'B/R', 'B/G', 'R/G', 'R/W', 'G/W', 'G/U',
  '2/W', '2/U', '2/B', '2/R', '2/G'
] as const;

// Phyrexian mana symbols
export const PHYREXIAN_SYMBOLS = ['W/P', 'U/P', 'B/P', 'R/P', 'G/P'] as const;

// Special symbols
export const SPECIAL_SYMBOLS = ['C', 'S', 'E', 'T', 'Q', 'CHAOS', 'A', 'PW'] as const;

// Mana cost parsing and analysis
export class ManaCost {
  private symbols: string[];

  constructor(manaCost: string) {
    this.symbols = this.parseManaCost(manaCost);
  }

  private parseManaCost(cost: string): string[] {
    if (!cost) return [];
    
    const symbols: string[] = [];
    let i = 0;
    
    while (i < cost.length) {
      if (cost[i] === '{') {
        // Find the closing brace
        const endIndex = cost.indexOf('}', i);
        if (endIndex !== -1) {
          const symbol = cost.substring(i + 1, endIndex);
          symbols.push(symbol);
          i = endIndex + 1;
        } else {
          i++;
        }
      } else if (/[WUBRG0-9XYZ]/.test(cost[i])) {
        // Single character symbol
        symbols.push(cost[i]);
        i++;
      } else {
        i++;
      }
    }
    
    return symbols;
  }

  // Get converted mana cost (CMC) / mana value
  getManaValue(): number {
    let total = 0;
    
    for (const symbol of this.symbols) {
      if (/^\d+$/.test(symbol)) {
        total += parseInt(symbol);
      } else if (['W', 'U', 'B', 'R', 'G', 'C'].includes(symbol)) {
        total += 1;
      } else if (symbol.includes('/')) {
        // Hybrid symbols
        if (symbol.includes('2/')) {
          total += 2; // Can be paid with 2 generic or 1 colored
        } else {
          total += 1; // Standard hybrid
        }
      } else if (symbol.includes('/P')) {
        total += 1; // Phyrexian symbols
      }
      // X, Y, Z don't add to CMC
    }
    
    return total;
  }

  // Get color requirements
  getColorRequirements(): Record<string, number> {
    const requirements: Record<string, number> = {
      W: 0, U: 0, B: 0, R: 0, G: 0
    };
    
    for (const symbol of this.symbols) {
      if (['W', 'U', 'B', 'R', 'G'].includes(symbol)) {
        requirements[symbol]++;
      } else if (symbol.includes('/') && !symbol.includes('2/') && !symbol.includes('/P')) {
        // Hybrid symbols (not generic hybrid or Phyrexian)
        const colors = symbol.split('/');
        // For devotion calculations, hybrid symbols count as both colors
        colors.forEach(color => {
          if (['W', 'U', 'B', 'R', 'G'].includes(color)) {
            requirements[color] += 0.5; // Half point for hybrid
          }
        });
      } else if (symbol.includes('/P')) {
        // Phyrexian symbols
        const color = symbol.split('/')[0];
        if (['W', 'U', 'B', 'R', 'G'].includes(color)) {
          requirements[color]++;
        }
      }
    }
    
    return requirements;
  }

  // Get devotion contribution
  getDevotionContribution(): Record<string, number> {
    const devotion: Record<string, number> = {
      W: 0, U: 0, B: 0, R: 0, G: 0
    };
    
    for (const symbol of this.symbols) {
      if (['W', 'U', 'B', 'R', 'G'].includes(symbol)) {
        devotion[symbol]++;
      } else if (symbol.includes('/') && !symbol.includes('2/')) {
        // Hybrid symbols count as both colors for devotion
        const colors = symbol.split('/').filter(c => ['W', 'U', 'B', 'R', 'G'].includes(c));
        colors.forEach(color => {
          devotion[color]++;
        });
      }
    }
    
    return devotion;
  }

  // Check if cost contains hybrid mana
  hasHybridMana(): boolean {
    return this.symbols.some(symbol => 
      symbol.includes('/') && !symbol.includes('/P')
    );
  }

  // Check if cost contains Phyrexian mana
  hasPhyrexianMana(): boolean {
    return this.symbols.some(symbol => symbol.includes('/P'));
  }

  // Check if cost contains X, Y, or Z
  hasVariableCost(): boolean {
    return this.symbols.some(symbol => ['X', 'Y', 'Z'].includes(symbol));
  }

  // Get color identity
  getColorIdentity(): string[] {
    const colors = new Set<string>();
    
    for (const symbol of this.symbols) {
      if (['W', 'U', 'B', 'R', 'G'].includes(symbol)) {
        colors.add(symbol);
      } else if (symbol.includes('/')) {
        const symbolColors = symbol.split('/').filter(c => ['W', 'U', 'B', 'R', 'G'].includes(c));
        symbolColors.forEach(color => colors.add(color));
      }
    }
    
    return Array.from(colors).sort();
  }

  // Convert to Scryfall search format
  toScryfallFormat(): string {
    return `{${this.symbols.join('}{')}}`;
  }

  // Check if this cost is greater than another (for >= queries)
  isGreaterThan(other: ManaCost): boolean {
    const thisReqs = this.getColorRequirements();
    const otherReqs = other.getColorRequirements();
    
    // Must have at least as much of each color
    for (const color of ['W', 'U', 'B', 'R', 'G']) {
      if (thisReqs[color] < otherReqs[color]) {
        return false;
      }
    }
    
    // Must have at least as high CMC
    return this.getManaValue() >= other.getManaValue();
  }
}

// Mana production analysis
export class ManaProduction {
  static analyzeLand(oracleText: string, typeLine: string): string[] {
    const producedColors: string[] = [];
    const text = oracleText?.toLowerCase() || '';
    
    // Basic lands
    if (typeLine.includes('Plains') || text.includes('add {w}')) {
      producedColors.push('W');
    }
    if (typeLine.includes('Island') || text.includes('add {u}')) {
      producedColors.push('U');
    }
    if (typeLine.includes('Swamp') || text.includes('add {b}')) {
      producedColors.push('B');
    }
    if (typeLine.includes('Mountain') || text.includes('add {r}')) {
      producedColors.push('R');
    }
    if (typeLine.includes('Forest') || text.includes('add {g}')) {
      producedColors.push('G');
    }
    
    // Generic patterns
    if (text.includes('add {c}') || text.includes('add one mana of any type')) {
      producedColors.push('C');
    }
    
    // Any color
    if (text.includes('any color') || text.includes('add one mana of any color')) {
      producedColors.push('W', 'U', 'B', 'R', 'G');
    }
    
    return [...new Set(producedColors)];
  }

  static canProduceColor(card: any, color: string): boolean {
    const produced = this.analyzeLand(card.oracle_text, card.type_line);
    return produced.includes(color) || produced.includes('any');
  }
}

// Devotion calculations
export class Devotion {
  static calculateDevotion(permanents: any[], colors: string[]): number {
    let total = 0;
    
    for (const permanent of permanents) {
      if (permanent.mana_cost) {
        const cost = new ManaCost(permanent.mana_cost);
        const contribution = cost.getDevotionContribution();
        
        for (const color of colors) {
          total += contribution[color] || 0;
        }
      }
    }
    
    return total;
  }

  static meetsDevotionRequirement(permanents: any[], requirement: string): boolean {
    // Parse requirement like "{R}{R}{R}" or "{U/B}{U/B}"
    const cost = new ManaCost(requirement);
    const required = cost.getDevotionContribution();
    
    for (const color of ['W', 'U', 'B', 'R', 'G']) {
      if (required[color] > 0) {
        const actual = this.calculateDevotion(permanents, [color]);
        if (actual < required[color]) {
          return false;
        }
      }
    }
    
    return true;
  }
}

// Scryfall search helpers for mana
export class ManaSearch {
  static buildManaValueQuery(value: number | string, operator: '=' | '>' | '<' | '>=' | '<=' | '!=' = '='): string {
    if (value === 'even') return 'mv:even';
    if (value === 'odd') return 'mv:odd';
    return `mv${operator}${value}`;
  }

  static buildManaCostQuery(cost: string, operator: '=' | '>' | '<' | '>=' | '<=' = '='): string {
    const cleanCost = cost.replace(/[{}]/g, '');
    return `m${operator}${cleanCost}`;
  }

  static buildDevotionQuery(requirement: string): string {
    return `devotion:${requirement}`;
  }

  static buildProducesQuery(colors: string[]): string {
    return `produces:${colors.join('')}`;
  }

  static buildHybridQuery(): string {
    return 'is:hybrid';
  }

  static buildPhyrexianQuery(): string {
    return 'is:phyrexian';
  }
}

export type ManaSymbol = typeof BASIC_MANA_SYMBOLS[number] | typeof GENERIC_MANA_SYMBOLS[number] | typeof HYBRID_SYMBOLS[number] | typeof PHYREXIAN_SYMBOLS[number];