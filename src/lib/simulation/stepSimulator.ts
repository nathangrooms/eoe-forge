import { GameState, SimulationEvent, StepResult, Phase } from './types';
import { createInitialGameState, drawCard as drawCardAction, moveCard } from './gameState';
import { advancePhase, checkStateBasedActions } from './turnEngine';
import { AIPlayer } from './aiPlayer';
import { declareAttackers, declareBlockers, resolveCombatDamage } from './combatSystem';
import { canPlayLand, canCastSpell, canAffordSpell, produceMana, calculateManaCost } from './cardInterpreter';
import { checkCastTriggers, checkETBTriggers, checkAttackTriggers } from './triggerSystem';
import { Card } from '@/lib/deckbuilder/types';

/**
 * Step-based simulator that emits fine-grained events for animations
 * Each step() call advances one phase or action and returns events
 */
export class StepSimulator {
  private state: GameState;
  private ai1: AIPlayer;
  private ai2: AIPlayer;
  private maxTurns: number;
  private currentPhaseStep: 'enter' | 'actions' | 'exit' = 'enter';
  private pendingActions: Array<() => SimulationEvent[]> = [];

  constructor(
    deck1: Card[],
    deck2: Card[],
    player1Name: string = 'Deck A',
    player2Name: string = 'Deck B',
    format: string = 'commander',
    maxTurns: number = 30,
    deck1CommanderId?: string,
    deck2CommanderId?: string
  ) {
    this.state = createInitialGameState(
      deck1, 
      deck2, 
      player1Name, 
      player2Name, 
      format,
      deck1CommanderId,
      deck2CommanderId
    );
    this.ai1 = new AIPlayer();
    this.ai2 = new AIPlayer();
    this.maxTurns = maxTurns;

    // Draw opening hands
    for (let i = 0; i < 7; i++) {
      this.drawCard('player1');
      this.drawCard('player2');
    }
  }

  /**
   * Advance one step: either phase transition or single action
   */
  step(): StepResult {
    const events: SimulationEvent[] = [];

    if (this.state.gameOver || this.state.turn >= this.maxTurns) {
      if (!this.state.gameOver) {
        this.endGameByTimeout();
        events.push({ type: 'game_over', winner: this.state.winner! });
      }
      return {
        state: this.state,
        events,
        shouldContinue: false
      };
    }

    // Process current phase step
    switch (this.currentPhaseStep) {
      case 'enter':
        // Phase just started - handle automatic actions
        events.push(...this.handlePhaseEnter());
        this.currentPhaseStep = 'actions';
        break;

      case 'actions':
        // Handle player actions (AI decisions)
        const actionEvents = this.handlePhaseActions();
        if (actionEvents.length > 0) {
          events.push(...actionEvents);
        } else {
          // No more actions, move to exit
          this.currentPhaseStep = 'exit';
        }
        break;

      case 'exit':
        // Phase ending - check state-based actions, advance
        events.push(...this.handlePhaseExit());
        this.advanceToNextPhase();
        events.push({ type: 'phase_advance', phase: this.state.phase });
        this.currentPhaseStep = 'enter';

        // Check if turn ended
        if (this.state.phase === 'untap') {
          events.push({ type: 'turn_end' });
        }
        break;
    }

    return {
      state: this.state,
      events,
      shouldContinue: !this.state.gameOver
    };
  }

  private handlePhaseEnter(): SimulationEvent[] {
    const events: SimulationEvent[] = [];
    const activePlayer = this.state[this.state.activePlayer];
    const phase = this.state.phase;

    switch (phase) {
      case 'untap':
        // Untap all permanents
        activePlayer.battlefield.forEach(card => {
          card.isTapped = false;
          if (card.type_line.includes('Creature')) {
            card.summoningSick = false;
          }
        });
        break;

      case 'draw':
        // Draw a card (skip first turn for starting player)
        if (this.state.turn > 0 || this.state.activePlayer === 'player2') {
          const drawnCard = activePlayer.library[0];
          if (drawnCard) {
            drawCardAction(this.state, this.state.activePlayer);
            events.push({
              type: 'draw_card',
              player: this.state.activePlayer,
              cardId: drawnCard.instanceId
            });
          }
        }
        break;

      case 'precombat_main':
        // Reset land plays
        activePlayer.landPlaysRemaining = 1;
        activePlayer.hasPlayedLand = false;
        // Check ETB triggers
        const etbEvents = checkETBTriggers(this.state);
        events.push(...etbEvents);
        break;

      case 'combat_begin':
        this.state.combat.isActive = true;
        this.state.combat.attackers = [];
        this.state.combat.blockers = [];
        this.state.combat.damageResolved = false;
        break;

      case 'combat_end':
        this.state.combat.isActive = false;
        this.state.combat.attackers = [];
        this.state.combat.blockers = [];
        break;

      case 'cleanup':
        // Empty mana pools
        activePlayer.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
        
        // Remove damage from creatures
        [...this.state.player1.battlefield, ...this.state.player2.battlefield].forEach(card => {
          if (card.type_line.includes('Creature')) {
            card.damageMarked = 0;
          }
          card.wasPlayedThisTurn = false;
        });
        break;
    }

    return events;
  }

