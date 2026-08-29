/**
 * DeckMatrix — the round in play.
 *
 * Round navigation, the state of the round you are looking at, and its
 * pairings. The distinction the old surface never made — and the one a judge
 * asks for first — is *which round is live*: every earlier round is a read-only
 * record, the current round is the only one taking results, and the rounds
 * after it do not exist yet but are still on the schedule.
 */

import { ChevronLeft, ChevronRight, Flag, Loader2, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PairingCard } from './PairingCard';
import { viewFor, type PlayerView } from './playerViews';
import type { MatchResult, Tournament } from './scoring';

export interface RoundBoardProps {
  tournament: Tournament;
  totalRounds: number;
  views: Map<string, PlayerView>;
  selectedRound: number;
  onSelectRound: (round: number) => void;
  onRecord: (round: number, matchId: string, result: MatchResult, p1: number, p2: number) => void;
  onClear: (round: number, matchId: string) => void;
  onAdvance: () => void;
}

export function RoundBoard({
  tournament,
  totalRounds,
  views,
  selectedRound,
  onSelectRound,
  onRecord,
  onClear,
  onAdvance,
}: RoundBoardProps) {
  const round = tournament.rounds.find(r => r.number === selectedRound);
  const isCurrent = selectedRound === tournament.currentRound;
  const played = tournament.rounds.length;

  // Swiss shows the rounds still to come; a bracket's schedule is already built.
  const scheduled = Math.max(totalRounds, played);
  const roundNumbers = Array.from({ length: scheduled }, (_, i) => i + 1);

  const decided = round?.matches.filter(m => m.status === 'completed').length ?? 0;
  const total = round?.matches.length ?? 0;
  const complete = total > 0 && decided === total;
  const isLastScheduled = tournament.currentRound >= totalRounds;

  return (
    <section className="space-y-4">
      {/* Round navigation */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground"
          disabled={selectedRound <= 1}
          onClick={() => onSelectRound(selectedRound - 1)}
          aria-label="Previous round"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">
          {roundNumbers.map(n => {
            const data = tournament.rounds.find(r => r.number === n);
            const isSelected = n === selectedRound;
            const isLive = n === tournament.currentRound && tournament.status === 'in-progress';
            const isDone = data?.status === 'completed';
            const notYet = !data;

            return (
              <button
                key={n}
                type="button"
                disabled={notYet}
                onClick={() => onSelectRound(n)}
                aria-current={isSelected ? 'true' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors motion-reduce:transition-none',
                  isSelected && 'bg-foreground text-background',
                  !isSelected && !notYet && 'bg-muted/40 text-foreground hover:bg-muted',
                  notYet && 'cursor-default bg-muted/20 text-muted-foreground/80'
                )}
              >
                <span className="tabular-nums">R{n}</span>
                {isLive && !isSelected && (
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-foreground" />
                )}
                {isDone && !isLive && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      isSelected ? 'bg-background/60' : 'bg-muted-foreground/50'
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground"
          disabled={selectedRound >= played}
          onClick={() => onSelectRound(selectedRound + 1)}
          aria-label="Next round"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Round state */}
      <div className="rounded-2xl bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              Round {selectedRound}
              <span className="text-sm font-normal text-muted-foreground">of {totalRounds}</span>
              {isCurrent && tournament.status === 'in-progress' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-background">
                  Current
                </span>
              )}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {total === 0
                ? 'No pairings in this round.'
                : complete
                  ? `All ${total} match${total === 1 ? '' : 'es'} recorded.`
                  : `${decided} of ${total} results in. ${total - decided} still playing.`}
            </p>
          </div>

          {isCurrent && complete && tournament.status === 'in-progress' && (
            <Button onClick={onAdvance} className="gap-2">
              {isLastScheduled ? (
                <>
                  <Trophy className="h-4 w-4" />
                  Finish event
                </>
              ) : (
                <>
                  <Flag className="h-4 w-4" />
                  Pair round {selectedRound + 1}
                </>
              )}
            </Button>
          )}
        </div>

        {total > 0 && (
          <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={decided}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label={`Round ${selectedRound} results recorded`}
          >
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${total === 0 ? 0 : (decided / total) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Pairings */}
      {round && round.matches.length > 0 ? (
        /*
          Columns follow the width that is actually there, not a breakpoint.
          `2xl:grid-cols-2` measured the WINDOW, so a 1,680px screen showing the
          standings rail got two 630px tables and half a row of nothing under
          them, while a 1,280px screen got one 900px table holding two 88px
          thumbnails. auto-fill against a 24rem floor gives three tables at
          1,680, two at 1,280 and one on a phone, and it is the same rule
          whether the rail is up or not.
        */
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,24rem),1fr))] gap-3">
          {round.matches.map((match, index) => (
            <PairingCard
              key={match.id}
              match={match}
              tableNumber={index + 1}
              player1={viewFor(views, match.player1)}
              player2={viewFor(views, match.player2)}
              editable={isCurrent && tournament.status === 'in-progress'}
              allowDraw={tournament.format === 'swiss'}
              onRecord={(result, p1, p2) => onRecord(selectedRound, match.id, result, p1, p2)}
              onClear={() => onClear(selectedRound, match.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-muted/30 p-10 text-center">
          <Loader2 aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">This round has no pairings yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Finish the current round and pair the next one. Swiss seats players on record and never
            repeats a match-up while a legal alternative exists.
          </p>
        </div>
      )}
    </section>
  );
}
