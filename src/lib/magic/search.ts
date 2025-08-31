// Magic: The Gathering Advanced Search Syntax Parser
// Based on Scryfall's comprehensive search syntax

import { ColorSearch } from './colors';

export interface SearchQuery {
  text?: string;
  name?: string;
  oracle?: string;
  type?: string;
  colors?: string[];
  identity?: string[];
  colorOperator?: 'exact' | 'contains' | 'subset' | 'superset';
  manaValue?: number | string | { min?: number; max?: number };
  power?: string | { min?: number; max?: number };
  toughness?: string | { min?: number; max?: number };
  loyalty?: string | { min?: number; max?: number };
  rarity?: string | string[];
  set?: string | string[];
  format?: string | string[];
  artist?: string;
  flavor?: string;
  watermark?: string;
  border?: string;
  frame?: string;
  layout?: string;
  year?: number | { min?: number; max?: number };
  legal?: string;
  banned?: string;
  restricted?: string;
  is?: string[];
  not?: string[];
  game?: string;
  language?: string;
  price?: { min?: number; max?: number; currency?: 'usd' | 'eur' | 'tix' };
  collection?: boolean;
  cube?: string;
  unique?: 'cards' | 'art' | 'prints';
}

// Core search operators
export const SEARCH_OPERATORS = {
  // Comparison operators
  EQUALS: ':',
  NOT_EQUALS: '!=',
  GREATER_THAN: '>',
  GREATER_EQUAL: '>=',
  LESS_THAN: '<',
  LESS_EQUAL: '<=',
  
  // Color operators
  COLOR_EXACT: ':',
  COLOR_SUBSET: '<=',
  COLOR_SUPERSET: '>=',
  COLOR_CONTAINS: '>=',
  
  // Text operators
  CONTAINS: ':',
  REGEX: '/'
} as const;

// Search syntax patterns
export const SEARCH_PATTERNS = {
  // Basic patterns
  QUOTED_STRING: /"([^"]+)"/g,
  WORD: /[a-zA-Z0-9_]+/g,
  NUMBER: /\d+/g,
  
  // Advanced patterns
  MANA_SYMBOL: /\{[^}]+\}/g,
  COLOR_IDENTITY: /id([:<>=!]+)([wubrgc]*)/gi,
  COLOR: /c([:<>=!]+)([wubrgc]*)/gi,
  MANA_VALUE: /(?:mv|cmc)([:<>=!]+)(\d+|\*)/gi,
  POWER: /pow([:<>=!]+)(\d+|\*)/gi,
  TOUGHNESS: /tou([:<>=!]+)(\d+|\*)/gi,
  LOYALTY: /loy([:<>=!]+)(\d+|\*)/gi,
  TYPE: /t:([a-zA-Z]+)/gi,
  ORACLE_TEXT: /o:(.+?)(?:\s|$)/gi,
  RARITY: /r:([a-zA-Z]+)/gi,
  SET: /(?:set|s):([a-zA-Z0-9]+)/gi,
  FORMAT: /(?:format|f):([a-zA-Z]+)/gi,
  LEGAL: /legal:([a-zA-Z]+)/gi,
  BANNED: /banned:([a-zA-Z]+)/gi,
  RESTRICTED: /restricted:([a-zA-Z]+)/gi,
  ARTIST: /a:(.+?)(?:\s|$)/gi,
  FLAVOR: /ft:(.+?)(?:\s|$)/gi,
  IS: /is:([a-zA-Z]+)/gi,
  NOT: /not:([a-zA-Z]+)/gi
} as const;

