/**
 * DeckMatrix — the single-elimination bracket.
 *
 * A read-only map of the whole event: who is still alive, who knocked out
 * whom, and what the final is going to be. Results are still taken on the
 * pairing cards — a bracket you can accidentally edit while scrolling
 * sideways is a bracket that gets edited by accident.
 *
 * Each seat carries its commander so a bracket of eight names is still a
 * bracket of eight decks — which the previous layout claimed but did not
 * deliver: the card was 28px square, roughly a favicon, and the deck it stood
 * for was not named anywhere on the board. A bracket is the one view a whole
 * room reads at once, off a screen on a wall, so the seats are now sized to be
 * read at a glance and the columns grow into the width they are given instead
 * of huddling at 224px each in the corner of a desktop display.
 */

import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CommanderPortrait, DeckLine } from './PlayerIdentity';
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
      {/*
        Columns share the whole board rather than each taking a fixed 224px.
        `flex-1` with a floor keeps a sixteen-player bracket scrollable instead
        of crushed; there is deliberately NO ceiling, because a capped column
        left a four-player bracket occupying 832px of a 1,632px panel —
        measured — with the right-hand half empty, which is the "unutilised
        space" the owner keeps rejecting.

        The width a wide column gains goes into the commander art, not into
        padding: the seat's card is a percentage of its column, so a two-round
        bracket draws cards you can read across a room instead of two ribbons
        of whitespace with a stamp on the left.

        Vertically, each round spreads itself over the height of the round that
        feeds it, so a semi-final sits between the two quarter-finals whose
        winners meet in it and the final sits in the middle of the board. That
        is what makes a bracket read as a tree rather than as three lists of
        different lengths all starting at the top, which is what the doubling
        `gap`/`marginTop` this replaces actually produced: the container had no
        height, so its `justify-around` did nothing and the arithmetic only
        pushed everything downwards.
      */}
      <div className="flex items-stretch gap-4 xl:gap-6">
        {tournament.rounds.map(round => (
          <div key={round.number} className="flex min-w-[17rem] flex-1 flex-col gap-3">
            <h3 className="text-center text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {roundLabel(round.number, totalRounds)}
            </h3>

            <div className="flex flex-1 flex-col justify-around gap-4">
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
      // Depth from surface tint and shadow. A ring here would be a hairline.
      className={cn(
        'w-full space-y-1 rounded-xl bg-muted/30 p-2',
        live && 'bg-muted shadow-md shadow-black/30'
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
      {/* A share of the column, floored so a sixteen-player bracket still shows
          a card and ceilinged so it stays a bracket rather than a gallery. */}
      <div className="w-[22%] min-w-[3.25rem] max-w-[7.5rem] shrink-0">
        {ghost ? (
          <div
            aria-hidden="true"
            className="aspect-[488/680] w-full rounded bg-muted-foreground/10"
          />
        ) : (
          <CommanderPortrait view={view} size="sm" dimmed={decided && !won} />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          {won && <Crown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-foreground" />}
          <span
            className={cn(
              'min-w-0 truncate text-sm',
              ghost ? 'italic text-muted-foreground/80' : 'text-foreground',
              won && 'font-semibold'
            )}
          >
            {view.name === 'TBD' ? 'To be decided' : view.name}
          </span>
        </span>
        {/* The deck the seat is actually playing. The board claimed to be "a
            bracket of decks" while naming none of them. */}
        {!ghost && <DeckLine view={view} />}
      </div>

      <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
        {decided ? score : ''}
      </span>
    </div>
  );
}
