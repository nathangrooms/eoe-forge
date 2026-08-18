/**
 * Pure MTG tournament maths for the Tournament Manager.
 *
 * Kept free of React and of any UI import so the scoring, pairing and
 * tiebreaker rules can be reasoned about (and exercised) on their own.
 */

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

/** Pairing structure. 'round-robin' used to be in this union but no UI could
 *  ever select it and it silently fell through to the Swiss branch. */
export type Structure = 'swiss' | 'single-elimination';

/** The actual Magic format being played — previously nowhere in the model. */
export const GAME_FORMATS = [
  'Standard',
  'Pioneer',
  'Modern',
  'Legacy',
  'Vintage',
  'Pauper',
  'Commander',
  'Booster Draft',
  'Sealed Deck',
  'Cube',
  'Casual',
] as const;
export type GameFormat = (typeof GAME_FORMATS)[number];

export type MatchResult = 'p1' | 'p2' | 'draw';

export interface Match {
  id: string;
  player1: string;
  /** 'BYE' marks a bye awarded to player1. */
  player2: string;
  player1Score: number;
  player2Score: number;
  result?: MatchResult;
  /** Kept for the elimination bracket and for tournaments saved by older builds. */
  winner?: string;
  status: 'pending' | 'in-progress' | 'completed';
}

export interface Round {
  number: number;
  matches: Match[];
  status: 'pending' | 'in-progress' | 'completed';
}

export interface Standing {
  player: string;
  wins: number;
  losses: number;
  draws: number;
  byes: number;
  points: number;
  /** Own match-win percentage, floored at 33% per the DCI floor. */
  matchWinPct: number;
  /** Own game-win percentage, floored at 33%. */
  gameWinPct: number;
  /** Opponents' match-win percentage — the primary Swiss tiebreaker. */
  opponentMatchWinPct: number;
  /** Opponents' game-win percentage — the final tiebreaker. */
  opponentGameWinPct: number;
  dropped: boolean;
}

export interface RoundTimer {
  /** Milliseconds left when the clock is not running. */
  remainingMs: number;
  /** Epoch ms the clock expires at, while running. */
  endsAt: number | null;
  running: boolean;
}

export interface Tournament {
  id: string;
  name: string;
  /** Pairing structure. */
  format: Structure;
  /** Magic format actually being played. */
  gameFormat: GameFormat;
  status: 'setup' | 'in-progress' | 'completed';
  players: string[];
  dropped: string[];
  rounds: Round[];
  currentRound: number;
  roundLengthMinutes: number;
  timer: RoundTimer;
  createdAt: string;
  winner?: string;
}

const MW_FLOOR = 1 / 3;

/* ------------------------------------------------------------------ *
 * MTG tournament maths
 * ------------------------------------------------------------------ */

/**
 * DCI recommended Swiss rounds. The previous implementation used
 * `Math.ceil(Math.log2(playerCount))`, which under-runs the recommendation at
 * several player counts.
 */
export function recommendedSwissRounds(playerCount: number): number {
  if (playerCount <= 2) return 1;
  if (playerCount <= 4) return 2;
  if (playerCount <= 8) return 3;
  if (playerCount <= 16) return 4;
  if (playerCount <= 32) return 5;
  if (playerCount <= 64) return 6;
  if (playerCount <= 128) return 7;
  if (playerCount <= 226) return 8;
  if (playerCount <= 409) return 9;
  if (playerCount <= 758) return 10;
  return 11;
}

/** Unbiased shuffle. `sort(() => Math.random() - 0.5)` is not one. */
function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('::');
}

/** Every pair of players who have already been seated across from each other. */
export function previousOpponents(rounds: Round[]): Set<string> {
  const seen = new Set<string>();
  for (const round of rounds) {
    for (const match of round.matches) {
      if (match.player2 === 'BYE') continue;
      seen.add(pairKey(match.player1, match.player2));
    }
  }
  return seen;
}

