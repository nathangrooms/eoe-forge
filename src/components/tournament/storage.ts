import {
  GAME_FORMATS,
  recommendedSwissRounds,
  type GameFormat,
  type Match,
  type MatchResult,
  type PlayerDeck,
  type Round,
  type RoundTimer,
  type Structure,
  type Tournament,
} from './scoring';

/**
 * Tournaments live in this browser only. Both the manager and the /tournament/new
 * route read and write through here so the create page does not have to
 * duplicate the migration rules.
 *
 * `localStorage` is untrusted input — it is whatever this build, an older build,
 * or a person with devtools open last wrote — so nothing is spread through
 * unchecked. Every field is read individually and falls back to a legal value,
 * which is also what makes adding a field to `Tournament` safe: events saved
 * before it existed simply take the default.
 */
export const TOURNAMENT_STORAGE_KEY = 'tournaments';

export function makeTimer(minutes: number): RoundTimer {
  return { remainingMs: minutes * 60_000, endsAt: null, running: false };
}

type Stored = Record<string, unknown>;

function obj(value: unknown): Stored {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Stored) : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function strings(value: unknown): string[] {
  return arr(value).filter((v): v is string => typeof v === 'string');
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const PROGRESS = ['pending', 'in-progress', 'completed'] as const;

function migrateMatch(raw: unknown): Match {
  const m = obj(raw);
  const player1 = str(m.player1, 'TBD');
  const player2 = str(m.player2, 'TBD');
  const status = oneOf(m.status, PROGRESS, 'pending');
  const winner = typeof m.winner === 'string' ? m.winner : undefined;

  // Builds before the result field wrote only `winner`, so a completed match
  // has its result recovered from whose name is in there.
  const result: MatchResult | undefined =
    m.result === 'p1' || m.result === 'p2' || m.result === 'draw'
      ? m.result
      : status === 'completed'
        ? winner === player1
          ? 'p1'
          : winner === player2
            ? 'p2'
            : undefined
        : undefined;

  return {
    id: str(m.id, `m-${Math.random().toString(36).slice(2)}`),
    player1,
    player2,
    player1Score: num(m.player1Score, 0),
    player2Score: num(m.player2Score, 0),
    result,
    winner,
    status,
  };
}

function migrateRound(raw: unknown, index: number): Round {
  const r = obj(raw);
  return {
    number: num(r.number, index + 1),
    matches: arr(r.matches).map(migrateMatch),
    status: oneOf(r.status, PROGRESS, 'pending'),
  };
}

function migrateTimer(raw: unknown, roundLengthMinutes: number): RoundTimer {
  if (!raw || typeof raw !== 'object') return makeTimer(roundLengthMinutes);
  const t = obj(raw);
  return {
    remainingMs: num(t.remainingMs, roundLengthMinutes * 60_000),
    endsAt: typeof t.endsAt === 'number' ? t.endsAt : null,
    running: t.running === true,
  };
}

/** Fill in fields added after a tournament was first written to storage. */
export function migrate(raw: unknown): Tournament {
  const t = obj(raw);
  const roundLengthMinutes = num(t.roundLengthMinutes, 50);
  const players = strings(t.players);

  // Registered decks arrived after the first events were written; anything that
  // is not a well-formed entry for a player still in the event is dropped.
  const decks: Record<string, PlayerDeck> = {};
  const rawDecks = obj(t.decks);
  for (const player of players) {
    const entry = obj(rawDecks[player]);
    if (typeof entry.deckId !== 'string') continue;
    decks[player] = {
      deckId: entry.deckId,
      deckName: str(entry.deckName, 'Untitled deck'),
      format: str(entry.format, 'commander'),
      commanderName: typeof entry.commanderName === 'string' ? entry.commanderName : null,
      colors: strings(entry.colors),
    };
  }

  return {
    id: str(t.id, Date.now().toString()),
    name: str(t.name, 'Untitled event'),
    format: oneOf<Structure>(t.format, ['swiss', 'single-elimination'], 'swiss'),
    gameFormat: oneOf<GameFormat>(t.gameFormat, GAME_FORMATS, 'Commander'),
    status: oneOf(t.status, ['setup', 'in-progress', 'completed'] as const, 'setup'),
    players,
    decks,
    dropped: strings(t.dropped),
    rounds: arr(t.rounds).map(migrateRound),
    currentRound: num(t.currentRound, 0),
    swissRounds:
      num(t.swissRounds, 0) > 0
        ? num(t.swissRounds, 0)
        : recommendedSwissRounds(Math.max(2, players.length)),
    roundLengthMinutes,
    timer: migrateTimer(t.timer, roundLengthMinutes),
    createdAt: str(t.createdAt, new Date().toISOString()),
    winner: typeof t.winner === 'string' ? t.winner : undefined,
  };
}

export function loadTournaments(): Tournament[] {
  try {
    const saved = localStorage.getItem(TOURNAMENT_STORAGE_KEY);
    if (!saved) return [];
    return arr(JSON.parse(saved)).map(migrate);
  } catch (error) {
    console.error('Failed to load tournaments:', error);
    return [];
  }
}

/** Returns false when storage rejected the write, so callers can report it. */
export function saveTournaments(tournaments: Tournament[]): boolean {
  try {
    localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(tournaments));
    return true;
  } catch {
    return false;
  }
}
