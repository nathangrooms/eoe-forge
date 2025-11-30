import { GameCard, GameState } from './types';

export interface CardAbility {
  type: 'etb' | 'activated' | 'triggered' | 'static' | 'mana';
  cost?: string;
  effect: string;
  condition?: string;
}

export function parseCardAbilities(card: GameCard): CardAbility[] {
  const abilities: CardAbility[] = [];
  const text = card.oracle_text?.toLowerCase() || '';

  // ETB effects
  if (text.includes('when') && text.includes('enters the battlefield')) {
    abilities.push({
      type: 'etb',
      effect: card.oracle_text || '',
    });
  }

  // Mana abilities (for lands and mana rocks)
  if (text.includes('add') && (text.includes('mana') || text.match(/\{[wubrgc]\}/))) {
    abilities.push({
      type: 'mana',
      effect: card.oracle_text || '',
    });
  }

  // Activated abilities (colon syntax)
  const activatedMatches = text.match(/([^:]+):\s*([^.]+)/g);
  if (activatedMatches) {
    activatedMatches.forEach(match => {
      const [cost, effect] = match.split(':').map(s => s.trim());
      abilities.push({
        type: 'activated',
        cost,
        effect,
      });
    });
  }

  return abilities;
}

export function canCastSpell(card: GameCard, state: GameState): boolean {
  const player = state[card.controller];
  const phase = state.phase;

  // Check if it's the right time to cast
  if (card.type_line.includes('Instant')) {
    return true; // Can cast anytime with priority
  }

  if (card.type_line.includes('Sorcery') || 
      card.type_line.includes('Creature') ||
      card.type_line.includes('Enchantment') ||
      card.type_line.includes('Artifact') ||
      card.type_line.includes('Planeswalker')) {
    // Can only cast during main phase with empty stack
    return (phase === 'precombat_main' || phase === 'postcombat_main') && 
           state.stack.length === 0 &&
           state.activePlayer === card.controller;
  }

  return false;
}

export function canPlayLand(card: GameCard, state: GameState): boolean {
  const player = state[card.controller];
  return card.type_line.includes('Land') &&
         state.activePlayer === card.controller &&
         (state.phase === 'precombat_main' || state.phase === 'postcombat_main') &&
         state.stack.length === 0 &&
         player.landPlaysRemaining > 0;
}

export function calculateManaCost(card: GameCard): Record<string, number> {
  const cost: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0 };
  
  if (!card.mana_cost) return cost;

  const costString = card.mana_cost.replace(/[{}]/g, '');
  
  // Parse specific colors
  cost.W = (costString.match(/W/g) || []).length;
  cost.U = (costString.match(/U/g) || []).length;
  cost.B = (costString.match(/B/g) || []).length;
  cost.R = (costString.match(/R/g) || []).length;
  cost.G = (costString.match(/G/g) || []).length;

  // Parse generic/colorless
  const genericMatches = costString.match(/\d+/g);
  if (genericMatches) {
    cost.generic = genericMatches.reduce((sum, num) => sum + parseInt(num), 0);
  }

  return cost;
}

export function canAffordSpell(card: GameCard, state: GameState): boolean {
  const player = state[card.controller];
  const cost = calculateManaCost(card);

  // Check colored mana requirements
  for (const [color, amount] of Object.entries(cost)) {
    if (color !== 'generic' && player.manaPool[color] < amount) {
      return false;
    }
  }

  // Check if generic can be paid with remaining mana
  const totalAvailable = Object.values(player.manaPool).reduce((sum, val) => sum + val, 0);
  const coloredSpent = Object.entries(cost)
    .filter(([color]) => color !== 'generic')
    .reduce((sum, [, amount]) => sum + amount, 0);
  
  return totalAvailable - coloredSpent >= cost.generic;
}

export function produceMana(card: GameCard, state: GameState): void {
  const player = state[card.controller];
  const text = card.oracle_text?.toLowerCase() || '';

  // Basic lands
  if (card.type_line.includes('Plains')) player.manaPool.W++;
  else if (card.type_line.includes('Island')) player.manaPool.U++;
  else if (card.type_line.includes('Swamp')) player.manaPool.B++;
  else if (card.type_line.includes('Mountain')) player.manaPool.R++;
  else if (card.type_line.includes('Forest')) player.manaPool.G++;
  
  // Any color mana
  else if (text.includes('add one mana of any color')) {
    // For simulation, add the first color in identity
    const colors = card.color_identity;
    if (colors && colors.length > 0) {
      const colorMap: Record<string, keyof typeof player.manaPool> = {
        W: 'W', U: 'U', B: 'B', R: 'R', G: 'G'
      };
      player.manaPool[colorMap[colors[0]]]++;
    } else {
      player.manaPool.C++;
    }
  }
}
