import { forwardRef, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CardSizeSlider } from '@/components/cards';
import { cn } from '@/lib/utils';
import { FIELD, TOOLBAR } from './listing-view';
import { ViewModeToggle } from './ViewModeToggle';
import type { ListingView } from './useListingView';

/**
 * The controls above a listing, as one band.
 *
 * Filter placement was being decided per page rather than per case: a slide
 * over on four surfaces, a popover on My Decks, an inline panel on the
 * marketplace, loose chips on templates. Four of those are the same job. This
 * is the band they all sit in, and where the control itself lives is still the
 * page's call, because a filter that is a map of the deck in your hand is not a
 * filter that queries 34,000 cards.
 *
 * ## Why this matters more than tidiness
 *
 * The collection was spending three separate bands on controls: the page tab
 * strip, a row of ownership chips, and a third row holding Select, the size
 * slider and the view toggle. Measured, those three cost 108px, and the
 * difference in chrome above the first card between My Collection and My Decks
 * was 110px. The metric tiles were then folded up into the title line to win
 * some of it back, where only a 20px run of text fits, which is the complaint
 * the owner actually made. One band gives that space back without removing a
 * single control.
 *
 * ## Every region is a slot
 *
 * ```
 *   search            presets   filters   sort
 *   facets
 *   children                          trailing  size  view
 *   chips                                       clear
 * ```
 *
 * A region with nothing in it draws nothing, so a page with a search box and no
 * filters gets one row. The collection passes its condition and foil chips into
 * `facets`; card search passes its presets popover and syntax help into
 * `presets` and its five browse views into `facets`; a page that has neither
 * passes neither. There is no `cardSearch` mode and no `showOwnership` flag,
 * because a component with a per-page boolean is this same drift in a uniform.
 *
 * ## A correction to the note this file used to carry
 *
 * It said browse views go in `presets`. They do not fit there: `presets` sits
 * in the control row beside the filter trigger and the sort pair, and five
 * named views with words on them push that row to three lines at 1600px. They
 * go in `facets`, which is a full row of the page's own narrowing controls, and
 * is exactly what a set of starting views is. The brief for this work says it
 * plainly: if the feature does not fit the slot, the slot is wrong.
 */

export interface FilterBarProps {
  /** Slot: the search field. Normally `<ListingSearch>`. */
  search?: ReactNode;
  /**
   * Slot: compact query controls that sit with the filter trigger. Card search
   * puts its presets popover and its syntax reference here. A row of named
   * starting views belongs in `facets`, which has a row of its own.
   */
  presets?: ReactNode;
  /** Slot: the filter control itself, usually `<CardFilterSheet>`. */
  filters?: ReactNode;
  /** Slot: sort. Pass `<SortControl>` for the standard one. */
  sort?: ReactNode;
  /** Slot: facets this page has and no other does. Its own row. */
  facets?: ReactNode;
  /** Slot: the left of the last control row. Selection mode, bulk controls. */
  children?: ReactNode;
  /** Slot: the right of the last control row, before the size and view controls. */
  trailing?: ReactNode;
  /**
   * Draws the card-size slider and the view-mode toggle from one view object.
   * Omit on a surface where neither applies: a deck tile is not a card and has
   * no width to set.
   */
  view?: ListingView;
  /** Slot: removable chips for what is currently on. */
  chips?: ReactNode;
  /**
   * How many filters are on, this page's own facets included. Drives the clear
   * control. Use `totalActiveFilters` so nothing is counted twice.
   */
  activeCount?: number;
  /**
   * Clears everything the bar can see, the page's own facets included.
   *
   * This is the one control that clears. `ActiveFilterChips` draws its own by
   * default and only knows about the shared filter state, so a page with extra
   * facets passes `showClear={false}` to the chips and its full reset here.
   * Otherwise "Clear all" leaves the ownership chips on, which is a filtered
   * grid that claims to be unfiltered.
   */
  onClear?: () => void;
  className?: string;
}

