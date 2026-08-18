import {
  GAME_FORMATS,
  recommendedSwissRounds,
  type PlayerDeck,
  type Round,
  type RoundTimer,
  type Tournament,
} from './scoring';

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

  // Registered decks arrived after the first events were written; anything that
  // is not a well-formed entry for a player still in the event is dropped.
  const decks: Record<string, PlayerDeck> = {};
  const rawDecks = raw.decks && typeof raw.decks === 'object' ? raw.decks : {};
  for (const player of players) {
    const entry = rawDecks[player];
    if (!entry || typeof entry !== 'object' || typeof entry.deckId !== 'string') continue;
    decks[player] = {
      deckId: entry.deckId,
      deckName: typeof entry.deckName === 'string' ? entry.deckName : 'Untitled deck',
      format: typeof entry.format === 'string' ? entry.format : 'commander',
      commanderName: typeof entry.commanderName === 'string' ? entry.commanderName : null,
      colors: Array.isArray(entry.colors) ? entry.colors.filter((c: unknown) => typeof c === 'string') : [],
    };
  }

  return {
    id: raw.id,
    name: raw.name,
    format: raw.format === 'single-elimination' ? 'single-elimination' : 'swiss',
    gameFormat: (GAME_FORMATS as readonly string[]).includes(raw.gameFormat)
      ? raw.gameFormat
      : 'Commander',
    status: raw.status ?? 'setup',
    players,
    decks,
    dropped: raw.dropped ?? [],
    rounds,
    currentRound: raw.currentRound ?? 0,
    swissRounds:
      typeof raw.swissRounds === 'number' && raw.swissRounds > 0
        ? raw.swissRounds
        : recommendedSwissRounds(Math.max(2, players.length)),
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
