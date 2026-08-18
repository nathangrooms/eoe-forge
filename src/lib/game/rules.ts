/**
 * DeckMatrix — shared game-state core: the rules engine.
 *
 * `applyAction(state, action) -> state` is a pure reducer. Given the same state
 * and the same action it always returns the same result:
 *
 *   - no `Date.now()`, no `Math.random()`, no `crypto.randomUUID()`.
 *     Timestamps arrive on `action.at`; randomness runs through the seeded
 *     `state.rng`; ids are supplied by the caller or derived deterministically.
 *   - no React, no Supabase, no fetch, no storage.
 *   - the input state is never mutated; every returned state is a new object.
 *
 * Two consequences worth stating outright, because they are the whole point:
 * the same action list replayed on any client produces byte-identical state
 * (so this can back a networked game), and every rule below is testable with
 * nothing but a state literal and an action literal.
 *
 * Real rules encoded here:
 *   - starting life 40 for Commander, 20 for most other formats
 *   - commander damage is lethal at 21 from a *single* commander (never summed)
 *   - poison is lethal at 10
 *   - loss by life <= 0, poison, commander damage, drawing from an empty
 *     library, or concession; last player standing wins
 *   - a player who loses leaves the game and takes their cards with them (CR 800.4a)
 *   - commander tax of {2} per previous cast from the command zone
 *   - the starting player skips their first draw step in a two-player game
 */

// Types and values are imported separately so this module can be loaded by a
// type-stripping runtime (`node --test --experimental-strip-types`), which
// erases `import type` but cannot tell a type from a value in a mixed clause.
import { PHASE_OF_STEP, TURN_STEPS, ZONES } from './types.ts';
import type {
  CardInstance,
  CommanderId,
  CommanderRef,
  Format,
  FormatRules,
  GameAction,
  GameEvent,
  GameMode,
  GameState,
  InstanceId,
  LossReason,
  ManaColor,
  Phase,
  Player,
  PlayerId,
  RngState,
  Step,
  ValidationResult,
  Zone,
} from './types.ts';
import { toggleKeyword } from './keywords.ts';
import { triggeredActionsFor } from './effects.ts';

/* -------------------------------------------------------------------------- */
/* Rules constants                                                            */
/* -------------------------------------------------------------------------- */

export const COMMANDER_STARTING_LIFE = 40;
export const DEFAULT_STARTING_LIFE = 20;
/** CR 903.10a — 21 damage from any one commander. Per commander, not per player. */
export const COMMANDER_DAMAGE_LETHAL = 21;
/** CR 704.5c — ten or more poison counters. */
export const POISON_LETHAL = 10;
export const COMMANDER_TAX_PER_CAST = 2;

const BASE_RULES: FormatRules = {
  format: 'custom',
  label: 'Custom',
  startingLife: DEFAULT_STARTING_LIFE,
  startingHandSize: 7,
  maxPlayers: 2,
  usesCommandZone: false,
  usesCommanderDamage: false,
  commanderDamageLethal: COMMANDER_DAMAGE_LETHAL,
  poisonLethal: POISON_LETHAL,
  singleton: false,
  commanderTaxPerCast: COMMANDER_TAX_PER_CAST,
};

const FORMAT_RULES: Record<Format, FormatRules> = {
  commander: {
    ...BASE_RULES,
    format: 'commander',
    label: 'Commander',
    startingLife: COMMANDER_STARTING_LIFE,
    maxPlayers: 6,
    usesCommandZone: true,
    usesCommanderDamage: true,
    singleton: true,
  },
  brawl: {
    ...BASE_RULES,
    format: 'brawl',
    label: 'Brawl',
    // 25 heads-up, 30 multiplayer — resolved by player count in resolveFormatRules.
    startingLife: 25,
    maxPlayers: 4,
    usesCommandZone: true,
    usesCommanderDamage: true,
    singleton: true,
  },
  oathbreaker: {
    ...BASE_RULES,
    format: 'oathbreaker',
    label: 'Oathbreaker',
    startingLife: DEFAULT_STARTING_LIFE,
    maxPlayers: 4,
    usesCommandZone: true,
    // Oathbreaker has no commander-damage loss condition.
    usesCommanderDamage: false,
    singleton: true,
  },
  standard: { ...BASE_RULES, format: 'standard', label: 'Standard' },
  pioneer: { ...BASE_RULES, format: 'pioneer', label: 'Pioneer' },
  modern: { ...BASE_RULES, format: 'modern', label: 'Modern' },
  legacy: { ...BASE_RULES, format: 'legacy', label: 'Legacy' },
  vintage: { ...BASE_RULES, format: 'vintage', label: 'Vintage' },
  pauper: { ...BASE_RULES, format: 'pauper', label: 'Pauper' },
  historic: { ...BASE_RULES, format: 'historic', label: 'Historic' },
  alchemy: { ...BASE_RULES, format: 'alchemy', label: 'Alchemy' },
  explorer: { ...BASE_RULES, format: 'explorer', label: 'Explorer' },
  penny: { ...BASE_RULES, format: 'penny', label: 'Penny Dreadful' },
  limited: { ...BASE_RULES, format: 'limited', label: 'Limited', maxPlayers: 8 },
  custom: { ...BASE_RULES },
};

/** Resolve the rules a game will run under. Player count matters for Brawl. */
export function resolveFormatRules(format: Format, playerCount = 2): FormatRules {
  const base = FORMAT_RULES[format] ?? FORMAT_RULES.custom;
  if (format === 'brawl') {
    return { ...base, startingLife: playerCount > 2 ? 30 : 25 };
  }
  return { ...base };
}

export function formatRules(format: Format): FormatRules {
  return { ...(FORMAT_RULES[format] ?? FORMAT_RULES.custom) };
}

export function startingLifeFor(format: Format, playerCount = 2): number {
  return resolveFormatRules(format, playerCount).startingLife;
}

export function phaseOf(step: Step): Phase {
  return PHASE_OF_STEP[step];
}

/* -------------------------------------------------------------------------- */
/* Deterministic RNG                                                          */
/* -------------------------------------------------------------------------- */

