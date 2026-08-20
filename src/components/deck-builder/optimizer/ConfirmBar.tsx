/**
 * "Apply these?" in the panel's own flow, and it brings itself to the reader.
 *
 * WHY THIS IS A COMPONENT AND NOT TWO COPIES OF FOUR LINES
 * -------------------------------------------------------
 * The optimiser confirms a multi-swap before it writes anything, and the
 * confirmation renders AFTER the list of swaps, because a dialog over the top
 * would hide the very cards you are being asked to check. With nine swaps
 * ticked that puts the question a screen and a half below the button that
 * asked it. The owner's report was "if I try apply 9 swaps nothing happens" —
 * it had been working the whole time and asking a question nobody could see.
 *
 * The fix was a scroll on mount. Lands now have their own multi-apply, so
 * there are two of these, and a second hand-rolled copy is exactly how one of
 * them ends up without the scroll again. So the scroll lives INSIDE the
 * component: anything that renders a confirmation gets it by construction
 * rather than by remembering.
 */

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface ConfirmBarProps {
  /** The question. Already counted and phrased by the caller. */
  question: string;
  confirmLabel: string;
  busyLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}

export function ConfirmBar({
  question,
  confirmLabel,
  busyLabel,
  onConfirm,
  onCancel,
  busy,
}: ConfirmBarProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  /*
   * A SMOOTH SCROLL IS AN ANIMATION, AND AN ANIMATION THAT NEVER RUNS IS NO
   * SCROLL AT ALL.
   *
   * `behavior: 'smooth'` is driven frame by frame, so it makes no progress
   * wherever frames are not being produced. Measured on 2026-08-20 in a view
   * that was not compositing: with fifteen swaps ticked, the confirmation
   * mounted 11,820 px below the fold on a 910 px viewport, and `window.scrollY`
   * was still 0 after 4.7 seconds. The same is true of a background tab, and
   * `prefers-reduced-motion: reduce` turns it into a jump in some engines and
   * nothing at all in others.
   *
   * This confirmation is the one thing on screen the reader has to see — the
   * owner's original report was "if I try apply 9 swaps nothing happens", which
   * was this question being asked below the fold. So it is animated only when
   * motion is welcome, and it is CHECKED: if the bar is still outside the
   * viewport shortly after, it is put in view without the animation. Arriving
   * abruptly is a much smaller cost than never arriving.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
    if (still) return;
    const check = window.setTimeout(() => {
      const box = el.getBoundingClientRect();
      const offscreen = box.bottom < 0 || box.top > window.innerHeight;
      if (offscreen) el.scrollIntoView({ behavior: 'auto', block: 'center' });
    }, 600);
    return () => window.clearTimeout(check);
  }, []);

  return (
    // No ring. Depth is surface tint and shadow: the project's design law is
    // that there are no hairlines anywhere, and `ring-1` draws one.
    <div ref={ref} className="mt-6 rounded-2xl bg-muted p-5 shadow-lg">
      <p className="text-base">{question}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button size="lg" onClick={onConfirm} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {busyLabel}
            </>
          ) : (
            confirmLabel
          )}
        </Button>
        <Button size="lg" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
