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

import { addCard, applyAction, createGame, type NewGamePlayerConfig } from './rules.ts';
import type { Format, GameAction, GameState, ManaColor, PlayerId, Zone } from './types.ts';

/** One card as the play system needs it — a flattened row, not a Scryfall blob. */
export interface PlayCard {
  cardId: string;
  name: string;
  manaCost?: string;
  cmc?: number;
  typeLine?: string;
  power?: string;
  toughness?: string;
  /**
   * Printed starting loyalty, exactly as it is printed. Planeswalkers only.
   *
   * It has to travel with the deck because `CardInstance.loyalty` is the ONLY
   * input to CR 306.5b: `moveCard` seeds the loyalty counter from it, and
   * `sba.ts` gates CR 704.5i on it. This field did not exist, so no real game
   * ever set it, so every planeswalker entered the battlefield on 0 loyalty and
   * every minus ability was permanently unaffordable. Measured over 120 harness
   * games after loyalty abilities became reachable: 77 plus activations and 0
   * minus activations, because a minus was always refused for want of counters.
   * The two gaps hid each other, because CR 704.5i is gated on the same absent
   * field and so declined to bin the 0-loyalty planeswalker it should have.
   */
  loyalty?: string;
  colorIdentity?: ManaColor[];
  imageUrl?: string;
  keywords?: string[];
  /**
   * Raw oracle text, faces joined with newlines. `effects.ts` cannot detect a
   * trigger without it, so a deck loaded without it produces a table where
   * every card reads "rules text not loaded" — the honest failure, and far
   * better than one that silently resolves nothing.
   */
  oracleText?: string;
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
          loyalty: commander.loyalty,
          colorIdentity: commander.colorIdentity,
          imageUrl: commander.imageUrl,
          keywords: commander.keywords,
          oracleText: commander.oracleText,
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
          loyalty: card.loyalty,
          colorIdentity: card.colorIdentity,
          imageUrl: card.imageUrl,
          keywords: card.keywords,
          oracleText: card.oracleText,
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

/* -------------------------------------------------------------------------- */
/* Mulligans (CR 103.4 — the London mulligan)                                 */
/* -------------------------------------------------------------------------- */

/**
 * Take a mulligan: hand back into the library, reshuffle, draw a FULL hand.
 *
 * This is the London mulligan, which is how Magic has worked since 2019. You
 * always draw seven. The price is paid afterwards, by putting one card on the
 * bottom of your library for each mulligan you have taken. The Paris rule — draw
 * one fewer every time — is what this used to do, and a six-card hand you cannot
 * choose from is a materially worse game than a seven-card hand you have to cut
 * one from.
 *
 * The bottoming step is `bottomActions`, and what you owe is `cardsToBottom`.
 * They are separate on purpose: between the two the player has to LOOK at seven
 * cards and choose, and one function that did the whole mulligan would have to
 * choose for them.
 *
 * Returned as actions rather than a new state so it travels the same path as
 * every other move: one code path in, one log, one thing to replay, and a
 * networked table broadcasts the same batch.
 */
export function mulliganActions(
  state: GameState,
  playerId: PlayerId,
  at = 0
): GameAction[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player || state.mode !== 'full') return [];

  const handSize = player.zones.hand.length;
  if (handSize === 0) return [];

  const actions: GameAction[] = player.zones.hand.map(instanceId => ({
    type: 'MOVE_ZONE',
    instanceId,
    to: 'library',
    position: 'bottom',
    at,
  }));

  actions.push({ type: 'SHUFFLE', playerId, at });
  /* A full hand, every time. `startingHandSize` rather than the size of the
     hand just shuffled away, so a second mulligan still draws seven. */
  actions.push({ type: 'DRAW', playerId, count: state.rules.startingHandSize, at });
  return actions;
}

/**
 * How many cards you owe the bottom of your library after `taken` mulligans.
 *
 * One per mulligan, never more than the hand holds.
 */
export function cardsToBottom(taken: number, handSize: number): number {
  return Math.max(0, Math.min(taken, handSize));
}