// Comprehensive search parser
export class SearchSyntaxParser {
  static parse(searchText: string): SearchQuery {
    const query: SearchQuery = {};
    let remainingText = searchText.trim();

    // Extract quoted strings first
    const quotedMatches = searchText.match(SEARCH_PATTERNS.QUOTED_STRING);
    if (quotedMatches) {
      query.text = quotedMatches.map(match => match.slice(1, -1)).join(' ');
      remainingText = searchText.replace(SEARCH_PATTERNS.QUOTED_STRING, '').trim();
    }

    // Parse specific search terms
    this.parseColors(remainingText, query);
    this.parseColorIdentity(remainingText, query);
    this.parseManaValue(remainingText, query);
    this.parsePowerToughness(remainingText, query);
    this.parseLoyalty(remainingText, query);
    this.parseTypes(remainingText, query);
    this.parseOracleText(remainingText, query);
    this.parseRarity(remainingText, query);
    this.parseSet(remainingText, query);
    this.parseFormat(remainingText, query);
    this.parseLegality(remainingText, query);
    this.parseArtist(remainingText, query);
    this.parseFlavor(remainingText, query);
    this.parseIs(remainingText, query);
    this.parseNot(remainingText, query);

    // Extract remaining text as general search
    const processedText = this.removeProcessedTerms(remainingText);
    if (processedText && !query.text) {
      query.text = processedText;
    }

    return query;
  }

  private static parseColors(text: string, query: SearchQuery): void {
    const colorMatches = [...text.matchAll(SEARCH_PATTERNS.COLOR)];
    for (const match of colorMatches) {
      const operator = match[1];
      const colors = match[2].toLowerCase().split('').filter(c => 'wubrg'.includes(c));
      
      query.colors = colors.map(c => c.toUpperCase());
      
      // Set color operator based on syntax
      if (operator === '<=') query.colorOperator = 'subset';
      else if (operator === '>=') query.colorOperator = 'superset';
      else if (operator === '!=') query.colorOperator = 'contains';
      else query.colorOperator = 'exact';
    }
  }

  private static parseColorIdentity(text: string, query: SearchQuery): void {
    const identityMatches = [...text.matchAll(SEARCH_PATTERNS.COLOR_IDENTITY)];
    for (const match of identityMatches) {
      const operator = match[1];
      const colors = match[2].toLowerCase().split('').filter(c => 'wubrg'.includes(c));
      
      query.identity = colors.map(c => c.toUpperCase());
      
      // Set color operator based on syntax
      if (operator === '<=') query.colorOperator = 'subset';
      else if (operator === '>=') query.colorOperator = 'superset';
      else if (operator === '!=') query.colorOperator = 'contains';
      else query.colorOperator = 'exact';
    }
  }

  private static parseManaValue(text: string, query: SearchQuery): void {
    const mvMatches = [...text.matchAll(SEARCH_PATTERNS.MANA_VALUE)];
    for (const match of mvMatches) {
      const operator = match[1];
      const value = match[2];
      
      if (value === '*') {
        query.manaValue = '*';
      } else {
        const numValue = parseInt(value);
        if (operator === '>=') {
          query.manaValue = { min: numValue };
        } else if (operator === '<=') {
          query.manaValue = { max: numValue };
        } else if (operator === '>') {
          query.manaValue = { min: numValue + 1 };
        } else if (operator === '<') {
          query.manaValue = { max: numValue - 1 };
        } else {
          query.manaValue = numValue;
        }
      }
    }
  }

  private static parsePowerToughness(text: string, query: SearchQuery): void {
    const powerMatches = [...text.matchAll(SEARCH_PATTERNS.POWER)];
    for (const match of powerMatches) {
      const operator = match[1];
      const value = match[2];
      
      if (value === '*') {
        query.power = '*';
      } else {
        const numValue = parseInt(value);
        if (operator === '>=') {
          query.power = { min: numValue };
        } else if (operator === '<=') {
          query.power = { max: numValue };
        } else {
          query.power = numValue.toString();
        }
      }
    }

    const toughnessMatches = [...text.matchAll(SEARCH_PATTERNS.TOUGHNESS)];
    for (const match of toughnessMatches) {
      const operator = match[1];
      const value = match[2];
      
      if (value === '*') {
        query.toughness = '*';
      } else {
        const numValue = parseInt(value);
        if (operator === '>=') {
          query.toughness = { min: numValue };
        } else if (operator === '<=') {
          query.toughness = { max: numValue };
        } else {
          query.toughness = numValue.toString();
        }
      }
    }
  }

