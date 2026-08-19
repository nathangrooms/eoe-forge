import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A horizontal row of cards you page through, rather than one you drag a
 * scrollbar under.
 *
 * The rails on the card page used `overflow-x-auto` with an explicitly styled
 * thin scrollbar. The owner's verdict: "remove the weird scroll bar - its ugly,
 * maybe we have left/right arrow pointers?". They are right, and a scrollbar is
 * also the wrong control here: these rails hold twenty or more cards, and a
 * 4px-tall drag target is a poor way to move through them.
 *
 * So the bar is gone and the row pages by a screenful at a time. Everything else
 * still works: trackpad and touch scrolling are untouched, because the element
 * is still a real scroll container, and the arrows only ever set scrollLeft.
 *
 * The arrows hide when there is nothing to scroll to, so a rail with four cards
 * shows no chrome at all.
 */
export function CardRail({
  children,
  className,
  label,
  scrollRef,
}: {
  children: ReactNode;
  className?: string;
  /** Announced to screen readers, e.g. "Cards that share Metalcraft". */
  label?: string;
  /**
   * The printings row scrolls its active card into view, so it needs the same
   * element this component pages. Handed out rather than duplicated, so there is
   * only ever one scroll container per rail.
   */
  scrollRef?: React.MutableRefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    /* 1px of slack: sub-pixel layout means scrollLeft rarely lands exactly on
       the maximum, which would otherwise leave the right arrow live forever. */
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    /* Content arrives asynchronously (cards load after the query resolves), so
       watching resize is what makes the arrows appear at the right moment. */
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [measure, children]);

  /* Hand the same element to the caller, so an external scrollIntoView and this
     component's paging act on one node rather than two. */
  useEffect(() => {
    if (scrollRef) scrollRef.current = ref.current;
  }, [scrollRef]);

  const page = (direction: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    /* Just under a full width, so the card at the edge stays visible and the
       reader keeps their place. */
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  const arrow =
    'absolute top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full ' +
    'h-10 w-10 bg-background/90 text-foreground shadow-lg shadow-black/50 backdrop-blur ' +
    'transition-opacity hover:bg-background focus-visible:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-ring md:flex';

  return (
    <div className={cn('group/rail relative', className)}>
      {!atStart && (
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => page(-1)}
          className={cn(arrow, 'left-0 -translate-x-1/3')}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      <div
        ref={ref}
        onScroll={measure}
        role={label ? 'group' : undefined}
        aria-label={label}
        className="scrollbar-none flex snap-x gap-3 overflow-x-auto pb-2"
      >
        {children}
      </div>

      {!atEnd && (
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => page(1)}
          className={cn(arrow, 'right-0 translate-x-1/3')}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

export default CardRail;
