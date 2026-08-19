import * as React from "react"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MoreHorizontal,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { ButtonProps, buttonVariants } from "@/components/ui/button"
import {
  DEFAULT_PAGE_SIZE,
  FIRST_PAGE,
  PAGE_SIZE_OPTIONS,
  clampPage,
  pageWindow,
  rangeLabel,
} from "@/lib/pagination"

const Pagination = ({ className, ...props }: React.ComponentProps<"nav">) => (
  <nav
    role="navigation"
    aria-label="pagination"
    className={cn("mx-auto flex w-full justify-center", className)}
    {...props}
  />
)
Pagination.displayName = "Pagination"

const PaginationContent = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn("flex flex-row items-center gap-1", className)}
    {...props}
  />
))
PaginationContent.displayName = "PaginationContent"

const PaginationItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
))
PaginationItem.displayName = "PaginationItem"

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<ButtonProps, "size"> &
  React.ComponentProps<"a">

const PaginationLink = ({
  className,
  isActive,
  size = "icon",
  ...props
}: PaginationLinkProps) => (
  <a
    aria-current={isActive ? "page" : undefined}
    className={cn(
      buttonVariants({
        variant: isActive ? "outline" : "ghost",
        size,
      }),
      className
    )}
    {...props}
  />
)
PaginationLink.displayName = "PaginationLink"

const PaginationPrevious = ({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) => (
  <PaginationLink
    aria-label="Go to previous page"
    size="default"
    className={cn("gap-1 pl-2.5", className)}
    {...props}
  >
    <ChevronLeft className="h-4 w-4" />
    <span>Previous</span>
  </PaginationLink>
)
PaginationPrevious.displayName = "PaginationPrevious"

const PaginationNext = ({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) => (
  <PaginationLink
    aria-label="Go to next page"
    size="default"
    className={cn("gap-1 pr-2.5", className)}
    {...props}
  >
    <span>Next</span>
    <ChevronRight className="h-4 w-4" />
  </PaginationLink>
)
PaginationNext.displayName = "PaginationNext"

const PaginationEllipsis = ({
  className,
  ...props
}: React.ComponentProps<"span">) => (
  <span
    aria-hidden
    className={cn("flex h-9 w-9 items-center justify-center", className)}
    {...props}
  >
    <MoreHorizontal className="h-4 w-4" />
    <span className="sr-only">More pages</span>
  </span>
)
PaginationEllipsis.displayName = "PaginationEllipsis"

/* ================================================================== *
 * Pager — the composed control every browse surface uses
 * ================================================================== */

/**
 * The one pagination control in this product.
 *
 * The shadcn primitives above are the parts; this is the assembled thing, and
 * surfaces should reach for this rather than rebuilding the row of buttons.
 * Collection, wishlist, card search and the commander pickers all render this,
 * which is why the control looks and behaves the same on all of them.
 *
 * ## It never invents a page count
 *
 * `pageCount` is `number | null`. Given a number it draws numbered pages with
 * first and last controls and says "of 1,276 cards". Given `null` it draws
 * "Page 3" between a previous and a next arrow, with no last control and no
 * total, because a last page you cannot name is a lie. See
 * `@/lib/pagination` for why that distinction is load-bearing here.
 *
 * ## Shape
 *
 *   Showing 25 to 48 of 30,636 cards        « ‹ 1 … 4 [5] 6 … 176 › »     24 per page
 *
 * On a narrow screen the numbers collapse to "Page 5 of 176" and only the
 * arrows remain, so the control never wraps into three lines on a phone.
 */

export interface PagerProps {
  /** Current page, 1-based. */
  page: number;
  /**
   * How many pages there are, or `null` when nothing has told us. Do not
   * compute this from an estimate; `pageCountFor` returns `null` on purpose.
   */
  pageCount: number | null;
  /**
   * Whether another page exists. Only consulted when `pageCount` is `null`,
   * where it is the only thing that can light the next arrow.
   */
  hasNext?: boolean;
  onPageChange: (page: number) => void;

  /** Total matching rows, when the source really reported one. */
  total?: number | null;
  /** How many rows are on screen right now, used for "showing 25 to 48". */
  shown?: number;
  /** Rows per page. Shown in the picker and used for the range label. */
  pageSize?: number;
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (size: number) => void;

  /** What is being counted. "card" gives "1,204 cards". */
  noun?: string;
  nounPlural?: string;

  /** Dim the controls while a page is in flight, without moving anything. */
  busy?: boolean;
  className?: string;
  /** Announced to screen readers, e.g. "Collection pages". */
  label?: string;
}

const PAGER_BUTTON =
  'h-9 min-w-9 px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function PagerButton({
  active,
  disabled,
  onClick,
  label,
  title,
  children,
  className,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  label: string
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      title={title ?? label}
      className={cn(
        buttonVariants({ variant: active ? 'default' : 'ghost', size: 'sm' }),
        PAGER_BUTTON,
        // Depth from tint, never from a hairline: the current page is a filled
        // chip and the rest are bare until hovered.
        !active && 'bg-muted/40 text-muted-foreground hover:text-foreground',
        'disabled:opacity-40',
        className
      )}
    >
      {children}
    </button>
  )
}

