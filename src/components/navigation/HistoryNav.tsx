import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Universal back / forward.
 *
 * Every page carries these so navigation is the same everywhere, rather than
 * depending on browser chrome that is absent in standalone/PWA mode and on
 * mobile.
 *
 * The History API deliberately does not expose whether a back or forward entry
 * exists, so we track our own depth: each in-app navigation pushes an entry, and
 * going back leaves a forward entry available until a new navigation truncates
 * it. `history.length` cannot be used for this — it counts the whole tab's
 * history including pages from before the app loaded, and never decreases.
 */

/* Module-level so the counters survive route changes; the component remounts. */
let backDepth = 0;
let forwardDepth = 0;
let lastKey: string | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function HistoryNav({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [, force] = useState(0);

  useEffect(() => subscribe(() => force(n => n + 1)), []);

  useEffect(() => {
    const key = window.history.state?.key ?? null;
    /* A genuinely new entry (not a back/forward replay) invalidates any forward
       history, exactly as the browser does. */
    if (key !== lastKey) {
      if (lastKey !== null) {
        backDepth += 1;
        forwardDepth = 0;
      }
      lastKey = key;
      emit();
    }
  });

  useEffect(() => {
    const onPop = () => emit();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const canBack = backDepth > 0;
  const canForward = forwardDepth > 0;

  const go = (delta: -1 | 1) => {
    if (delta === -1 && !canBack) return;
    if (delta === 1 && !canForward) return;
    if (delta === -1) { backDepth -= 1; forwardDepth += 1; }
    else { forwardDepth -= 1; backDepth += 1; }
    lastKey = null; // the resulting entry is a replay, not a new push
    navigate(delta);
    emit();
  };

  const base =
    'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ' +
    'text-muted-foreground hover:bg-accent hover:text-foreground ' +
    'disabled:pointer-events-none disabled:opacity-30 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <button
        type="button"
        className={base}
        onClick={() => go(-1)}
        disabled={!canBack}
        aria-label="Go back"
        title="Back"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={base}
        onClick={() => go(1)}
        disabled={!canForward}
        aria-label="Go forward"
        title="Forward"
      >
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export default HistoryNav;
