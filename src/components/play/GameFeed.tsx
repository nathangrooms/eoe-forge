/**
 * The game log.
 *
 * `GameState.log` is written by the reducer, so it is the same on every client
 * and survives a replay — that is the record. The bot's notes are not part of
 * game state (they are intent, not fact) and are folded into the same stream,
 * because "Holds back this turn" explains a board position that the log entry
 * "Advanced a step" never will.
 *
 * Two shapes, and the default matters:
 *
 *   **feed** — the last few lines, floating over the board, translucent, no
 *   panel around it and no pointer events except its own toggle. A log is
 *   something you glance at; giving it a card and a column made it compete with
 *   the board for the widest thing on screen, which is how a game screen turns
 *   back into a dashboard.
 *
 *   **panel** — the full scrollback, for when someone actually wants to read
 *   back through a game. Opened from the feed, closed the same way.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STEP_LABELS, type GameState } from '@/lib/game';
import type { PlayFeedEntry } from '@/hooks/usePlayGame';

export interface GameFeedProps {
  state: GameState;
  feed: PlayFeedEntry[];
  className?: string;
  /** How many lines the collapsed feed shows. */
  limit?: number;
  /** 'feed' floats over the board; 'panel' is the full scrollback. */
  variant?: 'feed' | 'panel';
}

interface FeedLine {
  key: string;
  /** Turn number, or null for a surface note that has no turn of its own. */
  turn: number | null;
  text: string;
  detail?: string;
  emphasis: boolean;
  /** Opponent intent rather than a recorded fact. */
  intent: boolean;
}

/**
 * Turn-structure bookkeeping. Every step the surface walks through on the
 * player's behalf writes one of these, so with auto-advance on they are most of
 * the log by volume and none of it by meaning — and the phase strip in the HUD
 * already says which step you are in. Hidden in the feed, kept in the panel,
 * never removed from `GameState.log`, which is the record.
 */
const STRUCTURAL: ReadonlySet<string> = new Set(['ADVANCE_STEP', 'PHASE_CHANGE']);

/**
 * The log and the bot's notes, merged into one stream oldest-first.
 *
 * Notes carry no sequence number of their own, so they are appended after the
 * log rather than interleaved by time — which is honest: they describe the
 * decision behind the entries immediately before them.
 */
function useLines(
  state: GameState,
  feed: PlayFeedEntry[],
  limit: number,
  full: boolean
): FeedLine[] {
  return useMemo(() => {
    const events = full ? state.log : state.log.filter(event => !STRUCTURAL.has(event.type));

    const lines: FeedLine[] = events.slice(-limit).map(event => ({
      key: `log-${event.seq}`,
      turn: event.turn,
      text: event.message,
      detail:
        event.type === 'GAME_OVER' || event.type === 'PLAYER_LOST'
          ? undefined
          : STEP_LABELS[event.step],
      emphasis: event.type === 'GAME_OVER' || event.type === 'PLAYER_LOST',
      intent: false,
    }));

    // Collapsed, one note is context; three notes is the bot narrating its own
    // step counter over the top of the things that actually happened.
    for (const entry of feed.slice(full ? -4 : -1)) {
      const actor = entry.actorId
        ? state.players.find(p => p.id === entry.actorId)?.name
        : null;
      lines.push({
        key: `note-${entry.id}`,
        turn: null,
        text: actor ? `${actor}: ${entry.text}` : entry.text,
        emphasis: false,
        intent: true,
      });
    }

    return lines.slice(-limit);
  }, [state.log, state.players, feed, limit, full]);
}

export function GameFeed({ state, feed, className, limit = 3, variant = 'feed' }: GameFeedProps) {
  const [expanded, setExpanded] = useState(variant === 'panel');
  const scrollRef = useRef<HTMLOListElement>(null);

  const isPanel = variant === 'panel' || expanded;
  const lines = useLines(state, feed, isPanel ? 200 : limit, isPanel);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines.length, expanded]);

  return (
    <div className={cn('pointer-events-none flex flex-col justify-end gap-1', className)}>
      <ol
        ref={scrollRef}
        aria-live="polite"
        aria-label="Game log"
        className={cn(
          'flex min-h-0 flex-col gap-0.5',
          isPanel
            ? 'pointer-events-auto max-h-[42vh] overflow-y-auto rounded-lg bg-background/80 p-2 shadow-lg shadow-black/40 backdrop-blur-md'
            : // Capped so the strip can never climb up over the viewer's own
              // life badge, which sits directly above it on every layout.
              'max-h-[62px] overflow-hidden'
        )}
      >
        {lines.length === 0 && isPanel && (
          <li className="rounded-md px-2 py-3 text-center text-[11px] text-muted-foreground">
            Nothing has happened yet.
          </li>
        )}
        {lines.map((line, index) => {
          // The oldest lines in the collapsed feed fade out rather than being
          // cut off, so the strip reads as a stream instead of a truncated list.
          //
          // The floor is not decoration. The feed floats in the strip the hand
          // is held over, so an older line is usually lying across a card face:
          // at the 0.28 this used to bottom out at, the line and the art behind
          // it were equally visible and neither could be read.
          const depth = lines.length - 1 - index;
          const faded = !isPanel && depth > 0;
          return (
            <li
              key={line.key}
              style={faded ? { opacity: Math.max(0.6, 1 - depth * 0.18) } : undefined}
              className={cn(
                'w-fit max-w-full truncate rounded-md px-2 py-0.5 text-[11px] leading-snug',
                isPanel ? '' : 'bg-background/75 shadow-sm shadow-black/40 backdrop-blur-sm',
                line.emphasis
                  ? 'font-medium text-foreground'
                  : line.intent
                    ? 'text-foreground/80'
                    : 'text-muted-foreground'
              )}
            >
              {line.turn !== null && (
                <span className="mr-1.5 tabular-nums text-[10px] text-muted-foreground/70">
                  T{line.turn}
                </span>
              )}
              {line.text}
              {line.detail && (
                <span className="ml-1.5 text-[10px] text-muted-foreground/60">{line.detail}</span>
              )}
            </li>
          );
        })}
      </ol>

      {variant === 'feed' && (
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="pointer-events-auto flex h-7 w-fit items-center gap-1.5 rounded-md bg-background/55 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground shadow-sm shadow-black/30 backdrop-blur-sm transition-colors hover:bg-background/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ScrollText className="h-3 w-3" />}
          {expanded ? 'Hide log' : 'Log'}
        </button>
      )}
    </div>
  );
}

export default GameFeed;
