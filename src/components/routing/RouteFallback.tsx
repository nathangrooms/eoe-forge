import { useEffect, useState } from 'react';

/**
 * What a page looks like while its code is still arriving.
 *
 * Routes are code-split, so moving between pages now waits on a network
 * request for the page's chunk. On a warm connection that request finishes in
 * well under a tenth of a second, and a spinner that appears and vanishes in
 * that window reads as a flicker rather than as loading — it makes a fast app
 * look broken.
 *
 * So nothing is drawn at all for the first `DELAY_MS`. Under that, the old
 * page simply stays on screen and the new one replaces it, which is what an
 * unsplit app looked like. Over it, the same spinner the app already uses
 * while auth resolves appears. One loading state for the whole app, not two.
 *
 * 200 ms is the standard threshold for "the user has started to wonder", and
 * it comfortably covers a chunk served from cache or from a nearby edge.
 */
const DELAY_MS = 200;

export function RouteFallback() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setVisible(true), DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div
      className="min-h-[60vh] flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading</span>
      {visible && (
        <div className="animate-spin h-8 w-8 ring-2 ring-primary ring-offset-0 border-t-transparent rounded-full" />
      )}
    </div>
  );
}

/**
 * The same idea for the very first paint, before the app knows who you are.
 * Full height, because there is no chrome around it yet.
 */
export function AppBootFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="animate-spin h-8 w-8 ring-2 ring-primary ring-offset-0 border-t-transparent rounded-full" />
    </div>
  );
}
