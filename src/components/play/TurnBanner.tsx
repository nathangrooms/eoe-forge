/**
 * The turn call.
 *
 * A physical table announces a new turn by a person picking up their cards. A
 * screen has to say it, and the moment it says it is the moment a play surface
 * stops feeling like a form and starts feeling like a game: the board dims for
 * a beat, the name of whoever is up is written across the middle of it, and
 * then it gets out of the way.
 *
 * It is text over the board and nothing else — no panel, no gradient, no glow.
 * The weight comes from the type and from the fact that it is briefly the only
 * thing moving. It never takes pointer events, so a player who wants to keep
 * clicking through it can.
 *
 * Silent under `prefers-reduced-motion`: the HUD already says whose turn it is
 * in words, so this is emphasis and emphasis is exactly what that setting asks
 * you to drop.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { GameState, PlayerId } from '@/lib/game';

export interface TurnBannerProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  /**
   * Whether that seat is actually the reader's.
   *
   * False in a playtest, where `viewerPlayerId` marks the seat the table is
   * being WATCHED through and nobody is playing it. Measured on 22 Aug 2026: a
   * playtest drew the seat badge as WATCHING and BOT while this banner said
   * YOUR TURN across the middle of the board in letters about 60px tall.
   */
  viewerOwnsSeat?: boolean;
  className?: string;
}

/** How long the call stays up. Long enough to read, short enough not to nag. */
const HOLD_MS = 1150;

export function TurnBanner({
  state,
  viewerPlayerId,
  viewerOwnsSeat = true,
  className,
}: TurnBannerProps) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState<number | null>(null);

  const turn = state.turn;
  const playing = state.status === 'playing';

  useEffect(() => {
    if (reduceMotion || !playing) return;
    setShown(turn);
    const timer = window.setTimeout(() => setShown(null), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [turn, playing, reduceMotion]);

  const active = state.players.find(p => p.id === state.activePlayerId);
  const mine = viewerOwnsSeat && state.activePlayerId === viewerPlayerId;

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 z-40 flex items-center justify-center',
        className
      )}
    >
      {/*
        `mode="wait"`, so the call that is leaving is GONE before the next one
        arrives.

        Both banners are centred in the same box, so a plain crossfade paints
        two different names on top of each other for the whole 340ms exit.
        Caught in a screenshot on 28 Aug 2026 at turn 8: "YOUR TURN" and
        "TORALF" superimposed into `YOUR TURNTORALF`, with one "Turn 8 · Round
        4" under the pair. It only shows when turns arrive faster than the
        1150ms hold, which is every bot turn that ends quickly, so it is common
        rather than rare.
      */}
      <AnimatePresence mode="wait">
        {shown !== null && (
          <motion.div
            key={shown}
            initial={{ opacity: 0, scale: 1.14 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center gap-1"
          >
            <span
              className={cn(
                'text-4xl font-semibold uppercase tracking-[0.2em] md:text-5xl',
                // A drop shadow rather than a panel: the board stays visible
                // underneath, which is the whole point of a call-out.
                'text-foreground [text-shadow:0_2px_24px_hsl(0_0%_0%/0.9)]'
              )}
            >
              {mine ? 'Your turn' : `${active?.name ?? 'Opponent'}`}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted-foreground [text-shadow:0_1px_10px_hsl(0_0%_0%/0.9)]">
              Turn {state.turn} · Round {state.round}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default TurnBanner;
