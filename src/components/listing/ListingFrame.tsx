import { Fragment, useCallback, useRef, type ReactNode, type Ref } from 'react';
import { CardGrid, CardGridSkeleton } from '@/components/cards';
import { Pager } from '@/components/ui/pagination';
import { cn } from '@/lib/utils';
import { EmptyState, type EmptyStateProps } from './EmptyState';
import type { ResultPart } from './listing-view';
import type { ListingView } from './useListingView';

/**
 * The count line, with the caveats still attached.
 *
 * `resultSentence` returns a string. A string cannot carry a `title`, so every
 * caveat handed to it was being dropped without a word, and `ResultPart.title`
 * was documented as "hover text, for a figure that needs a caveat" while
 * nothing in the product read it. Two real figures were affected: the
 * collection's "copies with no price", which carried this exact caption on a
 * `<span title>` before the conversion, and the scanner's confidence average.
 * The first one matters most, because a valuation that is quietly short and
 * looks exact is the one thing a collection total must never be.
 *
 * Use this wherever a part has a `title`; `resultSentence` is still the right
 * call for a line of plain figures.
 */
export function ResultSummary({
  parts,
  className,
}: {
  parts: (ResultPart | null | undefined | false)[];
  className?: string;
}) {
  const shown = parts.filter((part): part is ResultPart => Boolean(part));
  return (
    <span className={className}>
      {shown.map((part, i) => (
        <Fragment key={part.label ? `${part.value} ${part.label}` : `${part.value}-${i}`}>
          {i > 0 && ' · '}
          <span title={part.title}>{part.label ? `${part.value} ${part.label}` : part.value}</span>
        </Fragment>
      ))}
    </span>
  );
}

/**
 * The results, and everything that surrounds them.
 *
 * A page hands over the tiles or rows for the mode that is showing. This draws
 * the count line, the pager above and below, the grid at the size slider's
 * width, the empty state and the loading state, and it turns the page back to
 * the top when somebody pages forward.
 *
 * Every one of those already existed on at least one surface and was missing
 * from several others. Paging in particular had four idioms: numbered pages on
 * seven surfaces, infinite scroll on precons, a "Load more" button on the
 * marketplace, and nothing at all on My Decks, templates and deck detail. The
 * two that are not `Pager` both lose the back button, which is a standing rule
 * in this project rather than a preference.
 *
 * ## What it does not decide
 *
 * Which modes exist, what a row looks like, and whether there is a pager at all
 * are the page's. My Decks genuinely has no pager, because the largest real
 * library is nine decks and a pager over nine rows is chrome with nothing to
 * do; it passes no `pager` and gets none.
 */

export interface ListingPager {
  page: number;
  /** Real page count, or `null` when the source cannot report one. Not guessed. */
  pageCount: number | null;
  onPageChange: (page: number) => void;
  /** Only consulted when `pageCount` is null. */
  hasNext?: boolean;
  total?: number | null;
  /** Rows drawn right now, for "showing 25 to 48". */
  shown: number;
  noun?: string;
  nounPlural?: string;
  label?: string;
  /**
   * Rows per page, when the page's data source owns it rather than the view.
   *
   * Card search is the one surface where it does. Its rows come from Scryfall a
   * page at a time, so changing the page size has to move the page number as
   * well: going from 24 a page to 96 while on page 5 should keep showing the
   * row being read, not jump to the 385th card. `useAdvancedCardSearch` does
   * that arithmetic and there is nowhere else it can live, because only the
   * fetch knows which row is first on screen.
   *
   * Supply both or neither. Every other surface leaves them out and the view
   * holds the preference, which is the normal case and the simpler one.
   */
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  /** Drawn as busy while the next page is in flight. */
  busy?: boolean;
}

/**
 * What to say when there is nothing to show.
 *
 * The panel itself is `EmptyState`, which is exported on its own because a page
 * has empty states that are not listings and those looking different from the
 * listing beside them is the drift this folder exists to stop.
 */
export type ListingEmpty = EmptyStateProps;

