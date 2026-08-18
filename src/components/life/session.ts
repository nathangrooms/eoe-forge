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
  type PlayerId,
  type SeatingVariant,
} from '@/lib/game';

import { DEFAULT_MAT_ORDER, defaultMats, isMatColor, nextFreeMat, type MatColor } from './mats';

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

export interface LifeSeatConfig {
  name: string;
  /**
   * The seat's colour. Chooses the mat it plays on, and doubles as the colour
   * identity shown on the panel — one choice, not two, because at arm's length
   * the mat is how a player finds their own seat and a row of pips is not.
   */
  mat: MatColor;
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

export const MIN_STARTING_LIFE = 1;
export const MAX_STARTING_LIFE = 200;

export const DEFAULT_SEAT_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6'];

export function defaultSeats(count: number): LifeSeatConfig[] {
  const mats = defaultMats(count);
  return Array.from({ length: count }, (_, i) => ({
    name: DEFAULT_SEAT_NAMES[i] ?? `Player ${i + 1}`,
    mat: mats[i],
  }));
}

export function defaultConfig(playerCount: number = 4, format: Format = 'commander'): LifeGameConfig {
  return {
    format,
    startingLife: startingLifeFor(format, playerCount),
    seats: defaultSeats(playerCount),
  };
}

/**
 * Four players default to the 2x2 grid rather than the pinwheel.
 *
 * The pinwheel puts one player on each edge, which gives the left and right
 * seats a tall thin strip and rotates them 90 degrees. Two rows of two keeps
 * every panel the same shape and much larger.
 */
export function defaultVariantFor(playerCount: number): SeatingVariant {
  return playerCount === 4 ? 'quads' : 'table';
}

export function defaultOptions(playerCount = 4): LifeOptions {
  return { variant: defaultVariantFor(playerCount), partners: {} };
}

/**
 * Resize a seat list without losing the names and colours already entered —
 * changing the pod from 4 to 3 mid-setup should not wipe what was typed. A seat
 * added by growing the pod takes a colour nobody at the table is already on.
 */
export function resizeSeats(seats: LifeSeatConfig[], count: number): LifeSeatConfig[] {
  const out: LifeSeatConfig[] = [];
  for (let i = 0; i < count; i += 1) {
    const existing = seats[i];
    out.push(
      existing
        ? { name: existing.name, mat: existing.mat }
        : {
            name: DEFAULT_SEAT_NAMES[i] ?? `Player ${i + 1}`,
            mat: nextFreeMat(out.map(seat => seat.mat), i),
          },
    );
  }
  return out;
}

/**
 * Read a seat back out of whatever shape it arrived in.
 *
 * Sessions written before the mats existed stored `colors: ManaColor[]`, and a
 * game saved by that build should still resume rather than be discarded — so
 * its first colour becomes the mat, and a seat that never picked one falls back
 * to the default rotation for its position.
 */
export function normaliseSeat(seat: unknown, index: number): LifeSeatConfig {
  const raw = (seat ?? {}) as { name?: unknown; mat?: unknown; colors?: unknown };
  const legacy = Array.isArray(raw.colors) ? raw.colors.find(isMatColor) : undefined;
  const mat: MatColor = isMatColor(raw.mat)
    ? raw.mat
    : (legacy ?? DEFAULT_MAT_ORDER[index % DEFAULT_MAT_ORDER.length]);
  return {
    name: typeof raw.name === 'string' ? raw.name : (DEFAULT_SEAT_NAMES[index] ?? `Player ${index + 1}`),
    mat,
  };
}

export function normaliseConfig(config: LifeGameConfig | undefined, fallback: LifeGameConfig): LifeGameConfig {
  if (!config || !Array.isArray(config.seats) || config.seats.length === 0) return fallback;
  return {
    format: config.format ?? fallback.format,
    startingLife: Number.isFinite(config.startingLife) ? config.startingLife : fallback.startingLife,
    seats: config.seats.map(normaliseSeat),
  };
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
            colorIdentity: [seat.mat],
          },
          {
            id: commanderIdFor(id, PARTNER_COMMANDER),
            name: `${name} (partner)`,
            colorIdentity: [seat.mat],
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
    seats: state.players.map((player, index) => {
      const seat = config.seats[index];
      const live = player.commanders[0]?.colorIdentity?.find(isMatColor);
      return {
        name: player.name || seatName(seat ?? { name: '', mat: 'W' }, index),
        mat: live ?? seat?.mat ?? DEFAULT_MAT_ORDER[index % DEFAULT_MAT_ORDER.length],
      };
    }),
  };
}

