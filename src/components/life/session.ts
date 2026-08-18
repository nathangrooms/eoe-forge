/**
 * DeckMatrix — life counter: session shape, construction and persistence.
 *
 * `src/lib/game` is deliberately transport- and storage-free, so the bridge
 * between a `GameState` and `localStorage` lives here instead. Nothing in this
 * file touches React.
 *
 * A session is three things:
 *
 *   - `config`  what a *new* game is built from (format, life total, who is
 *               sitting down). Rebuilding from config is how "reset" works,
 *               because `resetGame()` in the core snaps everyone back to the
 *               format's starting life and would silently discard a custom
 *               starting-life override.
 *   - `state`   the live `GameState`, owned by the core reducer.
 *   - `past`    snapshots for undo. The reducer is pure and every state is a
 *               fresh object, so keeping references is free — no cloning.
 */

import {
  createGame,
  startingLifeFor,
  type Format,
  type GameState,
  type ManaColor,
  type PlayerId,
  type SeatingVariant,
} from '@/lib/game';

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

export interface LifeSeatConfig {
  name: string;
  /** Deck colour identity. Purely so a player can find their own panel fast. */
  colors: ManaColor[];
}

export interface LifeGameConfig {
  format: Format;
  /** Resolved at setup. May differ from the format default (e.g. 30-life pods). */
  startingLife: number;
  seats: LifeSeatConfig[];
}

export interface LifeOptions {
  /** Alternative seat arrangement for the same player count. */
  variant: SeatingVariant;
  /** Players running a partner / background — they get a second damage bucket. */
  partners: Record<PlayerId, boolean>;
}

export interface LifeSession {
  config: LifeGameConfig;
  state: GameState;
  /** Newest last. Undo pops from the end. */
  past: GameState[];
  options: LifeOptions;
}

/** Formats worth offering on a phone in the middle of a table. */
export const LIFE_FORMATS: Array<{ format: Format; label: string; note: string }> = [
  { format: 'commander', label: 'Commander', note: '40 life · commander damage' },
  { format: 'brawl', label: 'Brawl', note: '25 / 30 life · commander damage' },
  { format: 'oathbreaker', label: 'Oathbreaker', note: '20 life · no commander damage' },
  { format: 'standard', label: '60-card', note: '20 life' },
];

export const PLAYER_COUNTS = [2, 3, 4] as const;
export type PlayerCount = (typeof PLAYER_COUNTS)[number];

export const WUBRG: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

export const MIN_STARTING_LIFE = 1;
export const MAX_STARTING_LIFE = 200;

export const DEFAULT_SEAT_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6'];

export function defaultSeats(count: number): LifeSeatConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    name: DEFAULT_SEAT_NAMES[i] ?? `Player ${i + 1}`,
    colors: [],
  }));
}

export function defaultConfig(playerCount: number = 4, format: Format = 'commander'): LifeGameConfig {
  return {
    format,
    startingLife: startingLifeFor(format, playerCount),
    seats: defaultSeats(playerCount),
  };
}

export function defaultOptions(): LifeOptions {
  return { variant: 'table', partners: {} };
}

/**
 * Resize a seat list without losing the names and colours already entered —
 * changing the pod from 4 to 3 mid-setup should not wipe what was typed.
 */
export function resizeSeats(seats: LifeSeatConfig[], count: number): LifeSeatConfig[] {
  return Array.from({ length: count }, (_, i) => seats[i] ?? { name: DEFAULT_SEAT_NAMES[i] ?? `Player ${i + 1}`, colors: [] });
}

/* -------------------------------------------------------------------------- */
/* Commander identity                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Commander damage is tracked per *commander*, never per opponent — 21 from
 * each half of a partner pair is not lethal. A life counter has no decklists,
 * so each seat gets two synthetic damage buckets up front and the second one is
 * only revealed when that player says they are running a partner. Creating both
 * eagerly avoids needing an "add commander" action the core does not have.
 */
export const PRIMARY_COMMANDER = 1;
export const PARTNER_COMMANDER = 2;

export function commanderIdFor(playerId: PlayerId, slot: number): string {
  return `${playerId}-cmd${slot}`;
}

export function isPartnerCommander(commanderId: string): boolean {
  return commanderId.endsWith(`-cmd${PARTNER_COMMANDER}`);
}

/* -------------------------------------------------------------------------- */
/* Construction                                                               */
/* -------------------------------------------------------------------------- */

export function seatName(seat: LifeSeatConfig, index: number): string {
  const trimmed = (seat?.name ?? '').trim();
  return trimmed || DEFAULT_SEAT_NAMES[index] || `Player ${index + 1}`;
}

