/**
 * DeckMatrix — one match at one table.
 *
 * The old card put two names in a row and two buttons under them. This one is
 * built the way a pairing actually looks across a table: both decks facing each
 * other as whole commander cards, each player's live record beside their name,
 * and the result taken in a single click.
 *
 * Entry rules the rebuild is built around:
 *
 * - **One click per match.** The player's own panel *is* the win button. No
 *   dialog, no score fields, no confirm step — the overwhelmingly common result
 *   is 2–0 and it should cost one tap.
 * - **A wrong click is cheap.** Every recorded result can be taken back while
 *   its round is still the current one, which is the only reason one-click
 *   entry is safe. There was previously no way at all to correct a mis-tap.
 * - **Exact games when they matter.** 2–1s and 1–1 time-limit draws go in
 *   through an expander that stays out of the way until asked for.
 *
 * The geometry is the homepage's, and it is the homepage's because the homepage
 * was right. Its mock drew a pairing as two whole commander cards facing each
 * other at 146px with the name centred underneath; this drew two 88px
 * thumbnails with a text block glued to the side of each, mirrored on the right
 * so nothing on the two halves lined up. A commander at 88px is a coloured
 * smudge, and a TO reading a table number off a laptop across a shop counter
 * cannot use it. So the seat is a column now: card, name, record, deck, stacked
 * and centred, with the card taking whatever width the layout can spare up to a
 * cap. At 1680 that is a little over 190px, better than double what it was.
 */

import { useEffect, useState } from 'react';
import { Check, Crown, Handshake, RotateCcw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CommanderPortrait, DeckLine, RecordLine } from './PlayerIdentity';
import type { PlayerView } from './playerViews';
import type { Match, MatchResult } from './scoring';

export interface PairingCardProps {
  match: Match;
  tableNumber: number;
  player1: PlayerView;
  player2: PlayerView;
  /** Results can be taken in and taken back — true only for the current round. */
  editable: boolean;
  /** Swiss allows a drawn match; a bracket needs somebody to advance. */
  allowDraw: boolean;
  onRecord: (result: MatchResult, p1Score: number, p2Score: number) => void;
  onClear: () => void;
}

