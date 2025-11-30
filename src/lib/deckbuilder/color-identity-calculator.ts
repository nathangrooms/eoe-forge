import { Card } from '@/lib/deckbuilder/types';

/**
 * Calculate the color identity of a deck based on all cards
 * Color identity includes colors from mana costs, color indicators, 
 * and characteristic-defining abilities
 */
export function calculateDeckColorIdentity(cards: Card[]): string[] {
  const colorSet = new Set<string>();

  for (const card of cards) {
    // Use color_identity from card data (most reliable)
    if (card.color_identity && Array.isArray(card.color_identity)) {
      card.color_identity.forEach(color => colorSet.add(color));
      continue;
    }

    // Fallback: parse mana cost if color_identity not available
    if (card.mana_cost) {
      const manaCost = card.mana_cost;
      if (manaCost.includes('W')) colorSet.add('W');
      if (manaCost.includes('U')) colorSet.add('U');
      if (manaCost.includes('B')) colorSet.add('B');
      if (manaCost.includes('R')) colorSet.add('R');
      if (manaCost.includes('G')) colorSet.add('G');
    }

    // Include colors field as backup
    if (card.colors && Array.isArray(card.colors)) {
      card.colors.forEach(color => colorSet.add(color));
    }
  }

  // Return sorted array in WUBRG order
  const wubrgOrder = ['W', 'U', 'B', 'R', 'G'];
  return Array.from(colorSet).sort((a, b) => 
    wubrgOrder.indexOf(a) - wubrgOrder.indexOf(b)
  );
}

/**
 * Validate that all cards in deck match commander's color identity
 */
export function validateColorIdentity(
  cards: Card[],
  commanderIdentity: string[]
): { valid: boolean; violations: Array<{ card: string; colors: string[] }> } {
  const violations: Array<{ card: string; colors: string[] }> = [];
  const commanderSet = new Set(commanderIdentity);

  for (const card of cards) {
    const cardIdentity = card.color_identity || card.colors || [];
    const hasViolation = cardIdentity.some(color => !commanderSet.has(color));
    
    if (hasViolation) {
      violations.push({
        card: card.name,
        colors: cardIdentity
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations
  };
}

/**
 * Check if a card can be added to a deck with given color identity
 */
export function canAddCard(card: Card, deckIdentity: string[]): boolean {
  const cardIdentity = card.color_identity || card.colors || [];
  const deckSet = new Set(deckIdentity);
  
  return cardIdentity.every(color => deckSet.has(color));
}
