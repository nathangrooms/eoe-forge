import { GameState, AIDecision, GameCard, Player } from './types';
import { canPlayLand, canCastSpell, canAffordSpell, produceMana, calculateManaCost } from './cardInterpreter';
import { canAttack } from './combatSystem';

export class AIPlayer {
  makeDecision(state: GameState, playerId: 'player1' | 'player2'): AIDecision | null {
    const player = state[playerId];
    const opponent = playerId === 'player1' ? state.player2 : state.player1;
    const phase = state.phase;

    // Main phase decisions
    if ((phase === 'precombat_main' || phase === 'postcombat_main') && state.activePlayer === playerId) {
      // Priority 1: Play land if available
      const landDecision = this.evaluateLandPlay(player, state);
      if (landDecision) return landDecision;

      // Priority 2: Cast ramp spells early
      const rampDecision = this.evaluateRampSpells(player, state);
      if (rampDecision) return rampDecision;

      // Priority 3: Cast creatures
      const creatureDecision = this.evaluateCreatureSpells(player, state);
      if (creatureDecision) return creatureDecision;

      // Priority 4: Cast other spells
      const spellDecision = this.evaluateOtherSpells(player, state);
      if (spellDecision) return spellDecision;
    }

    // Combat phase - declare attackers
    if (phase === 'declare_attackers' && state.activePlayer === playerId) {
      return this.evaluateAttacks(player, opponent, state);
    }

    // Combat phase - declare blockers
    if (phase === 'declare_blockers' && state.activePlayer !== playerId) {
      return this.evaluateBlocks(player, opponent, state);
    }

    // Default: pass priority
    return { type: 'pass', priority: 0 };
  }

  private evaluateLandPlay(player: Player, state: GameState): AIDecision | null {
    const lands = player.hand.filter(card => canPlayLand(card, state));
    
    if (lands.length === 0 || player.landPlaysRemaining === 0) return null;

    // Prioritize lands that produce colors we need
    const bestLand = this.selectBestLand(lands, player);
    if (bestLand) {
      return {
        type: 'play_land',
        cardInstanceId: bestLand.instanceId,
        priority: 100,
      };
    }

    return null;
  }

  private evaluateRampSpells(player: Player, state: GameState): AIDecision | null {
    const rampSpells = player.hand.filter(card => {
      if (!canCastSpell(card, state)) return false;
      const text = card.oracle_text?.toLowerCase() || '';
      return text.includes('search') && text.includes('land') ||
             text.includes('add') && text.includes('mana') ||
             (card.type_line.includes('Artifact') && text.includes('mana'));
    });

    for (const spell of rampSpells) {
      if (this.canAffordAndWorthCasting(spell, player, state)) {
        return {
          type: 'cast_spell',
          cardInstanceId: spell.instanceId,
          priority: 90,
        };
      }
    }

    return null;
  }

  private evaluateCreatureSpells(player: Player, state: GameState): AIDecision | null {
    const creatures = player.hand.filter(card => 
      card.type_line.includes('Creature') && canCastSpell(card, state)
    );

    // Sort by CMC (play cheaper first, but prioritize impactful cards)
    const sorted = creatures.sort((a, b) => {
      const impactA = this.evaluateCreatureImpact(a);
      const impactB = this.evaluateCreatureImpact(b);
      if (Math.abs(impactA - impactB) > 2) return impactB - impactA;
      return a.cmc - b.cmc;
    });

    for (const creature of sorted) {
      if (this.canAffordAndWorthCasting(creature, player, state)) {
        return {
          type: 'cast_spell',
          cardInstanceId: creature.instanceId,
          priority: 70,
        };
      }
    }

    return null;
  }

  private evaluateOtherSpells(player: Player, state: GameState): AIDecision | null {
    const spells = player.hand.filter(card => 
      !card.type_line.includes('Creature') && 
      !card.type_line.includes('Land') &&
      canCastSpell(card, state)
    );

    for (const spell of spells) {
      if (this.canAffordAndWorthCasting(spell, player, state)) {
        return {
          type: 'cast_spell',
          cardInstanceId: spell.instanceId,
          priority: 50,
        };
      }
    }

    return null;
  }

