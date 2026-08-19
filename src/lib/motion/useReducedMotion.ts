import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Does this person want less motion.
 *
 * There were two copies of this hook in the repo — one in the dashboard's
 * `Reveal`, one in the life counter's `useImmersive` — plus framer-motion's own
 * `useReducedMotion` inside play mode. Three answers to one question. Both
 * hand-written copies now re-export this one; play mode keeps framer's because
 * it is already paying for framer.
 *
 * Live, not read once: someone who turns the setting on mid-session should see
 * the app go still, and on a Mac that setting is two keystrokes away.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);

    // Safari below 14 only has the deprecated listener API.
    if (query.addEventListener) {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);

  return reduced;
}

/**
 * The same answer outside React, for the one-shot helpers that run in an event
 * handler or a layout effect and have no business subscribing to anything.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}
