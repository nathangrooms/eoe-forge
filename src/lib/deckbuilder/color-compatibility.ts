import { Card } from './types';

export interface ColorCompatibilityResult {
  isCompatible: boolean;
  violations: ColorViolation[];
  commanderIdentity: string[];
  deckColors: string[];
}

export interface ColorViolation {
  cardName: string;
  cardId: string;
  cardColors: string[];
  invalidColors: string[];
  reason: string;
}

/**
 * Check if a card's color identity is compatible with the commander's color identity
 */
export function checkColorIdentityCompatibility(
  cardColorIdentity: string[],
  commanderColorIdentity: string[]
): { compatible: boolean; invalidColors: string[] } {
  const invalidColors = cardColorIdentity.filter(
    color => !commanderColorIdentity.includes(color)
  );
  
  return {
    compatible: invalidColors.length === 0,
    invalidColors
  };
}

/**
 * Check entire deck for color identity violations against commander
 */
export function checkDeckColorCompatibility(
  deck: Card[],
  commander?: Card,
  format: string = 'commander'
): ColorCompatibilityResult {
  // Only relevant for Commander format
  if (format !== 'commander' || !commander) {
    return {
      isCompatible: true,
      violations: [],
      commanderIdentity: [],
      deckColors: []
    };
  }

  const commanderIdentity = commander.color_identity || [];
  const violations: ColorViolation[] = [];
  const deckColorSet = new Set<string>();

  // Check each card in the deck
  deck.forEach(card => {
    const cardIdentity = card.color_identity || [];
    
    // Track all colors in deck
    cardIdentity.forEach(color => deckColorSet.add(color));

    // Check for violations
    const { compatible, invalidColors } = checkColorIdentityCompatibility(
      cardIdentity,
      commanderIdentity
    );

    if (!compatible) {
      violations.push({
        cardName: card.name,
        cardId: card.id,
        cardColors: cardIdentity,
        invalidColors,
        reason: `Card has ${invalidColors.join(', ')} in its identity, which is not in commander's identity (${commanderIdentity.join(', ')})`
      });
    }
  });

  return {
    isCompatible: violations.length === 0,
    violations,
    commanderIdentity,
    deckColors: Array.from(deckColorSet).sort()
  };
}

/**
 * Check if adding a card would violate color identity
 */
export function canAddCardToDeck(
  card: Card,
  commander?: Card,
  format: string = 'commander'
): { canAdd: boolean; reason?: string } {
  if (format !== 'commander' || !commander) {
    return { canAdd: true };
  }

  const commanderIdentity = commander.color_identity || [];
  const cardIdentity = card.color_identity || [];

  const { compatible, invalidColors } = checkColorIdentityCompatibility(
    cardIdentity,
    commanderIdentity
  );

  if (!compatible) {
    return {
      canAdd: false,
      reason: `${card.name} has ${invalidColors.join(', ')} in its color identity, which is not in your commander's identity`
    };
  }

  return { canAdd: true };
}

/**
 * Get color name from single-letter code
 */
export function getColorName(colorCode: string): string {
  const colorNames: Record<string, string> = {
    W: 'White',
    U: 'Blue',
    B: 'Black',
    R: 'Red',
    G: 'Green',
    C: 'Colorless'
  };
  
  return colorNames[colorCode] || colorCode;
}

/**
 * Get display text for color identity
 */
export function formatColorIdentity(colors: string[]): string {
  if (!colors || colors.length === 0) return 'Colorless';
  return colors.map(getColorName).join(', ');
}

/**
 * Calculate deck's actual color usage (not identity)
 */
export function calculateDeckColorDistribution(deck: Card[]): Record<string, number> {
  const distribution: Record<string, number> = {
    W: 0,
    U: 0,
    B: 0,
    R: 0,
    G: 0,
    C: 0
  };

  deck.forEach(card => {
    const colors = card.colors || [];
    if (colors.length === 0) {
      distribution.C += 1;
    } else {
      colors.forEach(color => {
        if (distribution[color] !== undefined) {
          distribution[color] += 1;
        }
      });
    }
  });

  return distribution;
}