/** mulberry32 — small, fast, and reproducible across every client. */
function nextRandom(rng: RngState): { value: number; rng: RngState } {
  const t = (rng.seed + 0x6d2b79f5) | 0;
  let r = t;
  r = Math.imul(r ^ (r >>> 15), r | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return { value, rng: { seed: t } };
}

/** Fisher-Yates against the seeded RNG. Returns the shuffled copy and the advanced state. */
export function shuffleWithRng<T>(items: readonly T[], rng: RngState): { items: T[]; rng: RngState } {
  const out = items.slice();
  let current = rng;
  for (let i = out.length - 1; i > 0; i--) {
    const step = nextRandom(current);
    current = step.rng;
    const j = Math.floor(step.value * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return { items: out, rng: current };
}

/* -------------------------------------------------------------------------- */
/* Construction                                                               */
/* -------------------------------------------------------------------------- */

export interface NewGameCommanderConfig {
  id?: CommanderId;
  name: string;
  instanceId?: InstanceId;
  colorIdentity?: ManaColor[];
  imageUrl?: string;
}

export interface NewGamePlayerConfig {
  id?: PlayerId;
  name: string;
  commanders?: NewGameCommanderConfig[];
  /** Per-player override, for handicaps or archenemy pods. */
  startingLife?: number;
  profileId?: string | null;
  deckId?: string | null;
  avatarUrl?: string | null;
}

export interface NewGameConfig {
  id?: string;
  /**
   * Defaults to 'life-counter': no decklists, no library, card actions rejected.
   * Pass 'full' for the play system.
   */
  mode?: GameMode;
  /** Defaults to 'commander'. */
  format?: Format;
  players: NewGamePlayerConfig[];
  /** Overrides the format's starting life for every player. */
  startingLife?: number;
  /** Seed for shuffles. Same seed + same actions = same game on every client. */
  seed?: number;
  startingPlayerId?: PlayerId;
  /** Epoch ms. Defaults to 0 — this core never reads a clock. */
  now?: number;
}

export function emptyZones(): Record<Zone, InstanceId[]> {
  const zones = {} as Record<Zone, InstanceId[]>;
  for (const zone of ZONES) zones[zone] = [];
  return zones;
}

export function createGame(config: NewGameConfig): GameState {
  const seats = config.players ?? [];
  if (seats.length === 0) {
    throw new Error('createGame: at least one player is required');
  }

  const format = config.format ?? 'commander';
  const rules = resolveFormatRules(format, seats.length);
  const mode: GameMode = config.mode ?? 'life-counter';
  const now = config.now ?? 0;

  const players: Player[] = seats.map((seat, index) => {
    const id = seat.id ?? `p${index + 1}`;
    const commanders: CommanderRef[] = (seat.commanders ?? []).map((commander, ci) => ({
      id: commander.id ?? `${id}-cmd${ci + 1}`,
      playerId: id,
      name: commander.name,
      instanceId: commander.instanceId,
      castCount: 0,
      colorIdentity: commander.colorIdentity,
      imageUrl: commander.imageUrl,
    }));

    return {
      id,
      name: seat.name || `Player ${index + 1}`,
      seat: index,
      life: seat.startingLife ?? config.startingLife ?? rules.startingLife,
      poison: 0,
      counters: {},
      commanders,
      commanderDamage: {},
      zones: emptyZones(),
      landsPlayedThisTurn: 0,
      drewFromEmptyLibrary: false,
      conceded: false,
      hasLost: false,
      lossReasons: [],
      profileId: seat.profileId ?? null,
      deckId: seat.deckId ?? null,
      avatarUrl: seat.avatarUrl ?? null,
    };
  });

  const startingPlayerId =
    config.startingPlayerId && players.some(p => p.id === config.startingPlayerId)
      ? config.startingPlayerId
      : players[0].id;

  return {
    id: config.id ?? 'game',
    mode,
    format,
    rules,
    status: 'playing',
    players,
    cards: {},
    turn: 1,
    round: 1,
    activePlayerId: startingPlayerId,
    priorityPlayerId: startingPlayerId,
    startingPlayerId,
    step: 'untap',
    combat: { attackers: [] },
    monarchId: null,
    initiativeId: null,
    winnerIds: [],
    log: [],
    rng: { seed: config.seed ?? 1 },
    startedAt: now,
    updatedAt: now,
    version: 0,
  };
}

/**
 * Register a card instance into a game. Kept separate from the reducer because
 * loading a decklist is a setup concern, not a game action — but it is still
 * pure, and still returns a new state.
 */
export function addCard(
  state: GameState,
  card: Partial<CardInstance> & Pick<CardInstance, 'instanceId' | 'cardId' | 'name' | 'ownerId'>,
  zone: Zone = 'library'
): GameState {
  const owner = getPlayer(state, card.ownerId);
  if (!owner) return state;

  const instance: CardInstance = {
    controllerId: card.ownerId,
    tapped: false,
    faceDown: false,
    flipped: false,
    summoningSick: false,
    damage: 0,
    counters: {},
    isCommander: false,
    castCount: 0,
    isToken: false,
    removedFromGame: false,
    ...card,
    // The zone argument is authoritative — it decides which array holds the id.
    zone,
  };

  const zones = { ...owner.zones, [zone]: [...owner.zones[zone], instance.instanceId] };
  return {
    ...state,
    cards: { ...state.cards, [instance.instanceId]: instance },
    players: state.players.map(p => (p.id === owner.id ? { ...p, zones } : p)),
  };
}

/* -------------------------------------------------------------------------- */
/* Selectors                                                                  */
/* -------------------------------------------------------------------------- */

export function getPlayer(state: GameState, playerId: PlayerId): Player | undefined {
  return state.players.find(p => p.id === playerId);
}

export function getCard(state: GameState, instanceId: InstanceId): CardInstance | undefined {
  return state.cards[instanceId];
}

export function isAlive(player: Player): boolean {
  return !player.hasLost;
}

export function livingPlayers(state: GameState): Player[] {
  return state.players.filter(isAlive);
}

export function opponentsOf(state: GameState, playerId: PlayerId): Player[] {
  return state.players.filter(p => p.id !== playerId);
}

export function findCommander(state: GameState, commanderId: CommanderId): CommanderRef | undefined {
  for (const player of state.players) {
    const found = player.commanders.find(c => c.id === commanderId);
    if (found) return found;
  }
  return undefined;
}

export function allCommanders(state: GameState): CommanderRef[] {
  return state.players.flatMap(p => p.commanders);
}

/** Commander damage dealt to `player` by one specific commander. */
export function commanderDamageOn(player: Player, commanderId: CommanderId): number {
  return player.commanderDamage[commanderId] ?? 0;
}

/**
 * The worst single-commander tally against `player` from `sourcePlayerId`.
 * Deliberately a max, not a sum: partner commanders each need their own 21.
 */
export function highestCommanderDamageFrom(
  state: GameState,
  player: Player,
  sourcePlayerId: PlayerId
): number {
  const source = getPlayer(state, sourcePlayerId);
  if (!source) return 0;
  return source.commanders.reduce(
    (worst, commander) => Math.max(worst, commanderDamageOn(player, commander.id)),
    0
  );
}

/** Damage still needed from `commanderId` to kill `player`. */
export function commanderDamageRemaining(
  state: GameState,
  player: Player,
  commanderId: CommanderId
): number {
  if (!state.rules.usesCommanderDamage) return Infinity;
  return Math.max(0, state.rules.commanderDamageLethal - commanderDamageOn(player, commanderId));
}

/** Additional generic mana to cast this commander from the command zone. */
export function commanderTax(state: GameState, commanderId: CommanderId): number {
  const commander = findCommander(state, commanderId);
  if (!commander) return 0;
  return commander.castCount * state.rules.commanderTaxPerCast;
}

export function cardsInZone(state: GameState, playerId: PlayerId, zone: Zone): CardInstance[] {
  const player = getPlayer(state, playerId);
  if (!player) return [];
  return player.zones[zone].map(id => state.cards[id]).filter(Boolean);
}

export function isGameOver(state: GameState): boolean {
  return state.status === 'complete';
}

export function winners(state: GameState): Player[] {
  return state.winnerIds.map(id => getPlayer(state, id)).filter(Boolean) as Player[];
}

/** Why a player is dead, in prose, for the log and the life counter. */
export function lossReasonLabel(reason: LossReason): string {
  switch (reason) {
    case 'life':
      return 'life total reached zero';
    case 'poison':
      return 'ten poison counters';
    case 'commander_damage':
      return '21 commander damage';
    case 'empty_library':
      return 'drew from an empty library';
    case 'concede':
      return 'conceded';
    default:
      return 'a game effect';
  }
}

/* -------------------------------------------------------------------------- */
/* Internal immutable helpers                                                 */
/* -------------------------------------------------------------------------- */

function patchPlayer(state: GameState, playerId: PlayerId, patch: (player: Player) => Player): GameState {
  let changed = false;
  const players = state.players.map(player => {
    if (player.id !== playerId) return player;
    const next = patch(player);
    if (next !== player) changed = true;
    return next;
  });
  return changed ? { ...state, players } : state;
}

function patchCard(
  state: GameState,
  instanceId: InstanceId,
  patch: (card: CardInstance) => CardInstance
): GameState {
  const card = state.cards[instanceId];
  if (!card) return state;
  const next = patch(card);
  if (next === card) return state;
  return { ...state, cards: { ...state.cards, [instanceId]: next } };
}

function bumpCounter(counters: Record<string, number>, key: string, delta: number): Record<string, number> {
  const next = { ...counters };
  const value = (next[key] ?? 0) + delta;
  if (value <= 0) delete next[key];
  else next[key] = value;
  return next;
}

function pushEvent(state: GameState, event: Omit<GameEvent, 'seq'>): GameState {
  return { ...state, log: [...state.log, { ...event, seq: state.log.length }] };
}

function logAction(state: GameState, action: GameAction, at: number, message: string): GameState {
  return pushEvent(state, {
    at,
    turn: state.turn,
    round: state.round,
    step: state.step,
    type: action.type,
    actorId: action.actorId,
    message,
  });
}

function playerName(state: GameState, playerId: PlayerId): string {
  return getPlayer(state, playerId)?.name ?? 'Unknown player';
}

function cardName(state: GameState, instanceId: InstanceId): string {
  return state.cards[instanceId]?.name ?? 'a card';
}

/* -------------------------------------------------------------------------- */
/* Zone movement                                                              */
/* -------------------------------------------------------------------------- */

function removeFromZones(player: Player, instanceId: InstanceId): Player {
  let touched = false;
  const zones = {} as Record<Zone, InstanceId[]>;
  for (const zone of ZONES) {
    const list = player.zones[zone];
    if (list.includes(instanceId)) {
      zones[zone] = list.filter(id => id !== instanceId);
      touched = true;
    } else {
      zones[zone] = list;
    }
  }
  return touched ? { ...player, zones } : player;
}

function insertInto(
  list: InstanceId[],
  instanceId: InstanceId,
  position?: 'top' | 'bottom' | number
): InstanceId[] {
  if (position === 'top' || position === undefined) return [instanceId, ...list];
  if (position === 'bottom') return [...list, instanceId];
  const index = Math.max(0, Math.min(list.length, position));
  return [...list.slice(0, index), instanceId, ...list.slice(index)];
}

/**
 * Move a card between zones. Index 0 of `library` is the top of the library;
 * every other zone appends. Ownership decides which player's zone array holds
 * the card, so a stolen creature returns to its owner's graveyard correctly.
 */
function moveCard(
  state: GameState,
  instanceId: InstanceId,
  to: Zone,
  options: { position?: 'top' | 'bottom' | number; tapped?: boolean; controllerId?: PlayerId } = {}
): GameState {
  const card = state.cards[instanceId];
  if (!card) return state;

  // CR 111.7 — a token that leaves the battlefield ceases to exist, so it never
  // reaches a graveyard or a hand. Without this, every dead token silts up the
  // graveyard forever and the zone browser fills with permanents that are not
  // real cards.
  const tokenCeasesToExist = card.isToken && to !== 'battlefield';

  const players = state.players.map(player => {
    const stripped = removeFromZones(player, instanceId);
    if (tokenCeasesToExist || stripped.id !== card.ownerId) return stripped;
    const list = to === 'library' ? insertInto(stripped.zones[to], instanceId, options.position ?? 'top') : [...stripped.zones[to], instanceId];
    return { ...stripped, zones: { ...stripped.zones, [to]: list } };
  });

  const enteringBattlefield = to === 'battlefield' && card.zone !== 'battlefield';
  const leavingBattlefield = card.zone === 'battlefield' && to !== 'battlefield';
  const nextCard: CardInstance = {
    ...card,
    zone: to,
    controllerId: options.controllerId ?? (to === 'battlefield' ? card.controllerId : card.ownerId),
    tapped: to === 'battlefield' ? options.tapped ?? false : false,
    // Leaving the battlefield resets everything a permanent was carrying —
    // including the player's own overrides and hand-flagged keywords, because
    // what comes back is a new object (CR 400.7).
    damage: to === 'battlefield' ? card.damage : 0,
    counters: to === 'battlefield' ? card.counters : {},
    attachedTo: to === 'battlefield' ? card.attachedTo : undefined,
    summoningSick: enteringBattlefield ? true : to === 'battlefield' ? card.summoningSick : false,
    faceDown: to === 'battlefield' || to === 'exile' ? card.faceDown : false,
    powerOverride: leavingBattlefield ? undefined : card.powerOverride,
    toughnessOverride: leavingBattlefield ? undefined : card.toughnessOverride,
    grantedKeywords: leavingBattlefield ? undefined : card.grantedKeywords,
    suppressedKeywords: leavingBattlefield ? undefined : card.suppressedKeywords,
    // The "resolve this by hand" marker is per-arrival, so a card that comes
    // back from the graveyard asks again rather than staying quietly dismissed.
    manualResolved: to === 'battlefield' && !enteringBattlefield ? card.manualResolved : undefined,
    removedFromGame: tokenCeasesToExist ? true : card.removedFromGame,
  };

  return { ...state, players, cards: { ...state.cards, [instanceId]: nextCard } };
}

function drawCards(state: GameState, playerId: PlayerId, count: number): GameState {
  let next = state;
  for (let i = 0; i < count; i++) {
    const player = getPlayer(next, playerId);
    if (!player) break;
    const top = player.zones.library[0];
    if (!top) {
      // CR 104.3c — the loss happens when state-based actions next check.
      next = patchPlayer(next, playerId, p =>
        p.drewFromEmptyLibrary ? p : { ...p, drewFromEmptyLibrary: true }
      );
      break;
    }
    next = moveCard(next, top, 'hand');
  }
  return next;
}

/* -------------------------------------------------------------------------- */
/* Damage                                                                     */
/* -------------------------------------------------------------------------- */

interface DamageOptions {
  amount: number;
  commanderId?: CommanderId;
  infect?: boolean;
}

/**
 * The one place life, poison and commander damage move.
 *
 * Commander damage is *also* damage: a hit from a commander lowers life and
 * raises that commander's tally. Negative amounts run the whole thing backwards
 * so a life counter can undo a mis-tap.
 */
function applyDamage(state: GameState, targetPlayerId: PlayerId, options: DamageOptions): GameState {
  const { amount, commanderId, infect } = options;
  if (!amount) return state;

  return patchPlayer(state, targetPlayerId, player => {
    let next = player;

    if (infect) {
      next = { ...next, poison: Math.max(0, next.poison + amount) };
    } else {
      next = { ...next, life: next.life - amount };
    }

    if (commanderId && state.rules.usesCommanderDamage) {
      const current = next.commanderDamage[commanderId] ?? 0;
      const tally = Math.max(0, current + amount);
      const commanderDamage = { ...next.commanderDamage };
      if (tally === 0) delete commanderDamage[commanderId];
      else commanderDamage[commanderId] = tally;
      next = { ...next, commanderDamage };
    }

    return next;
  });
}

/* -------------------------------------------------------------------------- */
/* Turn structure                                                             */
/* -------------------------------------------------------------------------- */

function untapPermanents(state: GameState, playerId: PlayerId): GameState {
  const player = getPlayer(state, playerId);
  if (!player) return state;
  let cards = state.cards;
  let changed = false;
  for (const id of player.zones.battlefield) {
    const card = cards[id];
    if (!card || card.controllerId !== playerId) continue;
    if (!card.tapped) continue;
    if (!changed) {
      cards = { ...cards };
      changed = true;
    }
    cards[id] = { ...card, tapped: false };
  }
  return changed ? { ...state, cards } : state;
}

/** Permanents a player has controlled since their turn began lose summoning sickness. */
function clearSummoningSickness(state: GameState, playerId: PlayerId): GameState {
  let cards = state.cards;
  let changed = false;
  for (const id of Object.keys(cards)) {
    const card = cards[id];
    if (card.zone !== 'battlefield' || card.controllerId !== playerId || !card.summoningSick) continue;
    if (!changed) {
      cards = { ...cards };
      changed = true;
    }
    cards[id] = { ...card, summoningSick: false };
  }
  return changed ? { ...state, cards } : state;
}

/** CR 514.2 — all marked damage wears off during cleanup. */
function clearMarkedDamage(state: GameState): GameState {
  let cards = state.cards;
  let changed = false;
  for (const id of Object.keys(cards)) {
    const card = cards[id];
    if (!card.damage) continue;
    if (!changed) {
      cards = { ...cards };
      changed = true;
    }
    cards[id] = { ...card, damage: 0 };
  }
  return changed ? { ...state, cards } : state;
}

/** The next living player in seat order, wrapping. Undefined if nobody else is alive. */
export function nextLivingPlayer(state: GameState, fromPlayerId: PlayerId): Player | undefined {
  const count = state.players.length;
  const fromSeat = getPlayer(state, fromPlayerId)?.seat ?? 0;
  for (let offset = 1; offset <= count; offset++) {
    const candidate = state.players[(fromSeat + offset) % count];
    if (candidate && isAlive(candidate)) return candidate;
  }
  return undefined;
}

function beginTurnFor(state: GameState, playerId: PlayerId): GameState {
  let next = untapPermanents(state, playerId);
  next = clearSummoningSickness(next, playerId);
  next = patchPlayer(next, playerId, p => ({ ...p, landsPlayedThisTurn: 0 }));
  return next;
}

function passTurn(state: GameState, toPlayerId?: PlayerId): GameState {
  const explicit = toPlayerId ? getPlayer(state, toPlayerId) : undefined;
  const upNext = explicit ?? nextLivingPlayer(state, state.activePlayerId);
  if (!upNext) return state;

  const previousSeat = getPlayer(state, state.activePlayerId)?.seat ?? 0;
  // Seat index going backwards (or staying put) means the table wrapped: new round.
  const wrapped = upNext.seat <= previousSeat;

  let next: GameState = {
    ...clearMarkedDamage(state),
    turn: state.turn + 1,
    round: wrapped ? state.round + 1 : state.round,
    activePlayerId: upNext.id,
    priorityPlayerId: upNext.id,
    step: 'untap',
    combat: { attackers: [] },
  };

  next = beginTurnFor(next, upNext.id);
  return next;
}

/** CR 103.7a — the starting player skips their first draw step in a two-player game. */
function skipsFirstDraw(state: GameState): boolean {
  return (
    state.players.length === 2 &&
    state.turn === 1 &&
    state.activePlayerId === state.startingPlayerId
  );
}

function enterStep(state: GameState, step: Step): GameState {
  let next: GameState = { ...state, step };

  switch (step) {
    case 'untap':
      next = beginTurnFor(next, next.activePlayerId);
      break;
    case 'draw':
      if (next.mode === 'full' && !skipsFirstDraw(next)) {
        next = drawCards(next, next.activePlayerId, 1);
      }
      break;
    case 'end_combat':
      next = { ...next, combat: { attackers: [] } };
      break;
    case 'cleanup':
      next = clearMarkedDamage(next);
      break;
    default:
      break;
  }

  return next;
}

function advanceStep(state: GameState): GameState {
  const index = TURN_STEPS.indexOf(state.step);
  const isLast = index === -1 || index === TURN_STEPS.length - 1;
  if (isLast) return passTurn(state);
  return enterStep(state, TURN_STEPS[index + 1]);
}

/* -------------------------------------------------------------------------- */
/* State-based actions                                                        */
/* -------------------------------------------------------------------------- */

function lossReasonsFor(state: GameState, player: Player): LossReason[] {
  const reasons: LossReason[] = [];
  if (player.conceded) reasons.push('concede');
  if (player.life <= 0) reasons.push('life');
  if (player.poison >= state.rules.poisonLethal) reasons.push('poison');
  if (state.rules.usesCommanderDamage) {
    const lethal = Object.values(player.commanderDamage).some(
      damage => damage >= state.rules.commanderDamageLethal
    );
    if (lethal) reasons.push('commander_damage');
  }
  // Only a game that tracks a library can deck someone out.
  if (state.mode === 'full' && player.drewFromEmptyLibrary) reasons.push('empty_library');
  return reasons;
}

/** CR 800.4a — everything a departing player owns leaves the game with them. */
function removePlayerCards(state: GameState, playerId: PlayerId): GameState {
  const player = getPlayer(state, playerId);
  if (!player) return state;

  const owned = Object.values(state.cards).filter(card => card.ownerId === playerId && !card.removedFromGame);
  if (owned.length === 0 && ZONES.every(zone => player.zones[zone].length === 0)) return state;

  const cards = { ...state.cards };
  for (const card of owned) {
    cards[card.instanceId] = { ...card, removedFromGame: true, attachedTo: undefined };
  }

  const ownedIds = new Set(owned.map(card => card.instanceId));
  const players = state.players.map(p => {
    if (p.id === playerId) return { ...p, zones: emptyZones() };
    let touched = false;
    const zones = {} as Record<Zone, InstanceId[]>;
    for (const zone of ZONES) {
      const filtered = p.zones[zone].filter(id => !ownedIds.has(id));
      if (filtered.length !== p.zones[zone].length) touched = true;
      zones[zone] = filtered;
    }
    return touched ? { ...p, zones } : p;
  });

  const combat = {
    attackers: state.combat.attackers.filter(
      declaration =>
        declaration.defenderPlayerId !== playerId && !ownedIds.has(declaration.attackerId)
    ),
  };

  return { ...state, cards, players, combat };
}

/**
 * Run loss and win detection. Called after every applied action, so a UI never
 * has to remember to ask "is anyone dead yet".
 */
export function checkStateBasedActions(state: GameState, at = state.updatedAt): GameState {
  if (state.status !== 'playing') return state;

  let next = state;
  const newlyLost: Array<{ player: Player; reasons: LossReason[] }> = [];

  for (const player of state.players) {
    if (player.hasLost) continue;
    const reasons = lossReasonsFor(state, player);
    if (reasons.length === 0) continue;
    newlyLost.push({ player, reasons });
  }

  for (const { player, reasons } of newlyLost) {
    next = patchPlayer(next, player.id, p => ({ ...p, hasLost: true, lossReasons: reasons }));
    next = pushEvent(next, {
      at,
      turn: next.turn,
      round: next.round,
      step: next.step,
      type: 'PLAYER_LOST',
      actorId: player.id,
      message: `${player.name} lost the game — ${lossReasonLabel(reasons[0])}.`,
    });
    if (next.mode === 'full') next = removePlayerCards(next, player.id);
  }

  const alive = livingPlayers(next);

  if (state.players.length > 1 && alive.length <= 1) {
    next = {
      ...next,
      status: 'complete',
      winnerIds: alive.map(p => p.id),
    };
    next = pushEvent(next, {
      at,
      turn: next.turn,
      round: next.round,
      step: next.step,
      type: 'GAME_OVER',
      actorId: alive[0]?.id,
      message: alive.length === 1 ? `${alive[0].name} wins the game.` : 'The game is a draw.',
    });
  } else if (state.players.length === 1 && alive.length === 0) {
    next = { ...next, status: 'complete', winnerIds: [] };
    next = pushEvent(next, {
      at,
      turn: next.turn,
      round: next.round,
      step: next.step,
      type: 'GAME_OVER',
      message: 'The game is over.',
    });
  }

  // The active player leaving hands the turn on.
  if (next.status === 'playing') {
    const active = getPlayer(next, next.activePlayerId);
    if (active && !isAlive(active)) {
      const upNext = nextLivingPlayer(next, next.activePlayerId);
      if (upNext) next = passTurn(next, upNext.id);
    }
  }

  return next;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const CARD_ACTIONS = new Set([
  'DRAW',
  'PLAY',
  'MOVE_ZONE',
  'TAP',
  'UNTAP',
  'UNTAP_ALL',
  'SHUFFLE',
  'ATTACK',
  'BLOCK',
  'SET_CARD_STAT',
  'SET_KEYWORD',
  'CREATE_TOKEN',
  'MARK_MANUAL_RESOLVED',
]);

/**
 * Pre-flight a action without applying it. UIs use this to disable controls;
 * `applyAction` runs it too and returns the state untouched on failure, so an
 * illegal action from a network peer can never corrupt a game.
 */
export function validateAction(state: GameState, action: GameAction): ValidationResult {
  if (!action || typeof action.type !== 'string') {
    return { ok: false, reason: 'Malformed action.' };
  }

  if (state.status === 'complete' && action.type !== 'RESET') {
    return { ok: false, reason: 'The game is over.' };
  }

  if (state.mode === 'life-counter' && CARD_ACTIONS.has(action.type)) {
    return { ok: false, reason: `${action.type} needs a full game — this is a life counter.` };
  }

  // Field presence is checked generically so every variant is covered by one pass.
  const anyAction = action as unknown as Record<string, unknown>;

  for (const key of ['playerId', 'targetPlayerId']) {
    const value = anyAction[key];
    if (typeof value === 'string' && !getPlayer(state, value)) {
      return { ok: false, reason: `Unknown player "${value}".` };
    }
  }

  // Two actions carry an `instanceId` that is not a card already in play:
  // CREATE_TOKEN names the id it is about to mint, and NOTE names the card a
  // line of prose is about — which may well be a token that has just ceased to
  // exist. Neither can be held to "this card must exist", and dropping a NOTE
  // silently would defeat the one rule this engine is built around.
  const ID_NEED_NOT_EXIST = action.type === 'CREATE_TOKEN' || action.type === 'NOTE';
  if (!ID_NEED_NOT_EXIST && 'instanceId' in anyAction && typeof anyAction.instanceId === 'string') {
    const card = state.cards[anyAction.instanceId];
    if (!card) return { ok: false, reason: 'Unknown card instance.' };
    if (card.removedFromGame) return { ok: false, reason: 'That card has left the game.' };
  }

  if (action.type === 'COMMANDER_DAMAGE') {
    if (!state.rules.usesCommanderDamage) {
      return { ok: false, reason: `${state.rules.label} has no commander damage.` };
    }
    if (!findCommander(state, action.commanderId)) {
      return { ok: false, reason: 'Unknown commander.' };
    }
  }

  if (action.type === 'CAST_COMMANDER' && !findCommander(state, action.commanderId)) {
    return { ok: false, reason: 'Unknown commander.' };
  }

  if (action.type === 'PHASE_CHANGE' && !TURN_STEPS.includes(action.step)) {
    return { ok: false, reason: `Unknown step "${action.step}".` };
  }

  if (action.type === 'MOVE_ZONE' && !ZONES.includes(action.to)) {
    return { ok: false, reason: `Unknown zone "${action.to}".` };
  }

  if (action.type === 'SET_KEYWORD' && !action.keyword.trim()) {
    return { ok: false, reason: 'A keyword is required.' };
  }

  if (action.type === 'CREATE_TOKEN' && !action.token?.name?.trim()) {
    return { ok: false, reason: 'A token needs a name.' };
  }

  if (action.type === 'NOTE' && !action.message.trim()) {
    return { ok: false, reason: 'An empty note says nothing.' };
  }

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Log prose                                                                  */
/* -------------------------------------------------------------------------- */

function describeAction(state: GameState, action: GameAction): string {
  switch (action.type) {
    case 'LIFE_CHANGE': {
      const verb = action.delta >= 0 ? 'gained' : 'lost';
      return `${playerName(state, action.playerId)} ${verb} ${Math.abs(action.delta)} life.`;
    }
    case 'SET_LIFE':
      return `${playerName(state, action.playerId)} set to ${action.life} life.`;
    case 'DAMAGE': {
      const source = action.sourceInstanceId ? cardName(state, action.sourceInstanceId) : undefined;
      const suffix = source ? ` from ${source}` : '';
      if (action.infect) {
        return `${playerName(state, action.targetPlayerId)} took ${action.amount} poison${suffix}.`;
      }
      return `${playerName(state, action.targetPlayerId)} took ${action.amount} damage${suffix}.`;
    }
    case 'COMMANDER_DAMAGE': {
      const commander = findCommander(state, action.commanderId);
      return `${playerName(state, action.targetPlayerId)} took ${Math.abs(action.amount)} commander damage from ${commander?.name ?? 'a commander'}.`;
    }
    case 'POISON':
      return `${playerName(state, action.playerId)} ${action.delta >= 0 ? 'gained' : 'lost'} ${Math.abs(action.delta)} poison.`;
    case 'CONCEDE':
      return `${playerName(state, action.playerId)} conceded.`;
    case 'PLAYER_COUNTER':
      return `${playerName(state, action.playerId)} ${action.delta >= 0 ? '+' : ''}${action.delta} ${action.counter}.`;
    case 'CARD_COUNTER':
      return `${cardName(state, action.instanceId)} ${action.delta >= 0 ? '+' : ''}${action.delta} ${action.counter} counters.`;
    case 'DRAW':
      return `${playerName(state, action.playerId)} drew ${action.count ?? 1} card${(action.count ?? 1) === 1 ? '' : 's'}.`;
    case 'PLAY':
      return `${playerName(state, state.cards[action.instanceId]?.controllerId ?? state.activePlayerId)} played ${cardName(state, action.instanceId)}.`;
    case 'MOVE_ZONE':
      return `${cardName(state, action.instanceId)} moved to ${action.to}.`;
    case 'TAP':
      return `${cardName(state, action.instanceId)} tapped.`;
    case 'UNTAP':
      return `${cardName(state, action.instanceId)} untapped.`;
    case 'UNTAP_ALL':
      return `${playerName(state, action.playerId)} untapped everything.`;
    case 'SHUFFLE':
      return `${playerName(state, action.playerId)} shuffled.`;
    case 'CAST_COMMANDER': {
      const commander = findCommander(state, action.commanderId);
      return `${commander?.name ?? 'A commander'} cast from the command zone.`;
    }
    case 'ATTACK':
      return `${playerName(state, state.activePlayerId)} attacked with ${action.attackers.length} creature${action.attackers.length === 1 ? '' : 's'}.`;
    case 'BLOCK':
      return `${action.blocks.length} block${action.blocks.length === 1 ? '' : 's'} declared.`;
    case 'END_COMBAT':
      return 'Combat ended.';
    case 'PHASE_CHANGE':
      return `Step: ${action.step}.`;
    case 'ADVANCE_STEP':
      return 'Advanced a step.';
    case 'PASS_TURN':
      return `Turn passed by ${playerName(state, state.activePlayerId)}.`;
    case 'SET_MONARCH':
      return action.playerId ? `${playerName(state, action.playerId)} is the monarch.` : 'No monarch.';
    case 'SET_INITIATIVE':
      return action.playerId ? `${playerName(state, action.playerId)} has the initiative.` : 'No initiative.';
    case 'SET_PLAYER_NAME':
      return `${playerName(state, action.playerId)} is now ${action.name}.`;
    case 'RESET':
      return 'Game reset.';
    case 'SET_CARD_STAT': {
      const name = cardName(state, action.instanceId);
      if (action.power === null && action.toughness === null) return `${name} back to printed stats.`;
      const parts: string[] = [];
      if (action.power !== undefined && action.power !== null) parts.push(`power ${action.power}`);
      if (action.toughness !== undefined && action.toughness !== null) {
        parts.push(`toughness ${action.toughness}`);
      }
      const verb = action.mode === 'adjust' ? 'adjusted by' : 'set to';
      return `${name} ${verb} ${parts.join(' and ') || 'nothing'}.`;
    }
    case 'SET_KEYWORD':
      return `${cardName(state, action.instanceId)} ${action.on ? 'flagged' : 'un-flagged'} ${action.keyword}.`;
    case 'CREATE_TOKEN': {
      const count = Math.max(1, action.count ?? 1);
      return `${playerName(state, action.playerId)} created ${count} ${action.token.name} token${count === 1 ? '' : 's'}.`;
    }
    case 'MARK_MANUAL_RESOLVED':
      return action.resolved === false
        ? `${cardName(state, action.instanceId)} marked as still needing manual resolution.`
        : `${cardName(state, action.instanceId)} resolved by hand.`;
    case 'NOTE':
      return action.message;
    default:
      return 'Action applied.';
  }
}

/* -------------------------------------------------------------------------- */
/* The reducer                                                                */
/* -------------------------------------------------------------------------- */

function reduce(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'LIFE_CHANGE':
      return patchPlayer(state, action.playerId, p => ({ ...p, life: p.life + action.delta }));

    case 'SET_LIFE':
      return patchPlayer(state, action.playerId, p => ({ ...p, life: action.life }));

    case 'DAMAGE':
      return applyDamage(state, action.targetPlayerId, {
        amount: action.amount,
        commanderId: action.commanderId,
        infect: action.infect,
      });

    case 'COMMANDER_DAMAGE':
      return applyDamage(state, action.targetPlayerId, {
        amount: action.amount,
        commanderId: action.commanderId,
      });

    case 'POISON':
      return patchPlayer(state, action.playerId, p => ({
        ...p,
        poison: Math.max(0, p.poison + action.delta),
      }));

    case 'CONCEDE':
      return patchPlayer(state, action.playerId, p => (p.conceded ? p : { ...p, conceded: true }));

    case 'PLAYER_COUNTER':
      return patchPlayer(state, action.playerId, p => ({
        ...p,
        counters: bumpCounter(p.counters, action.counter, action.delta),
      }));

    case 'CARD_COUNTER':
      return patchCard(state, action.instanceId, card => ({
        ...card,
        counters: bumpCounter(card.counters, action.counter, action.delta),
      }));

    case 'DRAW':
      return drawCards(state, action.playerId, Math.max(1, action.count ?? 1));

    case 'PLAY': {
      const card = state.cards[action.instanceId];
      if (!card) return state;
      const to: Zone = action.to ?? 'battlefield';
      let next = moveCard(state, action.instanceId, to, {
        tapped: action.tapped,
        controllerId: action.controllerId ?? card.controllerId,
      });
      if (card.zone === 'command' && card.isCommander) {
        next = incrementCommanderCast(next, action.instanceId);
      }
      if (to === 'battlefield' && (card.typeLine ?? '').toLowerCase().includes('land')) {
        next = patchPlayer(next, action.controllerId ?? card.controllerId, p => ({
          ...p,
          landsPlayedThisTurn: p.landsPlayedThisTurn + 1,
        }));
      }
      return next;
    }

    case 'MOVE_ZONE':
      return moveCard(state, action.instanceId, action.to, {
        position: action.position,
        controllerId: action.controllerId,
      });

    case 'TAP':
      return patchCard(state, action.instanceId, card => (card.tapped ? card : { ...card, tapped: true }));

    case 'UNTAP':
      return patchCard(state, action.instanceId, card => (card.tapped ? { ...card, tapped: false } : card));

    case 'UNTAP_ALL':
      return untapPermanents(state, action.playerId);

    case 'SHUFFLE': {
      const player = getPlayer(state, action.playerId);
      if (!player) return state;
      const rng: RngState = action.seed === undefined ? state.rng : { seed: action.seed };
      const result = shuffleWithRng(player.zones.library, rng);
      return {
        ...patchPlayer(state, action.playerId, p => ({
          ...p,
          zones: { ...p.zones, library: result.items },
        })),
        rng: result.rng,
      };
    }

    case 'CAST_COMMANDER':
      return patchCommander(state, action.commanderId, commander => ({
        ...commander,
        castCount: commander.castCount + 1,
      }));

    case 'ATTACK': {
      let next = state;
      for (const declaration of action.attackers) {
        if (declaration.tap !== false) {
          next = patchCard(next, declaration.attackerId, card =>
            card.tapped ? card : { ...card, tapped: true }
          );
        }
      }
      return {
        ...next,
        combat: {
          attackers: action.attackers.map(declaration => ({
            attackerId: declaration.attackerId,
            defenderPlayerId: declaration.defenderPlayerId,
            defenderInstanceId: declaration.defenderInstanceId,
            blockedBy: [],
          })),
        },
      };
    }

    case 'BLOCK': {
      const attackers = state.combat.attackers.map(declaration => {
        const blockers = action.blocks
          .filter(block => block.attackerId === declaration.attackerId)
          .map(block => block.blockerId);
        if (blockers.length === 0) return declaration;
        return { ...declaration, blockedBy: [...declaration.blockedBy, ...blockers] };
      });
      return { ...state, combat: { attackers } };
    }

    case 'END_COMBAT':
      return { ...state, combat: { attackers: [] } };

    case 'PHASE_CHANGE':
      return enterStep(state, action.step);

    case 'ADVANCE_STEP':
      return advanceStep(state);

    case 'PASS_TURN':
      return passTurn(state, action.toPlayerId);

    case 'SET_MONARCH':
      return { ...state, monarchId: action.playerId };

    case 'SET_INITIATIVE':
      return { ...state, initiativeId: action.playerId };

    case 'SET_PLAYER_NAME':
      return patchPlayer(state, action.playerId, p => ({ ...p, name: action.name }));

    case 'RESET':
      return resetGame(state);

    /* --- manual intervention --- */

    case 'SET_CARD_STAT':
      return patchCard(state, action.instanceId, card => {
        const adjust = action.mode === 'adjust';
        const basePower = card.powerOverride ?? printedNumber(card.power);
        const baseToughness = card.toughnessOverride ?? printedNumber(card.toughness);

        const nextPower =
          action.power === undefined
            ? card.powerOverride
            : action.power === null
              ? undefined
              : adjust
                ? basePower + action.power
                : action.power;

        const nextToughness =
          action.toughness === undefined
            ? card.toughnessOverride
            : action.toughness === null
              ? undefined
              : adjust
                ? baseToughness + action.toughness
                : action.toughness;

        if (nextPower === card.powerOverride && nextToughness === card.toughnessOverride) {
          return card;
        }
        return { ...card, powerOverride: nextPower, toughnessOverride: nextToughness };
      });

    case 'SET_KEYWORD':
      return patchCard(state, action.instanceId, card => {
        const next = toggleKeyword(card, action.keyword, action.on);
        const same =
          sameList(next.grantedKeywords, card.grantedKeywords) &&
          sameList(next.suppressedKeywords, card.suppressedKeywords);
        return same ? card : { ...card, ...next };
      });

    case 'CREATE_TOKEN': {
      const owner = getPlayer(state, action.playerId);
      if (!owner) return state;
      const count = Math.max(1, action.count ?? 1);
      let next = state;
      for (let index = 0; index < count; index++) {
        // Deterministic id: `version` is monotonic and bumps once per applied
        // action, so two clients replaying the same log derive the same ids.
        const instanceId =
          count === 1 && action.instanceId
            ? action.instanceId
            : `${action.playerId}-tk${state.version}-${index}`;
        if (next.cards[instanceId]) continue;
        next = addCard(
          next,
          {
            instanceId,
            cardId: `token:${action.token.name.toLowerCase().replace(/\s+/g, '-')}`,
            name: action.token.name,
            ownerId: action.playerId,
            controllerId: action.playerId,
            isToken: true,
            tapped: !!action.tapped,
            summoningSick: true,
            typeLine: action.token.typeLine ?? `Token — ${action.token.name}`,
            power: action.token.power,
            toughness: action.token.toughness,
            colorIdentity: action.token.colorIdentity,
            keywords: action.token.keywords,
            oracleText: action.token.oracleText ?? '',
            imageUrl: action.token.imageUrl,
          },
          'battlefield'
        );
      }
      return next;
    }

    case 'MARK_MANUAL_RESOLVED':
      return patchCard(state, action.instanceId, card => {
        const resolved = action.resolved !== false;
        return card.manualResolved === resolved ? card : { ...card, manualResolved: resolved };
      });

    case 'NOTE':
      // Changes nothing on purpose. A new object identity is what makes
      // `applyAction` log it instead of treating it as a rejected no-op — this
      // is the engine saying out loud that it did not resolve something.
      return { ...state };

    default:
      return state;
  }
}

function printedNumber(value: string | undefined): number {
  if (!value) return 0;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sameList(a: string[] | undefined, b: string[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function patchCommander(
  state: GameState,
  commanderId: CommanderId,
  patch: (commander: CommanderRef) => CommanderRef
): GameState {
  let changed = false;
  const players = state.players.map(player => {
    if (!player.commanders.some(c => c.id === commanderId)) return player;
    changed = true;
    return {
      ...player,
      commanders: player.commanders.map(c => (c.id === commanderId ? patch(c) : c)),
    };
  });
  return changed ? { ...state, players } : state;
}

function incrementCommanderCast(state: GameState, instanceId: InstanceId): GameState {
  const ref = allCommanders(state).find(commander => commander.instanceId === instanceId);
  let next = patchCard(state, instanceId, card => ({ ...card, castCount: card.castCount + 1 }));
  if (ref) next = patchCommander(next, ref.id, c => ({ ...c, castCount: c.castCount + 1 }));
  return next;
}

/**
 * Rewind life, poison, counters, commander damage and turn structure to the
 * start of a game, keeping the same players, seats and commanders. This is the
 * life counter's "new game" button. Cards are left where they are — a full
 * game should build a fresh state with `createGame` instead.
 */
export function resetGame(state: GameState): GameState {
  const players = state.players.map(player => ({
    ...player,
    life: state.rules.startingLife,
    poison: 0,
    counters: {},
    commanderDamage: {},
    commanders: player.commanders.map(commander => ({ ...commander, castCount: 0 })),
    landsPlayedThisTurn: 0,
    drewFromEmptyLibrary: false,
    conceded: false,
    hasLost: false,
    lossReasons: [],
  }));

  return {
    ...state,
    status: 'playing',
    players,
    turn: 1,
    round: 1,
    activePlayerId: state.startingPlayerId,
    priorityPlayerId: state.startingPlayerId,
    step: 'untap',
    combat: { attackers: [] },
    monarchId: null,
    initiativeId: null,
    winnerIds: [],
    log: [],
  };
}

/**
 * How deep a chain of triggered actions may run before the engine stops.
 *
 * A trigger can create a token, whose arrival can trigger something else. Real
 * Magic allows that to loop forever and calls it a draw; a playtest tool must
 * not hang, so the chain is capped and anything past the cap is simply not
 * applied. Four is deep enough for every trigger this module detects.
 */
const MAX_TRIGGER_DEPTH = 4;

function applyOne(state: GameState, action: GameAction, depth: number): GameState {
  const check = validateAction(state, action);
  if (!check.ok) return state;

  const at = action.at ?? state.updatedAt;
  const prefix = action.cause ? `${action.cause}: ` : '';
  const message = `${prefix}${describeAction(state, action)}`;

  const reduced = reduce(state, action);
  // A reducer that changed nothing is a no-op: no log entry, no version bump.
  if (reduced === state) return state;

  let next = logAction(reduced, action, at, message);
  next = { ...next, version: state.version + 1, updatedAt: at };
  next = checkStateBasedActions(next, at);

  // Triggered abilities. `effects.ts` reads the before and after states and
  // says what else should happen — including a NOTE when it has decided NOT to
  // resolve something, because a card that silently does nothing is the bug
  // this whole path exists to fix. Everything it returns is fed back through
  // the same reducer, so a trigger is an ordinary logged, undoable action, and
  // detection is pure so every client derives the identical chain.
  if (depth < MAX_TRIGGER_DEPTH) {
    for (const followUp of triggeredActionsFor(state, action, next, at)) {
      next = applyOne(next, followUp, depth + 1);
    }
  }

  return next;
}

/**
 * The reducer. Pure: same inputs, same output, no side effects, input untouched.
 * An invalid action returns the *same reference* back, so callers can cheaply
 * detect a rejected action with `next === prev`.
 */
export function applyAction(state: GameState, action: GameAction): GameState {
  return applyOne(state, action, 0);
}

/** Fold an action list. This is how a networked client replays a game log. */
export function applyActions(state: GameState, actions: readonly GameAction[]): GameState {
  return actions.reduce((current, action) => applyAction(current, action), state);
}
