import { Card } from '@/lib/deckbuilder/types';

export type Zone = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'stack' | 'command';
export type Phase = 'untap' | 'upkeep' | 'draw' | 'precombat_main' | 'combat_begin' | 'declare_attackers' | 'declare_blockers' | 'combat_damage' | 'combat_end' | 'postcombat_main' | 'end' | 'cleanup';
export type CardType = 'creature' | 'instant' | 'sorcery' | 'enchantment' | 'artifact' | 'land' | 'planeswalker';

export interface GameCard extends Card {
  instanceId: string;
  zone: Zone;
  controller: 'player1' | 'player2';
  owner: 'player1' | 'player2';
  isTapped: boolean;
  isPhasedOut: boolean;
  counters: Record<string, number>;
  damageMarked: number;
  attachedTo?: string;
  summoningSick: boolean;
  wasPlayedThisTurn: boolean;
  isCommander: boolean; // Track if this card is a commander
  // Modifiers that affect power/toughness
  powerModifier: number;
  toughnessModifier: number;
  // Track what abilities have been used this turn
  abilitiesUsedThisTurn: string[];
}

export interface Player {
  id: 'player1' | 'player2';
  name: string;
  life: number;
  library: GameCard[];
  hand: GameCard[];
  battlefield: GameCard[];
  graveyard: GameCard[];
  exile: GameCard[];
  commandZone: GameCard[];
  manaPool: Record<string, number>;
  landPlaysRemaining: number;
  hasPlayedLand: boolean;
  commanderDamage: Record<string, number>;
  commanderCastCount: number; // Track how many times commander was cast for tax
}

export interface StackObject {
  id: string;
  card: GameCard;
  controller: 'player1' | 'player2';
  targets: string[];
  resolving: boolean;
}

export interface GameState {
  turn: number;
  phase: Phase;
  activePlayer: 'player1' | 'player2';
  priorityPlayer: 'player1' | 'player2';
  player1: Player;
  player2: Player;
  stack: StackObject[];
  combat: CombatState;
  gameOver: boolean;
  winner?: 'player1' | 'player2';
  log: GameEvent[];
}

export interface CombatState {
  isActive: boolean;
  attackers: Array<{ instanceId: string; blockedBy: string[] }>;
  blockers: Array<{ instanceId: string; blocking: string }>;
  damageResolved: boolean;
}

export interface GameEvent {
  turn: number;
  phase: Phase;
  type: 'draw' | 'play_land' | 'cast_spell' | 'attack' | 'block' | 'damage' | 'trigger' | 'phase_change' | 'game_over' | 'ability_triggered';
  player: 'player1' | 'player2';
  description: string;
  cardName?: string;
  timestamp: number;
}

export interface SimulationResult {
  winner: 'player1' | 'player2';
  turns: number;
  player1Life: number;
  player2Life: number;
  events: GameEvent[];
  finalState: GameState;
}

export interface GameLog {
  turn: number;
  phase: Phase;
  type: string;
  player: string;
  description: string;
  cardName?: string;
  timestamp: number;
}

// Animation events emitted by simulator
export type SimulationEvent = 
  | { type: 'phase_advance'; phase: Phase }
  | { type: 'draw_card'; player: string; cardId: string }
  | { type: 'play_land'; player: string; cardId: string }
  | { type: 'cast_spell'; player: string; cardId: string; fromZone: Zone }
  | { type: 'tap_lands'; player: string; landIds: string[] }
  | { type: 'attack_declared'; attackerIds: string[] }
  | { type: 'blockers_declared'; blocks: Array<{ attacker: string; blocker: string }> }
  | { type: 'combat_damage'; damages: Array<{ cardId: string; amount: number; died?: boolean }> }
  | { type: 'creature_dies'; player: string; cardId: string }
  | { type: 'card_exiled'; player: string; cardId: string }
  | { type: 'token_created'; player: string; tokenIds: string[] }
  | { type: 'counters_added'; cardId: string; counterType: string; amount: number }
  | { type: 'ability_triggered'; cardId: string; abilityType: string }
  | { type: 'turn_end' }
  | { type: 'game_over'; winner: string };

export interface StepResult {
  state: GameState;
  events: SimulationEvent[];
  shouldContinue: boolean;
}

export interface AIDecision {
  type: 'play_land' | 'cast_spell' | 'attack' | 'block' | 'pass' | 'activate_ability';
  cardInstanceId?: string;
  targets?: string[];
  priority: number;
}
