/**
 * DeckMatrix — life counter: press-and-hold repeat.
 *
 * One tap is one point. Holding accelerates, because going from 40 to 12 in a
 * Commander game is routine and nobody should tap 28 times to do it.
 *
 * The first step fires on pointer *down*, not up, so the panel feels instant.
 * That creates one problem worth naming: a swipe also starts with a pointer
 * down, so by the time a drag is recognised a point has already been added.
 * The hook reports how many steps it applied when a gesture turns into a swipe,
 * and the caller rolls them back — which is free here, because nothing has been
 * committed to the game state yet, it is all still in the pending buffer.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

const HOLD_DELAY_MS = 420;

/**
 * A hold cannot run longer than this. Pointer capture is not a guarantee: a
 * dropped `pointerup` (a stolen pointer, a synthesised event, a browser that
 * loses the capture) would otherwise leave the repeat running forever and add a
 * few hundred life. Belt and braces alongside the window-level listeners below.
 */
const MAX_HOLD_MS = 8000;

/** Repeat interval, in ms, for the nth repeat. Ramps so long holds are usable. */
function intervalFor(ticks: number): number {
  if (ticks < 8) return 130;
  if (ticks < 16) return 70;
  return 42;
}

export interface HoldRepeatConfig {
  /** One increment. Fired immediately on press, then repeatedly while held. */
  onStep: () => void;
  /** Steps already applied when the gesture became a swipe, so they can be undone. */
  onCancelSteps?: (steps: number) => void;
  /** Fired once the pointer travels past the swipe threshold. */
  onSwipe?: () => void;
  /** Travel in CSS pixels before a press counts as a swipe. 0 disables swiping. */
  swipePx?: number;
  enabled?: boolean;
}

export interface HoldRepeatHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onLostPointerCapture: () => void;
  onClick: (event: ReactMouseEvent<HTMLElement>) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
}

interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  steps: number;
  swiped: boolean;
}

export function useHoldRepeat(config: HoldRepeatConfig): HoldRepeatHandlers {
  const { onStep, onCancelSteps, onSwipe, swipePx = 0, enabled = true } = config;

  const gesture = useRef<Gesture | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxHold = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable identity so add/removeEventListener match, delegating to whichever
  // `finish` the current render produced.
  const finishRef = useRef<() => void>(() => undefined);
  const globalEnd = useRef(() => finishRef.current()).current;

  // Handlers are attached once but the callbacks change every render; reading
  // them through a ref keeps a hold that started three renders ago calling the
  // current ones.
  const latest = useRef({ onStep, onCancelSteps, onSwipe });
  latest.current = { onStep, onCancelSteps, onSwipe };

  const stopTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    stopTimer();
    if (maxHold.current !== null) {
      clearTimeout(maxHold.current);
      maxHold.current = null;
    }
    gesture.current = null;
    window.removeEventListener('pointerup', globalEnd);
    window.removeEventListener('pointercancel', globalEnd);
    window.removeEventListener('blur', globalEnd);
  }, [globalEnd, stopTimer]);

  finishRef.current = finish;

  useEffect(() => finish, [finish]);

  const scheduleRepeat = useCallback(
    (delay: number) => {
      stopTimer();
      timer.current = setTimeout(() => {
        const active = gesture.current;
        if (!active || active.swiped) return;
        active.steps += 1;
        latest.current.onStep();
        scheduleRepeat(intervalFor(active.steps));
      }, delay);
    },
    [stopTimer],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || gesture.current) return;
      // Mouse: left button only. Touch and pen report button 0 too.
      if (event.button !== 0) return;

      try {
        // Capture keeps the hold alive if the finger drifts off the half. It
        // throws for a pointer the browser no longer considers active, which is
        // not a reason to drop the gesture.
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        /* capture unavailable — the window-level listeners still end the hold */
      }
      gesture.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        steps: 1,
        swiped: false,
      };
      latest.current.onStep();
      scheduleRepeat(HOLD_DELAY_MS);

      // The element's own pointerup is the normal path; these are the safety
      // net for when it never arrives.
      window.addEventListener('pointerup', globalEnd);
      window.addEventListener('pointercancel', globalEnd);
      window.addEventListener('blur', globalEnd);
      maxHold.current = setTimeout(globalEnd, MAX_HOLD_MS);
    },
    [enabled, globalEnd, scheduleRepeat],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const active = gesture.current;
      if (!active || active.swiped || swipePx <= 0) return;
      if (active.pointerId !== event.pointerId) return;

      const dx = event.clientX - active.startX;
      const dy = event.clientY - active.startY;
      if (Math.hypot(dx, dy) < swipePx) return;

      active.swiped = true;
      stopTimer();
      if (active.steps > 0) latest.current.onCancelSteps?.(active.steps);
      active.steps = 0;
      latest.current.onSwipe?.();
    },
    [stopTimer, swipePx],
  );

  const onPointerUp = useCallback(() => finish(), [finish]);
  const onPointerCancel = useCallback(() => finish(), [finish]);
  const onLostPointerCapture = useCallback(() => finish(), [finish]);

  /**
   * Pointer events already handled the press. A click with `detail === 0` is a
   * keyboard activation (Enter or Space on a focused button), which produces no
   * pointer events at all — so that is the only case this should act on.
   */
  const onClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!enabled) return;
      if (event.detail !== 0) return;
      latest.current.onStep();
    },
    [enabled],
  );

  const onContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    // A long press on Android raises the context menu, which would abort the hold.
    event.preventDefault();
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
    onClick,
    onContextMenu,
  };
}
