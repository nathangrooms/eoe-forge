import { CollectionCard } from '@/types/collection';

export interface CollectionStats {
  totalCards: number;
  uniqueCards: number;
  totalValue: number;
  averageValue: number;
  colorDistribution: Record<string, number>;
  rarityDistribution: Record<string, number>;
  typeDistribution: Record<string, number>;
  setDistribution: Record<string, number>;
  conditionDistribution: Record<string, number>;
  foilCount: number;
  foilValue: number;
}

/**
 * Calculates comprehensive collection statistics
 * Fixes bugs in total/unique card counting and value calculations
 */
export class CollectionStatsCalculator {
  /**
   * Calculate all collection statistics
   */
  static calculate(cards: CollectionCard[]): CollectionStats {
    // Total cards = sum of all quantities
    const totalCards = cards.reduce((sum, card) => sum + card.quantity, 0);
    
    // Unique cards = count of distinct cards
    const uniqueCards = cards.length;
    
    // Value calculations
    const totalValue = this.calculateTotalValue(cards);
    const averageValue = uniqueCards > 0 ? totalValue / totalCards : 0;
    
    // Distribution calculations
    const colorDistribution = this.calculateColorDistribution(cards);
    const rarityDistribution = this.calculateRarityDistribution(cards);
    const typeDistribution = this.calculateTypeDistribution(cards);
    const setDistribution = this.calculateSetDistribution(cards);
    const conditionDistribution = this.calculateConditionDistribution(cards);
    
    // Foil statistics
    const foilCount = cards.reduce((sum, card) => sum + (card.foil || 0), 0);
    const foilValue = this.calculateFoilValue(cards);

    return {
      totalCards,
      uniqueCards,
      totalValue,
      averageValue,
      colorDistribution,
      rarityDistribution,
      typeDistribution,
      setDistribution,
      conditionDistribution,
      foilCount,
      foilValue
    };
  }

  /**
   * Calculate total collection value
   */
  private static calculateTotalValue(cards: CollectionCard[]): number {
    return cards.reduce((sum, card) => {
      const price = card.price_usd || 0;
      return sum + (price * card.quantity);
    }, 0);
  }

  /**
   * Calculate value of foil cards only
   */
  private static calculateFoilValue(cards: CollectionCard[]): number {
    return cards.reduce((sum, card) => {
      if (!card.foil) return sum;
      const price = card.price_usd || 0;
      return sum + (price * card.foil);
    }, 0);
  }

  /**
   * Calculate color distribution across collection
   */
  private static calculateColorDistribution(cards: CollectionCard[]): Record<string, number> {
    const distribution: Record<string, number> = {
      W: 0,
      U: 0,
      B: 0,
      R: 0,
      G: 0,
      C: 0, // Colorless
      M: 0  // Multicolor
    };

    cards.forEach(collectionCard => {
      const colors = collectionCard.card?.color_identity || [];
      
      if (colors.length === 0) {
        distribution.C += collectionCard.quantity;
      } else if (colors.length === 1) {
        const color = colors[0];
        if (distribution[color] !== undefined) {
          distribution[color] += collectionCard.quantity;
        }
      } else {
        distribution.M += collectionCard.quantity;
      }
    });

    return distribution;
  }

  /**
   * Calculate rarity distribution
   */
  private static calculateRarityDistribution(cards: CollectionCard[]): Record<string, number> {
    const distribution: Record<string, number> = {
      common: 0,
      uncommon: 0,
      rare: 0,
      mythic: 0
    };

    cards.forEach(collectionCard => {
      const rarity = collectionCard.card?.rarity?.toLowerCase() || 'common';
      if (distribution[rarity] !== undefined) {
        distribution[rarity] += collectionCard.quantity;
      }
    });

    return distribution;
  }

  /**
   * Calculate type distribution
   */
  private static calculateTypeDistribution(cards: CollectionCard[]): Record<string, number> {
    const distribution: Record<string, number> = {
      creature: 0,
      instant: 0,
      sorcery: 0,
      enchantment: 0,
      artifact: 0,
      planeswalker: 0,
      land: 0,
      battle: 0,
      other: 0
    };

    cards.forEach(collectionCard => {
      const typeLine = collectionCard.card?.type_line?.toLowerCase() || '';
      
      if (typeLine.includes('creature')) {
        distribution.creature += collectionCard.quantity;
      } else if (typeLine.includes('instant')) {
        distribution.instant += collectionCard.quantity;
      } else if (typeLine.includes('sorcery')) {
        distribution.sorcery += collectionCard.quantity;
      } else if (typeLine.includes('enchantment')) {
        distribution.enchantment += collectionCard.quantity;
      } else if (typeLine.includes('artifact')) {
        distribution.artifact += collectionCard.quantity;
      } else if (typeLine.includes('planeswalker')) {
        distribution.planeswalker += collectionCard.quantity;
      } else if (typeLine.includes('land')) {
        distribution.land += collectionCard.quantity;
      } else if (typeLine.includes('battle')) {
        distribution.battle += collectionCard.quantity;
      } else {
        distribution.other += collectionCard.quantity;
      }
    });

    return distribution;
  }

  /**
   * Calculate set distribution
   */
  private static calculateSetDistribution(cards: CollectionCard[]): Record<string, number> {
    const distribution: Record<string, number> = {};

    cards.forEach(card => {
      const setCode = card.set_code || 'unknown';
      distribution[setCode] = (distribution[setCode] || 0) + card.quantity;
    });

    return distribution;
  }

  /**
   * Calculate condition distribution
   */
  private static calculateConditionDistribution(cards: CollectionCard[]): Record<string, number> {
    const distribution: Record<string, number> = {
      mint: 0,
      near_mint: 0,
      excellent: 0,
      good: 0,
      light_played: 0,
      played: 0,
      poor: 0
    };

    cards.forEach(card => {
      const condition = card.condition || 'near_mint';
      if (distribution[condition] !== undefined) {
        distribution[condition] += card.quantity;
      }
    });

    return distribution;
  }

  /**
   * Get top N most valuable cards
   */
  static getTopValueCards(cards: CollectionCard[], limit: number = 10): CollectionCard[] {
    return [...cards]
      .sort((a, b) => {
        const valueA = (a.price_usd || 0) * a.quantity;
        const valueB = (b.price_usd || 0) * b.quantity;
        return valueB - valueA;
      })
      .slice(0, limit);
  }

  /**
   * Get cards by color
   */
  static getCardsByColor(cards: CollectionCard[], color: string): CollectionCard[] {
    return cards.filter(collectionCard => {
      const colors = collectionCard.card?.color_identity || [];
      return colors.includes(color);
    });
  }

  /**
   * Get multicolor cards
   */
  static getMulticolorCards(cards: CollectionCard[]): CollectionCard[] {
    return cards.filter(collectionCard => {
      const colors = collectionCard.card?.color_identity || [];
      return colors.length > 1;
    });
  }
}
