import { GameState, AIDecision, GameCard, Player } from './types';
import { canPlayLand, canCastSpell, calculateManaCost, getCommanderCost } from './cardInterpreter';
import { canAttack } from './combatSystem';

/**
 * Advanced AI Player with strategic decision-making
 * - Proper instant timing (opponent's turn, combat tricks)
 * - Mana efficiency and curve considerations
 * - Combat math and threat assessment
 * - Card advantage evaluation
 * - Commander tax awareness
 */
export class AIPlayer {
  makeDecision(state: GameState, playerId: 'player1' | 'player2'): AIDecision | null {
    const player = state[playerId];
    const opponent = playerId === 'player1' ? state.player2 : state.player1;
    const phase = state.phase;
    const isMyTurn = state.activePlayer === playerId;

    // Instant-speed responses during opponent's turn
    if (!isMyTurn && phase !== 'declare_blockers') {
      const instantDecision = this.evaluateInstantResponse(player, opponent, state);
      if (instantDecision) return instantDecision;
    }

    // Main phase decisions (my turn only)
    if ((phase === 'precombat_main' || phase === 'postcombat_main') && isMyTurn) {
      // Priority 1: Play land if available
      const landDecision = this.evaluateLandPlay(player, state);
      if (landDecision) return landDecision;

      // Priority 2: Cast ramp spells early game (turns 1-4)
      if (state.turn < 4) {
        const rampDecision = this.evaluateRampSpells(player, state);
        if (rampDecision) return rampDecision;
      }

      // Priority 3: Cast commanders first if affordable
      const commanderDecision = this.evaluateCommander(player, state);
      if (commanderDecision) return commanderDecision;

      // Priority 4: Cast creatures on curve
      const creatureDecision = this.evaluateCreatureSpells(player, opponent, state);
      if (creatureDecision) return creatureDecision;

      // Priority 5: Cast non-instant sorcery-speed spells
      const sorceryDecision = this.evaluateSorcerySpells(player, opponent, state);
      if (sorceryDecision) return sorceryDecision;

      // Priority 6: Save mana for instants if we have them (postcombat only)
      if (phase === 'postcombat_main') {
        const hasInstants = player.hand.some(c => c.type_line.includes('Instant'));
        if (hasInstants) {
          return { type: 'pass', priority: 0 };
        }
      }
    }

    // Combat phase - declare attackers
    if (phase === 'declare_attackers' && isMyTurn) {
      return this.evaluateAttacks(player, opponent, state);
    }

    // Combat phase - declare blockers
    if (phase === 'declare_blockers' && !isMyTurn) {
      return this.evaluateBlocks(player, opponent, state);
    }

    // Default: pass priority
    return { type: 'pass', priority: 0 };
  }

  /**
   * Evaluate casting commander
   */
  private evaluateCommander(player: Player, state: GameState): AIDecision | null {
    const commander = player.commandZone.find(c => c.isCommander && canCastSpell(c, state));
    
    if (!commander) return null;

    // Calculate cost with tax
    const cost = getCommanderCost(commander, state);
    
    if (this.canAffordSpell(commander, player, state)) {
      return {
        type: 'cast_spell',
        cardInstanceId: commander.instanceId,
        priority: 95, // Very high priority for commanders
      };
    }

    return null;
  }