export function newSession(config: LifeGameConfig, now: number, options?: LifeOptions): LifeSession {
  return {
    config,
    state: buildGame(config, now),
    past: [],
    // The seating default depends on how many people are sitting down, so the
    // fallback has to be told — `defaultOptions()` bare would hand a two-player
    // game the four-player arrangement.
    options: options ?? defaultOptions(config.seats.length),
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
    const rebuilt: LifeGameConfig = {
      format: parsed.state.format,
      startingLife: parsed.state.rules.startingLife,
      seats: parsed.state.players.map((player, index) => ({
        name: player.name,
        mat: player.commanders?.[0]?.colorIdentity?.find(isMatColor)
          ?? DEFAULT_MAT_ORDER[index % DEFAULT_MAT_ORDER.length],
      })),
    };

    return {
      // A game saved before mats existed carries `colors` on each seat; run it
      // through the migration rather than dropping the pod on the floor.
      config: normaliseConfig(parsed.config, rebuilt),
      state: parsed.state,
      past: Array.isArray(parsed.past) ? parsed.past.filter(looksLikeGameState) : [],
      options: {
        variant: options.variant ?? defaultVariantFor(parsed.state.players.length),
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

/* -------------------------------------------------------------------------- */
/* Remembered setup                                                           */
/* -------------------------------------------------------------------------- */

/**
 * What the table looked like last time, kept separately from the session.
 *
 * The session is a *game*; these are the table's habits, and they have to
 * outlive the game or "quick start" would only work while a stale pod was still
 * sitting in storage. The same four people, the same colours and the same
 * format come back every week — remembering them is the difference between one
 * press and a minute of tapping.
 *
 * Deliberately small and deliberately optional: every field is re-validated on
 * read, and a corrupt or absent record just means the stock defaults.
 */
export const LIFE_PREFS_KEY = 'dm.life.prefs.v1';

export interface LifePrefs {
  playerCount: number;
  format: Format;
  seats: LifeSeatConfig[];
  /** Only set when the table played on a total the format does not imply. */
  startingLife: number | null;
}

interface StoredPrefs extends LifePrefs {
  v: 1;
  savedAt: number;
}

export function loadPrefs(): LifePrefs | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LIFE_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPrefs;
    if (!parsed || parsed.v !== 1) return null;

    const count = PLAYER_COUNTS.includes(parsed.playerCount as PlayerCount)
      ? parsed.playerCount
      : 4;
    const format = LIFE_FORMATS.some(entry => entry.format === parsed.format)
      ? parsed.format
      : 'commander';
    const seats = resizeSeats(
      Array.isArray(parsed.seats) ? parsed.seats.map(normaliseSeat) : defaultSeats(count),
      count,
    );
    const life =
      typeof parsed.startingLife === 'number' &&
      parsed.startingLife >= MIN_STARTING_LIFE &&
      parsed.startingLife <= MAX_STARTING_LIFE
        ? parsed.startingLife
        : null;

    return { playerCount: count, format, seats, startingLife: life };
  } catch {
    return null;
  }
}

export function savePrefs(config: LifeGameConfig): void {
  if (typeof window === 'undefined') return;
  const implied = startingLifeFor(config.format, config.seats.length);
  const payload: StoredPrefs = {
    v: 1,
    savedAt: Date.now(),
    playerCount: config.seats.length,
    format: config.format,
    seats: config.seats.map(seat => ({ name: seat.name, mat: seat.mat })),
    startingLife: config.startingLife === implied ? null : config.startingLife,
  };
  try {
    window.localStorage.setItem(LIFE_PREFS_KEY, JSON.stringify(payload));
  } catch {
    /* the table just starts from the stock defaults next time */
  }
}

/**
 * The config setup opens on when there is no game to carry forward: last
 * week's table if we have it, otherwise a four-player Commander pod. Either way
 * it is complete and startable without touching a single control.
 */
export function quickStartConfig(): LifeGameConfig {
  const prefs = loadPrefs();
  if (!prefs) return defaultConfig(4, 'commander');
  return {
    format: prefs.format,
    startingLife: prefs.startingLife ?? startingLifeFor(prefs.format, prefs.playerCount),
    seats: prefs.seats,
  };
}