export function PairingCard({
  match,
  tableNumber,
  player1,
  player2,
  editable,
  allowDraw,
  onRecord,
  onClear,
}: PairingCardProps) {
  const [scoresOpen, setScoresOpen] = useState(false);
  const [p1Games, setP1Games] = useState(2);
  const [p2Games, setP2Games] = useState(0);

  // A round advancing under an open expander should not leave it open on the
  // next round's card, which reuses this component instance.
  useEffect(() => {
    setScoresOpen(false);
    setP1Games(2);
    setP2Games(0);
  }, [match.id]);

  const isBye = match.player2 === 'BYE';
  const awaiting = match.player1 === 'TBD' || match.player2 === 'TBD';
  const done = match.status === 'completed';
  const drawn = done && match.result === 'draw';

  if (isBye) return <ByeCard tableNumber={tableNumber} player={player1} />;

  return (
    <article className="overflow-hidden rounded-2xl bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Table {tableNumber}
        </span>
        <MatchStatus done={done} drawn={drawn} awaiting={awaiting} live={editable && !done} />
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2 p-3 sm:gap-3 sm:p-4 sm:pt-3">
        <Seat
          view={player1}
          games={match.player1Score}
          won={done && match.result === 'p1'}
          lost={done && match.result === 'p2'}
          showGames={done}
          onWin={editable && !done && !awaiting ? () => onRecord('p1', 2, 0) : undefined}
        />

        {/* Both seats are the same column, so `vs` sits on the centre line of
            the two cards rather than floating between two mismatched blocks. */}
        <div className="flex items-center justify-center">
          <span
            aria-hidden="true"
            className="text-[0.6rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground/60"
          >
            vs
          </span>
        </div>

        <Seat
          view={player2}
          games={match.player2Score}
          won={done && match.result === 'p2'}
          lost={done && match.result === 'p1'}
          showGames={done}
          onWin={editable && !done && !awaiting ? () => onRecord('p2', 0, 2) : undefined}
        />
      </div>

      {/* Live match — the secondary results, kept quiet next to the one-click win. */}
      {editable && !done && !awaiting && (
        <div className="bg-muted/30 px-3 py-2.5 sm:px-4">
          {!scoresOpen ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Tap a player to record a 2–0 win.
              </p>
              <div className="flex items-center gap-1.5">
                {allowDraw && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => onRecord('draw', 1, 1)}
                  >
                    <Handshake className="h-3.5 w-3.5" />
                    Draw
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setScoresOpen(true)}
                >
                  Game scores
                </Button>
              </div>
            </div>
          ) : (
            <GameScoreEntry
              player1={player1}
              player2={player2}
              p1Games={p1Games}
              p2Games={p2Games}
              setP1Games={setP1Games}
              setP2Games={setP2Games}
              allowDraw={allowDraw}
              onCancel={() => setScoresOpen(false)}
              onSubmit={() => {
                const result: MatchResult =
                  p1Games > p2Games ? 'p1' : p2Games > p1Games ? 'p2' : 'draw';
                onRecord(result, p1Games, p2Games);
                setScoresOpen(false);
              }}
            />
          )}
        </div>
      )}

      {/* Recorded — restated in words, with the undo that makes one-click safe. */}
      {done && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 px-3 py-2.5 sm:px-4">
          <p className="text-xs text-muted-foreground">
            {drawn
              ? `Drawn ${match.player1Score}–${match.player2Score}. 1 match point each`
              : `${match.result === 'p1' ? player1.name : player2.name} wins ${Math.max(
                  match.player1Score,
                  match.player2Score
                )}–${Math.min(match.player1Score, match.player2Score)}`}
          </p>
          {editable && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={onClear}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Undo result
            </Button>
          )}
        </div>
      )}

      {awaiting && (
        <p className="bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          Waiting on the previous round to finish.
        </p>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function MatchStatus({
  done,
  drawn,
  awaiting,
  live,
}: {
  done: boolean;
  drawn: boolean;
  awaiting: boolean;
  live: boolean;
}) {
  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-wider text-foreground">
        <Check className="h-3 w-3" />
        {drawn ? 'Drawn' : 'Recorded'}
      </span>
    );
  }
  if (awaiting) {
    return (
      <span className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground/70">
        Pending
      </span>
    );
  }
  if (live) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[0.65rem] font-medium uppercase tracking-wider text-foreground">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-foreground" />
        In progress
      </span>
    );
  }
  return (
    <span className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground/70">
      Closed
    </span>
  );
}

interface SeatProps {
  view: PlayerView;
  games: number;
  won: boolean;
  lost: boolean;
  showGames: boolean;
  /** Present only while the result can be taken — makes the whole seat the button. */
  onWin?: () => void;
}

/**
 * One side of the table.
 *
 * A column, not a row: the commander card on top at whatever width the layout
 * can spare, then the name, the live record and the deck under it. The cap
 * exists so a single pairing on a very wide screen does not turn into two
 * poster-sized cards; everything below it scales with the column.
 */