export function Pager({
  page,
  pageCount,
  hasNext = false,
  onPageChange,
  total = null,
  shown = 0,
  pageSize = DEFAULT_PAGE_SIZE,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  onPageSizeChange,
  noun = 'card',
  nounPlural,
  busy = false,
  className,
  label = 'Pages',
}: PagerProps) {
  const current = clampPage(page, pageCount)
  const knownCount = pageCount != null
  const canPrev = current > FIRST_PAGE
  const canNext = knownCount ? current < pageCount : hasNext

  // One page of results and no way to get another is not a pager, it is noise.
  if (knownCount && pageCount <= 1 && !onPageSizeChange) return null

  const range = rangeLabel(current, pageSize, shown)
  const plural = nounPlural ?? `${noun}s`

  const go = (next: number) => {
    const target = clampPage(next, pageCount)
    if (target !== current) onPageChange(target)
  }

  return (
    <nav
      aria-label={label}
      className={cn(
        'flex flex-col gap-3 rounded-lg bg-card/60 px-3 py-2.5 shadow-lg shadow-black/10',
        'sm:flex-row sm:items-center sm:justify-between',
        busy && 'opacity-60',
        className
      )}
    >
      {/* What you are looking at. Only ever says what it was told. */}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {range ? (
          <>
            Showing{' '}
            <span className="font-medium text-foreground">
              {range.from.toLocaleString()} to {range.to.toLocaleString()}
            </span>
            {total != null && (
              <>
                {' of '}
                <span className="font-medium text-foreground">
                  {total.toLocaleString()}
                </span>{' '}
                {total === 1 ? noun : plural}
              </>
            )}
          </>
        ) : (
          <>No {plural} on this page</>
        )}
      </p>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          {knownCount && (
            <PagerButton
              label="Go to first page"
              disabled={!canPrev}
              onClick={() => go(FIRST_PAGE)}
              className="hidden sm:inline-flex"
            >
              <ChevronsLeft className="h-4 w-4" aria-hidden />
            </PagerButton>
          )}

          <PagerButton
            label="Go to previous page"
            disabled={!canPrev}
            onClick={() => go(current - 1)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            <span className="ml-1 hidden md:inline">Previous</span>
          </PagerButton>

          {knownCount ? (
            <>
              {/* Numbers, on anything wider than a phone. */}
              <span className="hidden items-center gap-1 sm:flex">
                {pageWindow(current, pageCount).map((token, i) =>
                  token === 'gap' ? (
                    <PaginationEllipsis key={`gap-${i}`} className="h-9 w-7" />
                  ) : (
                    <PagerButton
                      key={token}
                      active={token === current}
                      label={
                        token === current
                          ? `Page ${token}, current page`
                          : `Go to page ${token}`
                      }
                      onClick={() => go(token)}
                    >
                      {token.toLocaleString()}
                    </PagerButton>
                  )
                )}
              </span>
              {/* And a plain statement on a phone, where numbers do not fit. */}
              <span className="px-2 text-sm text-muted-foreground sm:hidden">
                Page {current.toLocaleString()} of {pageCount.toLocaleString()}
              </span>
            </>
          ) : (
            /* No total came back, so there is no page count to show and no last
               page to jump to. Saying "page 3" is the whole truth here. */
            <span className="px-2 text-sm font-medium text-foreground">
              Page {current.toLocaleString()}
            </span>
          )}

          <PagerButton
            label="Go to next page"
            disabled={!canNext}
            onClick={() => go(current + 1)}
          >
            <span className="mr-1 hidden md:inline">Next</span>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </PagerButton>

          {knownCount && (
            <PagerButton
              label="Go to last page"
              disabled={!canNext}
              onClick={() => go(pageCount)}
              className="hidden sm:inline-flex"
            >
              <ChevronsRight className="h-4 w-4" aria-hidden />
            </PagerButton>
          )}
        </div>

        {onPageSizeChange && (
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="hidden lg:inline">Cards per page</span>
            <select
              value={pageSize}
              onChange={e => onPageSizeChange(Number(e.target.value))}
              aria-label="Cards per page"
              className="h-9 rounded-md border-0 bg-muted/40 px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {pageSizeOptions.map(size => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </nav>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
