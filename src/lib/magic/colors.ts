// Comprehensive Magic: The Gathering Color System
// Based on Scryfall search syntax and Magic rules

export const BASIC_COLORS = {
  W: { name: 'White', symbol: 'W', hex: '#FFFBD5' },
  U: { name: 'Blue', symbol: 'U', hex: '#0E68AB' },
  B: { name: 'Black', symbol: 'B', hex: '#150B00' },
  R: { name: 'Red', symbol: 'R', hex: '#D3202A' },
  G: { name: 'Green', symbol: 'G', hex: '#00733E' }
} as const;

// Guild combinations (Ravnica)
export const GUILDS = {
  azorius: { colors: ['W', 'U'] as string[], name: 'Azorius', description: 'White-Blue' },
  dimir: { colors: ['U', 'B'] as string[], name: 'Dimir', description: 'Blue-Black' },
  rakdos: { colors: ['B', 'R'] as string[], name: 'Rakdos', description: 'Black-Red' },
  gruul: { colors: ['R', 'G'] as string[], name: 'Gruul', description: 'Red-Green' },
  selesnya: { colors: ['G', 'W'] as string[], name: 'Selesnya', description: 'Green-White' },
  orzhov: { colors: ['W', 'B'] as string[], name: 'Orzhov', description: 'White-Black' },
  izzet: { colors: ['U', 'R'] as string[], name: 'Izzet', description: 'Blue-Red' },
  golgari: { colors: ['B', 'G'] as string[], name: 'Golgari', description: 'Black-Green' },
  boros: { colors: ['R', 'W'] as string[], name: 'Boros', description: 'Red-White' },
  simic: { colors: ['G', 'U'] as string[], name: 'Simic', description: 'Green-Blue' }
};

// Shard combinations (Alara)
export const SHARDS = {
  bant: { colors: ['G', 'W', 'U'] as string[], name: 'Bant', description: 'Green-White-Blue' },
  esper: { colors: ['W', 'U', 'B'] as string[], name: 'Esper', description: 'White-Blue-Black' },
  grixis: { colors: ['U', 'B', 'R'] as string[], name: 'Grixis', description: 'Blue-Black-Red' },
  jund: { colors: ['B', 'R', 'G'] as string[], name: 'Jund', description: 'Black-Red-Green' },
  naya: { colors: ['R', 'G', 'W'] as string[], name: 'Naya', description: 'Red-Green-White' }
};

// Wedge combinations (Khans of Tarkir)
export const WEDGES = {
  abzan: { colors: ['W', 'B', 'G'] as string[], name: 'Abzan', description: 'White-Black-Green' },
  jeskai: { colors: ['U', 'R', 'W'] as string[], name: 'Jeskai', description: 'Blue-Red-White' },
  sultai: { colors: ['B', 'G', 'U'] as string[], name: 'Sultai', description: 'Black-Green-Blue' },
  mardu: { colors: ['R', 'W', 'B'] as string[], name: 'Mardu', description: 'Red-White-Black' },
  temur: { colors: ['G', 'U', 'R'] as string[], name: 'Temur', description: 'Green-Blue-Red' }
};

// Four-color combinations (Commander 2016)
export const FOUR_COLOR = {
  chaos: { colors: ['U', 'B', 'R', 'G'] as string[], name: 'Chaos', description: 'Not White' },
  aggression: { colors: ['W', 'B', 'R', 'G'] as string[], name: 'Aggression', description: 'Not Blue' },
  altruism: { colors: ['W', 'U', 'R', 'G'] as string[], name: 'Altruism', description: 'Not Black' },
  growth: { colors: ['W', 'U', 'B', 'G'] as string[], name: 'Growth', description: 'Not Red' },
  artifice: { colors: ['W', 'U', 'B', 'R'] as string[], name: 'Artifice', description: 'Not Green' }
};

// Special color categories
export const SPECIAL_COLORS = {
  colorless: { name: 'Colorless', symbol: 'C', description: 'No colors' },
  multicolor: { name: 'Multicolor', symbol: 'M', description: 'Two or more colors' },
  wubrg: { colors: ['W', 'U', 'B', 'R', 'G'] as string[], name: 'WUBRG', description: 'All five colors' }
};

// All color combinations for easy lookup
export const ALL_COLOR_COMBINATIONS = {
  ...GUILDS,
  ...SHARDS,
  ...WEDGES,
  ...FOUR_COLOR
};

// Color identity utilities
export class ColorIdentity {
  static getColorCount(colors: string[]): number {
    return colors.filter(c => ['W', 'U', 'B', 'R', 'G'].includes(c)).length;
  }

  static isMonoColor(colors: string[]): boolean {
    return this.getColorCount(colors) === 1;
  }

