import { GameState, Phase } from './types';
import { drawCard } from './gameState';
import { checkETBTriggers, checkAttackTriggers, checkDiesTriggers } from './triggerSystem';

const PHASE_ORDER: Phase[] = [
  'untap',
  'upkeep',
  'draw',
  'precombat_main',
  'combat_begin',
  'declare_attackers',
  'declare_blockers',
  'combat_damage',
  'combat_end',
  'postcombat_main',
  'end',
  'cleanup'
];

export function advancePhase(state: GameState): void {
  const currentIndex = PHASE_ORDER.indexOf(state.phase);
  const nextIndex = (currentIndex + 1) % PHASE_ORDER.length;
  
  state.phase = PHASE_ORDER[nextIndex];

  // Log phase change
  state.log.push({
    turn: state.turn,
    phase: state.phase,
    type: 'phase_change',
    player: state.activePlayer,
    description: `${state.phase.replace(/_/g, ' ')} phase begins`,
    timestamp: Date.now(),
  });

  // Handle phase triggers
  handlePhaseActions(state);

  // If we wrapped around to untap, it's a new turn
  if (state.phase === 'untap') {
    state.turn++;
    state.activePlayer = state.activePlayer === 'player1' ? 'player2' : 'player1';
    state.priorityPlayer = state.activePlayer;
  }
}

function handlePhaseActions(state: GameState): void {
  const activePlayer = state[state.activePlayer];

  switch (state.phase) {
    case 'untap':
      // Untap all permanents
      activePlayer.battlefield.forEach(card => {
        card.isTapped = false;
        if (card.type_line.includes('Creature')) {
          card.summoningSick = false;
        }
      });
      break;

    case 'upkeep':
      // Trigger upkeep abilities
      break;

    case 'draw':
      // Skip draw on turn 1 for starting player
      if (state.turn > 0 || state.activePlayer === 'player2') {
        drawCard(state, state.activePlayer);
      }
      break;

    case 'precombat_main':
      // Reset land plays
      activePlayer.landPlaysRemaining = 1;
      activePlayer.hasPlayedLand = false;
      // Check ETB triggers from previous phases
      checkETBTriggers(state);
      break;

    case 'combat_begin':
      state.combat.isActive = true;
      break;

    case 'declare_attackers':
      // After attackers declared, check attack triggers
      if (state.combat.attackers.length > 0) {
        checkAttackTriggers(state);
      }
      break;

    case 'combat_end':
      state.combat.isActive = false;
      state.combat.attackers = [];
      state.combat.blockers = [];
      break;

    case 'cleanup':
      // Empty mana pools
      activePlayer.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
      
      // Remove damage from creatures
      activePlayer.battlefield.forEach(card => {
        if (card.type_line.includes('Creature')) {
          card.damageMarked = 0;
        }
      });
      
      const opponent = state.activePlayer === 'player1' ? state.player2 : state.player1;
      opponent.battlefield.forEach(card => {
        if (card.type_line.includes('Creature')) {
          card.damageMarked = 0;
        }
      });

      // Clear wasPlayedThisTurn flags
      [...activePlayer.battlefield, ...opponent.battlefield].forEach(card => {
        card.wasPlayedThisTurn = false;
      });
      break;
  }
}

export function checkStateBasedActions(state: GameState): void {
  // Check for player death
  if (state.player1.life <= 0) {
    state.gameOver = true;
    state.winner = 'player2';
    state.log.push({
      turn: state.turn,
      phase: state.phase,
      type: 'game_over',
      player: 'player1',
      description: `${state.player2.name} wins! ${state.player1.name} has 0 life`,
      timestamp: Date.now(),
    });
  }
  
  if (state.player2.life <= 0) {
    state.gameOver = true;
    state.winner = 'player1';
    state.log.push({
      turn: state.turn,
      phase: state.phase,
      type: 'game_over',
      player: 'player2',
      description: `${state.player1.name} wins! ${state.player2.name} has 0 life`,
      timestamp: Date.now(),
    });
  }

  // Check for commander damage
  for (const [damagingPlayer, damage] of Object.entries(state.player1.commanderDamage)) {
    if (damage >= 21) {
      state.gameOver = true;
      state.winner = 'player2';
      state.log.push({
        turn: state.turn,
        phase: state.phase,
        type: 'game_over',
        player: 'player1',
        description: `${state.player2.name} wins via commander damage!`,
        timestamp: Date.now(),
      });
    }
  }

  for (const [damagingPlayer, damage] of Object.entries(state.player2.commanderDamage)) {
    if (damage >= 21) {
      state.gameOver = true;
      state.winner = 'player1';
      state.log.push({
        turn: state.turn,
        phase: state.phase,
        type: 'game_over',
        player: 'player2',
        description: `${state.player1.name} wins via commander damage!`,
        timestamp: Date.now(),
      });
    }
  }

  // Check for dead creatures and trigger dies effects
  [state.player1, state.player2].forEach(player => {
    const deadCreatures = player.battlefield.filter(card => {
      if (!card.type_line.includes('Creature')) return false;
      const toughness = parseInt(card.toughness || '0') + card.toughnessModifier;
      return card.damageMarked >= toughness || toughness <= 0;
    });

    deadCreatures.forEach(creature => {
      const index = player.battlefield.findIndex(c => c.instanceId === creature.instanceId);
      if (index !== -1) {
        // Trigger dies effects before moving to graveyard
        checkDiesTriggers(state, creature, player.id);
        
        player.battlefield.splice(index, 1);
        creature.zone = 'graveyard';
        player.graveyard.push(creature);
        
        state.log.push({
          turn: state.turn,
          phase: state.phase,
          type: 'trigger',
          player: player.id,
          description: `${creature.name} dies`,
          cardName: creature.name,
          timestamp: Date.now(),
        });
      }
    });
  });
}