/** Build a fresh `GameState` from a config. `now` is passed in — the core never reads a clock. */
export function buildGame(config: LifeGameConfig, now: number): GameState {
  return createGame({
    id: `life-${now}`,
    mode: 'life-counter',
    format: config.format,
    startingLife: config.startingLife,
    now,
    players: config.seats.map((seat, index) => {
      const id = `p${index + 1}`;
      const name = seatName(seat, index);
      return {
        id,
        name,
        commanders: [
          {
            id: commanderIdFor(id, PRIMARY_COMMANDER),
            name,
            colorIdentity: seat.colors ?? [],
          },
          {
            id: commanderIdFor(id, PARTNER_COMMANDER),
            name: `${name} (partner)`,
            colorIdentity: seat.colors ?? [],
          },
        ],
      };
    }),
  });
}

/**
 * Fold live table edits (renames, colour changes) back into the config, so a
 * reset keeps the names people typed on the panels rather than reverting to
 * whatever was entered at setup.
 */
export function syncConfig(config: LifeGameConfig, state: GameState): LifeGameConfig {
  return {
    ...config,
    seats: state.players.map((player, index) => ({
      name: player.name || seatName(config.seats[index] ?? { name: '', colors: [] }, index),
      colors: (player.commanders[0]?.colorIdentity ?? config.seats[index]?.colors ?? []) as ManaColor[],
    })),
  };
}

export function newSession(config: LifeGameConfig, now: number, options?: LifeOptions): LifeSession {
  return {
    config,
    state: buildGame(config, now),
    past: [],
    options: options ?? defaultOptions(),
  };
}

/* -------------------------------------------------------------------------- */
/* Log compaction                                                             */
/* -------------------------------------------------------------------------- */

const LOG_LIMIT = 400;
const LOG_KEEP = 150;

/**
 * A long pod can rack up hundreds of log entries, and every undo snapshot holds
 * a reference to one. `pushEvent` in the core derives `seq` from `log.length`,
 * so a trim has to renumber or two events would share a sequence number.
 */
export function compactLog(state: GameState): GameState {
  if (state.log.length <= LOG_LIMIT) return state;
  return {
    ...state,
    log: state.log.slice(-LOG_KEEP).map((event, index) => ({ ...event, seq: index })),
  };
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

export const LIFE_STORAGE_KEY = 'dm.life.session.v1';

const SCHEMA_VERSION = 1;
/** Undo depth kept in memory. Storage keeps less — see `PERSISTED_UNDO_DEPTH`. */
export const UNDO_DEPTH = 40;
const PERSISTED_UNDO_DEPTH = 15;

interface StoredSession {
  v: number;
  savedAt: number;
  config: LifeGameConfig;
  state: GameState;
  past: GameState[];
  options: LifeOptions;
}

function looksLikeGameState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<GameState>;
  return (
    Array.isArray(state.players) &&
    state.players.length > 0 &&
    !!state.rules &&
    typeof state.rules === 'object' &&
    Array.isArray(state.log) &&
    typeof state.version === 'number'
  );
}

export function loadSession(): LifeSession | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(LIFE_STORAGE_KEY);
  } catch {
    return null; // private mode / storage disabled — the counter still works, it just forgets
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed || parsed.v !== SCHEMA_VERSION) return null;
    if (!looksLikeGameState(parsed.state)) return null;

    const options = parsed.options ?? defaultOptions();
    return {
      config: parsed.config ?? {
        format: parsed.state.format,
        startingLife: parsed.state.rules.startingLife,
        seats: parsed.state.players.map(p => ({ name: p.name, colors: [] })),
      },
      state: parsed.state,
      past: Array.isArray(parsed.past) ? parsed.past.filter(looksLikeGameState) : [],
      options: {
        variant: options.variant ?? 'table',
        partners: options.partners ?? {},
      },
    };
  } catch {
    return null; // corrupt payload — treat it as no saved game rather than crashing the table
  }
}

export function saveSession(session: LifeSession, now: number): void {
  if (typeof window === 'undefined') return;
  const payload: StoredSession = {
    v: SCHEMA_VERSION,
    savedAt: now,
    config: session.config,
    state: session.state,
    // Undo snapshots keep player state but drop their logs: fifteen copies of a
    // 400-entry log is megabytes of storage for history nobody reads.
    past: session.past.slice(-PERSISTED_UNDO_DEPTH).map(state => ({ ...state, log: [] })),
    options: session.options,
  };
  try {
    window.localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota exceeded or storage disabled — the in-memory game is unaffected */
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LIFE_STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}