  private evaluateAttacks(player: Player, opponent: Player, state: GameState): AIDecision | null {
    const potentialAttackers = player.battlefield.filter(card => 
      card.type_line.includes('Creature') && !card.isTapped && !card.summoningSick
    );

    if (potentialAttackers.length === 0) {
      return { type: 'pass', priority: 0 };
    }

    // Calculate if we can win this turn
    const totalPower = potentialAttackers.reduce((sum, c) => sum + parseInt(c.power || '0'), 0);
    const opponentBlockers = opponent.battlefield.filter(c => 
      c.type_line.includes('Creature') && !c.isTapped
    );

    // If lethal and opponent has few blockers, attack all
    if (totalPower >= opponent.life && opponentBlockers.length < potentialAttackers.length / 2) {
      return {
        type: 'attack',
        targets: potentialAttackers.map(c => c.instanceId),
        priority: 95,
      };
    }

    // Otherwise, attack with favorable creatures
    const goodAttackers = potentialAttackers.filter(attacker => {
      const power = parseInt(attacker.power || '0');
      const toughness = parseInt(attacker.toughness || '0');
      
      // Attack if we're bigger than their blockers
      const canBeatBlockers = opponentBlockers.every(blocker => {
        const blockerPower = parseInt(blocker.power || '0');
        const blockerToughness = parseInt(blocker.toughness || '0');
        return power > blockerToughness || toughness > blockerPower;
      });

      return canBeatBlockers || opponentBlockers.length === 0;
    });

    if (goodAttackers.length > 0) {
      return {
        type: 'attack',
        targets: goodAttackers.map(c => c.instanceId),
        priority: 80,
      };
    }

    return { type: 'pass', priority: 0 };
  }

  private evaluateBlocks(player: Player, opponent: Player, state: GameState): AIDecision | null {
    // Simplified blocking logic
    const blockers = player.battlefield.filter(c => 
      c.type_line.includes('Creature') && !c.isTapped
    );

    if (blockers.length === 0 || state.combat.attackers.length === 0) {
      return { type: 'pass', priority: 0 };
    }

    // Block the biggest threats
    const blocks: Array<{ blocker: string; attacker: string }> = [];
    const sortedAttackers = [...state.combat.attackers].sort((a, b) => {
      const cardA = opponent.battlefield.find(c => c.instanceId === a.instanceId);
      const cardB = opponent.battlefield.find(c => c.instanceId === b.instanceId);
      const powerA = parseInt(cardA?.power || '0');
      const powerB = parseInt(cardB?.power || '0');
      return powerB - powerA;
    });

    sortedAttackers.forEach(attacker => {
      if (blockers.length === 0) return;
      
      const attackerCard = opponent.battlefield.find(c => c.instanceId === attacker.instanceId);
      if (!attackerCard) return;

      const bestBlocker = blockers[0]; // Simplified: use first available
      blocks.push({ blocker: bestBlocker.instanceId, attacker: attacker.instanceId });
      blockers.shift();
    });

    if (blocks.length > 0) {
      return {
        type: 'block',
        targets: blocks.map(b => b.blocker),
        priority: 85,
      };
    }

    return { type: 'pass', priority: 0 };
  }

  private selectBestLand(lands: GameCard[], player: Player): GameCard | null {
    // Prefer untapped lands, then lands that produce multiple colors
    const untapped = lands.filter(land => 
      !land.oracle_text?.toLowerCase().includes('enters the battlefield tapped')
    );

    if (untapped.length > 0) return untapped[0];
    return lands[0];
  }

  private canAffordAndWorthCasting(card: GameCard, player: Player, state: GameState): boolean {
    if (!canAffordSpell(card, state)) return false;

    // Simple heuristic: cast if CMC <= available mana
    const availableMana = Object.values(player.manaPool).reduce((sum, val) => sum + val, 0);
    return card.cmc <= availableMana;
  }

  private evaluateCreatureImpact(creature: GameCard): number {
    const power = parseInt(creature.power || '0');
    const toughness = parseInt(creature.toughness || '0');
    const hasAbilities = (creature.oracle_text?.length || 0) > 20;
    
    let impact = power + toughness;
    if (hasAbilities) impact += 2;
    if (creature.is_legendary) impact += 1;
    
    return impact;
  }

  private evaluateTapForMana(player: Player, state: GameState): void {
    // Tap all lands for mana
    const lands = player.battlefield.filter(card => 
      card.type_line.includes('Land') && !card.isTapped
    );

    lands.forEach(land => {
      land.isTapped = true;
      produceMana(land, state);
    });
  }
}
