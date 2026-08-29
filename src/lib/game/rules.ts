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
  ReplacementEffect,
  RngState,
  StackObject,
  Step,
  ValidationResult,
  Zone,
} from './types.ts';
import { toggleKeyword } from './keywords.ts';
import { isDieLabel, markLabel } from './marks.ts';
import type { SbaFinding } from './sba.ts';
import { lossReasonsFor, printedInteger, runStateBasedActions } from './sba.ts';
import {
  collectTriggers,
  drainTriggers,
  enqueueTriggers,
  orderTriggers,
  pendingTriggersOf,
  spellResolutionNotes,
} from './triggers.ts';
// CR 603.3d — judging a trigger's announced targets. The same
// `chooseTargetsFor` the question was asked with, so an answer cannot be
// accepted by one rule and resolved by another.
import { planTriggerTargets } from './announce.ts';
import {
  castSpell,
  clearStack,
  counterStackObject,
  hasSplitSecond,
  passPriority,
  popStack,
  putAbilityOnStack,
  resetPriority,
  stackFollowUps,
  stackObject,
  stackOf,
} from './stack.ts';
import { addReplacement, removeReplacement, replaceAction } from './replacement.ts';
import { manaUnitsFrom } from './mana.ts';
import { addTimedEffect, pruneTimedEffects } from './layers.ts';

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
    stack: [],
    passedPriority: [],
    nextStackId: 0,
    replacements: [],
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

  // A planeswalker registered straight onto the battlefield — a test fixture, a
  // restored game — gets the same CR 306.5b loyalty a cast one would, so
  // CR 704.5i does not put it in the graveyard on the very next check.
  if (zone === 'battlefield') {
    instance.counters = withStartingLoyalty(instance, instance.counters);
  }

  const zones = { ...owner.zones, [zone]: [...(owner.zones[zone] ?? []), instance.instanceId] };
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
  return (player.zones[zone] ?? []).map(id => state.cards[id]).filter(Boolean);
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
    // `?? []` because a game state persisted before a zone existed will not
    // have an array for it. A live backend holds those; crashing on one is not
    // an option.
    const list = player.zones[zone] ?? [];
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
  options: {
    position?: 'top' | 'bottom' | number;
    tapped?: boolean;
    controllerId?: PlayerId;
    /** CR 614.1c — counters the permanent *enters with*, set by replacement effects. */
    counters?: Record<string, number>;
    /** CR 303.4f — an Aura enters the battlefield already attached to its host. */
    attachedTo?: InstanceId;
  } = {}
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
    const current = stripped.zones[to] ?? [];
    const list =
      to === 'library'
        ? insertInto(current, instanceId, options.position ?? 'top')
        : [...current, instanceId];
    return { ...stripped, zones: { ...stripped.zones, [to]: list } };
  });

  const enteringBattlefield = to === 'battlefield' && card.zone !== 'battlefield';
  const leavingBattlefield = card.zone === 'battlefield' && to !== 'battlefield';
  const changedZone = card.zone !== to;
  const nextCard: CardInstance = {
    ...card,
    zone: to,
    // CR 400.7 — what arrives is a new object, and this is how anything
    // still pointing at the old one finds out.
    zoneChangeCounter: (card.zoneChangeCounter ?? 0) + (changedZone ? 1 : 0),
    controllerId: options.controllerId ?? (to === 'battlefield' ? card.controllerId : card.ownerId),
    tapped: to === 'battlefield' ? options.tapped ?? false : false,
    // Leaving the battlefield resets everything a permanent was carrying —
    // including the player's own overrides and hand-flagged keywords, because
    // what comes back is a new object (CR 400.7).
    damage: to === 'battlefield' ? card.damage : 0,
    // Marked damage and the deathtouch flag travel together — a permanent that
    // left and came back is a new object with neither (CR 400.7).
    damagedByDeathtouch: to === 'battlefield' ? card.damagedByDeathtouch : undefined,
    // CR 614.1c — a permanent that enters with counters has them from the
    // moment it arrives, so an ETB trigger reading them sees the right number.
    // CR 306.5b — a planeswalker enters with its printed loyalty, which is also
    // what stops CR 704.5i binning it the instant it lands.
    counters: enteringBattlefield
      ? withStartingLoyalty(card, { ...(options.counters ?? {}) })
      : to === 'battlefield'
        ? card.counters
        : {},
    // An Aura entering attached says where; anything else keeps what it had on
    // the battlefield and loses it everywhere else.
    attachedTo: to === 'battlefield' ? options.attachedTo ?? card.attachedTo : undefined,
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

/**
 * CR 306.5b — a planeswalker enters the battlefield with loyalty counters equal
 * to its printed loyalty.
 *
 * Seeded here rather than left to the caller because CR 704.5i puts a
 * planeswalker with no loyalty into its graveyard: without this, every
 * planeswalker would die on arrival. A card with no printed loyalty is left
 * alone and `sba.ts` declines to judge it, which is the honest pairing — the
 * engine never destroys a permanent on a number it does not have.
 */
function withStartingLoyalty(
  card: CardInstance,
  counters: Record<string, number>
): Record<string, number> {
  if (!(card.typeLine ?? '').toLowerCase().includes('planeswalker')) return counters;
  if (counters.loyalty !== undefined) return counters;
  const printed = printedInteger(card.loyalty);
  if (printed === null || printed <= 0) return counters;
  return { ...counters, loyalty: printed };
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
    if (!card.damage && !card.damagedByDeathtouch) continue;
    if (!changed) {
      cards = { ...cards };
      changed = true;
    }
    // CR 704.5h speaks of damage dealt "since state-based actions were last
    // checked", so the flag cannot outlive the damage that carried it.
    cards[id] = { ...card, damage: 0, damagedByDeathtouch: undefined };
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
  /*
   * "Only once each turn" and CR 606.3's one loyalty ability per planeswalker
   * are counted per TURN, not per player, so the whole record clears here
   * rather than under the active seat. Dropped rather than emptied: an absent
   * key and a zero mean the same thing to `abilityUsesThisTurn`, and a state
   * that carries no key is the one that compares equal to a freshly created
   * game after a replay.
   */
  if (next.abilityUses && Object.keys(next.abilityUses).length > 0) {
    const { abilityUses: _cleared, ...rest } = next;
    next = rest as GameState;
  }
  /*
   * Housekeeping, not a rule. `liveTimedEffects` already refuses to apply an
   * effect whose expiry has passed, so last turn's Giant Growth stopped pumping
   * the moment the turn counter moved, with or without this line. Dropping the
   * row keeps a long game from carrying a record of every pump ever cast.
   */
  next = pruneTimedEffects(next);
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
    ...emptyManaPools(clearMarkedDamage(state)),
    turn: state.turn + 1,
    round: wrapped ? state.round + 1 : state.round,
    activePlayerId: upNext.id,
    priorityPlayerId: upNext.id,
    passedPriority: [],
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

/**
 * CR 500.4 — every mana pool empties as a step or phase ends.
 *
 * Called from `enterStep` and from `passTurn`, which between them are the only
 * ways the game leaves a step, so there is no boundary where somebody has to
 * remember to do this. That is what makes floating mana safe to hold in state:
 * it cannot outlive the step it was made in, whatever anybody forgets.
 *
 * Returns the same object when the pools are already empty, which is the normal
 * case, so the memoised layer computation is not thrown away every step.
 */
function emptyManaPools(state: GameState): GameState {
  const pool = state.manaPool;
  if (!pool) return state;
  if (Object.values(pool).every(units => (units ?? []).length === 0)) return state;
  return { ...state, manaPool: {} };
}

function enterStep(state: GameState, step: Step): GameState {
  // CR 117.3a — the active player receives priority at the start of each step
  // that has one, and the round of passes starts over.
  let next: GameState = resetPriority(emptyManaPools({ ...state, step }));

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

/** CR 800.4a — everything a departing player owns leaves the game with them. */
function removePlayerCards(state: GameState, playerId: PlayerId): GameState {
  const player = getPlayer(state, playerId);
  if (!player) return state;

  const owned = Object.values(state.cards).filter(card => card.ownerId === playerId && !card.removedFromGame);
  if (owned.length === 0 && ZONES.every(zone => (player.zones[zone] ?? []).length === 0)) return state;

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
      const existing = p.zones[zone] ?? [];
      const filtered = existing.filter(id => !ownedIds.has(id));
      if (filtered.length !== existing.length) touched = true;
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
 * Apply one state-based action. The `apply` half of `sba.ts`'s detect/apply
 * split: everything that moves a card between zones, marks a player as out, or
 * writes to the log lives here, so `sba.ts` stays a pure selector with no
 * dependency on this module.
 *
 * Every branch logs. CR 704 actions happen without anybody doing anything, so
 * an unexplained empty battlefield is exactly the kind of silence this engine
 * treats as a bug.
 */
function applySbaFinding(state: GameState, finding: SbaFinding, at: number): GameState {
  const say = (message: string, actorId?: PlayerId): GameState =>
    pushEvent(state, {
      at,
      turn: state.turn,
      round: state.round,
      step: state.step,
      type: 'STATE_BASED_ACTION',
      actorId,
      message: `${message} (CR ${finding.rule})`,
    });

  switch (finding.kind) {
    case 'player-loses': {
      const player = finding.playerId ? getPlayer(state, finding.playerId) : undefined;
      if (!player) return state;
      const reasons = lossReasonsFor(state, player);
      let next = patchPlayer(state, player.id, p => ({ ...p, hasLost: true, lossReasons: reasons }));
      next = pushEvent(next, {
        at,
        turn: next.turn,
        round: next.round,
        step: next.step,
        type: 'PLAYER_LOST',
        actorId: player.id,
        message: `${player.name} lost the game — ${lossReasonLabel(reasons[0] ?? 'effect')}.`,
      });
      if (next.mode === 'full') next = removePlayerCards(next, player.id);
      return next;
    }

    case 'token-ceases': {
      const id = finding.instanceId;
      const card = id ? state.cards[id] : undefined;
      if (!id || !card) return state;
      const players = state.players.map(player => removeFromZones(player, id));
      const next: GameState = {
        ...state,
        players,
        cards: { ...state.cards, [id]: { ...card, removedFromGame: true, attachedTo: undefined } },
      };
      return pushEvent(next, {
        at,
        turn: next.turn,
        round: next.round,
        step: next.step,
        type: 'STATE_BASED_ACTION',
        message: `${card.name} ceased to exist — ${finding.detail} (CR ${finding.rule}).`,
      });
    }

    case 'creature-zero-toughness':
    case 'creature-destroyed':
    case 'planeswalker-dies':
    case 'aura-illegal': {
      const id = finding.instanceId;
      const card = id ? state.cards[id] : undefined;
      if (!id || !card) return state;
      const next = say(`${card.name} was put into its owner's graveyard — ${finding.detail}`);
      return moveCard(next, id, 'graveyard');
    }

    case 'legend-rule': {
      const id = finding.instanceId;
      const card = id ? state.cards[id] : undefined;
      if (!id || !card) return state;
      const kept = finding.keptInstanceId ? state.cards[finding.keptInstanceId] : undefined;
      const next = say(
        `The legend rule put ${card.name} into its owner's graveyard; ${kept ? 'the copy that has been in play longest' : 'the other copy'} stays. Move the other one by hand if that was the wrong choice`
      );
      return moveCard(next, id, 'graveyard');
    }

    case 'equipment-unattached': {
      const id = finding.instanceId;
      const card = id ? state.cards[id] : undefined;
      if (!id || !card) return state;
      const next = say(`${card.name} became unattached — ${finding.detail}`);
      return patchCard(next, id, c => ({ ...c, attachedTo: undefined }));
    }

    case 'counters-annihilate': {
      const id = finding.instanceId;
      const card = id ? state.cards[id] : undefined;
      const pairs = finding.amount ?? 0;
      if (!id || !card || pairs <= 0) return state;
      const next = say(`${card.name}: ${finding.detail}`);
      return patchCard(next, id, c => {
        let counters = bumpCounter(c.counters, '+1/+1', -pairs);
        counters = bumpCounter(counters, '-1/-1', -pairs);
        return { ...c, counters };
      });
    }

    default:
      return state;
  }
}

/**
 * CR 704 — apply state-based actions until none apply, then settle the game.
 *
 * Called after every applied action, so no UI ever has to remember to ask "is
 * anyone dead yet". The *loop* is the important part and the thing a one-pass
 * implementation gets wrong: a creature dying frees an Aura, the Aura hitting
 * the graveyard can drop a life total, and a player leaving takes their
 * permanents with them, which can free more Auras. `sba.ts` owns the detection
 * and the loop; this function owns applying a finding and the once-only work
 * that follows — who won, and handing the turn on when the active player is the
 * one who left.
 */
export function checkStateBasedActions(state: GameState, at = state.updatedAt): GameState {
  if (state.status !== 'playing') return state;

  const run = runStateBasedActions(state, (current, finding) =>
    applySbaFinding(current, finding, at)
  );
  let next = run.state;

  if (!run.stable) {
    // CR 704.4 calls an unbreakable loop a draw. A playtest tool must not hang,
    // so it stops and says so rather than presenting a healthy-looking game.
    next = pushEvent(next, {
      at,
      turn: next.turn,
      round: next.round,
      step: next.step,
      type: 'STATE_BASED_ACTION',
      message: `State-based actions did not settle after ${run.iterations} passes. In a real game this loop would be a draw (CR 704.4); check the board by hand.`,
    });
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
  'UNBLOCK',
  'ORDER_BLOCKERS',
  'SET_CARD_STAT',
  'SET_KEYWORD',
  'CREATE_TOKEN',
  'MARK_MANUAL_RESOLVED',
  // Damage marked on a permanent, and attachment: both need a permanent to
  // exist, which a life counter has no way to produce.
  'DAMAGE_CARD',
  'ATTACH',
  // The stack is a card zone; a life counter has no cards to put on it.
  'CAST_SPELL',
  'PUT_ABILITY_ON_STACK',
  'PASS_PRIORITY',
  'RESOLVE_STACK',
  'COUNTER_SPELL',
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

  /*
   * CR 509.2 — a damage assignment order is a REORDER, never a re-declaration.
   *
   * The check is a permutation test rather than a subset test, on purpose. A
   * list missing one blocker would quietly take that creature out of combat: it
   * would stop taking damage AND stop dealing it, from an action whose whole
   * job is supposed to be cosmetic ordering. An extra id would put a creature
   * into a block it never declared. Both are refused with the reason said, so a
   * client bug shows up as a refusal instead of as a board that silently
   * changed under the player.
   */
  if (action.type === 'ORDER_BLOCKERS') {
    const lane = state.combat.attackers.find(d => d.attackerId === action.attackerId);
    if (!lane) return { ok: false, reason: 'That creature is not attacking.' };
    if (lane.blockedBy.length < 2) {
      return { ok: false, reason: 'Nothing to order: fewer than two blockers.' };
    }
    const wanted = action.blockerIds ?? [];
    if (wanted.length !== lane.blockedBy.length) {
      return { ok: false, reason: 'An order must list every blocker exactly once.' };
    }
    const seen = new Set<InstanceId>();
    for (const id of wanted) {
      if (seen.has(id)) return { ok: false, reason: 'A blocker is listed twice.' };
      if (lane.blockedBy.indexOf(id) === -1) {
        return { ok: false, reason: 'That creature is not blocking this attacker.' };
      }
      seen.add(id);
    }
  }

  /* --- the stack --- */

  if (action.type === 'CAST_SPELL') {
    const card = state.cards[action.instanceId];
    if (card && card.zone === 'stack') {
      return { ok: false, reason: 'That spell is already on the stack.' };
    }
    // CR 702.61a — nothing but mana abilities while split second is waiting.
    //
    // Holding priority is deliberately NOT enforced here. DeckMatrix's existing
    // surfaces are manual-first and do not run a strict priority loop; making
    // the reducer refuse a cast because the loop was not driven would break
    // them for no rules benefit, since an illegal-timing cast is a table
    // problem, not a state-corruption one. A UI that wants the real thing gates
    // on `canRespond()`, which is exported for exactly that.
    if (hasSplitSecond(state)) {
      return { ok: false, reason: 'A spell with split second is on the stack.' };
    }
  }

  if (action.type === 'PUT_ABILITY_ON_STACK') {
    if (!getPlayer(state, action.controllerId)) {
      return { ok: false, reason: `Unknown player "${action.controllerId}".` };
    }
    if (!action.name.trim()) return { ok: false, reason: 'An ability needs a name.' };
    // CR 702.61b — triggers still trigger and still go on the stack under
    // split second; only *playing* things is stopped. So only activated
    // abilities are refused here.
    if (action.kind === 'activated' && hasSplitSecond(state)) {
      return { ok: false, reason: 'A spell with split second is on the stack.' };
    }
  }

  if (action.type === 'PASS_PRIORITY') {
    const playerId = action.playerId ?? state.priorityPlayerId;
    if (playerId !== state.priorityPlayerId) {
      return { ok: false, reason: 'That player does not have priority.' };
    }
    const player = getPlayer(state, playerId);
    if (!player || !isAlive(player)) {
      return { ok: false, reason: 'That player has left the game.' };
    }
  }

  if (action.type === 'RESOLVE_STACK' && stackOf(state).length === 0) {
    return { ok: false, reason: 'The stack is empty.' };
  }

  if (action.type === 'COUNTER_SPELL') {
    const object = stackObject(state, action.stackId);
    if (!object) return { ok: false, reason: 'That is not on the stack.' };
    // CR 701.5b. Fizzling is not countering (CR 608.2b), so this flag does not
    // appear anywhere near `willFizzle`.
    if (object.cantBeCountered) {
      return { ok: false, reason: `${object.name} can't be countered.` };
    }
  }

  if (action.type === 'ADD_REPLACEMENT') {
    const effect = action.effect;
    if (!effect?.id?.trim()) return { ok: false, reason: 'A replacement effect needs an id.' };
    if (!effect.event) return { ok: false, reason: 'A replacement effect needs an event kind.' };
    if (!effect.apply?.op) return { ok: false, reason: 'A replacement effect needs an operation.' };
  }

  if (action.type === 'ADD_CONTINUOUS') {
    const effect = action.effect;
    if (!effect?.id?.trim()) return { ok: false, reason: 'A continuous effect needs an id.' };
    // A stored effect with no expiry would never end, and "never" has to be
    // said rather than left out, because the field is optional for the
    // statics-derived effects that are rebuilt from the board every read.
    if (!effect.expiry?.kind) return { ok: false, reason: 'A stored continuous effect needs an expiry.' };
    if (!effect.affects?.kind) return { ok: false, reason: 'A continuous effect needs something to affect.' };
    if (!Array.isArray(effect.parts) || effect.parts.length === 0) {
      return { ok: false, reason: 'A continuous effect with no parts changes nothing.' };
    }
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
    case 'DAMAGE_CARD': {
      const source = action.sourceInstanceId ? cardName(state, action.sourceInstanceId) : undefined;
      const from = source ? ` from ${source}` : '';
      const touch = action.deathtouch ? ' (deathtouch)' : '';
      return `${cardName(state, action.instanceId)} was dealt ${action.amount} damage${from}${touch}.`;
    }
    case 'ATTACH':
      return action.toInstanceId
        ? `${cardName(state, action.instanceId)} attached to ${cardName(state, action.toInstanceId)}.`
        : `${cardName(state, action.instanceId)} unattached.`;
    case 'PLAYER_COUNTER':
      return `${playerName(state, action.playerId)} ${action.delta >= 0 ? '+' : ''}${action.delta} ${action.counter}.`;
    case 'CARD_COUNTER': {
      /*
       * A MARK A PLAYER PUT THERE IS NOT "N COUNTERS", AND ITS KEY IS NOT A
       * WORD ANYBODY TYPED.
       *
       * Free markers and dice are stored as counters under a fenced key (see
       * `marks.ts`), so without this branch the log would read *"Atraxa +17
       * mark:d20 counters."* — a storage prefix on the table, in the one
       * sentence whose whole job is to tell a player what just happened. That
       * is this project's `~` bug for a second time; `manual.ts` records the
       * first, where a parser's notation reached the upkeep strip.
       */
      const mark = markLabel(action.counter);
      if (mark !== null) {
        const name = cardName(state, action.instanceId);
        if (isDieLabel(mark)) {
          const face = state.cards[action.instanceId]?.counters[action.counter] ?? 0;
          /* The die's FACE, not the change to it. Rolling a 3 over a 17 is a
             delta of −14, and "−14 on a d20" is not a thing that happened. */
          return `${name}: ${mark} showing ${face + action.delta}.`;
        }
        if (action.delta < 0) {
          const left = (state.cards[action.instanceId]?.counters[action.counter] ?? 0) + action.delta;
          return left <= 0
            ? `${name}: ${mark} taken off.`
            : `${name}: ${mark} down to ${left}.`;
        }
        const now = (state.cards[action.instanceId]?.counters[action.counter] ?? 0) + action.delta;
        return now === 1 ? `${name} marked ${mark}.` : `${name}: ${mark} up to ${now}.`;
      }
      return `${cardName(state, action.instanceId)} ${action.delta >= 0 ? '+' : ''}${action.delta} ${action.counter} counters.`;
    }
    case 'DRAW':
      return `${playerName(state, action.playerId)} drew ${action.count ?? 1} card${(action.count ?? 1) === 1 ? '' : 's'}.`;
    case 'PLAY':
      return `${playerName(state, state.cards[action.instanceId]?.controllerId ?? state.activePlayerId)} played ${cardName(state, action.instanceId)}.`;
    case 'MOVE_ZONE': {
      const moving = state.cards[action.instanceId];
      /* CR 903.9a is a decision, and "moved to command" is not a sentence that
         records one. The log has to say what was chosen and where it came from,
         because the alternative — leaving it in the graveyard — was equally
         legal and a reader has no other way to tell the two apart. */
      if (action.to === 'command' && moving?.isCommander && moving.zone !== 'command') {
        return (
          `${cardName(state, action.instanceId)} went to the command zone from the ` +
          `${moving.zone} instead of staying there (CR 903.9a).`
        );
      }
      return `${cardName(state, action.instanceId)} moved to ${action.to}.`;
    }
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
      const name = commander?.name ?? 'A commander';
      // Read BEFORE the reduce, so this is the tax being paid for THIS cast
      // rather than the one the next cast will pay. `describeAction` is called
      // on the pre-reduce state for exactly this kind of reason.
      const tax = commanderTax(state, action.commanderId);
      if (tax <= 0) return `${name} cast from the command zone.`;
      return (
        `${name} cast from the command zone, ${tax} more mana for ` +
        `${commander?.castCount === 1 ? 'the previous cast' : `${commander?.castCount ?? 0} previous casts`}.`
      );
    }
    case 'ATTACK':
      return `${playerName(state, state.activePlayerId)} attacked with ${action.attackers.length} creature${action.attackers.length === 1 ? '' : 's'}.`;
    case 'BLOCK':
      return `${action.blocks.length} block${action.blocks.length === 1 ? '' : 's'} declared.`;
    case 'UNBLOCK':
      return `${cardName(state, action.blockerId)} stopped blocking.`;
    case 'ORDER_BLOCKERS':
      return (
        `${cardName(state, action.attackerId)} assigns damage to ` +
        `${action.blockerIds.map(id => cardName(state, id)).join(', then ')}.`
      );
    case 'END_COMBAT':
      return 'Combat ended.';
    case 'CAST_SPELL': {
      const card = state.cards[action.instanceId];
      const who = playerName(state, action.controllerId ?? card?.controllerId ?? state.activePlayerId);
      return `${who} cast ${cardName(state, action.instanceId)}.`;
    }
    case 'PUT_ABILITY_ON_STACK':
      return `${action.name} goes on the stack.`;
    case 'PASS_PRIORITY':
      return `${playerName(state, action.playerId ?? state.priorityPlayerId)} passed priority.`;
    case 'RESOLVE_STACK': {
      const top = stackOf(state)[stackOf(state).length - 1];
      return top ? `${top.name} resolves.` : 'Nothing to resolve.';
    }
    case 'COUNTER_SPELL': {
      const object = stackObject(state, action.stackId);
      const name = object ? object.name : 'A spell';
      return action.reason ? `${name} countered by ${action.reason}.` : `${name} countered.`;
    }
    case 'ADD_REPLACEMENT':
      return `${action.effect.name} is now replacing ${action.effect.event} events.`;
    case 'REMOVE_REPLACEMENT':
      return 'A replacement effect ended.';
    case 'ADD_CONTINUOUS':
      /*
       * The note is a whole sentence written by whoever built the effect, and it
       * has to be: only the builder knows which cards the selector matched and
       * whether the verb is "gets" or "get". Assembling it here from the id list
       * would be a second, worse version of that sentence.
       */
      return `${action.effect.note ?? 'A continuous effect began'}.`;
    case 'ADD_MANA': {
      /*
       * No branch for "this string adds nothing". `applyOne` never reaches this
       * function for an action whose reducer changed nothing, so such a line
       * could not print, and copy that can never print is a small untruth about
       * what the log does. The honest sentence for that case comes from
       * `addManaToActions`, one step earlier, where there is still something to
       * say it on. See the reducer.
       */
      const who = playerName(state, action.playerId);
      const from = action.sourceName ? ` from ${action.sourceName}` : '';
      const restriction = action.restriction ? `. ${action.restriction}` : '';
      return `${who} adds ${action.mana}${from}${restriction}.`;
    }
    case 'SPEND_MANA':
      return `${playerName(state, action.playerId)} spent ${action.colors
        .map(color => `{${color}}`)
        .join('')} from their pool.`;
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
    case 'ANNOUNCE_TRIGGER_TARGETS': {
      /*
       * Named in the log, because a trigger being aimed is a play. A watcher
       * who sees "Angel of Despair's ability destroys that land" without ever
       * seeing the land chosen has no way to tell a decision from a default.
       */
      const queue = pendingTriggersOf(state);
      const trigger = queue.find(entry => entry.id === action.triggerId);
      const named = action.targets
        .map(target =>
          target.kind === 'player'
            ? playerName(state, target.playerId)
            : cardName(state, target.instanceId)
        )
        .filter(Boolean);
      const who = trigger ? `${trigger.sourceName}'s triggered ability` : 'A triggered ability';
      return named.length > 0 ? `${who} is aimed at ${named.join(' and ')}.` : `${who} is aimed.`;
    }
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

    // CR 119.3 — damage is *marked*, and nothing more. Whether that is lethal
    // is CR 704.5g/h, checked by `sba.ts` the next time state-based actions run,
    // which is immediately after this action is applied.
    case 'DAMAGE_CARD':
      return patchCard(state, action.instanceId, card => {
        const damage = Math.max(0, card.damage + action.amount);
        const deathtouched = action.deathtouch ? true : card.damagedByDeathtouch;
        if (damage === card.damage && deathtouched === card.damagedByDeathtouch) return card;
        return { ...card, damage, damagedByDeathtouch: deathtouched };
      });

    case 'ATTACH':
      return patchCard(state, action.instanceId, card => {
        const to = action.toInstanceId ?? undefined;
        if (card.attachedTo === to) return card;
        // Attaching to something that is not in play at all is refused rather
        // than recorded, so CR 704.5m does not immediately bin the card for a
        // mistake the caller could have been told about.
        if (to && !state.cards[to]) return card;
        return { ...card, attachedTo: to };
      });

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
        counters: action.counters,
        // Only when the host is really on the battlefield. An Aura pointed at
        // something that has gone would enter attached to a ghost, and CR
        // 704.5m would bin it a moment later for a reason nobody could read.
        ...(action.attachedTo && state.cards[action.attachedTo]
          ? { attachedTo: action.attachedTo }
          : {}),
      });
      /* The commander tax used to be counted right here, off `card.zone ===
         'command'`. It is counted by `CAST_COMMANDER` now, which `moves.ts`
         builds as part of the cast batch. The difference is not tidiness: this
         version charged tax for any `PLAY` of a card that happened to be in the
         command zone, so a free "put your commander onto the battlefield"
         effect made the next real cast two mana dearer, and the count could not
         be read off the action log at all. */
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
        counters: action.counters,
        tapped: action.tapped,
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

    /*
     * CR 903.8 — the cast is counted here and nowhere else.
     *
     * `CommanderRef.castCount` drives the tax and `CardInstance.castCount` is
     * the same fact on the card, so both move together or a surface reading one
     * of them lies. `incrementCommanderCast` owns that pairing; this case is
     * the only caller left.
     */
    case 'CAST_COMMANDER': {
      const commander = findCommander(state, action.commanderId);
      if (!commander) return state;
      const instanceId = action.instanceId ?? commander.instanceId;
      if (instanceId && state.cards[instanceId]) return incrementCommanderCast(state, instanceId);
      // Life-counter mode has refs and no cards, and the tax still has to count.
      return patchCommander(state, action.commanderId, ref => ({
        ...ref,
        castCount: ref.castCount + 1,
      }));
    }

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
        /* Deliberately deduplicated against what is already there. `BLOCK`
           appends, and a board where the same chip can be pressed twice would
           otherwise list one creature in one lane twice — which `resolveCombat`
           reads as two blockers and assigns damage to twice. */
        const blockers = action.blocks
          .filter(block => block.attackerId === declaration.attackerId)
          .map(block => block.blockerId)
          .filter(
            (id, index, all) =>
              all.indexOf(id) === index && declaration.blockedBy.indexOf(id) === -1
          );
        if (blockers.length === 0) return declaration;
        return { ...declaration, blockedBy: [...declaration.blockedBy, ...blockers] };
      });
      return { ...state, combat: { attackers } };
    }

    /* The way back out of a block, so a misclick during the declare blockers
       step is not permanent. See the note on the action in `types.ts`. */
    case 'UNBLOCK': {
      let changed = false;
      const attackers = state.combat.attackers.map(declaration => {
        if (action.attackerId && declaration.attackerId !== action.attackerId) return declaration;
        if (declaration.blockedBy.indexOf(action.blockerId) === -1) return declaration;
        changed = true;
        return {
          ...declaration,
          blockedBy: declaration.blockedBy.filter(id => id !== action.blockerId),
        };
      });
      // Same reference when nothing moved: the transport treats an unchanged
      // state as a rejected action and keeps it out of the undo history.
      return changed ? { ...state, combat: { attackers } } : state;
    }

    /* CR 509.2. `validateAction` has already proved `blockerIds` is a
       permutation of this lane's `blockedBy`, so this only has to write it. */
    case 'ORDER_BLOCKERS': {
      let changed = false;
      const attackers = state.combat.attackers.map(declaration => {
        if (declaration.attackerId !== action.attackerId) return declaration;
        if (declaration.blockedBy.join('|') === action.blockerIds.join('|')) return declaration;
        changed = true;
        return { ...declaration, blockedBy: [...action.blockerIds] };
      });
      // Same reference when nothing moved, the way `UNBLOCK` does it: the
      // transport reads an unchanged state as a rejected action and keeps it
      // out of the undo history.
      return changed ? { ...state, combat: { attackers } } : state;
    }

    case 'END_COMBAT':
      return { ...state, combat: { attackers: [] } };

    /* --- the stack and priority (stack.ts owns the rules; this owns the cards) --- */

    case 'CAST_SPELL': {
      const card = state.cards[action.instanceId];
      if (!card) return state;
      const built = castSpell(state, action);
      if (!built) return state;
      // CR 601.2a — the card physically moves to the stack. Its controller is
      // the caster, not its owner, so a spell cast off someone else's library
      // resolves under the right person.
      // Commander tax is counted by `CAST_COMMANDER`, which `moves.ts` puts
      // into the batch immediately before this. See the note on `PLAY`.
      return moveCard(built.state, action.instanceId, 'stack', {
        controllerId: built.object.controllerId,
      });
    }

    case 'PUT_ABILITY_ON_STACK': {
      const built = putAbilityOnStack(state, action);
      if (!built) return state;
      /*
       * CR 602.2a — the ability is on the stack, so it HAS been activated, and
       * that is true whether or not it goes on to resolve. Counting it here
       * rather than in the caller means a bot batch, a human click and a
       * replayed log all reach the same count, which is the only way a
       * "once each turn" limit can survive a replay.
       */
      if (action.kind !== 'activated' || !action.abilityId || !action.sourceInstanceId) {
        return built.state;
      }
      const key = `${action.sourceInstanceId}:${action.abilityId}`;
      return {
        ...built.state,
        abilityUses: { ...(built.state.abilityUses ?? {}), [key]: (built.state.abilityUses?.[key] ?? 0) + 1 },
      };
    }

    case 'PASS_PRIORITY':
      return passPriority(state, action.playerId ?? state.priorityPlayerId);

    case 'RESOLVE_STACK': {
      const popped = popStack(state);
      return popped ? popped.state : state;
    }

    case 'COUNTER_SPELL':
      return counterStackObject(state, action.stackId);

    /* --- replacement effects --- */

    case 'ADD_REPLACEMENT':
      return addReplacement(state, action.effect);

    case 'REMOVE_REPLACEMENT':
      return removeReplacement(state, action.replacementId);

    /* --- continuous effects a resolved spell left behind --- */

    case 'ADD_CONTINUOUS':
      return addTimedEffect(state, action.effect);

    /* --- mana (CR 106) --- */

    case 'ADD_MANA': {
      const { units } = manaUnitsFrom(action.mana, {
        ...(action.restriction ? { restriction: action.restriction } : {}),
        ...(action.sourceName ? { sourceName: action.sourceName } : {}),
      });
      /*
       * A mana string that yields no mana. UNREACHABLE FROM THE ENGINE, and
       * that is a guarantee rather than a hope: the one producer of this action
       * is `addManaToActions`, which defers with a note for any symbol it will
       * not guess at and emits nothing. `mana.test.ts` pins that.
       *
       * The guarantee matters because `applyOne` drops an action whose reducer
       * changed nothing, with no log entry and no version bump. So a no-op
       * ADD_MANA would be the silent no-op this project keeps finding, and the
       * place to stop it is at the producer, where there is still a `deferred`
       * channel to say something on.
       */
      if (units.length === 0) return state;
      return {
        ...state,
        manaPool: {
          ...(state.manaPool ?? {}),
          [action.playerId]: [...(state.manaPool?.[action.playerId] ?? []), ...units],
        },
      };
    }

    case 'SPEND_MANA': {
      const existing = state.manaPool?.[action.playerId] ?? [];
      if (existing.length === 0 || action.colors.length === 0) return state;

      /*
       * Take the FIRST unit of each colour asked for. Deterministic, so two
       * clients replaying this log remove the same units and their pools stay
       * identical; and oldest-first, which is the order a player thinks of
       * their own floating mana in.
       *
       * A colour that is not there is skipped rather than failing the action.
       * `planPayment` cannot produce such a list, and refusing the whole action
       * if it ever did would take the mana off nobody and leave the spell
       * already paid for by the taps in the same batch.
       */
      const remaining = [...existing];
      for (const color of action.colors) {
        const index = remaining.findIndex(unit => unit.color === color && !unit.restriction);
        if (index >= 0) remaining.splice(index, 1);
      }
      if (remaining.length === existing.length) return state;
      return { ...state, manaPool: { ...(state.manaPool ?? {}), [action.playerId]: remaining } };
    }

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

    /*
     * CR 603.3d — the controller of a waiting trigger says what it is aimed at.
     *
     * Only the TOP of the queue may be answered, because that is the only one
     * on the stack: `drainTriggers` pops last-in-first-out, and letting a
     * player aim a trigger further down would be aiming it at a board that has
     * not happened yet. The id is checked rather than the position, so a stale
     * answer sent twice over a transport is refused instead of landing on
     * whatever happens to be on top now.
     *
     * Legality is `planTriggerTargets`, which is `chooseTargetsFor`, which is
     * the same function that judged the candidates when the question was asked.
     * Nothing is re-derived here, so an answer cannot be accepted by one rule
     * and resolved by another.
     */
    case 'ANNOUNCE_TRIGGER_TARGETS': {
      const queue = pendingTriggersOf(state);
      const top = queue[queue.length - 1];
      if (!top || top.id !== action.triggerId || top.targets) return state;

      const aim = planTriggerTargets(state, top, { targets: action.targets });
      // A refusal is a rejection, never a repair. Announcing something the
      // ability could not legally have been pointed at would aim it somewhere
      // nobody chose, which is worse than the client seeing its action bounce.
      if (aim.reason) return state;

      return {
        ...state,
        pendingTriggers: [...queue.slice(0, -1), { ...top, targets: aim.targets }],
      };
    }

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
  // An ability activated in the game being thrown away is not activated in the
  // new one. Dropped rather than emptied, for the reason `beginTurnFor` gives.
  const { abilityUses: _spent, ...carried } = state;
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

  return clearStack({
    ...(carried as GameState),
    status: 'playing',
    players,
    turn: 1,
    round: 1,
    activePlayerId: state.startingPlayerId,
    priorityPlayerId: state.startingPlayerId,
    step: 'untap',
    combat: { attackers: [] },
    // A registered replacement effect belongs to the game that registered it.
    replacements: [],
    monarchId: null,
    initiativeId: null,
    winnerIds: [],
    log: [],
  });
}

