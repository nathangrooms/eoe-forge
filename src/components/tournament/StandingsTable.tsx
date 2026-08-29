/**
 * DeckMatrix — the standings sheet.
 *
 * `scoring.ts` already computes the whole DCI tiebreaker chain; the job here is
 * to make it legible on the screen it is actually read on.
 *
 * What was wrong with the table this replaces was not its typography, which was
 * fine. It was that a `<table class="w-full">` on a 1,680px page gave the player
 * column about 1,050px to hold a 56px thumbnail and two short lines, and pinned
 * the five numeric columns to the right edge. The name and the points describing
 * it ended up most of a screen apart, so reading the sheet meant tracking across
 * an empty black gulf. The "why does the page not use its width" complaint was
 * true here in the opposite direction: the width was used, by nothing.
 *
 * So a standing is a panel, not a table row:
 *
 *   rank · commander (large) · player and deck · the round-by-round trail · points
 *
 * The trail is the middle, and it is the thing a printed standings sheet always
 * has and this app never did: which round the draw was in, and who it was
 * against. `roundTrail` derives it from the matches themselves, so it cannot
 * disagree with the record beside it, and it turns the empty middle into the
 * most informative part of the row.
 *
 * The tiebreakers keep their place as fine print, because that is what they are:
 * points is the number people scan for, OMW% is the number people check.
 */

import { Crown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CommanderPortrait, DeckLine } from './PlayerIdentity';
import { viewFor, type PlayerView } from './playerViews';
import { roundTrail, type Round, type RoundOutcome, type Standing } from './scoring';

export interface StandingsTableProps {
  standings: Standing[];
  views: Map<string, PlayerView>;
  /** The played rounds, for the round-by-round trail. */
  rounds?: Round[];
  /** Final standings get the podium treatment on the top three. */
  finished?: boolean;
}

