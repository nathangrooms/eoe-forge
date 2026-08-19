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

/**
 * Vertical rhythm.
 *
 * This was `py-24 lg:py-28` — 112px of air above AND below every section. Over
 * the eighteen sections on the homepage that is ~4,000px of padding on its own,
 * roughly four full screens of nothing, and it is the single largest reason the
 * page reads as exhausting. Owner: "lots of sections super tall".
 *
 * 80px still separates two sections cleanly at this type size. The step down
 * reads as "less tired", not as "cramped".
 */
/*
 * A phone gets a tighter rhythm than a desktop, and nothing above `sm` moves.
 *
 * 56px of air above and below is a comfortable step on a 1600px canvas. On a
 * 390px one it is a seventh of the screen, spent twice per section, twenty-one
 * times down the page: measured, the mobile page carried ~2,350px of section
 * padding on its own. 36px still separates two sections cleanly at this type
 * size, because everything either side of the gap is narrower too.
 */
const RHYTHM: Record<SectionSize, string> = {
  default: 'py-7 sm:py-14 lg:py-20',
  compact: 'py-6 sm:py-10 lg:py-12',
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
          eyebrow && 'mt-3 sm:mt-4'
        )}
      >
        {title}
      </h2>

      {/* 16px on a phone, 18px from `sm` up. A supporting line set at 18px runs
          to eight or nine lines at 390px, and eighteen of those down the page is
          most of a screen spent on the gap between "lead" and "body". */}
      {lead && (
        <p className="mt-4 text-base leading-relaxed text-muted-foreground text-pretty sm:mt-5 sm:text-lg sm:leading-relaxed">
          {lead}
        </p>
      )}

      {children}
    </div>
  );
}

/**
 * Detail that is worth reading on a phone, but not worth scrolling past.
 *
 * A homepage section on a 1600px canvas can lay ten rows out in three columns
 * and cost one screen. The same ten rows on a 390px phone are ten rows, one
 * under the other, and cost four. The argument the reader came for is usually
 * the first two or three; the rest is the table you open when you want to check
 * the working.
 *
 * So this hides its children below `sm` until the reader asks for them, and does
 * NOTHING at `sm` and above: `max-sm:hidden` stops applying, the button carries
 * `sm:hidden`, and the desktop page is byte-for-byte the layout it was. There is
 * no animation and no measured height, so nothing can get stuck half open.
 */
export function MobileReveal({
  label,
  children,
  className,
  buttonClassName,
}: {
  /** What the control says while the detail is hidden. */
  label: string;
  children: React.ReactNode;
  /** Applied to the wrapper around the hidden content. */
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <div className={cn(!open && 'max-sm:hidden', className)}>{children}</div>

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            /* Full width and 48px tall, so it is a thumb target rather than a
               link. */
            'mt-8 flex w-full items-center justify-center rounded-full bg-muted/50 px-5 py-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            buttonClassName
          )}
        >
          {label}
        </button>
      )}
    </>
  );
}

export default Section;