/**
 * Recalculate the whole standings table from the played rounds.
 *
 * Scoring is the official one: win 3, draw 1, loss 0. The old version scored
 * `wins * 3` and never wrote the `draws` field at all, so the Draws column was
 * permanently zero and the Points column could not match a real standings sheet.
 */
export function computeStandings(
  players: string[],
  rounds: Round[],
  dropped: string[]
): Standing[] {
  const matches = rounds.flatMap(r => r.matches).filter(m => m.status === 'completed');

  interface Raw {
    wins: number;
    losses: number;
    draws: number;
    byes: number;
    matchPoints: number;
    matchesForPct: number;
    gamesWon: number;
    gamesPlayed: number;
    opponents: string[];
  }

  const raw = new Map<string, Raw>();
  for (const p of players) {
    raw.set(p, {
      wins: 0, losses: 0, draws: 0, byes: 0,
      matchPoints: 0, matchesForPct: 0,
      gamesWon: 0, gamesPlayed: 0,
      opponents: [],
    });
  }

  for (const match of matches) {
    const p1 = raw.get(match.player1);

    if (match.player2 === 'BYE') {
      // A bye is a 2-0 match win for the player's own percentages, but the
      // absent opponent never joins anyone's opponent list.
      if (p1) {
        p1.byes += 1;
        p1.wins += 1;
        p1.matchPoints += 3;
        p1.matchesForPct += 1;
        p1.gamesWon += 2;
        p1.gamesPlayed += 2;
      }
      continue;
    }

    const p2 = raw.get(match.player2);
    if (!p1 || !p2) continue;

    const result: MatchResult =
      match.result ??
      (match.winner === match.player1 ? 'p1' : match.winner === match.player2 ? 'p2' : 'draw');

    p1.opponents.push(match.player2);
    p2.opponents.push(match.player1);
    p1.matchesForPct += 1;
    p2.matchesForPct += 1;

    const games = match.player1Score + match.player2Score;
    p1.gamesWon += match.player1Score;
    p2.gamesWon += match.player2Score;
    p1.gamesPlayed += games;
    p2.gamesPlayed += games;

    if (result === 'p1') {
      p1.wins += 1; p1.matchPoints += 3;
      p2.losses += 1;
    } else if (result === 'p2') {
      p2.wins += 1; p2.matchPoints += 3;
      p1.losses += 1;
    } else {
      p1.draws += 1; p1.matchPoints += 1;
      p2.draws += 1; p2.matchPoints += 1;
    }
  }

  const mwPct = (r: Raw) =>
    r.matchesForPct === 0 ? MW_FLOOR : Math.max(MW_FLOOR, r.matchPoints / (3 * r.matchesForPct));
  const gwPct = (r: Raw) =>
    r.gamesPlayed === 0 ? MW_FLOOR : Math.max(MW_FLOOR, r.gamesWon / r.gamesPlayed);

  const standings: Standing[] = players.map(player => {
    const r = raw.get(player)!;
    const opponentMw = r.opponents.length
      ? r.opponents.reduce((sum, o) => sum + mwPct(raw.get(o)!), 0) / r.opponents.length
      : 0;
    const opponentGw = r.opponents.length
      ? r.opponents.reduce((sum, o) => sum + gwPct(raw.get(o)!), 0) / r.opponents.length
      : 0;

    return {
      player,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      byes: r.byes,
      points: r.matchPoints,
      matchWinPct: mwPct(r) * 100,
      gameWinPct: gwPct(r) * 100,
      opponentMatchWinPct: opponentMw * 100,
      opponentGameWinPct: opponentGw * 100,
      dropped: dropped.includes(player),
    };
  });

  // Points -> OMW% -> GW% -> OGW%, the official order.
  return standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.opponentMatchWinPct !== a.opponentMatchWinPct)
      return b.opponentMatchWinPct - a.opponentMatchWinPct;
    if (b.gameWinPct !== a.gameWinPct) return b.gameWinPct - a.gameWinPct;
    if (b.opponentGameWinPct !== a.opponentGameWinPct)
      return b.opponentGameWinPct - a.opponentGameWinPct;
    return a.player.localeCompare(b.player);
  });
}

