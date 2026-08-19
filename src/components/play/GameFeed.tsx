/**
 * The game log.
 *
 * `GameState.log` is written by the reducer, so it is the same on every client
 * and survives a replay — that is the record. The bot's notes are not part of
 * game state (they are intent, not fact) and are folded into the same stream,
 * because "Holds back this turn" explains a board position that the log entry
 * "Advanced a step" never will.
 *
 * ---------------------------------------------------------------------------
 * "Loading log doesnt do anything either"
 * ---------------------------------------------------------------------------
 *
 * The owner's report, and it needed measuring rather than believing or
 * dismissing. Driving a real game and probing the control:
 *
 *   - the LOG button IS wired. It sits at 8,1014 — bottom left, on screen — it
 *     carries `aria-expanded`, and pressing it swaps the collapsed strip for a
 *     scrollable panel. It is not dead.
 *   - the panel it opens was **224px wide** (`w-56`) with `truncate` on every
 *     line, and 31 of its 200 lines were cut off mid-sentence.
 *   - and in a real game most of what it showed was `Advanced a step.` Measured
 *     across a played game rather than a scripted one, structural entries were
 *     about **70% of the log by volume**. The panel deliberately included them,
 *     so opening it buried the four lines that mattered under a hundred that
 *     did not.
 *
 * So "does nothing" is a fair description of the experience and a wrong
 * description of the wiring, and both halves are fixed here:
 *
 *   1. The panel is wide enough for a sentence and **wraps** instead of
 *      truncating. A log whose lines are cut off is a log you cannot use.
 *   2. It keeps hiding turn bookkeeping by default, with an explicit control to
 *      show it — `GameState.log` is still the complete record and the toggle
 *      says so, so nothing is hidden without a way back.
 *   3. Turns are separated, so scrolling back through a game reads as turns
 *      rather than as one undifferentiated column.
 *   4. It opens where it can be read: anchored to the bottom-left, growing
 *      upward, with the newest line at the bottom, and it is scrolled there on
 *      open.
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
  /** Turn bookkeeping, shown only when the reader asks for everything. */
  structural: boolean;
}

/**
 * Turn-structure bookkeeping. Every step the surface walks through on the
 * player's behalf writes one of these, so with auto-advance on they are most of
 * the log by volume and none of it by meaning — measured at about 70% of a
 * played game — and the phase strip in the HUD already says which step you are
 * in. Hidden by default in both shapes, shown by the panel's own control, never
 * removed from `GameState.log`, which is the record.
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
  full: boolean,
  everything: boolean
): FeedLine[] {
  return useMemo(() => {
    const events = everything ? state.log : state.log.filter(event => !STRUCTURAL.has(event.type));

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
      structural: STRUCTURAL.has(event.type),
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
        structural: false,
      });
    }

    return lines.slice(-limit);
  }, [state.log, state.players, feed, limit, full, everything]);
}

export function GameFeed({ state, feed, className, limit = 3, variant = 'feed' }: GameFeedProps) {
  const [expanded, setExpanded] = useState(variant === 'panel');
  /* Off by default. See STRUCTURAL: the record is complete either way, and the
     control below says which of the two the reader is looking at. */
  const [everything, setEverything] = useState(false);
  const scrollRef = useRef<HTMLOListElement>(null);

  const isPanel = variant === 'panel' || expanded;
  const lines = useLines(state, feed, isPanel ? 300 : limit, isPanel, isPanel && everything);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines.length, expanded, everything]);

  return (
    <div
      className={cn(
        'pointer-events-none flex flex-col justify-end gap-1',
        /* The panel needs room for a sentence. 224px with `truncate` on it cut
           31 of 200 measured lines off mid-word, which is most of why a wired
           control read as a dead one. */
        isPanel ? 'w-[min(30rem,42vw)]' : 'w-56',
        className
      )}
    >
      {isPanel && variant === 'feed' && (
        <div className="pointer-events-auto flex items-center justify-between gap-2 rounded-t-lg bg-background/85 px-2 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-md">
          <span>
            Game log
            <span className="ml-1.5 tabular-nums text-muted-foreground/70">
              {state.log.length} entries
            </span>
          </span>
          <button
            type="button"
            onClick={() => setEverything(value => !value)}
            aria-pressed={everything}
            title={
              everything
                ? 'Hide the turn bookkeeping: untap, upkeep, every step walked through'
                : 'Show every entry, including each step the game walked through for you'
            }
            className={cn(
              'rounded px-1.5 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              everything
                ? 'bg-foreground text-background'
                : 'bg-foreground/10 hover:bg-foreground/20 hover:text-foreground'
            )}
          >
            Every step
          </button>
        </div>
      )}

      <ol
        ref={scrollRef}
        aria-live="polite"
        aria-label="Game log"
        className={cn(
          'flex min-h-0 flex-col gap-0.5',
          isPanel
            ? 'pointer-events-auto max-h-[46vh] overflow-y-auto bg-background/85 p-2 shadow-lg shadow-black/40 backdrop-blur-md'
            : // Capped so the strip can never climb up over the viewer's own
              // life badge, which sits directly above it on every layout.
              'max-h-[62px] overflow-hidden',
          isPanel && variant === 'feed' ? 'rounded-b-lg' : isPanel ? 'rounded-lg' : ''
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
          /* A rule between turns, so a scrollback reads as turns rather than as
             one column. Drawn as spacing and a hairline of surface, never a
             border on the line itself. */
          const newTurn =
            isPanel && line.turn !== null && index > 0 && lines[index - 1].turn !== line.turn;
          return (
            <li
              key={line.key}
              style={faded ? { opacity: Math.max(0.6, 1 - depth * 0.18) } : undefined}
              className={cn(
                'w-fit max-w-full rounded-md px-2 py-0.5 text-[11px] leading-snug',
                /* Wraps in the panel, truncates in the floating strip. The
                   strip is a glance and has one line to give; the panel is
                   being read. */
                isPanel ? 'break-words' : 'truncate',
                isPanel ? '' : 'bg-background/75 shadow-sm shadow-black/40 backdrop-blur-sm',
                newTurn && 'mt-1.5 border-t border-foreground/10 pt-1.5',
                line.emphasis
                  ? 'font-medium text-foreground'
                  : line.structural
                    ? 'text-muted-foreground/50'
                    : line.intent
                      ? 'text-foreground/80'
                      : 'text-muted-foreground',
                /* The newest line is the one a player looks for. */
                isPanel && index === lines.length - 1 && 'bg-foreground/[0.07] text-foreground'
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