  private static parseLoyalty(text: string, query: SearchQuery): void {
    const loyaltyMatches = [...text.matchAll(SEARCH_PATTERNS.LOYALTY)];
    for (const match of loyaltyMatches) {
      const operator = match[1];
      const value = match[2];
      
      if (value === '*') {
        query.loyalty = '*';
      } else {
        const numValue = parseInt(value);
        if (operator === '>=') {
          query.loyalty = { min: numValue };
        } else if (operator === '<=') {
          query.loyalty = { max: numValue };
        } else {
          query.loyalty = numValue.toString();
        }
      }
    }
  }

  private static parseTypes(text: string, query: SearchQuery): void {
    const typeMatches = [...text.matchAll(SEARCH_PATTERNS.TYPE)];
    if (typeMatches.length > 0) {
      query.type = typeMatches.map(match => match[1]).join(' ');
    }
  }

  private static parseOracleText(text: string, query: SearchQuery): void {
    const oracleMatches = [...text.matchAll(SEARCH_PATTERNS.ORACLE_TEXT)];
    if (oracleMatches.length > 0) {
      query.oracle = oracleMatches.map(match => match[1]).join(' ');
    }
  }

  private static parseRarity(text: string, query: SearchQuery): void {
    const rarityMatches = [...text.matchAll(SEARCH_PATTERNS.RARITY)];
    if (rarityMatches.length > 0) {
      query.rarity = rarityMatches.map(match => match[1]);
    }
  }

  private static parseSet(text: string, query: SearchQuery): void {
    const setMatches = [...text.matchAll(SEARCH_PATTERNS.SET)];
    if (setMatches.length > 0) {
      query.set = setMatches.map(match => match[1]);
    }
  }

  private static parseFormat(text: string, query: SearchQuery): void {
    const formatMatches = [...text.matchAll(SEARCH_PATTERNS.FORMAT)];
    if (formatMatches.length > 0) {
      query.format = formatMatches.map(match => match[1]);
    }
  }

  private static parseLegality(text: string, query: SearchQuery): void {
    const legalMatches = [...text.matchAll(SEARCH_PATTERNS.LEGAL)];
    if (legalMatches.length > 0) {
      query.legal = legalMatches[0][1];
    }

    const bannedMatches = [...text.matchAll(SEARCH_PATTERNS.BANNED)];
    if (bannedMatches.length > 0) {
      query.banned = bannedMatches[0][1];
    }

    const restrictedMatches = [...text.matchAll(SEARCH_PATTERNS.RESTRICTED)];
    if (restrictedMatches.length > 0) {
      query.restricted = restrictedMatches[0][1];
    }
  }

  private static parseArtist(text: string, query: SearchQuery): void {
    const artistMatches = [...text.matchAll(SEARCH_PATTERNS.ARTIST)];
    if (artistMatches.length > 0) {
      query.artist = artistMatches[0][1].trim();
    }
  }

  private static parseFlavor(text: string, query: SearchQuery): void {
    const flavorMatches = [...text.matchAll(SEARCH_PATTERNS.FLAVOR)];
    if (flavorMatches.length > 0) {
      query.flavor = flavorMatches[0][1].trim();
    }
  }

  private static parseIs(text: string, query: SearchQuery): void {
    const isMatches = [...text.matchAll(SEARCH_PATTERNS.IS)];
    if (isMatches.length > 0) {
      query.is = isMatches.map(match => match[1]);
    }
  }

  private static parseNot(text: string, query: SearchQuery): void {
    const notMatches = [...text.matchAll(SEARCH_PATTERNS.NOT)];
    if (notMatches.length > 0) {
      query.not = notMatches.map(match => match[1]);
    }
  }