  private handlePhaseActions(): SimulationEvent[] {
    const events: SimulationEvent[] = [];
    const phase = this.state.phase;
    const activePlayerId = this.state.activePlayer;
    const defendingPlayerId = activePlayerId === 'player1' ? 'player2' : 'player1';
    const ai = activePlayerId === 'player1' ? this.ai1 : this.ai2;
    const defendingAI = defendingPlayerId === 'player1' ? this.ai1 : this.ai2;

    // Main phases - AI makes decisions
    if (phase === 'precombat_main' || phase === 'postcombat_main') {
      const decision = ai.makeDecision(this.state, activePlayerId);
      
      if (decision && decision.type !== 'pass') {
        events.push(...this.executeDecision(decision, activePlayerId));
        return events; // One action per step
      }
    }

    // Declare attackers
    if (phase === 'declare_attackers') {
      const decision = ai.makeDecision(this.state, activePlayerId);
      if (decision && decision.type === 'attack' && decision.targets) {
        // Declare attackers (creatures will tap as part of combat rules)
        declareAttackers(this.state, decision.targets);
        events.push({
          type: 'attack_declared',
          attackerIds: decision.targets
        });

        // Check attack triggers
        const attackTriggerEvents = checkAttackTriggers(this.state);
        events.push(...attackTriggerEvents);
      }
    }

    // Declare blockers - defending player gets to block
    if (phase === 'declare_blockers') {
      const decision = defendingAI.makeDecision(this.state, defendingPlayerId);
      if (decision && decision.type === 'block' && decision.targets) {
        const blocks = decision.targets.map((blocker, i) => ({
          blocker,
          attacker: this.state.combat.attackers[i]?.instanceId || this.state.combat.attackers[0]?.instanceId
        })).filter(b => b.attacker);
        
        if (blocks.length > 0) {
          declareBlockers(this.state, blocks);
          events.push({
            type: 'blockers_declared',
            blocks
          });
        }
      }
    }

    // Resolve combat damage
    if (phase === 'combat_damage') {
      const damageEvents = this.resolveCombat();
      events.push(...damageEvents);
    }

    return events;
  }

  private handlePhaseExit(): SimulationEvent[] {
    const events: SimulationEvent[] = [];
    
    // Check state-based actions (creatures dying)
    const diedEvents = this.checkCreatureDeaths();
    events.push(...diedEvents);
    
    checkStateBasedActions(this.state);
    
    if (this.state.gameOver) {
      events.push({ type: 'game_over', winner: this.state.winner! });
    }
    
    return events;
  }

  private advanceToNextPhase(): void {
    advancePhase(this.state);
  }

  private executeDecision(decision: any, playerId: 'player1' | 'player2'): SimulationEvent[] {
    const events: SimulationEvent[] = [];
    const player = this.state[playerId];

    switch (decision.type) {
      case 'play_land':
        if (decision.cardInstanceId) {
          const card = player.hand.find(c => c.instanceId === decision.cardInstanceId);
          if (card && canPlayLand(card, this.state)) {
            moveCard(card, 'hand', 'battlefield', this.state);
            player.landPlaysRemaining--;
            player.hasPlayedLand = true;
            
            events.push({
              type: 'play_land',
              player: playerId,
              cardId: card.instanceId
            });
            
            this.state.log.push({
              turn: this.state.turn,
              phase: this.state.phase,
              type: 'play_land',
              player: playerId,
              description: `${player.name} plays ${card.name}`,
              cardName: card.name,
              timestamp: Date.now(),
            });
          }
        }
        break;

      case 'cast_spell':
        if (decision.cardInstanceId) {
          const card = player.hand.find(c => c.instanceId === decision.cardInstanceId) ||
                      player.commandZone.find(c => c.instanceId === decision.cardInstanceId);
          const fromZone = player.hand.find(c => c.instanceId === decision.cardInstanceId) ? 'hand' : 'command';
          
          if (card && canCastSpell(card, this.state)) {
            // Tap lands for visual mana usage when casting spells
            const tapEvents = this.tapLandsForMana(playerId);
            events.push(...tapEvents);
            
            const castTriggerEvents = checkCastTriggers(this.state, card, playerId);
            events.push(...castTriggerEvents);
            
            const destination = card.type_line.includes('Instant') || card.type_line.includes('Sorcery') 
              ? 'graveyard' 
              : 'battlefield';
            
            // Track commander casts for tax
            if (card.isCommander && fromZone === 'command') {
              player.commanderCastCount++;
            }

            moveCard(card, fromZone as any, destination, this.state);
            
            // Apply summoning sickness to creatures entering battlefield
            if (destination === 'battlefield' && card.type_line.includes('Creature')) {
              card.summoningSick = true;
            }
            
            events.push({
              type: 'cast_spell',
              player: playerId,
              cardId: card.instanceId,
              fromZone
            });
            
            if (destination === 'battlefield') {
              const etbEvents = checkETBTriggers(this.state);
              events.push(...etbEvents);
            }
            
            this.state.log.push({
              turn: this.state.turn,
              phase: this.state.phase,
              type: 'cast_spell',
              player: playerId,
              description: `${player.name} casts ${card.name}${fromZone === 'command' ? ' from command zone' : ''}`,
              cardName: card.name,
              timestamp: Date.now(),
            });
          }
        }
        break;
    }

    return events;
  }

