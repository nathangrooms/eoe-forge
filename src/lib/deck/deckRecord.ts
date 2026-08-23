/* Relative imports carry their `.ts` extension so this module runs unchanged
   under `node --test --experimental-strip-types`. */

/**
 * What a deck's games add up to.
 *
 * ## Why this is a module
 *
 * The Record tab used to compute these figures twice, in two components, from
 * two separate reads of `deck_matches`, and the two drifted: logging a match
 * reloaded one of them and the other went on printing the old win rate until
 * the page was reloaded. The previous pass folded the two panels into one,
 * which fixed the drift. This takes the last step and makes the arithmetic a
 * function, so the tab's metric row and the panel below it cannot disagree even
 * in principle, and so the one figure with a real bug in it stays fixed.
 *
 * ## The bug that has to stay fixed
 *
 * "This month" was `new Date(m.played_at).getMonth() === new Date().getMonth()`
 * with no year test, so a game played last August counted towards this August
 * and the figure grew by twelve months of games every time the calendar came
 * round. There is a test for it.
 */

export interface MatchRow {
  id: string;
  result: string;
  opponent_commander?: string | null;
  opponent_deck_name?: string | null;
  played_at: string;
  notes?: string | null;
}

export interface OpponentRecord {
  /** What was typed, or the deck name, or `Unrecorded`. */
  opponent: string;
  wins: number;
  losses: number;
  draws: number;
  total: number;
  winRate: number;
}

export interface MonthRecord {
  /** `YYYY-MM`. */
  month: string;
  /** `Aug` and, when the year turns, `Aug 25`. */
  label: string;
  played: number;
  wins: number;
  /** Null when nothing was played that month. Never 0: you did not lose them. */
  winRate: number | null;
}

export interface DeckRecordStats {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  /** Null with no matches. A deck that has not played has not won nothing. */
  winRate: number | null;
  recentCount: number;
  recentWinRate: number | null;
  monthCount: number;
  monthWinRate: number | null;
  opponents: OpponentRecord[];
  /** Newest last, so it reads left to right as a timeline. */
  months: MonthRecord[];
}

/** How many games count as "recent form". */
export const RECENT_WINDOW = 10;

/** How many months the timeline covers. */
export const TIMELINE_MONTHS = 12;

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Roll a deck's matches up.
 *
 * `matches` must be newest first, which is how the query orders them, because
 * "the last ten games" is the first ten rows and re-sorting here would be a
 * second opinion about an order the database already gave.
 *
 * `now` is a parameter so the month arithmetic is testable without freezing the
 * clock.
 */
export function deckRecordStats(
  matches: readonly MatchRow[],
  now: Date = new Date()
): DeckRecordStats {
  const total = matches.length;
  const wins = matches.filter(m => m.result === 'win').length;
  const losses = matches.filter(m => m.result === 'loss').length;
  const draws = matches.filter(m => m.result === 'draw').length;

  const recent = matches.slice(0, RECENT_WINDOW);
  const recentWins = recent.filter(m => m.result === 'win').length;

  /* A calendar month IN THIS YEAR. Without the year test a game played last
     August counted towards this August. */
  const thisMonth = matches.filter(m => {
    const played = new Date(m.played_at);
    return played.getMonth() === now.getMonth() && played.getFullYear() === now.getFullYear();
  });
  const monthWins = thisMonth.filter(m => m.result === 'win').length;

  const byOpponent = new Map<string, { wins: number; losses: number; draws: number; total: number }>();
  for (const match of matches) {
    const key =
      match.opponent_commander?.trim() || match.opponent_deck_name?.trim() || 'Unrecorded';
    const bucket = byOpponent.get(key) ?? { wins: 0, losses: 0, draws: 0, total: 0 };
    bucket.total += 1;
    if (match.result === 'win') bucket.wins += 1;
    if (match.result === 'loss') bucket.losses += 1;
    if (match.result === 'draw') bucket.draws += 1;
    byOpponent.set(key, bucket);
  }

  /* The last twelve months, every one of them, including the empty ones.
     `deck_matches` has `played_at` and the tab had no timeline at all, and a
     timeline that skips the months you did not play is not a timeline: the gap
     is the information. */
  const months: MonthRecord[] = [];
  for (let back = TIMELINE_MONTHS - 1; back >= 0; back -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const played = matches.filter(m => {
      const at = new Date(m.played_at);
      return at.getMonth() === d.getMonth() && at.getFullYear() === d.getFullYear();
    });
    const won = played.filter(m => m.result === 'win').length;
    months.push({
      month: key,
      label:
        d.getFullYear() === now.getFullYear()
          ? MONTH_NAMES[d.getMonth()]
          : `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      played: played.length,
      wins: won,
      winRate: played.length > 0 ? (won / played.length) * 100 : null,
    });
  }

  return {
    total,
    wins,
    losses,
    draws,
    winRate: total > 0 ? (wins / total) * 100 : null,
    recentCount: recent.length,
    recentWinRate: recent.length > 0 ? (recentWins / recent.length) * 100 : null,
    monthCount: thisMonth.length,
    monthWinRate: thisMonth.length > 0 ? (monthWins / thisMonth.length) * 100 : null,
    opponents: Array.from(byOpponent.entries())
      .map(([opponent, record]) => ({
        opponent,
        ...record,
        winRate: (record.wins / record.total) * 100,
      }))
      /* By games played, which is the order that puts your real meta at the
         top. Each line carries its own rate rather than one line claiming to be
         the best matchup, which is what the panel this replaced got wrong. */
      .sort((a, b) => b.total - a.total),
    months,
  };
}
