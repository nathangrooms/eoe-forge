/**
 * DeckMatrix — life counter: the "phone in the middle of the table" hooks.
 *
 * Every capability here is optional and feature-detected. iOS Safari on iPhone
 * has no Fullscreen API for ordinary elements, older Android has no Wake Lock,
 * and both are perfectly usable life counters without them — so nothing in this
 * file ever throws, warns, or blocks. It either works or it quietly does not.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/lib/motion';

/* -------------------------------------------------------------------------- */
/* Reduced motion                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Re-exported rather than reimplemented. This file used to carry its own copy,
 * byte-for-byte the same question as the dashboard's copy. The answer belongs
 * with the rest of the motion vocabulary in `@/lib/motion`; the export stays
 * here so the life counter's existing imports still resolve.
 */
export { usePrefersReducedMotion };

/* -------------------------------------------------------------------------- */
/* Scroll lock                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A life counter must not rubber-band. Locking overflow on the document while
 * the board is mounted stops the pull-to-refresh gesture from firing when
 * somebody swipes a panel, which would otherwise reload the game mid-turn.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      overscroll: body.style.overscrollBehavior,
    };

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    // Deliberately not `touch-action: none` on the body: touch-action is
    // evaluated up the ancestor chain, so blocking it here would also block
    // panning inside the rotated detail sheet. The board and its tap targets set
    // it on themselves instead.
    body.style.overscrollBehavior = 'none';

    return () => {
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.overscrollBehavior = previous.overscroll;
    };
  }, [active]);
}

/* -------------------------------------------------------------------------- */
/* Wake lock                                                                  */
/* -------------------------------------------------------------------------- */

interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
}

interface NavigatorWithWakeLock {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
}

export interface WakeLockStatus {
  supported: boolean;
  /** True while the screen is actually being held awake. */
  held: boolean;
}

/**
 * Keeps the screen on while a game is running. The lock is dropped by the
 * browser whenever the tab is hidden, so it has to be re-acquired on every
 * return to visibility — otherwise the phone dims halfway through a long turn.
 */
export function useWakeLock(active: boolean): WakeLockStatus {
  const sentinel = useRef<WakeLockSentinelLike | null>(null);
  const [held, setHeld] = useState(false);

  const supported =
    typeof navigator !== 'undefined' &&
    typeof (navigator as unknown as NavigatorWithWakeLock).wakeLock?.request === 'function';

  useEffect(() => {
    if (!active || !supported) return;

    let cancelled = false;
    const api = (navigator as unknown as NavigatorWithWakeLock).wakeLock;

    const acquire = async () => {
      if (cancelled || sentinel.current || document.visibilityState !== 'visible') return;
      try {
        const lock = await api.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel.current = lock;
        setHeld(true);
        lock.addEventListener?.('release', () => {
          sentinel.current = null;
          setHeld(false);
        });
      } catch {
        // NotAllowedError on a hidden tab, insecure context or low battery.
        setHeld(false);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      const lock = sentinel.current;
      sentinel.current = null;
      setHeld(false);
      if (lock) void lock.release().catch(() => undefined);
    };
  }, [active, supported]);

  return { supported, held };
}

/* -------------------------------------------------------------------------- */
/* Fullscreen                                                                 */
/* -------------------------------------------------------------------------- */

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

export interface FullscreenControl {
  supported: boolean;
  isFullscreen: boolean;
  /** Must be called from a user gesture or the browser rejects it. */
  enter: () => void;
  exit: () => void;
  toggle: () => void;
}

function fullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function useFullscreen(): FullscreenControl {
  const [isFullscreen, setIsFullscreen] = useState(() => !!fullscreenElement());

  const supported =
    typeof document !== 'undefined' &&
    (typeof document.documentElement.requestFullscreen === 'function' ||
      typeof (document.documentElement as FullscreenElement).webkitRequestFullscreen === 'function');

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onChange = () => setIsFullscreen(!!fullscreenElement());
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const enter = useCallback(() => {
    if (!supported || fullscreenElement()) return;
    const element = document.documentElement as FullscreenElement;
    try {
      const request = element.requestFullscreen
        ? element.requestFullscreen({ navigationUI: 'hide' })
        : element.webkitRequestFullscreen?.();
      if (request && typeof (request as Promise<void>).catch === 'function') {
        (request as Promise<void>).catch(() => undefined);
      }
    } catch {
      /* rejected outside a gesture, or unsupported on this element */
    }
  }, [supported]);

  const exit = useCallback(() => {
    if (!fullscreenElement()) return;
    const doc = document as FullscreenDocument;
    try {
      const request = doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.();
      if (request && typeof (request as Promise<void>).catch === 'function') {
        (request as Promise<void>).catch(() => undefined);
      }
    } catch {
      /* already out */
    }
  }, []);

  const toggle = useCallback(() => {
    if (fullscreenElement()) exit();
    else enter();
  }, [enter, exit]);

  return { supported, isFullscreen, enter, exit, toggle };
}

/* -------------------------------------------------------------------------- */
/* Haptics                                                                    */
/* -------------------------------------------------------------------------- */

interface NavigatorWithVibrate {
  vibrate?: (pattern: number | number[]) => boolean;
}

/** A short tick on a discrete tap. No-op on iOS, which has no Vibration API. */
export function haptic(pattern: number | number[] = 8): void {
  if (typeof navigator === 'undefined') return;
  try {
    (navigator as unknown as NavigatorWithVibrate).vibrate?.(pattern);
  } catch {
    /* blocked by the browser — cosmetic only */
  }
}
