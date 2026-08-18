import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The single homepage section shell.
 *
 * Before this existed, every marketing section invented its own container:
 * `container mx-auto px-4` (1336px), `max-w-[1400px]`, a `max-w-[1500px]` that never
 * applied because it sat inside Tailwind's 1400px container, plus one-off
 * max-w-4xl / 3xl / 2xl columns. Content edges landed on seven different values
 * down a single scroll, and the 1336 / 1376 pair read as sloppiness.
 *
 * There is now exactly ONE content width below the hero. The hero is the only
 * exception, being full-bleed by design.
 *
 * Separation between sections comes from vertical rhythm plus an optional surface
 * tint — never a hairline (design law 2: no borders).
 */

/* Padding lives on the OUTER element and the max-width on the INNER one, so
   `max-w-[1600px]` is a true content width and resolves identically whether a
   section is bled or not. Putting both on one element would silently make bled
   content 80px narrower than contained content. */
const CONTENT = 'mx-auto w-full max-w-[1600px]';
const GUTTER = 'px-4 sm:px-8 lg:px-10';

export type SectionSize = 'default' | 'compact' | 'flush';

const RHYTHM: Record<SectionSize, string> = {
  default: 'py-24 lg:py-28',
  compact: 'py-16 lg:py-20',
  flush: '',
};

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  /** Surface step so neighbouring sections separate without a border. */
  tint?: boolean;
  /** Vertical rhythm. `flush` opts out entirely. */
  size?: SectionSize;
  /**
   * Children handle their own width — for sections that need something
   * edge-to-edge (a marquee, a wall of art). Wrap the contained parts in
   * <SectionInner> so they still land on the shared width.
   */
  bleed?: boolean;
  /** Applied to the inner content box, not the <section>. */
  containerClassName?: string;
}

export function Section({
  tint = false,
  size = 'default',
  bleed = false,
  className,
  containerClassName,
  children,
  ...rest
}: SectionProps) {
  return (
    <section
      className={cn(RHYTHM[size], tint && 'bg-card/40', !bleed && GUTTER, className)}
      {...rest}
    >
      {bleed ? children : <div className={cn(CONTENT, containerClassName)}>{children}</div>}
    </section>
  );
}

/**
 * The shared width on its own, for contained blocks inside a <Section bleed>.
 * Edges land in exactly the same place as a normal <Section>.
 */
export function SectionInner({
  className,
  containerClassName,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { containerClassName?: string }) {
  return (
    <div className={cn(GUTTER, className)} {...rest}>
      <div className={cn(CONTENT, containerClassName)}>{children}</div>
    </div>
  );
}

export interface SectionHeadingProps {
  /** Small uppercase line above the headline. */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** Supporting line under the headline. */
  lead?: React.ReactNode;
  align?: 'center' | 'left';
  className?: string;
  /** Anything that belongs directly under the lead — a CTA, a stat line. */
  children?: React.ReactNode;
}

/**
 * Eyebrow + headline + supporting line, one size everywhere.
 *
 * The measure stays at max-w-3xl because that is a reading width, not a container
 * width — the section's edges are still the shared 1600px.
 */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = 'center',
  className,
  children,
}: SectionHeadingProps) {
  const centered = align === 'center';

  return (
    <div className={cn('max-w-3xl', centered && 'mx-auto text-center', className)}>
      {eyebrow && (
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {eyebrow}
        </p>
      )}

      <h2
        className={cn(
          'text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl',
          eyebrow && 'mt-4'
        )}
      >
        {title}
      </h2>

      {lead && (
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground text-pretty">{lead}</p>
      )}

      {children}
    </div>
  );
}

export default Section;