function Seat({ view, games, won, lost, showGames, onWin }: SeatProps) {
  const isTbd = view.name === 'TBD';
  const interactive = !!onWin;

  /*
   * While the result can still be taken, the whole seat is the "record win"
   * button, so nothing inside it may be separately clickable: nested
   * interactive content is invalid, and a TO tapping a commander to score the
   * table would be thrown out to a card page instead of scoring it. Once the
   * match is closed the seat is inert again, and the card and the deck name
   * become the links they are everywhere else in the event.
   */
  const body = (
    <>
      <div className="w-[min(100%,11.5rem)]">
        <CommanderPortrait view={view} size="md" dimmed={lost} linked={!interactive} />
      </div>

      <div className="flex w-full min-w-0 flex-1 flex-col items-center gap-1 text-center">
        <div className="flex min-w-0 max-w-full items-center gap-1.5">
          {won && <Crown aria-hidden="true" className="h-4 w-4 shrink-0 text-foreground" />}
          <span
            className={cn(
              'truncate text-base font-semibold text-foreground',
              lost && 'text-muted-foreground'
            )}
          >
            {isTbd ? 'To be decided' : view.name}
          </span>
        </div>

        {!isTbd && (
          <>
            <RecordLine standing={view.standing} />
            <DeckLine view={view} linked={!interactive} className="max-w-full justify-center" />
          </>
        )}

        <div className="mt-auto flex items-center justify-center gap-2 pt-1.5">
          {showGames && (
            <span
              className={cn(
                'rounded-md px-2.5 py-0.5 text-base font-semibold tabular-nums',
                won ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
              )}
            >
              {games}
            </span>
          )}
          {interactive && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[0.65rem] font-medium uppercase tracking-wider',
                'text-muted-foreground/70 transition-colors group-hover:text-foreground motion-reduce:transition-none'
              )}
            >
              <Crown className="h-3 w-3" />
              Record win
            </span>
          )}
        </div>
      </div>
    </>
  );

  const shell = cn(
    'group flex w-full flex-col items-center gap-2.5 rounded-xl p-2.5 transition-colors motion-reduce:transition-none sm:p-3',
    won && 'bg-muted',
    !won && !interactive && 'bg-muted/20',
    interactive && 'bg-muted/20 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  );

  if (!interactive) return <div className={shell}>{body}</div>;

  return (
    <button type="button" onClick={onWin} className={shell} aria-label={`${view.name} wins 2–0`}>
      {body}
    </button>
  );
}

function ByeCard({ tableNumber, player }: { tableNumber: number; player: PlayerView }) {
  return (
    <article className="overflow-hidden rounded-2xl bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Table {tableNumber}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-wider text-foreground">
          <Sparkles className="h-3 w-3" />
          Bye
        </span>
      </header>

      <div className="flex items-stretch gap-4 p-3 sm:p-4 sm:pt-3">
        <div className="w-[min(38%,11.5rem)] shrink-0">
          <CommanderPortrait view={player} size="md" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <span className="truncate text-base font-semibold text-foreground">{player.name}</span>
          <RecordLine standing={player.standing} />
          <DeckLine view={player} />
        </div>
      </div>

      <p className="bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
        The field is odd, so this seat is awarded a 2–0 win. Nobody takes a second bye while
        another player can.
      </p>
    </article>
  );
}

function GameScoreEntry({
  player1,
  player2,
  p1Games,
  p2Games,
  setP1Games,
  setP2Games,
  allowDraw,
  onCancel,
  onSubmit,
}: {
  player1: PlayerView;
  player2: PlayerView;
  p1Games: number;
  p2Games: number;
  setP1Games: (n: number) => void;
  setP2Games: (n: number) => void;
  allowDraw: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const tied = p1Games === p2Games;

  return (
    <div className="space-y-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Games won
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-between">
        <Stepper label={player1.name} value={p1Games} onChange={setP1Games} />
        <Stepper label={player2.name} value={p2Games} onChange={setP2Games} />
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="flex-1 gap-1.5 text-xs"
          disabled={tied && !allowDraw}
          onClick={onSubmit}
        >
          <Check className="h-3.5 w-3.5" />
          Record
        </Button>
      </div>

      {tied && (
        <p className="text-center text-xs text-muted-foreground">
          {allowDraw
            ? 'Equal games record as a draw, worth 1 match point each.'
            : 'A bracket match needs a winner to advance.'}
        </p>
      )}
    </div>
  );
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="max-w-[7rem] truncate text-xs font-medium text-foreground">{label}</span>
      <div className="flex items-center overflow-hidden rounded-lg bg-background">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={`One fewer game for ${label}`}
          className="h-8 w-8 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none"
        >
          −
        </button>
        <span className="w-8 text-center text-sm font-semibold tabular-nums text-foreground">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(9, value + 1))}
          aria-label={`One more game for ${label}`}
          className="h-8 w-8 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none"
        >
          +
        </button>
      </div>
    </div>
  );
}
