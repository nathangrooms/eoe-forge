import { GameState, GameCard } from './types';
import { parseAbilities, shouldTrigger } from './abilityParser';
import { executeAbility } from './abilityExecutor';

/**
 * Track which cards have had their ETB triggers fire
 */
const firedETBs = new Set<string>();

/**
 * Check and execute ETB triggers for cards that just entered the battlefield
 */
export function checkETBTriggers(state: GameState): void {
  [state.player1, state.player2].forEach(player => {
    player.battlefield.forEach(card => {
      // Only fire ETB once per card instance
      if (card.wasPlayedThisTurn && !firedETBs.has(card.instanceId)) {
        const abilities = parseAbilities(card);
        abilities.forEach(ability => {
          if (shouldTrigger(ability, 'enters_battlefield')) {
            executeAbility(state, ability.effect, card, player.id);
            firedETBs.add(card.instanceId);
          }
        });
      }
    });
  });
}

/**
 * Check dies triggers when a creature dies
 */
export function checkDiesTriggers(state: GameState, deadCard: GameCard, controller: 'player1' | 'player2'): void {
  const abilities = parseAbilities(deadCard);
  abilities.forEach(ability => {
    if (shouldTrigger(ability, 'dies')) {
      executeAbility(state, ability.effect, deadCard, controller);
    }
  });
}

/**
 * Check attack triggers when creatures attack
 */
export function checkAttackTriggers(state: GameState): void {
  state.combat.attackers.forEach(attacker => {
    const card = state[state.activePlayer].battlefield.find(c => c.instanceId === attacker.instanceId);
    if (card) {
      const abilities = parseAbilities(card);
      abilities.forEach(ability => {
        if (shouldTrigger(ability, 'attacks')) {
          executeAbility(state, ability.effect, card, state.activePlayer);
        }
      });
    }
  });
}

/**
 * Check cast triggers when a spell is cast
 */
export function checkCastTriggers(state: GameState, card: GameCard, controller: 'player1' | 'player2'): void {
  const abilities = parseAbilities(card);
  abilities.forEach(ability => {
    if (shouldTrigger(ability, 'cast')) {
      executeAbility(state, ability.effect, card, controller);
    }
  });
}

/**
 * Clear ETB tracking when game restarts
 */
export function clearTriggerTracking(): void {
  firedETBs.clear();
}
