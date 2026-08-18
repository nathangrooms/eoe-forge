/**
 * The game log, plus what the bot thought it was doing.
 *
 * `GameState.log` is written by the reducer, so it is the same on every client
 * and survives a replay — that is the record. The bot's notes are not part of
 * game state (they are intent, not fact) and sit above it, because "Holds back
 * this turn" explains a board position that the log entry "Advanced a step"
 * never will.
 */

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { STEP_LABELS, type GameState } from '@/lib/game';
import type { PlayFeedEntry } from '@/hooks/usePlayGame';

export interface GameFeedProps {
  state: GameState;
  feed: PlayFeedEntry[];
  className?: string;
  /** How many log lines to keep on screen. */
  limit?: number;
}

export function GameFeed({ state, feed, className, limit = 60 }: GameFeedProps) {
  const scrollRef = useRef<HTMLOListElement>(null);
  const entries = state.log.slice(-limit);
  const notes = feed.slice(-4).reverse();

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [state.log.length]);

  return (
    <aside className={cn('flex min-h-0 flex-col gap-3 rounded-xl bg-card p-3 shadow-sm', className)}>
      {notes.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Opponent intent
          </h3>
          <ul className="mt-1.5 space-y-1">
            {notes.map(entry => {
              const actor = entry.actorId
                ? state.players.find(p => p.id === entry.actorId)?.name
                : null;
              return (
                <li key={entry.id} className="rounded-md bg-muted/50 px-2 py-1 text-[11px] leading-snug">
                  {actor && <span className="font-medium text-foreground">{actor}: </span>}
                  <span className="text-muted-foreground">{entry.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Game log
        </h3>
        <ol
          ref={scrollRef}
          className="mt-1.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1"
          aria-live="polite"
        >
          {entries.length === 0 && (
            <li className="rounded-md bg-muted/40 px-2 py-3 text-center text-[11px] text-muted-foreground">
              Nothing has happened yet.
            </li>
          )}
          {entries.map(event => (
            <li
              key={event.seq}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] leading-snug',
                event.type === 'GAME_OVER' || event.type === 'PLAYER_LOST'
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              <span className="mr-1.5 tabular-nums text-[10px] text-muted-foreground/70">
                T{event.turn}
              </span>
              {event.message}
              {event.type !== 'GAME_OVER' && event.type !== 'PLAYER_LOST' && (
                <span className="ml-1.5 text-[10px] text-muted-foreground/70">
                  {STEP_LABELS[event.step]}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