export function FilterBar({
  search,
  presets,
  filters,
  sort,
  facets,
  children,
  trailing,
  view,
  chips,
  activeCount = 0,
  onClear,
  className,
}: FilterBarProps) {
  const hasControlRow = Boolean(search || presets || filters || sort);
  const showSize = Boolean(
    view && (view.activeMode.sized ?? view.activeMode.layout === 'grid')
  );

  const viewControls =
    view && (showSize || view.modes.length > 1) ? (
      <>
        {showSize && (
          <CardSizeSlider
            storageKey={view.sizeSurface}
            value={view.size}
            onValueChange={view.setSize}
            showValue={false}
            className="hidden sm:flex"
          />
        )}
        <ViewModeToggle modes={view.modes} value={view.mode} onChange={view.setMode} />
      </>
    ) : null;

  /*
   * A ROW FOR TWO BUTTONS IS NOT A ROW.
   *
   * On My Decks the view row held nothing but the grid/list toggle: measured at
   * 1600px it was a 36px band whose left 1,200 pixels were empty, sitting under
   * a search field that had room to spare. A deck tile has no width to set, so
   * there is no size slider to keep it company either, and the same is true of
   * every listing that passes neither `children` nor `trailing`.
   *
   * When the view controls are the ONLY thing in that row they join the control
   * row instead. The row comes back the moment a page has selection controls or
   * something trailing, because then it is carrying its own weight.
   */
  const foldViewIntoControlRow = Boolean(viewControls) && !children && !trailing && hasControlRow;
  const hasViewRow = Boolean(children || trailing || viewControls) && !foldViewIntoControlRow;
  const hasChipRow = Boolean(chips) || (activeCount > 0 && Boolean(onClear));

  return (
    <div className={cn('space-y-3', TOOLBAR, className)}>
      {hasControlRow && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {search}
          {(presets || filters || sort || foldViewIntoControlRow) && (
            <div className="flex items-center gap-2">
              {presets}
              {filters}
              {sort}
              {foldViewIntoControlRow && viewControls}
            </div>
          )}
        </div>
      )}

      {facets && <div className="flex flex-wrap items-center gap-1.5">{facets}</div>}

      {hasViewRow && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">{children}</div>
          <div className="flex items-center gap-3">
            {trailing}
            {viewControls}
          </div>
        </div>
      )}

      {hasChipRow && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips}
          {activeCount > 0 && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The filter trigger, with the count on it.
 *
 * Pass it as the `trigger` of a `CardFilterSheet`, or use it on its own for a
 * page whose filter is not the shared one. `forwardRef` and the spread are what
 * let Radix's `asChild` attach to it.
 */
export const FilterButton = forwardRef<
  HTMLButtonElement,
  { count?: number; label?: string; className?: string } & React.ComponentProps<typeof Button>
>(function FilterButton({ count = 0, label = 'Filters', className, ...props }, ref) {
  return (
    <Button ref={ref} variant="secondary" size="sm" className={cn('h-9 gap-1.5', className)} {...props}>
      <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
      {label}
      {count > 0 && (
        <span className="ml-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.65rem] font-bold leading-none text-primary-foreground">
          {count}
        </span>
      )}
    </Button>
  );
});

export interface SortOption {
  value: string;
  label: string;
}

/**
 * Sort axis and direction.
 *
 * Four surfaces had already converged on this exact pair, a borderless select
 * beside an arrow button, and wrote it out four times. The options are the
 * page's: My Decks sorts by power and completion, the collection by condition
 * and value, and neither list means anything to the other.
 */
export function SortControl({
  options,
  value,
  onValueChange,
  dir,
  onToggleDir,
  label = 'Sort by',
  className,
}: {
  options: readonly SortOption[];
  value: string;
  onValueChange: (value: string) => void;
  dir: 'asc' | 'desc';
  onToggleDir: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={cn(FIELD, 'h-9 w-[150px]')} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-0 shadow-xl shadow-black/40">
          {options.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="secondary"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={onToggleDir}
        aria-label={dir === 'asc' ? 'Sort ascending' : 'Sort descending'}
        title={dir === 'asc' ? 'Ascending' : 'Descending'}
      >
        {dir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      </Button>
    </div>
  );
}

/**
 * A chip that turns one facet on or off.
 *
 * The collection's condition and foil controls, extracted so the next surface
 * with a question the shared filter cannot ask does not draw its own.
 */
export function FacetChip({
  selected,
  onClick,
  title,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
        className
      )}
    >
      {children}
    </button>
  );
}

/**
 * A chip saying a filter is on, which removes it when clicked.
 *
 * `ActiveFilterChips` draws these for the shared filter state. This is the same
 * chip for a page's own facets, so the two halves of a chip row cannot drift
 * apart the way the collection's hand-rolled copy had begun to.
 */
export function RemovableChip({
  onRemove,
  children,
}: {
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      title="Remove filter"
      className="group inline-flex max-w-[16rem] items-center gap-1.5 rounded-full bg-muted/60 py-1 pl-2.5 pr-1.5 text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="truncate">{children}</span>
      <X className="h-3 w-3 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
    </button>
  );
}

export default FilterBar;
