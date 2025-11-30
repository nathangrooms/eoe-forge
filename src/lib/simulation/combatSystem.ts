import { GameState, GameCard } from './types';

export function declareAttackers(state: GameState, attackers: string[]): void {
  const activePlayer = state[state.activePlayer];
  
  attackers.forEach(instanceId => {
    const creature = activePlayer.battlefield.find(c => c.instanceId === instanceId);
    if (creature && canAttack(creature, state)) {
      creature.isTapped = true;
      state.combat.attackers.push({ instanceId, blockedBy: [] });
      
      state.log.push({
        turn: state.turn,
        phase: state.phase,
        type: 'attack',
        player: state.activePlayer,
        description: `${creature.name} attacks`,
        cardName: creature.name,
        timestamp: Date.now(),
      });
    }
  });
}

export function declareBlockers(state: GameState, blocks: Array<{ blocker: string; attacker: string }>): void {
  const defendingPlayer = state.activePlayer === 'player1' ? state.player2 : state.player1;
  
  blocks.forEach(({ blocker, attacker }) => {
    const blockerCard = defendingPlayer.battlefield.find(c => c.instanceId === blocker);
    const attackerData = state.combat.attackers.find(a => a.instanceId === attacker);
    
    if (blockerCard && attackerData && canBlock(blockerCard, state)) {
      blockerCard.isTapped = true;
      attackerData.blockedBy.push(blocker);
      state.combat.blockers.push({ instanceId: blocker, blocking: attacker });
      
      const attackerCard = state[state.activePlayer].battlefield.find(c => c.instanceId === attacker);
      state.log.push({
        turn: state.turn,
        phase: state.phase,
        type: 'block',
        player: defendingPlayer.id,
        description: `${blockerCard.name} blocks ${attackerCard?.name}`,
        cardName: blockerCard.name,
        timestamp: Date.now(),
      });
    }
  });
}

export function resolveCombatDamage(state: GameState): void {
  const activePlayer = state[state.activePlayer];
  const defendingPlayer = state.activePlayer === 'player1' ? state.player2 : state.player1;

  state.combat.attackers.forEach(attackerData => {
    const attacker = activePlayer.battlefield.find(c => c.instanceId === attackerData.instanceId);
    if (!attacker) return;

    const power = parseInt(attacker.power || '0');

    if (attackerData.blockedBy.length === 0) {
      // Unblocked - deal damage to defending player
      defendingPlayer.life -= power;
      
      // Check for commander damage
      if (attacker.zone === 'command' || attacker.is_legendary) {
        if (!defendingPlayer.commanderDamage[state.activePlayer]) {
          defendingPlayer.commanderDamage[state.activePlayer] = 0;
        }
        defendingPlayer.commanderDamage[state.activePlayer] += power;
      }

      state.log.push({
        turn: state.turn,
        phase: state.phase,
        type: 'damage',
        player: state.activePlayer,
        description: `${attacker.name} deals ${power} damage to ${defendingPlayer.name}`,
        cardName: attacker.name,
        timestamp: Date.now(),
      });
    } else {
      // Blocked - deal damage to blockers
      attackerData.blockedBy.forEach(blockerId => {
        const blocker = defendingPlayer.battlefield.find(c => c.instanceId === blockerId);
        if (!blocker) return;

        const blockerPower = parseInt(blocker.power || '0');
        
        // Damage to blocker
        blocker.damageMarked += power;
        // Damage to attacker
        attacker.damageMarked += blockerPower;

        state.log.push({
          turn: state.turn,
          phase: state.phase,
          type: 'damage',
          player: state.activePlayer,
          description: `${attacker.name} and ${blocker.name} deal damage to each other`,
          cardName: attacker.name,
          timestamp: Date.now(),
        });
      });
    }
  });
}

export function canAttack(creature: GameCard, state: GameState): boolean {
  if (!creature.type_line.includes('Creature')) return false;
  if (creature.isTapped) return false;
  if (creature.summoningSick) return false;
  
  // Check for can't attack conditions (simplified)
  const text = creature.oracle_text?.toLowerCase() || '';
  if (text.includes("can't attack")) return false;

  return true;
}

function canBlock(creature: GameCard, state: GameState): boolean {
  if (!creature.type_line.includes('Creature')) return false;
  if (creature.isTapped) return false;
  
  // Check for can't block conditions (simplified)
  const text = creature.oracle_text?.toLowerCase() || '';
  if (text.includes("can't block")) return false;

  return true;
}

export function calculateCombatOutcome(
  attacker: GameCard,
  blockers: GameCard[]
): { attackerDies: boolean; blockersDie: string[]; damageToPlayer: number } {
  const attackerPower = parseInt(attacker.power || '0');
  const attackerToughness = parseInt(attacker.toughness || '0');
  
  if (blockers.length === 0) {
    return {
      attackerDies: false,
      blockersDie: [],
      damageToPlayer: attackerPower,
    };
  }

  let totalBlockerPower = 0;
  const blockersDie: string[] = [];

  blockers.forEach(blocker => {
    const blockerPower = parseInt(blocker.power || '0');
    const blockerToughness = parseInt(blocker.toughness || '0');
    
    totalBlockerPower += blockerPower;
    
    if (attackerPower >= blockerToughness) {
      blockersDie.push(blocker.instanceId);
    }
  });

  return {
    attackerDies: totalBlockerPower >= attackerToughness,
    blockersDie,
    damageToPlayer: 0,
  };
}
