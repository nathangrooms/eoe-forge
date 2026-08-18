import { GAME_FORMATS, type Round, type RoundTimer, type Tournament } from './scoring';

/**
 * Tournaments live in this browser only. Both the manager and the /tournament/new
 * route read and write through here so the create page does not have to
 * duplicate the migration rules.
 */
export const TOURNAMENT_STORAGE_KEY = 'tournaments';

export function makeTimer(minutes: number): RoundTimer {
  return { remainingMs: minutes * 60_000, endsAt: null, running: false };
}

/** Fill in fields added after a tournament was first written to storage. */
export function migrate(raw: any): Tournament {
  const roundLengthMinutes = raw.roundLengthMinutes ?? 50;
  const players: string[] = raw.players ?? [];
  const rounds: Round[] = (raw.rounds ?? []).map((round: any) => ({
    ...round,
    matches: (round.matches ?? []).map((m: any) => ({
      ...m,
      result:
        m.result ??
        (m.status === 'completed'
          ? m.winner === m.player1
            ? 'p1'
            : m.winner === m.player2
              ? 'p2'
              : undefined
          : undefined),
    })),
  }));

  return {
    id: raw.id,
    name: raw.name,
    format: raw.format === 'single-elimination' ? 'single-elimination' : 'swiss',
    gameFormat: (GAME_FORMATS as readonly string[]).includes(raw.gameFormat)
      ? raw.gameFormat
      : 'Commander',
    status: raw.status ?? 'setup',
    players,
    dropped: raw.dropped ?? [],
    rounds,
    currentRound: raw.currentRound ?? 0,
    roundLengthMinutes,
    timer: raw.timer ?? makeTimer(roundLengthMinutes),
    createdAt: raw.createdAt ?? new Date().toISOString(),
    winner: raw.winner,
  };
}

export function loadTournaments(): Tournament[] {
  try {
    const saved = localStorage.getItem(TOURNAMENT_STORAGE_KEY);
    if (!saved) return [];
    return (JSON.parse(saved) as any[]).map(migrate);
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
