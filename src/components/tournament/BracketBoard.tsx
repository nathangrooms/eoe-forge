/**
 * DeckMatrix — the single-elimination bracket.
 *
 * A read-only map of the whole event: who is still alive, who knocked out
 * whom, and what the final is going to be. Results are still taken on the
 * pairing cards — a bracket you can accidentally edit while scrolling
 * sideways is a bracket that gets edited by accident.
 *
 * Each seat carries its commander so a bracket of eight names is still a
 * bracket of eight decks.
 */

import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CommanderPortrait } from './PlayerIdentity';
import { viewFor, type PlayerView } from './playerViews';
import type { Match, Tournament } from './scoring';

/** "Final", "Semi-finals", "Quarter-finals", then plain round numbers. */
function roundLabel(roundNumber: number, totalRounds: number): string {
  const fromEnd = totalRounds - roundNumber;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-finals';
  if (fromEnd === 2) return 'Quarter-finals';
  return `Round ${roundNumber}`;
}

export function BracketBoard({
  tournament,
  views,
}: {
  tournament: Tournament;
  views: Map<string, PlayerView>;
}) {
  const totalRounds = tournament.rounds.length;

  if (totalRounds === 0) {
    return (
      <div className="rounded-2xl bg-muted/30 p-10 text-center">
        <p className="text-sm font-medium text-foreground">The bracket is drawn when you start</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Seeding is randomised and the field is padded to a power of two with byes.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl bg-card p-4 shadow-sm sm:p-6">
      <div className="flex min-w-max gap-6">
        {tournament.rounds.map((round, roundIdx) => (
          <div key={round.number} className="flex flex-col gap-3">
            <h3 className="text-center text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {roundLabel(round.number, totalRounds)}
            </h3>

            <div
              className="flex flex-col justify-around"
              style={{
                gap: `${Math.pow(2, roundIdx) * 1.75}rem`,
                marginTop: `${(Math.pow(2, roundIdx) - 1) * 0.9}rem`,
              }}
            >
              {round.matches.map(match => (
                <BracketMatch
                  key={match.id}
                  match={match}
                  views={views}
                  live={round.number === tournament.currentRound && match.status !== 'completed'}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketMatch({
  match,
  views,
  live,
}: {
  match: Match;
  views: Map<string, PlayerView>;
  live: boolean;
}) {
  return (
    <div
      className={cn(
        'w-56 space-y-1 rounded-xl bg-muted/30 p-1.5',
        live && 'bg-muted ring-1 ring-foreground/20'
      )}
    >
      <BracketSeat
        view={viewFor(views, match.player1)}
        score={match.player1Score}
        won={match.result === 'p1'}
        decided={match.status === 'completed'}
      />
      <BracketSeat
        view={viewFor(views, match.player2)}
        score={match.player2Score}
        won={match.result === 'p2'}
        decided={match.status === 'completed'}
      />
    </div>
  );
}

function BracketSeat({
  view,
  score,
  won,
  decided,
}: {
  view: PlayerView;
  score: number;
  won: boolean;
  decided: boolean;
}) {
  const ghost = view.name === 'BYE' || view.name === 'TBD';

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg p-1.5',
        won && 'bg-foreground/10',
        decided && !won && 'opacity-50'
      )}
    >
      <div className="w-7 shrink-0">
        {ghost ? (
          <div
            aria-hidden="true"
            className="aspect-[488/680] w-full rounded bg-muted-foreground/10"
          />
        ) : (
          <CommanderPortrait view={view} size="xs" dimmed={decided && !won} />
        )}
      </div>

      {won && <Crown aria-hidden="true" className="h-3 w-3 shrink-0 text-foreground" />}

      <span
        className={cn(
          'min-w-0 flex-1 truncate text-xs',
          ghost ? 'italic text-muted-foreground/60' : 'text-foreground',
          won && 'font-semibold'
        )}
      >
        {view.name === 'TBD' ? 'To be decided' : view.name}
      </span>

      <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
        {decided ? score : '—'}
      </span>
    </div>
  );
}
