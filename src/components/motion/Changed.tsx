import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { MOTION_DURATION, MOTION_EASE_CSS, usePrefersReducedMotion } from '@/lib/motion';

/**
 * A number that changed, saying so.
 *
 * A collection total that silently becomes a different collection total is the
 * cheapest moment in any interface: the app did something, and the only
 * evidence is that the reader happened to remember the old figure. This makes
 * the new value land — rising into place if it went up, dropping if it went
 * down, with one short swell.
 *
 * ## What it will not do
 *
 * It does not count up. Rolling a total from 0 to 14,238 over most of a second
 * is a value the reader cannot use until it stops, and there is already one of
 * those on the dashboard. This is 380ms of the *same* number arriving, so the
 * figure is readable the entire time.
 *
 * ## Layout
 *
 * `transform` and `opacity` only, so a value changing cannot move anything
 * beside it. `inline-block` is required for a transform to apply to a run of
 * text — which means the content must be something that never wraps. A figure
 * with `tabular-nums` on it, which is what every call site here passes, cannot.
 *
 * ## Reduced motion
 *
 * Handled inside, from the hook, so no call site can forget it.
 */

export interface ChangedProps {
  /**
   * What is being watched. Compare the value, not the formatted string: a total
   * re-rendered as the same figure has not changed, and should not flicker.
   */
  value: number | string | null | undefined;
  children: ReactNode;
  className?: string;
}

/** How far the figure travels as it lands. Enough to read a direction from. */
const TRAVEL_PX = 5;

export function Changed({ value, children, className }: ChangedProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef<ChangedProps['value']>(value);
  const running = useRef<Animation | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const was = previous.current;
    if (was === value) return;
    previous.current = value;

    // The first real value is not a change; it is the figure arriving, which
    // whatever replaced the skeleton has already animated.
    if (was === null || was === undefined) return;
    if (reduced || !ref.current) return;

    /* Direction is only claimed when both figures are numbers. A currency
       string that went from "$4.10" to "$18.90" swells without a direction
       rather than guessing at one. */
    const from = typeof was === 'number' ? was : Number.NaN;
    const to = typeof value === 'number' ? value : Number.NaN;
    const rose = Number.isFinite(from) && Number.isFinite(to) ? to > from : null;
    const offset = rose === null ? 0 : rose ? TRAVEL_PX : -TRAVEL_PX;

    running.current?.cancel();
    running.current = ref.current.animate(
      [
        { opacity: 0.45, transform: `translate3d(0, ${offset}px, 0) scale(0.98)` },
        { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1.06)', offset: 0.45 },
        { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
      ],
      { duration: MOTION_DURATION.emphasis, easing: MOTION_EASE_CSS.out }
    );
  }, [value, reduced]);

  useEffect(
    () => () => {
      running.current?.cancel();
      running.current = null;
    },
    []
  );

  return (
    <span ref={ref} className={cn('inline-block', className)}>
      {children}
    </span>
  );
}

export default Changed;
