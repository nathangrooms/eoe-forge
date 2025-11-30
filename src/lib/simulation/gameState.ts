import { GameState, Player, GameCard, Zone } from './types';
import { Card } from '@/lib/deckbuilder/types';

export function createInitialGameState(
  deck1: Card[],
  deck2: Card[],
  player1Name: string,
  player2Name: string,
  format: string = 'commander'
): GameState {
  const startingLife = format === 'commander' ? 40 : 20;

  const player1: Player = {
    id: 'player1',
    name: player1Name,
    life: startingLife,
    library: shuffleDeck(convertToGameCards(deck1, 'player1')),
    hand: [],
    battlefield: [],
    graveyard: [],
    exile: [],
    commandZone: [],
    manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    landPlaysRemaining: 1,
    hasPlayedLand: false,
    commanderDamage: {},
  };

  const player2: Player = {
    id: 'player2',
    name: player2Name,
    life: startingLife,
    library: shuffleDeck(convertToGameCards(deck2, 'player2')),
    hand: [],
    battlefield: [],
    graveyard: [],
    exile: [],
    commandZone: [],
    manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    landPlaysRemaining: 1,
    hasPlayedLand: false,
    commanderDamage: {},
  };

  // Move commanders to command zone if commander format
  if (format === 'commander') {
    const p1Commander = player1.library.find(c => c.is_legendary && c.type_line.includes('Creature'));
    const p2Commander = player2.library.find(c => c.is_legendary && c.type_line.includes('Creature'));
    
    if (p1Commander) {
      player1.library = player1.library.filter(c => c.instanceId !== p1Commander.instanceId);
      p1Commander.zone = 'command';
      player1.commandZone.push(p1Commander);
    }
    
    if (p2Commander) {
      player2.library = player2.library.filter(c => c.instanceId !== p2Commander.instanceId);
      p2Commander.zone = 'command';
      player2.commandZone.push(p2Commander);
    }
  }

  return {
    turn: 0,
    phase: 'untap',
    activePlayer: 'player1',
    priorityPlayer: 'player1',
    player1,
    player2,
    stack: [],
    combat: {
      isActive: false,
      attackers: [],
      blockers: [],
    },
    gameOver: false,
    log: [],
  };
}

function convertToGameCards(deck: Card[], owner: 'player1' | 'player2'): GameCard[] {
  return deck.map((card, index) => ({
    ...card,
    instanceId: `${owner}-${card.id}-${index}`,
    zone: 'library' as Zone,
    controller: owner,
    owner,
    isTapped: false,
    isPhasedOut: false,
    counters: {},
    damageMarked: 0,
    summoningSick: true,
    wasPlayedThisTurn: false,
  }));
}

function shuffleDeck(cards: GameCard[]): GameCard[] {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function drawCard(state: GameState, playerId: 'player1' | 'player2'): void {
  const player = state[playerId];
  if (player.library.length === 0) {
    // Deck out - player loses
    state.gameOver = true;
    state.winner = playerId === 'player1' ? 'player2' : 'player1';
    state.log.push({
      turn: state.turn,
      phase: state.phase,
      type: 'game_over',
      player: playerId,
      description: `${player.name} loses by decking out`,
      timestamp: Date.now(),
    });
    return;
  }

  const card = player.library.shift()!;
  card.zone = 'hand';
  player.hand.push(card);
  
  state.log.push({
    turn: state.turn,
    phase: state.phase,
    type: 'draw',
    player: playerId,
    description: `${player.name} draws ${card.name}`,
    cardName: card.name,
    timestamp: Date.now(),
  });
}

export function moveCard(card: GameCard, fromZone: Zone, toZone: Zone, state: GameState): void {
  const player = state[card.controller];
  
  // Remove from old zone
  const fromArray = getZoneArray(player, fromZone);
  const index = fromArray.findIndex(c => c.instanceId === card.instanceId);
  if (index !== -1) {
    fromArray.splice(index, 1);
  }

  // Add to new zone
  card.zone = toZone;
  const toArray = getZoneArray(player, toZone);
  toArray.push(card);

  // Reset certain properties when moving zones
  if (toZone === 'battlefield') {
    card.summoningSick = card.type_line.includes('Creature');
  } else {
    card.isTapped = false;
    card.damageMarked = 0;
  }
}

function getZoneArray(player: Player, zone: Zone): GameCard[] {
  switch (zone) {
    case 'library': return player.library;
    case 'hand': return player.hand;
    case 'battlefield': return player.battlefield;
    case 'graveyard': return player.graveyard;
    case 'exile': return player.exile;
    case 'command': return player.commandZone;
    default: return [];
  }
}
