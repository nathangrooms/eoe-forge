/**
 * DeckMatrix — shared game-state core: dealing a table out.
 *
 * `createGame` makes an empty table; `addCard` registers one card. This module
 * is the step between them and a playable game: take decklists, build every
 * library, put commanders in the command zone, shuffle with the game's seed and
 * draw opening hands.
 *
 * Still pure — it takes plain card data in and returns a `GameState`. Where the
 * card data came from (a user's deck, a seeded list, a precon) is somebody
 * else's problem, which is what keeps this folder free of Supabase.
 *
 * Determinism matters here: same decks + same seed produce the same shuffle on
 * every client, which is what lets a networked table agree on a library without
 * anyone sending one.
 */

import { addCard, applyAction, createGame, type NewGamePlayerConfig } from './rules';
import type { Format, GameState, ManaColor, PlayerId, Zone } from './types';

/** One card as the play system needs it — a flattened row, not a Scryfall blob. */
export interface PlayCard {
  cardId: string;
  name: string;
  manaCost?: string;
  cmc?: number;
  typeLine?: string;
  power?: string;
  toughness?: string;
  colorIdentity?: ManaColor[];
  imageUrl?: string;
  keywords?: string[];
}

export interface PlayDeck {
  id: string;
  name: string;
  format: Format;
  /** The 99 / the 60. Commanders are listed separately, not here. */
  cards: PlayCard[];
  commanders: PlayCard[];
  /** Where this list came from, shown in the lobby so a seeded deck is never mistaken for yours. */
  source: 'user-deck' | 'seeded' | 'fallback';
}

export interface SeatConfig {
  deck: PlayDeck;
  playerName: string;
  playerId?: PlayerId;
  /** Seats the bot policy drives. The human is normally seat 0. */
  isBot?: boolean;
}

export interface BuildTableOptions {
  id?: string;
  seats: SeatConfig[];
  format?: Format;
  /** Same seed + same decks = same shuffle everywhere. */
  seed?: number;
  /** Epoch ms. The core never reads a clock; the caller supplies one. */
  now?: number;
  /** Defaults to the format's starting hand size. */
  handSize?: number;
  /** Skip the opening draw — useful when a UI wants to animate it. */
  skipOpeningHands?: boolean;
}

export interface BuiltTable {
  state: GameState;
  /** Seat ids the bot policy should drive. */
  botPlayerIds: PlayerId[];
  /** Seat id -> deck it was dealt from, for the HUD. */
  decksBySeat: Record<PlayerId, PlayDeck>;
}

function instanceIdFor(playerId: PlayerId, index: number): string {
  return `${playerId}-c${index}`;
}

/**
 * Build a playable, shuffled, dealt table.
 *
 * Commanders are registered into the command zone with the instance id their
 * `CommanderRef` already points at, so commander damage, commander tax and the
 * physical card are the same object from the first frame.
 */
export function buildTable(options: BuildTableOptions): BuiltTable {
  const seats = options.seats ?? [];
  if (seats.length === 0) throw new Error('buildTable: at least one seat is required');

  const format: Format = options.format ?? seats[0].deck.format ?? 'commander';
  const now = options.now ?? 0;

  const playerConfigs: NewGamePlayerConfig[] = seats.map((seat, index) => {
    const playerId = seat.playerId ?? `p${index + 1}`;
    return {
      id: playerId,
      name: seat.playerName,
      deckId: seat.deck.id,
      commanders: seat.deck.commanders.map((commander, ci) => ({
        id: `${playerId}-cmd${ci + 1}`,
        name: commander.name,
        // Reserve the top of this seat's id space for commanders.
        instanceId: instanceIdFor(playerId, ci),
        colorIdentity: commander.colorIdentity,
        imageUrl: commander.imageUrl,
      })),
    };
  });

  let state = createGame({
    id: options.id,
    mode: 'full',
    format,
    players: playerConfigs,
    seed: options.seed ?? 1,
    now,
  });

  const decksBySeat: Record<PlayerId, PlayDeck> = {};
  const botPlayerIds: PlayerId[] = [];

  seats.forEach((seat, index) => {
    const playerId = playerConfigs[index].id as PlayerId;
    decksBySeat[playerId] = seat.deck;
    if (seat.isBot) botPlayerIds.push(playerId);

    let cursor = 0;

    for (const commander of seat.deck.commanders) {
      state = addCard(
        state,
        {
          instanceId: instanceIdFor(playerId, cursor),
          cardId: commander.cardId,
          name: commander.name,
          ownerId: playerId,
          isCommander: true,
          manaCost: commander.manaCost,
          cmc: commander.cmc,
          typeLine: commander.typeLine,
          power: commander.power,
          toughness: commander.toughness,
          colorIdentity: commander.colorIdentity,
          imageUrl: commander.imageUrl,
          keywords: commander.keywords,
        },
        'command' as Zone
      );
      cursor += 1;
    }

    for (const card of seat.deck.cards) {
      state = addCard(
        state,
        {
          instanceId: instanceIdFor(playerId, cursor),
          cardId: card.cardId,
          name: card.name,
          ownerId: playerId,
          manaCost: card.manaCost,
          cmc: card.cmc,
          typeLine: card.typeLine,
          power: card.power,
          toughness: card.toughness,
          colorIdentity: card.colorIdentity,
          imageUrl: card.imageUrl,
          keywords: card.keywords,
        },
        'library' as Zone
      );
      cursor += 1;
    }
  });

  // Shuffle through the reducer rather than around it, so the seeded RNG
  // advances once per shuffle and a replay of the log reproduces it exactly.
  for (const config of playerConfigs) {
    state = applyAction(state, { type: 'SHUFFLE', playerId: config.id as PlayerId, at: now });
  }

  if (!options.skipOpeningHands) {
    const handSize = options.handSize ?? state.rules.startingHandSize;
    for (const config of playerConfigs) {
      state = applyAction(state, {
        type: 'DRAW',
        playerId: config.id as PlayerId,
        count: handSize,
        at: now,
      });
    }
  }

  return { state, botPlayerIds, decksBySeat };
}

/**
 * Take a mulligan: shuffle a hand back, reshuffle, and draw one fewer. London
 * mulligan's "put N on the bottom" is left to the player — this deals the hand
 * and lets them use the zone browser, which is how a paper playtest works too.
 */
export function mulligan(state: GameState, playerId: PlayerId, at = 0): GameState {
  const player = state.players.find(p => p.id === playerId);
  if (!player || state.mode !== 'full') return state;

  const handSize = player.zones.hand.length;
  let next = state;

  for (const instanceId of [...player.zones.hand]) {
    next = applyAction(next, { type: 'MOVE_ZONE', instanceId, to: 'library', position: 'bottom', at });
  }
  next = applyAction(next, { type: 'SHUFFLE', playerId, at });
  next = applyAction(next, {
    type: 'DRAW',
    playerId,
    count: Math.max(1, handSize - 1),
    at,
  });
  return next;
}
