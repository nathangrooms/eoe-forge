import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/**
 * The failure mode that code splitting introduces, and nothing else catches.
 *
 * Before routes were split, every page's code was already in the one file the
 * browser downloaded at the start, so a page could never fail to *arrive* —
 * only to render. Now each page is fetched on demand, from a URL containing a
 * content hash, and there is a window where that fetch returns 404: a deploy
 * lands while someone has the app open, the new build writes new hashes, and
 * the tab they are sitting in still holds the old ones. Their next click asks
 * for a file that no longer exists.
 *
 * That is not really an error, it is a stale tab, and the fix is to reload so
 * the browser picks up the new index.html and the new hashes. So a chunk
 * failure reloads itself once, silently. The `sessionStorage` guard is what
 * stops that becoming a reload loop when the file is genuinely missing rather
 * than merely renamed: the second failure in a session shows the message
 * instead of reloading again.
 *
 * Anything else that throws inside a route gets the ordinary message, because
 * reloading will not fix a component that crashes on render.
 */

const RELOAD_GUARD = 'dm:chunk-reloaded';

/**
 * Browsers disagree on the wording, so match on all of them. Chrome says
 * "Failed to fetch dynamically imported module", Firefox "error loading
 * dynamically imported module", Safari "Importing a module script failed".
 */
function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  return (
    /dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /ChunkLoadError/i.test(message) ||
    /Loading chunk \S+ failed/i.test(message)
  );
}

interface Props {
  children: ReactNode;
  /** Changes when the route changes, so a new page clears a previous failure. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class RouteBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error)) {
      let alreadyTried = false;
      try {
        alreadyTried = window.sessionStorage.getItem(RELOAD_GUARD) === '1';
        if (!alreadyTried) window.sessionStorage.setItem(RELOAD_GUARD, '1');
      } catch {
        /* private browsing can refuse storage; fall through to the message */
      }
      if (!alreadyTried) {
        window.location.reload();
        return;
      }
    }
    console.error('Route failed to render:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private retry = () => {
    this.setState({ error: null });
  };

  private goHome = () => {
    try {
      window.sessionStorage.removeItem(RELOAD_GUARD);
    } catch {
      /* nothing to clear */
    }
    window.location.href = '/';
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg bg-card p-6 text-center shadow-lg">
          <h1 className="text-lg font-semibold text-foreground">This page did not load</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Something went wrong on the way here. Try again, and if it keeps happening go back to
            the start.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={this.retry}>Try again</Button>
            <Button variant="ghost" onClick={this.goHome}>
              Go to the home page
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * A successful render means the tab is not stale, so drop the guard. Without
 * this, one recovered chunk failure would leave the flag set for the rest of
 * the session and the *next* deploy would show the message instead of quietly
 * reloading.
 */
export function clearChunkReloadGuard() {
  try {
    window.sessionStorage.removeItem(RELOAD_GUARD);
  } catch {
    /* nothing to clear */
  }
}
