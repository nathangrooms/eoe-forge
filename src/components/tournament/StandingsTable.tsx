/**
 * DeckMatrix — the standings sheet.
 *
 * `scoring.ts` already computes the whole DCI tiebreaker chain; the job here is
 * to make it legible. The previous table printed four percentages in identical
 * grey at identical weight, which is exactly how you make a standings sheet
 * unreadable — points is the number people scan for, the tiebreakers are the
 * fine print underneath it, and they should not look the same.
 *
 * So: rank and points carry the visual weight, the record is set as one
 * `W–L–D` unit, the three percentages sit in a quieter numeric column group,
 * and every row is anchored by the player's commander so a name is never
 * looked up in isolation.
 */

import { Crown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CommanderPortrait } from './PlayerIdentity';
import { viewFor, type PlayerView } from './playerViews';
import type { Standing } from './scoring';

export interface StandingsTableProps {
  standings: Standing[];
  views: Map<string, PlayerView>;
  /** Final standings get the podium treatment on the top three. */
  finished?: boolean;
}

export function StandingsTable({ standings, views, finished = false }: StandingsTableProps) {
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
    <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <caption className="sr-only">
            Standings, ordered by match points then opponents&apos; match-win percentage, own
            game-win percentage and opponents&apos; game-win percentage.
          </caption>
          <thead>
            <tr className="bg-muted/50 text-left">
              <th scope="col" className="w-14 py-2.5 pl-4 pr-2 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Rank
              </th>
              <th scope="col" className="py-2.5 pr-3 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Player
              </th>
              <th scope="col" className="w-24 py-2.5 pr-3 text-center text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                W–L–D
              </th>
              <th scope="col" className="w-16 py-2.5 pr-3 text-center text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Pts
              </th>
              <th scope="col" className="w-20 py-2.5 pr-3 text-right text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                OMW%
              </th>
              <th scope="col" className="w-20 py-2.5 pr-3 text-right text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                GW%
              </th>
              <th scope="col" className="w-20 py-2.5 pr-4 text-right text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
                OGW%
              </th>
            </tr>
          </thead>
          <tbody>
            {standings.map((standing, index) => {
              const view = viewFor(views, standing.player);
              const rank = index + 1;
              const podium = finished && rank <= 3 && !standing.dropped;

              return (
                <tr
                  key={standing.player}
                  className={cn(
                    'align-middle transition-colors motion-reduce:transition-none',
                    index % 2 === 1 && 'bg-muted/20',
                    podium && 'bg-muted/60',
                    standing.dropped && 'opacity-45'
                  )}
                >
                  <td className="py-2 pl-4 pr-2">
                    <span
                      className={cn(
                        'inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold tabular-nums',
                        podium
                          ? 'bg-foreground text-background'
                          : 'bg-muted/60 text-muted-foreground'
                      )}
                    >
                      {rank}
                    </span>
                  </td>

                  <td className="py-2 pr-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="w-9 shrink-0">
                        <CommanderPortrait view={view} size="xs" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {podium && rank === 1 && (
                            <Crown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-foreground" />
                          )}
                          <span className="truncate font-medium text-foreground">
                            {standing.player}
                          </span>
                          {standing.dropped && (
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-muted-foreground">
                              Dropped
                            </span>
                          )}
                          {standing.byes > 0 && (
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-muted-foreground">
                              {standing.byes} bye{standing.byes > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {view.deck ? view.deck.deckName : 'No deck registered'}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="py-2 pr-3 text-center text-sm tabular-nums text-foreground">
                    {standing.wins}–{standing.losses}–{standing.draws}
                  </td>

                  <td className="py-2 pr-3 text-center">
                    <span className="text-base font-semibold tabular-nums text-foreground">
                      {standing.points}
                    </span>
                  </td>

                  <td className="py-2 pr-3 text-right text-xs tabular-nums text-muted-foreground">
                    {standing.opponentMatchWinPct.toFixed(1)}
                  </td>
                  <td className="py-2 pr-3 text-right text-xs tabular-nums text-muted-foreground">
                    {standing.gameWinPct.toFixed(1)}
                  </td>
                  <td className="py-2 pr-4 text-right text-xs tabular-nums text-muted-foreground">
                    {standing.opponentGameWinPct.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="flex items-start gap-2 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Win 3, draw 1, loss 0. Ties break on opponents&apos; match-win percentage, then own
          game-win percentage, then opponents&apos; game-win percentage — each floored at 33% as
          the DCI does. A bye counts as a 2–0 win but its opponent is excluded from everyone&apos;s
          averages.
        </span>
      </p>
    </div>
  );
}

/**
 * The same standings, condensed to what fits beside the pairings.
 *
 * Points and rank only. Anything more and it competes with the table it is a
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
                  'flex items-center gap-2.5 px-4 py-2',
                  index % 2 === 1 && 'bg-muted/20',
                  standing.dropped && 'opacity-45'
                )}
              >
                <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <div className="w-8 shrink-0">
                  <CommanderPortrait view={view} size="xs" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{standing.player}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {standing.wins}–{standing.losses}–{standing.draws}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
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