/**
 * How deep a chain of triggered actions may run before the engine stops.
 *
 * A trigger can create a token, whose arrival can trigger something else. Real
 * Magic allows that to loop forever and calls it a draw; a playtest tool must
 * not hang, so the chain is capped and anything past the cap is simply not
 * applied.
 *
 * The stack spends levels too — a full round of passes resolves the top object,
 * whose resolution plays a card, whose arrival triggers something — so this has
 * to clear `pass -> resolve -> play -> trigger -> consequence` with room over.
 * Replacement effects do NOT spend depth; they are bounded separately by the
 * once-only rule.
 */
const MAX_TRIGGER_DEPTH = 8;

function applyOne(state: GameState, action: GameAction, depth: number): GameState {
  const check = validateAction(state, action);
  if (!check.ok) return state;

  // CR 614 — a replacement effect modifies an event *before* it happens, so
  // this runs before the reducer sees anything. Exactly one effect applies per
  // pass and the result comes straight back through here, which is CR 616.1's
  // "apply one, then check again" rather than a shortcut around it.
  //
  // `depth` is not spent on this: the once-only marker on the action
  // (`replacedBy`) already bounds the chain at the number of registered
  // effects, and burning trigger depth on replacements would silently drop
  // legitimate ones. `replaceAction` returns null when no effect is registered,
  // so a game without any pays a single property read.
  const replaced = replaceAction(state, action);
  if (replaced) {
    let next = state;
    for (const substitute of replaced) next = applyOne(next, substitute, depth);
    return next;
  }

  const at = action.at ?? state.updatedAt;
  const prefix = action.cause ? `${action.cause}: ` : '';
  const message = `${prefix}${describeAction(state, action)}`;

  const reduced = reduce(state, action);
  // A reducer that changed nothing is a no-op: no log entry, no version bump.
  if (reduced === state) return state;

  // Past this line the action really applied. See `applyActionTraced`.
  if (applyTrace) applyTrace.push(action);

  let next = logAction(reduced, action, at, message);
  next = { ...next, version: state.version + 1, updatedAt: at };
  next = checkStateBasedActions(next, at);

  if (depth < MAX_TRIGGER_DEPTH) {
    // The stack's own consequences come first: a full round of passes resolves
    // the top object, a resolution does what the object says, a counter puts
    // the card in the graveyard. All derived from state, never sent, so every
    // client replaying the same log builds the identical chain.
    for (const followUp of stackFollowUps(state, action, next, at)) {
      next = applyOne(next, followUp, depth + 1);
    }

    // CR 603 — triggered abilities. `triggers.ts` diffs the state before and
    // after (which is how a death caused by a *state-based action* still
    // triggers a dies ability — nothing in the action says a creature died) and
    // puts what triggered onto the waiting list in CR 603.3b order, with the
    // controller's own ordering taken from `action.triggerOrder`.
    const triggered = collectTriggers(state, action, next);
    if (triggered.length > 0) {
      next = enqueueTriggers(next, orderTriggers(next, triggered, action.triggerOrder));
    }

    // A spell that resolved into a graveyard having done nothing is the loudest
    // silent no-op there is, and the complaint this whole subsystem answers.
    for (const followUp of spellResolutionNotes(state, action, next, at)) {
      next = applyOne(next, followUp, depth + 1);
    }
  }

  // CR 603.3 — the waiting list empties the next time a player would receive
  // priority, which for this engine is once the action and everything it caused
  // have finished. Draining only at the outermost call is what makes a chain of
  // triggers resolve last-in-first-out through one shared stack instead of
  // recursing: a trigger that triggers something else pushes onto the same
  // queue, and the loop below picks it up before the rest.
  if (depth === 0 && pendingTriggersOf(next).length > 0) {
    next = drainTriggers(next, (current, followUp) => applyOne(current, followUp, 1), at).state;
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

/* -------------------------------------------------------------------------- */
/* Seeing what the engine actually did                                        */
/* -------------------------------------------------------------------------- */

/**
 * Collector for `applyActionTraced`. Null unless a trace is running, which is
 * never in the app: `/play`, `/simulate` and the life counter all call
 * `applyAction`, and the one line in `applyOne` that reads this is a null check.
 */
let applyTrace: GameAction[] | null = null;

/**
 * Apply one action and report EVERY action the engine ran because of it.
 *
 * ## Why this exists
 *
 * `applyAction` cascades and hides the cascade. A full round of priority passes
 * resolves the top of the stack, that resolution puts a permanent onto the
 * battlefield, its arrival triggers something, a counterspell resolving moves
 * the countered card to a graveyard. NONE of those appear as actions to
 * the caller. All of it happens inside one call, under `stackFollowUps`,
 * `collectTriggers` and `spellResolutionNotes`.
 *
 * The playtest harness was reading its findings off the action a bot PROPOSED,
 * and so it could not see any of that. It reported "a spell was countered: 0
 * times" over twenty games in which the engine's own log recorded three
 * `COUNTER_SPELL`s, and that false zero was on its way to sending somebody to
 * fix working code. This project has already been burned three times by a
 * probe watching the wrong layer: lifelink, deathtouch, and this.
 *
 * The obvious fix, watching the state difference, works for most events and
 * cannot work for this one. Countering is an action, not a shape on the board:
 * a card in a graveyard looks the same whether it was countered, discarded or
 * resolved there.
 *
 * ## What it does not change
 *
 * The state it returns is the state `applyAction` returns, action for action.
 * Nothing about the rules reads `applyTrace` and nothing about the trace is
 * written into the game, so a traced apply and an untraced one produce the same
 * state, the same log and the same hash.
 *
 * The collector is a module variable rather than a threaded parameter because
 * threading one through `applyOne`, the replacement recursion and the trigger
 * drain callback would touch the hottest path in the engine for the benefit of
 * a diagnostic. It is saved and restored around the call, so a nested trace
 * returns only its own actions and leaves the outer one intact. JavaScript is
 * single threaded here, and the engine is called synchronously.
 *
 * `applied` is in the order the engine ran them, the top-level action first,
 * and it is EMPTY when the action was refused, which is a cheaper refusal test
 * than comparing state references.
 */
export function applyActionTraced(
  state: GameState,
  action: GameAction
): { state: GameState; applied: GameAction[] } {
  const outer = applyTrace;
  const applied: GameAction[] = [];
  applyTrace = applied;
  try {
    return { state: applyOne(state, action, 0), applied };
  } finally {
    applyTrace = outer;
  }
}
