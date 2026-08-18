import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Load animation for the dashboard.
 *
 * The dashboard is a page you arrive at, so its sections settle into place in
 * the order you read them. Deliberately one movement — a short rise and fade,
 * no scale, no bounce — so it reads as the page arriving rather than as an
 * effect.
 *
 * Reduced motion is honoured in JS rather than with `motion-reduce:animate-none`
 * because these elements animate with `fill-mode: both` and a delay: they are
 * invisible until their turn comes. Relying on one utility class to out-specify
 * another to make content appear is not a bet worth taking, so when the user has
 * asked for less motion the animation classes are simply never applied.
 */

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/** Stagger step. Small enough that the page reads as one movement, not a queue. */
export const REVEAL_STEP_MS = 60;

/** Kept to intrinsic elements so `aria-*` and `role` still typecheck when spread. */
type RevealTag = 'div' | 'li' | 'ul' | 'section' | 'nav' | 'article';

interface RevealProps extends React.HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** Position in the stagger sequence. Ignored when `delay` is given. */
  index?: number;
  delay?: number;
  as?: RevealTag;
}

export function Reveal({
  children,
  index = 0,
  delay,
  as: Tag = 'div',
  className,
  ...rest
}: RevealProps) {
  const reduced = usePrefersReducedMotion();
  const ms = delay ?? index * REVEAL_STEP_MS;

  if (reduced) {
    return (
      <Tag className={className} {...rest}>
        {children}
      </Tag>
    );
  }

  return (
    <Tag
      style={{ animationDelay: `${ms}ms` }}
      className={cn(
        'animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 ease-out',
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * Count a number up to its final value once it lands.
 *
 * Stat tiles go from "nothing" to "a number" the moment the query resolves; the
 * count-up is what makes that read as a value arriving rather than a flicker.
 * Under reduced motion it returns the target immediately.
 */
export function useCountUp(target: number, durationMs = 900): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);

  useEffect(() => {
    if (reduced || !isFinite(target)) {
      setValue(target);
      return;
    }

    // Small numbers are more legible landing than rolling.
    if (target === 0) {
      setValue(0);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const from = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic — fast off the mark, settles rather than stops.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, reduced]);

  return value;
}
