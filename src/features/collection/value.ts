import { Card, CollectionCard } from '@/types/collection';

// Price calculation utilities
export function priceUSD(card: Card, preferFoil = false): number {
  if (!card.prices) return 0;
  
  const foilPrice = card.prices.usd_foil;
  const regularPrice = card.prices.usd;
  
  if (preferFoil && foilPrice) {
    const price = parseFloat(foilPrice);
    return Number.isFinite(price) ? price : 0;
  }
  
  if (regularPrice) {
    const price = parseFloat(regularPrice);
    return Number.isFinite(price) ? price : 0;
  }
  
  return 0;
}

export function collectionTotals(items: CollectionCard[]): { 
  unique: number; 
  count: number; 
  valueUSD: number;
  avgCmc: number;
} {
  let unique = 0;
  let count = 0;
  let value = 0;
  let totalCmc = 0;
  let cardCount = 0;

  for (const item of items) {
    const totalQty = (item.quantity || 0) + (item.foil || 0);
    
    if (totalQty > 0) {
      unique++;
      count += totalQty;
      
      if (item.card) {
        // Regular copies at regular price
        value += (item.quantity || 0) * priceUSD(item.card, false);
        // Foil copies at foil price (fallback to regular)
        value += (item.foil || 0) * (priceUSD(item.card, true) || priceUSD(item.card, false));
        
        // CMC calculation
        const cmc = item.card.cmc || 0;
        totalCmc += cmc * totalQty;
        cardCount += totalQty;
      }
    }
  }

  return {
    unique,
    count,
    valueUSD: Math.round(value * 100) / 100,
    avgCmc: cardCount > 0 ? Math.round((totalCmc / cardCount) * 100) / 100 : 0
  };
}

export function getTopValueCards(items: CollectionCard[], limit = 10): CollectionCard[] {
  return [...items]
    .filter(item => item.card && ((item.quantity || 0) + (item.foil || 0)) > 0)
    .sort((a, b) => {
      const aValue = (a.quantity || 0) * priceUSD(a.card!, false) + 
                     (a.foil || 0) * (priceUSD(a.card!, true) || priceUSD(a.card!, false));
      const bValue = (b.quantity || 0) * priceUSD(b.card!, false) + 
                     (b.foil || 0) * (priceUSD(b.card!, true) || priceUSD(b.card!, false));
      return bValue - aValue;
    })
    .slice(0, limit);
}

export function getColorDistribution(items: CollectionCard[]): Record<string, number> {
  const distribution: Record<string, number> = {
    W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 // C for colorless
  };

  for (const item of items) {
    if (!item.card) continue;
    
    const totalQty = (item.quantity || 0) + (item.foil || 0);
    if (totalQty === 0) continue;

    if (item.card.colors.length === 0) {
      distribution.C += totalQty;
    } else {
      for (const color of item.card.colors) {
        if (distribution[color] !== undefined) {
          distribution[color] += totalQty;
        }
      }
    }
  }

  return distribution;
}

export function getTypeDistribution(items: CollectionCard[]): Record<string, number> {
  const distribution: Record<string, number> = {};

  for (const item of items) {
    if (!item.card) continue;
    
    const totalQty = (item.quantity || 0) + (item.foil || 0);
    if (totalQty === 0) continue;

    // Extract primary type from type line
    const primaryType = item.card.type_line.split(' —')[0].split(' ')[0];
    distribution[primaryType] = (distribution[primaryType] || 0) + totalQty;
  }

  return distribution;
}

export function formatPrice(price: number): string {
  if (price >= 1000) {
    return `$${(price / 1000).toFixed(1)}k`;
  }
  if (price >= 100) {
    return `$${price.toFixed(0)}`;
  }
  return `$${price.toFixed(2)}`;
}

export function formatCardCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}