export interface ListingFrameProps {
  view: ListingView;
  /** Rows on screen. Zero draws the empty state. */
  count: number;
  loading?: boolean;
  /** Slot: the count line. `resultSentence` builds the standard one. */
  summary?: ReactNode;
  /** Slot: between the controls and the results. Bulk action bars live here. */
  beforeResults?: ReactNode;
  pager?: ListingPager | null;
  empty?: ListingEmpty;
  /** Slot: a loading body of the page's own. Defaults to a grid of placeholders. */
  skeleton?: ReactNode;
  /**
   * The grid element itself, for a surface that animates its rows.
   *
   * `useFlipOnChange` has to measure the box the cards actually live in. The
   * shopping list is the one screen a player empties a card at a time, so it is
   * the one where a row vanishing between frames is most obviously wrong, and
   * before this the page had to draw its own `CardGrid` to have something to
   * hand the animation. `CardGrid` forwards its ref for exactly this reason;
   * this passes it on rather than making a page choose between the shared frame
   * and its animation.
   */
  gridRef?: Ref<HTMLDivElement>;
  /** The body for whichever mode is showing. */
  children: ReactNode;
  className?: string;
}

export function ListingFrame({
  view,
  count,
  loading = false,
  summary,
  beforeResults,
  pager,
  empty,
  skeleton,
  gridRef,
  children,
  className,
}: ListingFrameProps) {
  /*
   * Turning the page starts you at the top of it.
   *
   * Without this, clicking "3" on the pager below the grid leaves the reader
   * looking at the bottom of page three, which reads as nothing having
   * happened. The anchor is a zero-height element above the results rather
   * than the results themselves, so the scroll target does not move when the
   * new page turns out to be shorter.
   */
  const top = useRef<HTMLDivElement>(null);
  const goToPage = useCallback(
    (next: number) => {
      pager?.onPageChange(next);
      const anchor = top.current;
      if (!anchor) return;
      const y = anchor.getBoundingClientRect().top + window.scrollY - 16;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    },
    [pager]
  );

  /*
   * One page and no way to reach another is not a pager, it is two bars of
   * chrome around a short list. `Pager` already suppresses itself on a single
   * page, but only while nothing can change the page size — and this frame
   * always wires the page-size picker up, so the rule has to be stated here as
   * well or every small collection grows a pager it cannot use.
   */
  const showPager = pager && (pager.pageCount === null || pager.pageCount > 1);

  const pagerNode =
    pager && showPager && !loading ? (
      <Pager
        page={pager.page}
        pageCount={pager.pageCount}
        hasNext={pager.hasNext}
        onPageChange={goToPage}
        total={pager.total ?? null}
        shown={pager.shown}
        pageSize={pager.pageSize ?? view.pageSize}
        onPageSizeChange={pager.onPageSizeChange ?? view.setPageSize}
        busy={pager.busy}
        noun={pager.noun ?? 'card'}
        nounPlural={pager.nounPlural}
        label={pager.label ?? 'Pages'}
      />
    ) : null;

  const isGrid = view.activeMode.layout === 'grid';

  return (
    <div className={cn('space-y-4', className)}>
      {beforeResults}

      {/*
        The count line holds its box, and says a number only when there is
        something to count.

        It used to be `summary && !loading`, which draws nothing while the rows
        are in flight and a line of text the moment they land, so every listing
        pushed its own results down by one line plus the gap the instant the
        data arrived. Measured on the built bundle at 1600 and 1280: My Decks
        went from 0.0000 and 0.0068 Cumulative Layout Shift before this work to
        0.0108 and 0.0191 after it, and the wishlist from 0.0001 to 0.0557 at
        1280. The moving element was the results grid and the cause was this
        line appearing above it.

        Same treatment `MetricRow` already gives a figure that has not arrived:
        hold the box, draw a bar. The sentence itself is drawn as soon as the
        count is known, zero included, because "0 of 240 entries" is the line a
        reader who has just filtered everything out most needs. `min-h-5` keeps
        the box when a page's sentence comes out empty.
      */}
      {(summary !== undefined || loading) && (
        <p className="min-h-5 text-sm text-muted-foreground">
          {loading ? (
            <span
              className="inline-block h-4 w-40 animate-pulse rounded bg-muted align-middle motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            summary
          )}
        </p>
      )}

      <div ref={top} className="h-px" aria-hidden="true" />

      {pagerNode}

      {loading ? (
        skeleton ?? <CardGridSkeleton width={view.size} count={12} />
      ) : count === 0 ? (
        <EmptyState {...(empty ?? { title: 'Nothing to show' })} />
      ) : isGrid ? (
        <CardGrid ref={gridRef} width={view.size}>
          {children}
        </CardGrid>
      ) : (
        children
      )}

      {pagerNode}
    </div>
  );
}

export default ListingFrame;
