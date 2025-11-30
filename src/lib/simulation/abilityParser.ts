import { GameCard } from './types';

export type AbilityType = 
  | 'etb' // enters the battlefield
  | 'dies' // when this dies
  | 'attack' // when this attacks
  | 'cast' // when you cast this
  | 'activated' // activated ability
  | 'static'; // static ability

export interface ParsedAbility {
  type: AbilityType;
  trigger?: string;
  effect: AbilityEffect;
  condition?: string;
}

export type AbilityEffect =
  | { type: 'create_tokens'; tokenType: string; count: number }
  | { type: 'destroy_target'; targetType: string }
  | { type: 'exile_target'; targetType: string }
  | { type: 'draw_cards'; count: number }
  | { type: 'deal_damage'; amount: number; targetType: string }
  | { type: 'gain_life'; amount: number }
  | { type: 'add_counters'; counterType: string; count: number; targetType?: string }
  | { type: 'tap_untap'; action: 'tap' | 'untap'; targetType: string }
  | { type: 'ramp'; landCount: number }
  | { type: 'tutor'; cardType: string };

/**
 * Parse abilities from card oracle text
 * Returns array of executable abilities
 */
export function parseAbilities(card: GameCard): ParsedAbility[] {
  const abilities: ParsedAbility[] = [];
  const text = card.oracle_text || '';
  
  if (!text) return abilities;

  const lowercaseText = text.toLowerCase();

  // ETB triggers: "When [this] enters the battlefield"
  if (lowercaseText.includes('enters the battlefield') || lowercaseText.includes('enters,')) {
    const effect = extractEffect(text);
    if (effect) {
      abilities.push({
        type: 'etb',
        trigger: 'enters_battlefield',
        effect,
      });
    }
  }

  // Dies triggers: "When [this] dies"
  if (lowercaseText.includes('when') && (lowercaseText.includes('dies') || lowercaseText.includes('is put into'))) {
    const effect = extractEffect(text);
    if (effect) {
      abilities.push({
        type: 'dies',
        trigger: 'dies',
        effect,
      });
    }
  }

  // Attack triggers: "Whenever [this] attacks"
  if (lowercaseText.includes('attacks') && (lowercaseText.includes('whenever') || lowercaseText.includes('when'))) {
    const effect = extractEffect(text);
    if (effect) {
      abilities.push({
        type: 'attack',
        trigger: 'attacks',
        effect,
      });
    }
  }

  // Cast triggers: "When you cast [this]"
  if (lowercaseText.includes('when you cast')) {
    const effect = extractEffect(text);
    if (effect) {
      abilities.push({
        type: 'cast',
        trigger: 'cast',
        effect,
      });
    }
  }

  return abilities;
}

/**
 * Extract the effect from ability text
 */
function extractEffect(text: string): AbilityEffect | null {
  const lowercase = text.toLowerCase();

  // Token creation
  if (lowercase.includes('create')) {
    const match = lowercase.match(/create (?:(\d+|a|an|one|two|three)) (\w+)(?: creature)? tokens?/);
    if (match) {
      const countStr = match[1];
      let count = 1;
      if (countStr === 'two') count = 2;
      else if (countStr === 'three') count = 3;
      else if (/^\d+$/.test(countStr)) count = parseInt(countStr);
      
      return {
        type: 'create_tokens',
        tokenType: match[2].replace(/s$/, ''),
        count,
      };
    }
  }

  // Destroy
  if (lowercase.includes('destroy target')) {
    const match = lowercase.match(/destroy target (\w+)/);
    if (match) {
      return {
        type: 'destroy_target',
        targetType: match[1],
      };
    }
  }

  // Exile
  if (lowercase.includes('exile target') || lowercase.includes('exile another')) {
    const match = lowercase.match(/exile (?:target |another )?(\w+)/);
    if (match) {
      return {
        type: 'exile_target',
        targetType: match[1],
      };
    }
  }

  // Draw cards
  if (lowercase.includes('draw') && lowercase.includes('card')) {
    const match = lowercase.match(/draw (?:(\d+|a|an|one|two|three)) cards?/);
    if (match) {
      const countStr = match[1];
      let count = 1;
      if (countStr === 'two') count = 2;
      else if (countStr === 'three') count = 3;
      else if (/^\d+$/.test(countStr)) count = parseInt(countStr);
      
      return {
        type: 'draw_cards',
        count,
      };
    }
  }

  // Deal damage
  if (lowercase.includes('deal') && lowercase.includes('damage')) {
    const match = lowercase.match(/deals? (\d+) damage to (?:any target|target (\w+))/);
    if (match) {
      return {
        type: 'deal_damage',
        amount: parseInt(match[1]),
        targetType: match[2] || 'any',
      };
    }
  }

  // Gain life
  if (lowercase.includes('gain') && lowercase.includes('life')) {
    const match = lowercase.match(/(?:you )?gains? (\d+) life/);
    if (match) {
      return {
        type: 'gain_life',
        amount: parseInt(match[1]),
      };
    }
  }

  // Add counters
  if (lowercase.includes('counter') && (lowercase.includes('put') || lowercase.includes('add'))) {
    const match = lowercase.match(/put (?:(\d+|a|an|one|two|three)) \+1\/\+1 counters?/);
    if (match) {
      const countStr = match[1];
      let count = 1;
      if (countStr === 'two') count = 2;
      else if (countStr === 'three') count = 3;
      else if (/^\d+$/.test(countStr)) count = parseInt(countStr);
      
      return {
        type: 'add_counters',
        counterType: '+1/+1',
        count,
        targetType: 'self',
      };
    }
  }

  // Search library (ramp)
  if (lowercase.includes('search your library for') && lowercase.includes('land')) {
    const match = lowercase.match(/search (?:your library )?for (?:up to )?(\d+|a|an|one|two|three)/);
    const countStr = match?.[1];
    let count = 1;
    if (countStr === 'two') count = 2;
    else if (countStr === 'three') count = 3;
    else if (countStr && /^\d+$/.test(countStr)) count = parseInt(countStr);
    
    return {
      type: 'ramp',
      landCount: count,
    };
  }

  return null;
}

/**
 * Check if an ability should trigger based on game event
 */
export function shouldTrigger(ability: ParsedAbility, event: string): boolean {
  return ability.trigger === event;
}