/** Put the chosen cards on the bottom of the library, in the order given. */
export function bottomActions(instanceIds: readonly string[], at = 0): GameAction[] {
  return instanceIds.map(instanceId => ({
    type: 'MOVE_ZONE',
    instanceId,
    to: 'library',
    position: 'bottom',
    at,
  }));
}

/**
 * Should this seat ship it back? The rule, written down.
 *
 * A bot that never mulligans keeps a one-land hand and then does nothing for
 * six turns, which reads as a broken opponent rather than an unlucky one. This
 * is deliberately the crudest defensible rule rather than a good one:
 *
 *   - keep any hand holding two to five lands;
 *   - mulligan anything outside that band;
 *   - stop after two, because a bot mulliganing itself to five is worse to play
 *     against than a bot with a mediocre hand.
 *
 * Pure, and it reads the same `GameState` a human reads. It is not trying to
 * play well. It is trying to be plausible, which is the whole bot's brief.
 */
export function shouldBotMulligan(
  state: GameState,
  playerId: PlayerId,
  taken: number
): boolean {
  if (taken >= 2) return false;
  const player = state.players.find(p => p.id === playerId);
  if (!player) return false;

  let lands = 0;
  for (const instanceId of player.zones.hand) {
    const card = state.cards[instanceId];
    if (card && (card.typeLine ?? '').toLowerCase().includes('land')) lands += 1;
  }
  return lands < 2 || lands > 5;
}

/**
 * Which cards a bot puts on the bottom, worst first.
 *
 * Lands beyond the fourth go first, then the most expensive spells, because the
 * card a seven-card hand can least afford is the one it will never cast. Ties
 * break on instance id, so replaying the same log lands on the same hand.
 */
export function botBottomChoice(
  state: GameState,
  playerId: PlayerId,
  count: number
): string[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player || count <= 0) return [];

  const isLandLine = (typeLine: string | undefined) =>
    (typeLine ?? '').toLowerCase().includes('land');

  const hand = player.zones.hand.map(id => state.cards[id]).filter(Boolean);
  let spareLands = Math.max(0, hand.filter(card => isLandLine(card.typeLine)).length - 4);

  const ranked = hand.slice().sort((a, b) => {
    const aLand = isLandLine(a.typeLine);
    const bLand = isLandLine(b.typeLine);
    if (aLand !== bLand) return aLand ? -1 : 1;
    return (b.cmc ?? 0) - (a.cmc ?? 0) || a.instanceId.localeCompare(b.instanceId);
  });

  const chosen: string[] = [];
  for (const card of ranked) {
    if (chosen.length >= count) break;
    if (isLandLine(card.typeLine)) {
      if (spareLands <= 0) continue;
      spareLands -= 1;
    }
    chosen.push(card.instanceId);
  }
  // Short because the hand was all lands and none were spare: take what is left
  // rather than handing back an illegal partial choice.
  for (const card of ranked) {
    if (chosen.length >= count) break;
    if (chosen.indexOf(card.instanceId) === -1) chosen.push(card.instanceId);
  }

  return chosen;
}

/**
 * Run every bot seat's opening hand to a decision, and hand back the actions.
 *
 * Done once, at the table, before the first untap. A bot mulliganing in the
 * middle of turn one would be a rules violation and would also look like a bug.
 */
export function botMulliganActions(
  state: GameState,
  botPlayerIds: readonly PlayerId[],
  at = 0
): GameAction[] {
  const actions: GameAction[] = [];
  let current = state;

  for (const playerId of botPlayerIds) {
    let taken = 0;
    while (shouldBotMulligan(current, playerId, taken)) {
      const batch = mulliganActions(current, playerId, at);
      if (batch.length === 0) break;
      for (const action of batch) current = applyAction(current, action);
      actions.push(...batch);
      taken += 1;
    }

    const player = current.players.find(p => p.id === playerId);
    const owed = cardsToBottom(taken, player?.zones.hand.length ?? 0);
    if (owed > 0) {
      const batch = bottomActions(botBottomChoice(current, playerId, owed), at);
      for (const action of batch) current = applyAction(current, action);
      actions.push(...batch);
    }
  }

  return actions;
}