  /**
   * Evaluate instant-speed responses during opponent's turn
   */
  private evaluateInstantResponse(player: Player, opponent: Player, state: GameState): AIDecision | null {
    const instants = player.hand.filter(card => 
      card.type_line.includes('Instant') && canCastSpell(card, state)
    );

    for (const instant of instants) {
      if (this.canAffordSpell(instant, player, state)) {
        const text = instant.oracle_text?.toLowerCase() || '';
        
        // Removal instants when opponent has threats
        if (text.includes('destroy') || text.includes('exile') || text.includes('damage')) {
          const threats = opponent.battlefield.filter(c => 
            c.type_line.includes('Creature') && this.evaluateThreatLevel(c) > 3
          );
          if (threats.length > 0) {
            return { type: 'cast_spell', cardInstanceId: instant.instanceId, priority: 85 };
          }
        }

        // Card draw instants at end of opponent's turn
        if ((text.includes('draw') && state.phase === 'end') || text.includes('scry')) {
          return { type: 'cast_spell', cardInstanceId: instant.instanceId, priority: 70 };
        }

        // Counterspells when opponent casts something important
        if (text.includes('counter') && state.stack.length > 0) {
          return { type: 'cast_spell', cardInstanceId: instant.instanceId, priority: 90 };
        }
      }
    }

    return null;
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
      return (
        (text.includes('search') && text.includes('land')) ||
        text.includes('sol ring') ||
        text.includes('mana crypt') ||
        (card.type_line.includes('Artifact') && text.includes('add') && text.includes('mana')) ||
        (card.name.toLowerCase().includes('signet')) ||
        (card.name.toLowerCase().includes('talisman'))
      );
    });

    // Sort by efficiency (lower CMC = better for ramp)
    const sorted = rampSpells.sort((a, b) => a.cmc - b.cmc);

    for (const spell of sorted) {
      if (this.canAffordSpell(spell, player, state)) {
        return {
          type: 'cast_spell',
          cardInstanceId: spell.instanceId,
          priority: 90,
        };
      }
    }

    return null;
  }

  private evaluateCreatureSpells(player: Player, opponent: Player, state: GameState): AIDecision | null {
    // Only check hand for creatures (commanders handled separately)
    const creaturesInHand = player.hand.filter(card => 
      card.type_line.includes('Creature') && 
      canCastSpell(card, state) &&
      !card.type_line.includes('Instant')
    );
    
    // Evaluate creatures by impact vs cost
    const sorted = creaturesInHand.sort((a, b) => {
      const valueA = this.evaluateCreatureValue(a, player, opponent, state);
      const valueB = this.evaluateCreatureValue(b, player, opponent, state);
      return valueB - valueA;
    });

    for (const creature of sorted) {
      if (this.canAffordSpell(creature, player, state)) {
        return {
          type: 'cast_spell',
          cardInstanceId: creature.instanceId,
          priority: 70,
        };
      }
    }

    return null;
  }

  private evaluateSorcerySpells(player: Player, opponent: Player, state: GameState): AIDecision | null {
    const sorceries = player.hand.filter(card => 
      (card.type_line.includes('Sorcery') || 
       (card.type_line.includes('Enchantment') || card.type_line.includes('Artifact')) &&
       !card.type_line.includes('Creature')) &&
      canCastSpell(card, state) &&
      !card.type_line.includes('Instant')
    );

    // Prioritize by impact
    const sorted = sorceries.sort((a, b) => {
      const impactA = this.evaluateSpellImpact(a, opponent);
      const impactB = this.evaluateSpellImpact(b, opponent);
      return impactB - impactA;
    });

    for (const spell of sorted) {
      if (this.canAffordSpell(spell, player, state)) {
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
      card.type_line.includes('Creature') && canAttack(card, state)
    );

    if (potentialAttackers.length === 0) {
      return { type: 'pass', priority: 0 };
    }

    const opponentBlockers = opponent.battlefield.filter(c => 
      c.type_line.includes('Creature') && !c.isTapped
    );

    // Calculate lethal damage
    const totalPower = potentialAttackers.reduce((sum, c) => sum + parseInt(c.power || '0'), 0);
    const isLethal = totalPower >= opponent.life;

    // Attack all if lethal
    if (isLethal) {
      return {
        type: 'attack',
        targets: potentialAttackers.map(c => c.instanceId),
        priority: 95,
      };
    }

    // Evaluate each attacker
    const goodAttackers = potentialAttackers.filter(attacker => {
      const power = parseInt(attacker.power || '0');
      const toughness = parseInt(attacker.toughness || '0');
      
      // Don't attack if likely to die unfavorably
      if (opponentBlockers.length > 0) {
        const worstCase = this.evaluateWorstCaseCombat(attacker, opponentBlockers);
        if (worstCase.attackerDies && worstCase.tradedValue < 0) {
          return false; // Bad trade
        }
      }

      // Attack with evasion
      const text = attacker.oracle_text?.toLowerCase() || '';
      if (text.includes('flying') || text.includes('unblockable') || text.includes('menace')) {
        return true;
      }

      // Attack if significantly bigger than blockers or no blockers
      if (opponentBlockers.length === 0) return true;
      
      const canBeatSomeBlockers = opponentBlockers.some(blocker => {
        const blockerToughness = parseInt(blocker.toughness || '0');
        return power >= blockerToughness;
      });

      return canBeatSomeBlockers;
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
    const blockers = player.battlefield.filter(c => 
      c.type_line.includes('Creature') && !c.isTapped
    );

    if (blockers.length === 0 || state.combat.attackers.length === 0) {
      return { type: 'pass', priority: 0 };
    }

    // Calculate if we need to block to survive
    const incomingDamage = state.combat.attackers.reduce((sum, a) => {
      const card = opponent.battlefield.find(c => c.instanceId === a.instanceId);
      return sum + parseInt(card?.power || '0');
    }, 0);

    const mustBlockToSurvive = incomingDamage >= player.life;

    const blocks: Array<{ blocker: string; attacker: string }> = [];
    const usedBlockers = new Set<string>();

    // Sort attackers by threat (power, abilities, etc.)
    const sortedAttackers = [...state.combat.attackers].sort((a, b) => {
      const cardA = opponent.battlefield.find(c => c.instanceId === a.instanceId);
      const cardB = opponent.battlefield.find(c => c.instanceId === b.instanceId);
      const threatA = this.evaluateThreatLevel(cardA);
      const threatB = this.evaluateThreatLevel(cardB);
      return threatB - threatA;
    });

    // Assign blockers
    for (const attacker of sortedAttackers) {
      const attackerCard = opponent.battlefield.find(c => c.instanceId === attacker.instanceId);
      if (!attackerCard) continue;

      const attackerPower = parseInt(attackerCard.power || '0');
      const attackerToughness = parseInt(attackerCard.toughness || '0');

      // Find best blocker for this attacker
      const availableBlockers = blockers.filter(b => !usedBlockers.has(b.instanceId));
      if (availableBlockers.length === 0) break;

      // Prefer blockers that can kill the attacker without dying
      let bestBlocker = availableBlockers.find(b => {
        const blockerPower = parseInt(b.power || '0');
        const blockerToughness = parseInt(b.toughness || '0');
        return blockerPower >= attackerToughness && attackerPower < blockerToughness;
      });

      // If no perfect blocker, prefer favorable trades
      if (!bestBlocker) {
        bestBlocker = availableBlockers.find(b => {
          const blockerPower = parseInt(b.power || '0');
          const blockerToughness = parseInt(b.toughness || '0');
          return blockerPower >= attackerToughness;
        });
      }

      // Block large threats even if unfavorable (if must survive)
      if (!bestBlocker && (mustBlockToSurvive || attackerPower >= 5)) {
        bestBlocker = availableBlockers[0];
      }

      if (bestBlocker) {
        blocks.push({ blocker: bestBlocker.instanceId, attacker: attacker.instanceId });
        usedBlockers.add(bestBlocker.instanceId);
      }
    }

    if (blocks.length > 0) {
      return {
        type: 'block',
        targets: blocks.map(b => b.blocker),
        priority: 85,
      };
    }

    return { type: 'pass', priority: 0 };
  }

  /**
   * Helper methods
   */

  private selectBestLand(lands: GameCard[], player: Player): GameCard | null {
    // Prefer untapped lands
    const untapped = lands.filter(land => {
      const text = land.oracle_text?.toLowerCase() || '';
      return !text.includes('enters the battlefield tapped') && 
             !text.includes('enters tapped') &&
             !text.includes('etb tapped');
    });

    // Prefer lands that produce colors we need
    const handColors = this.getColorsInHand(player.hand);
    const matchingLands = (untapped.length > 0 ? untapped : lands).filter(land => {
      const produces = this.getColorsProduced(land);
      return produces.some(c => handColors.includes(c));
    });

    if (matchingLands.length > 0) return matchingLands[0];
    if (untapped.length > 0) return untapped[0];
    return lands[0];
  }

  private canAffordSpell(card: GameCard, player: Player, state: GameState): boolean {
    const untappedLands = player.battlefield.filter(c => 
      c.type_line.includes('Land') && !c.isTapped
    ).length;
    const floatingMana = Object.values(player.manaPool).reduce((sum, val) => sum + val, 0);
    const availableMana = untappedLands + floatingMana;

    // Check commander tax if casting from command zone
    let cost = card.cmc;
    if (card.isCommander && card.zone === 'command') {
      const tax = player.commanderCastCount * 2;
      cost = cost + tax;
    }

    return cost <= availableMana;
  }

  private evaluateCreatureValue(creature: GameCard, player: Player, opponent: Player, state: GameState): number {
    const power = parseInt(creature.power || '0');
    const toughness = parseInt(creature.toughness || '0');
    let cmc = creature.cmc || 0;
    
    // Add commander tax to cost evaluation
    if (creature.isCommander && creature.zone === 'command') {
      cmc += player.commanderCastCount * 2;
    }
    
    let value = (power + toughness) * 2 - cmc; // Base value
    
    const text = creature.oracle_text?.toLowerCase() || '';
    
    // Value evasion
    if (text.includes('flying') || text.includes('unblockable')) value += 3;
    if (text.includes('trample')) value += 2;
    if (text.includes('menace')) value += 2;
    
    // Value card advantage
    if (text.includes('draw')) value += 4;
    if (text.includes('when') && text.includes('enters')) value += 2; // ETB
    
    // Value removal
    if (text.includes('destroy') || text.includes('exile')) value += 3;
    
    // Value legendary commanders
    if (creature.is_legendary || creature.zone === 'command') value += 3;
    
    // Early game: prefer cheaper creatures
    if (state.turn < 4 && cmc <= 3) value += 2;
    
    return value;
  }

  private evaluateSpellImpact(spell: GameCard, opponent: Player): number {
    const text = spell.oracle_text?.toLowerCase() || '';
    let impact = 5; // Base impact
    
    // Removal
    if (text.includes('destroy') || text.includes('exile')) {
      const targets = opponent.battlefield.filter(c => c.type_line.includes('Creature'));
      impact += targets.length > 0 ? 8 : 0;
    }
    
    // Board wipes
    if (text.includes('all creatures')) impact += 10;
    
    // Card draw
    if (text.includes('draw')) {
      const drawCount = text.match(/draw (\d+)/);
      impact += drawCount ? parseInt(drawCount[1]) * 3 : 3;
    }
    
    return impact;
  }

  private evaluateThreatLevel(card?: GameCard): number {
    if (!card) return 0;
    
    const power = parseInt(card.power || '0');
    const toughness = parseInt(card.toughness || '0');
    const text = card.oracle_text?.toLowerCase() || '';
    
    let threat = power + toughness;
    
    // High-impact abilities
    if (text.includes('flying')) threat += 2;
    if (text.includes('trample')) threat += 2;
    if (text.includes('first strike') || text.includes('double strike')) threat += 3;
    if (text.includes('when') && text.includes('combat damage')) threat += 3;
    if (card.is_legendary || card.isCommander) threat += 3;
    
    return threat;
  }

  private evaluateWorstCaseCombat(attacker: GameCard, blockers: GameCard[]): { attackerDies: boolean; tradedValue: number } {
    const attackerPower = parseInt(attacker.power || '0');
    const attackerToughness = parseInt(attacker.toughness || '0');
    const attackerValue = this.evaluateThreatLevel(attacker);
    
    // Assume best blocker
    const bestBlocker = blockers.reduce((best, b) => {
      const bPower = parseInt(b.power || '0');
      if (!best || bPower > parseInt(best.power || '0')) return b;
      return best;
    }, blockers[0]);
    
    const blockerPower = parseInt(bestBlocker.power || '0');
    const blockerValue = this.evaluateThreatLevel(bestBlocker);
    
    const attackerDies = blockerPower >= attackerToughness;
    const tradedValue = attackerDies ? blockerValue - attackerValue : attackerValue;
    
    return { attackerDies, tradedValue };
  }

  private getColorsInHand(hand: GameCard[]): string[] {
    const colors = new Set<string>();
    hand.forEach(card => {
      const manaCost = card.mana_cost || '';
      if (manaCost.includes('W')) colors.add('W');
      if (manaCost.includes('U')) colors.add('U');
      if (manaCost.includes('B')) colors.add('B');
      if (manaCost.includes('R')) colors.add('R');
      if (manaCost.includes('G')) colors.add('G');
    });
    return Array.from(colors);
  }

  private getColorsProduced(land: GameCard): string[] {
    const colors: string[] = [];
    const text = land.oracle_text?.toLowerCase() || '';
    if (text.includes('white') || text.includes('{w}')) colors.push('W');
    if (text.includes('blue') || text.includes('{u}')) colors.push('U');
    if (text.includes('black') || text.includes('{b}')) colors.push('B');
    if (text.includes('red') || text.includes('{r}')) colors.push('R');
    if (text.includes('green') || text.includes('{g}')) colors.push('G');
    return colors;
  }
}
