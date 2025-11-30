import { GameState, SimulationResult, AIDecision } from './types';
import { createInitialGameState, moveCard } from './gameState';
import { advancePhase, checkStateBasedActions } from './turnEngine';
import { AIPlayer } from './aiPlayer';
import { declareAttackers, declareBlockers, resolveCombatDamage } from './combatSystem';
import { canPlayLand, canCastSpell, canAffordSpell, produceMana, calculateManaCost } from './cardInterpreter';
import { checkCastTriggers, checkETBTriggers } from './triggerSystem';
import { Card } from '@/lib/deckbuilder/types';

export class GameSimulator {
  private state: GameState;
  private ai1: AIPlayer;
  private ai2: AIPlayer;
  private maxTurns: number;

  constructor(
    deck1: Card[],
    deck2: Card[],
    player1Name: string = 'Deck A',
    player2Name: string = 'Deck B',
    format: string = 'commander',
    maxTurns: number = 30
  ) {
    this.state = createInitialGameState(deck1, deck2, player1Name, player2Name, format);
    this.ai1 = new AIPlayer();
    this.ai2 = new AIPlayer();
    this.maxTurns = maxTurns;

    // Draw opening hands
    for (let i = 0; i < 7; i++) {
      this.drawCard('player1');
      this.drawCard('player2');
    }
  }

  simulate(): SimulationResult {
    while (!this.state.gameOver && this.state.turn < this.maxTurns) {
      this.simulateTurn();
    }

    // If we hit max turns without a winner, determine winner by life total
    if (!this.state.gameOver) {
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

    return {
      winner: this.state.winner!,
      turns: this.state.turn,
      player1Life: this.state.player1.life,
      player2Life: this.state.player2.life,
      events: this.state.log,
      finalState: this.state,
    };
  }

  // Step through one complete turn for visual playback
  stepTurn(): boolean {
    if (this.state.gameOver || this.state.turn >= this.maxTurns) {
      return false;
    }

    this.simulateTurn();

    // Check if game is over or max turns reached
    if (!this.state.gameOver && this.state.turn >= this.maxTurns) {
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

    return !this.state.gameOver;
  }

  private simulateTurn(): void {
    // Advance through all phases
    while (!this.state.gameOver) {
      const currentPhase = this.state.phase;
      
      // Get AI decision for current player
      const activePlayerId = this.state.activePlayer;
      const ai = activePlayerId === 'player1' ? this.ai1 : this.ai2;
      
      this.processPhase(ai, activePlayerId);
      
      // Check state-based actions
      checkStateBasedActions(this.state);
      
      if (this.state.gameOver) break;
      
      // Advance phase
      advancePhase(this.state);
      
      // Break if we completed cleanup (end of turn)
      if (currentPhase === 'cleanup' && this.state.phase === 'untap') {
        break;
      }
    }
  }

  private processPhase(ai: AIPlayer, playerId: 'player1' | 'player2'): void {
    const phase = this.state.phase;
    
    // Let AI make decisions during appropriate phases
    if (phase === 'precombat_main' || phase === 'postcombat_main') {
      // Main phases - cast spells, play lands
      let decision: AIDecision | null;
      let attempts = 0;
      const maxAttempts = 10; // Prevent infinite loops
      
      do {
        decision = ai.makeDecision(this.state, playerId);
        if (decision && decision.type !== 'pass') {
          this.executeDecision(decision, playerId);
        }
        attempts++;
      } while (decision && decision.type !== 'pass' && attempts < maxAttempts);
    }
    
    if (phase === 'declare_attackers' && this.state.activePlayer === playerId) {
      const decision = ai.makeDecision(this.state, playerId);
      if (decision && decision.type === 'attack' && decision.targets) {
        this.tapLandsForMana(playerId);
        declareAttackers(this.state, decision.targets);
      }
    }
    
    if (phase === 'declare_blockers' && this.state.activePlayer !== playerId) {
      const decision = ai.makeDecision(this.state, playerId);
      if (decision && decision.type === 'block' && decision.targets) {
        // Simplified: block first attacker with first blocker
        const blocks = decision.targets.map((blocker, i) => ({
          blocker,
          attacker: this.state.combat.attackers[i]?.instanceId || this.state.combat.attackers[0]?.instanceId
        })).filter(b => b.attacker);
        
        declareBlockers(this.state, blocks);
      }
    }
    
    if (phase === 'combat_damage') {
      resolveCombatDamage(this.state);
      checkStateBasedActions(this.state);
    }
  }

  private executeDecision(decision: AIDecision, playerId: 'player1' | 'player2'): void {
    const player = this.state[playerId];
    
    switch (decision.type) {
      case 'play_land':
        if (decision.cardInstanceId) {
          const card = player.hand.find(c => c.instanceId === decision.cardInstanceId);
          if (card && canPlayLand(card, this.state)) {
            moveCard(card, 'hand', 'battlefield', this.state);
            player.landPlaysRemaining--;
            player.hasPlayedLand = true;
            
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
            // Tap lands for mana
            this.tapLandsForMana(playerId);
            
            if (canAffordSpell(card, this.state)) {
              // Pay mana cost
              this.payManaCost(card, playerId);
              
              // Check cast triggers before moving card
              checkCastTriggers(this.state, card, playerId);
              
              // Move card to battlefield or graveyard
              const destination = card.type_line.includes('Instant') || card.type_line.includes('Sorcery') 
                ? 'graveyard' 
                : 'battlefield';
              
              moveCard(card, fromZone as any, destination, this.state);
              
              // Check ETB triggers after entering battlefield
              if (destination === 'battlefield') {
                checkETBTriggers(this.state);
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
        }
        break;
    }
  }

  private tapLandsForMana(playerId: 'player1' | 'player2'): void {
    const player = this.state[playerId];
    const lands = player.battlefield.filter(card => 
      card.type_line.includes('Land') && !card.isTapped
    );

    lands.forEach(land => {
      land.isTapped = true;
      produceMana(land, this.state);
    });
  }

  private payManaCost(card: any, playerId: 'player1' | 'player2'): void {
    const player = this.state[playerId];
    const cost = calculateManaCost(card);
    
    // Pay colored mana
    for (const [color, amount] of Object.entries(cost)) {
      if (color !== 'generic') {
        player.manaPool[color as keyof typeof player.manaPool] -= amount;
      }
    }
    
    // Pay generic mana with remaining mana
    let genericToPay = cost.generic;
    for (const color of ['W', 'U', 'B', 'R', 'G', 'C'] as const) {
      while (player.manaPool[color] > 0 && genericToPay > 0) {
        player.manaPool[color]--;
        genericToPay--;
      }
    }
  }

  private drawCard(playerId: 'player1' | 'player2'): void {
    const player = this.state[playerId];
    if (player.library.length > 0) {
      const card = player.library.shift()!;
      card.zone = 'hand';
      player.hand.push(card);
    }
  }

  getState(): GameState {
    return this.state;
  }
}