export function StandingsTable({
  standings,
  views,
  rounds = [],
  finished = false,
}: StandingsTableProps) {
  if (standings.length === 0) {
    return (
      <div className="rounded-2xl bg-muted/30 p-10 text-center">
        <p className="text-sm font-medium text-foreground">No standings yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Records appear here as soon as the first result is recorded.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-2">
      {/* Column headings, aligned to the panels below rather than owned by a
          table element, so the panels can be panels and still line up. */}
      <div className="hidden items-center gap-4 px-4 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:flex">
        <span className="w-8 shrink-0" />
        <span className="w-[5.5rem] shrink-0" />
        <span className="w-[16rem] shrink-0 xl:w-[18rem]">Player</span>
        <span className="min-w-0 flex-1">Round by round</span>
        <span className="w-16 shrink-0 text-center">W-L-D</span>
        <span className="w-14 shrink-0 text-center">Pts</span>
        <span className="w-[9rem] shrink-0 text-right text-muted-foreground/80">
          OMW / GW / OGW
        </span>
      </div>

      <ol className="space-y-2">
        {standings.map((standing, index) => {
          const view = viewFor(views, standing.player);
          const rank = index + 1;
          const podium = finished && rank <= 3 && !standing.dropped;
          const trail = roundTrail(standing.player, rounds);

          return (
            <li
              key={standing.player}
              className={cn(
                'flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl p-3 shadow-sm sm:p-4',
                podium ? 'bg-muted/70' : 'bg-card',
                standing.dropped && 'opacity-45'
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold tabular-nums',
                  podium ? 'bg-foreground text-background' : 'bg-muted/60 text-muted-foreground'
                )}
              >
                {rank}
              </span>

              {/* 56px was the "cards are tiny" complaint in miniature. A
                  standings sheet has the room for a commander you can actually
                  recognise, and the homepage's mock of this screen proved it. */}
              <div className="w-[5.5rem] shrink-0">
                <CommanderPortrait view={view} size="sm" />
              </div>

              <div className="w-[16rem] min-w-0 shrink-0 xl:w-[18rem]">
                <div className="flex min-w-0 items-center gap-1.5">
                  {podium && rank === 1 && (
                    <Crown aria-hidden="true" className="h-4 w-4 shrink-0 text-foreground" />
                  )}
                  <span className="truncate text-base font-semibold text-foreground">
                    {standing.player}
                  </span>
                  {standing.dropped && <Tag>Dropped</Tag>}
                  {standing.byes > 0 && (
                    <Tag>
                      {standing.byes} bye{standing.byes > 1 ? 's' : ''}
                    </Tag>
                  )}
                </div>
                {/* The same deck line the pairings and the roster draw, so the
                    deck a player is on is the same object, and the same link,
                    wherever you meet them. */}
                <DeckLine view={view} className="mt-1" />
              </div>

              {/* The flexible column, so extra width buys more of the trail
                  rather than more black between the name and the points. */}
              <div className="min-w-0 flex-1 basis-64">
                <Trail trail={trail} />
              </div>

              <span className="w-16 shrink-0 text-center text-sm tabular-nums text-foreground">
                {standing.wins}-{standing.losses}-{standing.draws}
              </span>

              <span className="w-14 shrink-0 text-center text-xl font-semibold tabular-nums text-foreground">
                {standing.points}
              </span>

              <span className="flex w-[9rem] shrink-0 justify-end gap-3 text-xs tabular-nums text-muted-foreground">
                <span>{standing.opponentMatchWinPct.toFixed(1)}</span>
                <span>{standing.gameWinPct.toFixed(1)}</span>
                <span>{standing.opponentGameWinPct.toFixed(1)}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <p className="flex items-start gap-2 rounded-2xl bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Win 3, draw 1, loss 0. Ties break on opponents&apos; match-win percentage, then own
          game-win percentage, then opponents&apos; game-win percentage, each floored at 33% as the
          DCI does. A bye counts as a 2-0 win but its opponent is excluded from everyone&apos;s
          averages.
        </span>
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

const OUTCOME_LETTER: Record<RoundOutcome['outcome'], string> = {
  win: 'W',
  loss: 'L',
  draw: 'D',
  bye: 'B',
  pending: '·',
};

/**
 * One chip per round: the result, the games, and who it was against.
 *
 * A win is the only outcome set in the foreground tone, because what you look
 * for on a standings sheet is how somebody got their points.
 *
 * Laid out on a grid of one column per round rather than as a wrapping row, so
 * round two is in the same place on every line and the sheet can be read down a
 * round as well as across a player. Every trail is the same length by
 * construction (`roundTrail` emits an entry for a round a player sat out), which
 * is what makes the columns line up. Capped at six across so a long event wraps
 * to a second line instead of shrinking every chip to nothing.
 */
function Trail({ trail }: { trail: RoundOutcome[] }) {
  if (trail.length === 0) {
    return <span className="text-xs text-muted-foreground">No rounds played yet</span>;
  }

  return (
    <ul
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${Math.min(trail.length, 6)}, minmax(0, 1fr))` }}
    >
      {trail.map(entry => (
        <li
          key={entry.round}
          title={
            entry.opponent
              ? `Round ${entry.round} against ${entry.opponent}`
              : `Round ${entry.round}`
          }
          className={cn(
            'flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1',
            entry.outcome === 'win' ? 'bg-foreground/15' : 'bg-muted/40'
          )}
        >
          <span className="shrink-0 text-[0.6rem] font-medium uppercase tracking-wider text-muted-foreground">
            R{entry.round}
          </span>
          <span
            className={cn(
              'shrink-0 text-xs font-semibold',
              entry.outcome === 'win' ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {OUTCOME_LETTER[entry.outcome]}
          </span>
          {entry.games && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {entry.games[0]}-{entry.games[1]}
            </span>
          )}
          {entry.opponent && (
            <span className="hidden min-w-0 truncate text-xs text-muted-foreground/80 sm:inline">
              {entry.opponent}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The same standings, condensed to what fits beside the pairings.
 *
 * Points and rank only. Anything more and it competes with the sheet it is a
 * summary of.
 */
export function StandingsRail({
  standings,
  views,
  limit = 8,
  onSeeAll,
}: {
  standings: Standing[];
  views: Map<string, PlayerView>;
  limit?: number;
  onSeeAll?: () => void;
}) {
  const shown = standings.slice(0, limit);

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Live standings
        </h3>
        {onSeeAll && standings.length > limit && (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
          >
            All {standings.length}
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="px-4 pb-4 text-xs text-muted-foreground">
          Standings fill in as results come back from the tables.
        </p>
      ) : (
        <ul className="pb-2">
          {shown.map((standing, index) => {
            const view = viewFor(views, standing.player);
            return (
              <li
                key={standing.player}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5',
                  index % 2 === 1 && 'bg-muted/20',
                  standing.dropped && 'opacity-45'
                )}
              >
                <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <div className="w-12 shrink-0">
                  <CommanderPortrait view={view} size="sm" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{standing.player}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {standing.wins}-{standing.losses}-{standing.draws}
                  </p>
                </div>
                <span className="shrink-0 text-base font-semibold tabular-nums text-foreground">
                  {standing.points}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