  private static removeProcessedTerms(text: string): string {
    return text
      .replace(SEARCH_PATTERNS.COLOR, '')
      .replace(SEARCH_PATTERNS.COLOR_IDENTITY, '')
      .replace(SEARCH_PATTERNS.MANA_VALUE, '')
      .replace(SEARCH_PATTERNS.POWER, '')
      .replace(SEARCH_PATTERNS.TOUGHNESS, '')
      .replace(SEARCH_PATTERNS.LOYALTY, '')
      .replace(SEARCH_PATTERNS.TYPE, '')
      .replace(SEARCH_PATTERNS.ORACLE_TEXT, '')
      .replace(SEARCH_PATTERNS.RARITY, '')
      .replace(SEARCH_PATTERNS.SET, '')
      .replace(SEARCH_PATTERNS.FORMAT, '')
      .replace(SEARCH_PATTERNS.LEGAL, '')
      .replace(SEARCH_PATTERNS.BANNED, '')
      .replace(SEARCH_PATTERNS.RESTRICTED, '')
      .replace(SEARCH_PATTERNS.ARTIST, '')
      .replace(SEARCH_PATTERNS.FLAVOR, '')
      .replace(SEARCH_PATTERNS.IS, '')
      .replace(SEARCH_PATTERNS.NOT, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Convert parsed query to Scryfall API query string
  static toScryfallQuery(query: SearchQuery): string {
    const parts: string[] = [];

    // Basic text search
    if (query.text) {
      parts.push(`"${query.text}"`);
    }

    // Name search
    if (query.name) {
      parts.push(`name:"${query.name}"`);
    }

    // Oracle text search
    if (query.oracle) {
      parts.push(`oracle:"${query.oracle}"`);
    }

    // Type search
    if (query.type) {
      parts.push(`type:"${query.type}"`);
    }

    // Color search
    if (query.colors && query.colors.length > 0) {
      const colorQuery = ColorSearch.buildColorQuery(query.colors, query.colorOperator);
      parts.push(colorQuery);
    }

    // Color identity search
    if (query.identity && query.identity.length > 0) {
      const identityQuery = ColorSearch.buildIdentityQuery(query.identity, query.colorOperator);
      parts.push(identityQuery);
    }

    // Mana value search
    if (query.manaValue !== undefined) {
      if (typeof query.manaValue === 'string') {
        parts.push(`mv:${query.manaValue}`);
      } else if (typeof query.manaValue === 'number') {
        parts.push(`mv:${query.manaValue}`);
      } else if (typeof query.manaValue === 'object') {
        if (query.manaValue.min !== undefined && query.manaValue.max !== undefined) {
          parts.push(`mv>=${query.manaValue.min} mv<=${query.manaValue.max}`);
        } else if (query.manaValue.min !== undefined) {
          parts.push(`mv>=${query.manaValue.min}`);
        } else if (query.manaValue.max !== undefined) {
          parts.push(`mv<=${query.manaValue.max}`);
        }
      }
    }

    // Power/Toughness search
    if (query.power !== undefined) {
      if (typeof query.power === 'string') {
        parts.push(`pow:${query.power}`);
      } else if (typeof query.power === 'object') {
        if (query.power.min !== undefined) parts.push(`pow>=${query.power.min}`);
        if (query.power.max !== undefined) parts.push(`pow<=${query.power.max}`);
      }
    }

    if (query.toughness !== undefined) {
      if (typeof query.toughness === 'string') {
        parts.push(`tou:${query.toughness}`);
      } else if (typeof query.toughness === 'object') {
        if (query.toughness.min !== undefined) parts.push(`tou>=${query.toughness.min}`);
        if (query.toughness.max !== undefined) parts.push(`tou<=${query.toughness.max}`);
      }
    }

    // Loyalty search
    if (query.loyalty !== undefined) {
      if (typeof query.loyalty === 'string') {
        parts.push(`loyalty:${query.loyalty}`);
      } else if (typeof query.loyalty === 'object') {
        if (query.loyalty.min !== undefined) parts.push(`loyalty>=${query.loyalty.min}`);
        if (query.loyalty.max !== undefined) parts.push(`loyalty<=${query.loyalty.max}`);
      }
    }

    // Rarity search
    if (query.rarity) {
      if (Array.isArray(query.rarity)) {
        const rarityQuery = query.rarity.map(r => `rarity:${r}`).join(' OR ');
        parts.push(`(${rarityQuery})`);
      } else {
        parts.push(`rarity:${query.rarity}`);
      }
    }

    // Set search
    if (query.set) {
      if (Array.isArray(query.set)) {
        const setQuery = query.set.map(s => `set:${s}`).join(' OR ');
        parts.push(`(${setQuery})`);
      } else {
        parts.push(`set:${query.set}`);
      }
    }

    // Format legality
    if (query.format) {
      if (Array.isArray(query.format)) {
        const formatQuery = query.format.map(f => `legal:${f}`).join(' OR ');
        parts.push(`(${formatQuery})`);
      } else {
        parts.push(`legal:${query.format}`);
      }
    }

    // Specific legality states
    if (query.legal) parts.push(`legal:${query.legal}`);
    if (query.banned) parts.push(`banned:${query.banned}`);
    if (query.restricted) parts.push(`restricted:${query.restricted}`);

    // Artist search
    if (query.artist) {
      parts.push(`artist:"${query.artist}"`);
    }

    // Flavor text search
    if (query.flavor) {
      parts.push(`flavor:"${query.flavor}"`);
    }

    // Is/Not conditions
    if (query.is && query.is.length > 0) {
      query.is.forEach(condition => parts.push(`is:${condition}`));
    }

    if (query.not && query.not.length > 0) {
      query.not.forEach(condition => parts.push(`not:${condition}`));
    }

    return parts.join(' ');
  }
}

// Quick search helpers for common patterns
export class QuickSearch {
  static creatures(colors?: string[]): string {
    const base = 't:creature';
    return colors ? `${base} ${ColorSearch.buildColorQuery(colors)}` : base;
  }

  static spells(colors?: string[]): string {
    const base = '(t:instant OR t:sorcery)';
    return colors ? `${base} ${ColorSearch.buildColorQuery(colors)}` : base;
  }

  static artifacts(): string {
    return 't:artifact';
  }

  static enchantments(colors?: string[]): string {
    const base = 't:enchantment';
    return colors ? `${base} ${ColorSearch.buildColorQuery(colors)}` : base;
  }

  static planeswalkers(colors?: string[]): string {
    const base = 't:planeswalker';
    return colors ? `${base} ${ColorSearch.buildColorQuery(colors)}` : base;
  }

  static lands(colors?: string[]): string {
    const base = 't:land';
    return colors ? `${base} ${ColorSearch.buildIdentityQuery(colors)}` : base;
  }

  static byFormat(format: string): string {
    return `legal:${format}`;
  }

  static byCMC(cmc: number | { min?: number; max?: number }): string {
    if (typeof cmc === 'number') {
      return `mv:${cmc}`;
    }
    
    const parts: string[] = [];
    if (cmc.min !== undefined) parts.push(`mv>=${cmc.min}`);
    if (cmc.max !== undefined) parts.push(`mv<=${cmc.max}`);
    return parts.join(' ');
  }

  static byRarity(rarity: 'common' | 'uncommon' | 'rare' | 'mythic'): string {
    return `rarity:${rarity}`;
  }

  static expensive(minPrice: number = 10): string {
    return `usd>=${minPrice}`;
  }

  static budget(maxPrice: number = 5): string {
    return `usd<=${maxPrice}`;
  }
}