  static isMultiColor(colors: string[]): boolean {
    return this.getColorCount(colors) > 1;
  }

  static isColorless(colors: string[]): boolean {
    return this.getColorCount(colors) === 0;
  }

  static matchesIdentity(cardColors: string[], identityColors: string[]): boolean {
    // Check if card colors are subset of identity colors
    return cardColors.every(color => identityColors.includes(color));
  }

  static getGuildName(colors: string[]): string | null {
    if (colors.length !== 2) return null;
    const sorted = [...colors].sort();
    for (const [name, guild] of Object.entries(GUILDS)) {
      if (guild.colors.length === 2 && 
          guild.colors.every((c: string) => sorted.includes(c)) &&
          sorted.every((c: string) => guild.colors.includes(c))) {
        return name;
      }
    }
    return null;
  }

  static getShardName(colors: string[]): string | null {
    if (colors.length !== 3) return null;
    const sorted = [...colors].sort();
    for (const [name, shard] of Object.entries(SHARDS)) {
      if (shard.colors.length === 3 && 
          shard.colors.every((c: string) => sorted.includes(c)) &&
          sorted.every((c: string) => shard.colors.includes(c))) {
        return name;
      }
    }
    return null;
  }

  static getWedgeName(colors: string[]): string | null {
    if (colors.length !== 3) return null;
    const sorted = [...colors].sort();
    for (const [name, wedge] of Object.entries(WEDGES)) {
      if (wedge.colors.length === 3 && 
          wedge.colors.every((c: string) => sorted.includes(c)) &&
          sorted.every((c: string) => wedge.colors.includes(c))) {
        return name;
      }
    }
    return null;
  }

  static getFourColorName(colors: string[]): string | null {
    if (colors.length !== 4) return null;
    const sorted = [...colors].sort();
    for (const [name, fourColor] of Object.entries(FOUR_COLOR)) {
      if (fourColor.colors.length === 4 && 
          fourColor.colors.every((c: string) => sorted.includes(c)) &&
          sorted.every((c: string) => fourColor.colors.includes(c))) {
        return name;
      }
    }
    return null;
  }

  static getColorCombinationName(colors: string[]): string | null {
    switch (colors.length) {
      case 0: return 'colorless';
      case 1: return BASIC_COLORS[colors[0] as keyof typeof BASIC_COLORS]?.name || null;
      case 2: return this.getGuildName(colors);
      case 3: return this.getShardName(colors) || this.getWedgeName(colors);
      case 4: return this.getFourColorName(colors);
      case 5: return 'wubrg';
      default: return null;
    }
  }
}

// Scryfall search syntax helpers
export class ColorSearch {
  static buildColorQuery(colors: string[], operator: 'exact' | 'contains' | 'subset' | 'superset' = 'exact'): string {
    if (colors.length === 0) return 'c:colorless';
    
    const colorString = colors.join('');
    
    switch (operator) {
      case 'exact': return `c:${colorString}`;
      case 'contains': return `c>=${colorString}`;
      case 'subset': return `c<=${colorString}`;
      case 'superset': return `c>=${colorString}`;
      default: return `c:${colorString}`;
    }
  }

  static buildIdentityQuery(colors: string[], operator: 'exact' | 'contains' | 'subset' | 'superset' = 'exact'): string {
    if (colors.length === 0) return 'id:colorless';
    
    const colorString = colors.join('');
    
    switch (operator) {
      case 'exact': return `id:${colorString}`;
      case 'contains': return `id>=${colorString}`;
      case 'subset': return `id<=${colorString}`;
      case 'superset': return `id>=${colorString}`;
      default: return `id:${colorString}`;
    }
  }

  static buildCombinationQuery(combinationName: string): string {
    if (combinationName in GUILDS) {
      return `c:${GUILDS[combinationName as keyof typeof GUILDS].colors.join('')}`;
    }
    if (combinationName in SHARDS) {
      return `c:${SHARDS[combinationName as keyof typeof SHARDS].colors.join('')}`;
    }
    if (combinationName in WEDGES) {
      return `c:${WEDGES[combinationName as keyof typeof WEDGES].colors.join('')}`;
    }
    if (combinationName in FOUR_COLOR) {
      return `c:${FOUR_COLOR[combinationName as keyof typeof FOUR_COLOR].colors.join('')}`;
    }
    return `c:${combinationName}`;
  }
}

export type ColorCombination = keyof typeof ALL_COLOR_COMBINATIONS;
export type BasicColor = keyof typeof BASIC_COLORS;
export type GuildName = keyof typeof GUILDS;
export type ShardName = keyof typeof SHARDS;
export type WedgeName = keyof typeof WEDGES;
export type FourColorName = keyof typeof FOUR_COLOR;