/**
 * Swiss pairings that never repeat a match-up while a legal alternative exists.
 *
 * The previous version walked the sorted standings and greedily paired adjacent
 * players with no knowledge of earlier rounds, so in round 3 of a small event
 * the two leaders who met in round 1 were paired again.
 */
export function generatePairings(
  standings: Standing[],
  played: Set<string>,
  roundNumber: number
): Match[] {
  const active = standings.filter(s => !s.dropped).map(s => s.player);

  let byePlayer: string | null = null;
  let pool = active;
  if (active.length % 2 === 1) {
    // Lowest-ranked player who has not already had a bye takes it.
    const byeCounts = new Map(standings.map(s => [s.player, s.byes]));
    const candidates = [...active].reverse();
    byePlayer = candidates.find(p => (byeCounts.get(p) ?? 0) === 0) ?? candidates[0];
    pool = active.filter(p => p !== byePlayer);
  }

  // Backtracking search over the standings order. Candidates are tried nearest
  // in rank first, so the common case resolves without any backtracking at all;
  // the step budget stops a pathological field from freezing the browser, and a
  // rematch is only permitted once a rematch-free pairing is shown impossible.
  let budget = 200_000;
  const solve = (remaining: string[], allowRematch: boolean): [string, string][] | null => {
    if (remaining.length === 0) return [];
    if (budget-- <= 0) return null;
    const [first, ...rest] = remaining;

    for (let i = 0; i < rest.length; i++) {
      const opponent = rest[i];
      if (!allowRematch && played.has(pairKey(first, opponent))) continue;

      const tail = solve([...rest.slice(0, i), ...rest.slice(i + 1)], allowRematch);
      if (tail) return [[first, opponent], ...tail];
    }
    return null;
  };

  let pairs = solve(pool, false);
  if (!pairs) {
    budget = 200_000;
    pairs = solve(pool, true) ?? [];
  }

  const matches: Match[] = pairs.map(([p1, p2], idx) => ({
    id: `r${roundNumber}-m${idx}-${Date.now()}`,
    player1: p1,
    player2: p2,
    player1Score: 0,
    player2Score: 0,
    status: 'pending',
  }));

  if (byePlayer) {
    matches.push({
      id: `r${roundNumber}-bye-${Date.now()}`,
      player1: byePlayer,
      player2: 'BYE',
      player1Score: 2,
      player2Score: 0,
      result: 'p1',
      winner: byePlayer,
      status: 'completed',
    });
  }

  return matches;
}

export function generateEliminationBracket(players: string[]): Round[] {
  const seeded = shuffle(players);

  const size = Math.pow(2, Math.ceil(Math.log2(Math.max(2, seeded.length))));
  while (seeded.length < size) seeded.push('BYE');

  const rounds: Round[] = [];
  let currentPlayers = seeded;
  let roundNum = 1;

  while (currentPlayers.length > 1) {
    const matches: Match[] = [];

    for (let i = 0; i < currentPlayers.length; i += 2) {
      const match: Match = {
        id: `r${roundNum}-m${i / 2}`,
        player1: currentPlayers[i],
        player2: currentPlayers[i + 1],
        player1Score: 0,
        player2Score: 0,
        status: 'pending',
      };

      if (match.player2 === 'BYE') {
        match.winner = match.player1;
        match.result = 'p1';
        match.player1Score = 2;
        match.status = 'completed';
      } else if (match.player1 === 'BYE') {
        match.winner = match.player2;
        match.result = 'p2';
        match.player2Score = 2;
        match.status = 'completed';
      }

      matches.push(match);
    }

    rounds.push({
      number: roundNum,
      matches,
      status: roundNum === 1 ? 'in-progress' : 'pending',
    });

    currentPlayers = matches.map(m => m.winner || 'TBD');
    roundNum++;
  }

  return rounds;
}