  private tapLandsForMana(playerId: 'player1' | 'player2'): SimulationEvent[] {
    const events: SimulationEvent[] = [];
    const player = this.state[playerId];
    const lands = player.battlefield.filter(card => 
      card.type_line.includes('Land') && !card.isTapped
    );

    if (lands.length > 0) {
      const tappedIds: string[] = [];
      lands.forEach(land => {
        land.isTapped = true;
        produceMana(land, this.state);
        tappedIds.push(land.instanceId);
      });

      events.push({
        type: 'tap_lands',
        player: playerId,
        landIds: tappedIds
      });
    }

    return events;
  }

  private payManaCost(card: any, playerId: 'player1' | 'player2'): void {
    const player = this.state[playerId];
    const cost = calculateManaCost(card);
    
    for (const [color, amount] of Object.entries(cost)) {
      if (color !== 'generic') {
        player.manaPool[color as keyof typeof player.manaPool] -= amount;
      }
    }
    
    let genericToPay = cost.generic;
    for (const color of ['W', 'U', 'B', 'R', 'G', 'C'] as const) {
      while (player.manaPool[color] > 0 && genericToPay > 0) {
        player.manaPool[color]--;
        genericToPay--;
      }
    }
  }

  private resolveCombat(): SimulationEvent[] {
    const events: SimulationEvent[] = [];

    // Ensure combat damage is only applied once per combat phase
    if (this.state.combat.damageResolved) {
      return events;
    }
    this.state.combat.damageResolved = true;

    const damages: Array<{ cardId: string; amount: number; died?: boolean }> = [];
    
    resolveCombatDamage(this.state);
    
    // Track damage events
    [this.state.player1, this.state.player2].forEach(player => {
      player.battlefield.forEach(card => {
        if (card.damageMarked > 0 && card.type_line.includes('Creature')) {
          const toughness = parseInt(card.toughness || '0') + card.toughnessModifier;
          damages.push({
            cardId: card.instanceId,
            amount: card.damageMarked,
            died: card.damageMarked >= toughness
          });
        }
      });
    });

    if (damages.length > 0) {
      events.push({ type: 'combat_damage', damages });
    }

    return events;
  }

  private checkCreatureDeaths(): SimulationEvent[] {
    const events: SimulationEvent[] = [];

    [this.state.player1, this.state.player2].forEach(player => {
      const deadCreatures = player.battlefield.filter(card => {
        if (!card.type_line.includes('Creature')) return false;
        const toughness = parseInt(card.toughness || '0') + card.toughnessModifier;
        return card.damageMarked >= toughness || toughness <= 0;
      });

      deadCreatures.forEach(creature => {
        // Move creature from battlefield to appropriate zone
        const index = player.battlefield.findIndex(c => c.instanceId === creature.instanceId);
        if (index !== -1) {
          player.battlefield.splice(index, 1);
          
          // Commanders return to command zone, others go to graveyard
          if (creature.isCommander) {
            creature.zone = 'command';
            player.commandZone.push(creature);
            // Reset damage and modifiers
            creature.damageMarked = 0;
            creature.powerModifier = 0;
            creature.toughnessModifier = 0;
            creature.counters = {};
          } else {
            creature.zone = 'graveyard';
            player.graveyard.push(creature);
          }
          
          events.push({
            type: 'creature_dies',
            player: player.id,
            cardId: creature.instanceId
          });
          
          // Check dies triggers for all permanents on battlefield
          const diesTriggerEvents = this.checkDiesTriggersForAll(creature, player.id);
          events.push(...diesTriggerEvents);
        }
      });
    });

    return events;
  }

  private drawCard(playerId: 'player1' | 'player2'): void {
    const player = this.state[playerId];
    if (player.library.length > 0) {
      const card = player.library.shift()!;
      card.zone = 'hand';
      player.hand.push(card);
    }
  }

  private endGameByTimeout(): void {
    this.state.gameOver = true;
    this.state.winner = this.state.player1.life > this.state.player2.life ? 'player1' : 'player2';
    this.state.log.push({
      turn: this.state.turn,
      phase: this.state.phase,
      type: 'game_over',
      player: this.state.winner,
      description: `Game ends at turn ${this.maxTurns}. ${this.state[this.state.winner].name} wins by life total.`,
      timestamp: Date.now(),
    });
  }

  private checkDiesTriggersForAll(deadCard: any, controller: 'player1' | 'player2'): SimulationEvent[] {
    const events: SimulationEvent[] = [];
    
    // Import trigger checking
    const { checkDiesTriggers } = require('./triggerSystem');
    const diesEvents = checkDiesTriggers(this.state, deadCard, controller);
    events.push(...diesEvents);
    
    return events;
  }

  getState(): GameState {
    return this.state;
  }
}
