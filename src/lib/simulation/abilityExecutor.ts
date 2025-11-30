import { GameState, GameCard } from './types';
import { AbilityEffect } from './abilityParser';
import { createToken, COMMON_TOKENS } from './tokenGenerator';
import { drawCard } from './gameState';

/**
 * Execute an ability effect on the game state
 */
export function executeAbility(
  state: GameState,
  effect: AbilityEffect,
  source: GameCard,
  controller: 'player1' | 'player2'
): void {
  const player = state[controller];
  const opponent = controller === 'player1' ? state.player2 : state.player1;

  switch (effect.type) {
    case 'create_tokens': {
      const tokenDef = COMMON_TOKENS[effect.tokenType];
      if (!tokenDef) {
        console.warn(`Unknown token type: ${effect.tokenType}`);
        return;
      }

      for (let i = 0; i < effect.count; i++) {
        const token = createToken(tokenDef, controller, `${source.instanceId}-${Date.now()}-${i}`);
        player.battlefield.push(token);
        
        state.log.push({
          turn: state.turn,
          phase: state.phase,
          type: 'trigger',
          player: controller,
          description: `${source.name} creates a ${tokenDef.name}`,
          cardName: source.name,
          timestamp: Date.now(),
        });
      }
      break;
    }

    case 'destroy_target': {
      // Simple AI: destroy random opponent creature matching type
      const validTargets = opponent.battlefield.filter(c => 
        c.type_line.toLowerCase().includes(effect.targetType) ||
        effect.targetType === 'permanent'
      );
      
      if (validTargets.length > 0) {
        const target = validTargets[Math.floor(Math.random() * validTargets.length)];
        const index = opponent.battlefield.findIndex(c => c.instanceId === target.instanceId);
        if (index !== -1) {
          opponent.battlefield.splice(index, 1);
          target.zone = 'graveyard';
          opponent.graveyard.push(target);
          
          state.log.push({
            turn: state.turn,
            phase: state.phase,
            type: 'trigger',
            player: controller,
            description: `${source.name} destroys ${target.name}`,
            cardName: source.name,
            timestamp: Date.now(),
          });
        }
      }
      break;
    }

    case 'exile_target': {
      const validTargets = opponent.battlefield.filter(c => 
        c.type_line.toLowerCase().includes(effect.targetType) ||
        effect.targetType === 'permanent'
      );
      
      if (validTargets.length > 0) {
        const target = validTargets[Math.floor(Math.random() * validTargets.length)];
        const index = opponent.battlefield.findIndex(c => c.instanceId === target.instanceId);
        if (index !== -1) {
          opponent.battlefield.splice(index, 1);
          target.zone = 'exile';
          opponent.exile.push(target);
          
          state.log.push({
            turn: state.turn,
            phase: state.phase,
            type: 'trigger',
            player: controller,
            description: `${source.name} exiles ${target.name}`,
            cardName: source.name,
            timestamp: Date.now(),
          });
        }
      }
      break;
    }

    case 'draw_cards': {
      for (let i = 0; i < effect.count; i++) {
        drawCard(state, controller);
      }
      break;
    }

    case 'deal_damage': {
      if (effect.targetType === 'player' || effect.targetType === 'any') {
        opponent.life -= effect.amount;
        state.log.push({
          turn: state.turn,
          phase: state.phase,
          type: 'trigger',
          player: controller,
          description: `${source.name} deals ${effect.amount} damage to ${opponent.name}`,
          cardName: source.name,
          timestamp: Date.now(),
        });
      } else {
        // Target creature
        const creatures = opponent.battlefield.filter(c => c.type_line.includes('Creature'));
        if (creatures.length > 0) {
          const target = creatures[Math.floor(Math.random() * creatures.length)];
          target.damageMarked += effect.amount;
          
          state.log.push({
            turn: state.turn,
            phase: state.phase,
            type: 'trigger',
            player: controller,
            description: `${source.name} deals ${effect.amount} damage to ${target.name}`,
            cardName: source.name,
            timestamp: Date.now(),
          });
        }
      }
      break;
    }

    case 'gain_life': {
      player.life += effect.amount;
      state.log.push({
        turn: state.turn,
        phase: state.phase,
        type: 'trigger',
        player: controller,
        description: `${player.name} gains ${effect.amount} life`,
        cardName: source.name,
        timestamp: Date.now(),
      });
      break;
    }

    case 'add_counters': {
      const target = effect.targetType === 'self' ? source : null;
      if (target) {
        const counterType = effect.counterType;
        target.counters[counterType] = (target.counters[counterType] || 0) + effect.count;
        
        // Apply P/T modifiers if +1/+1 counters
        if (counterType === '+1/+1') {
          target.powerModifier += effect.count;
          target.toughnessModifier += effect.count;
        }
        
        state.log.push({
          turn: state.turn,
          phase: state.phase,
          type: 'trigger',
          player: controller,
          description: `${source.name} gets ${effect.count} ${counterType} counter(s)`,
          cardName: source.name,
          timestamp: Date.now(),
        });
      }
      break;
    }

    case 'ramp': {
      // Search for basic lands and put them onto battlefield tapped
      const basicLands = player.library.filter(c => 
        c.type_line.includes('Land') && 
        c.type_line.includes('Basic')
      );
      
      const count = Math.min(effect.landCount, basicLands.length);
      for (let i = 0; i < count; i++) {
        const land = basicLands[i];
        const index = player.library.findIndex(c => c.instanceId === land.instanceId);
        if (index !== -1) {
          player.library.splice(index, 1);
          land.zone = 'battlefield';
          land.isTapped = true;
          player.battlefield.push(land);
        }
      }
      
      if (count > 0) {
        state.log.push({
          turn: state.turn,
          phase: state.phase,
          type: 'trigger',
          player: controller,
          description: `${source.name} searches for ${count} land(s)`,
          cardName: source.name,
          timestamp: Date.now(),
        });
      }
      break;
    }
  }
}
