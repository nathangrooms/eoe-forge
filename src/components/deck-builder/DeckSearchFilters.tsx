import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FIELD, FacetChip, FilterButton, SURFACE } from '@/components/listing';
import { cn } from '@/lib/utils';
import { ManaPip } from '@/components/ui/mana-cost';
import { DECK_FORMATS } from '@/lib/deck/formats';
import {
  COLOR_MATCH_LABELS,
  type ColorMatchMode,
  type DeckFilters,
} from '@/hooks/useDeckFilters';

/**
 * The deck filters: format, colour identity and power range.
 *
 * ## Why this is a slide-over now and was a popover
 *
 * The audit counted four presentations of the same job — a right-hand slide-over
 * on `/cards`, `/collection`, `/wishlist` and the deck builder, a popover here,
 * an inline panel on the marketplace, always-open rows on the deck page — and
 * found the choice was being made per page rather than per case. Four of those
 * are one case: questions you ask of a list you are looking at, which the list
 * should stay visible for. Design law 3 names the pattern, and it is the
 * slide-over. So this is now the same control in the same place as the rest.
 *
 * The deck page keeps its always-open rows, and that is a real difference
 * rather than drift: those facets carry live counts off the deck in your hand,
 * and hiding a map behind a button defeats the map.
 *
 * Every facet survived the move. Format chips, the colour-match mode, six
 * colour pips including colourless, and the two power sliders with their note
 * about unscored decks. The search box left, because it was never a filter
 * panel's job: it is `ListingSearch` in the bar now, with the shared 250ms
 * debounce this page did not have, and its text goes into the URL so a narrowed
 * deck list is something you can send somebody.
 */

/** W/U/B/R/G plus colourless, drawn as real mana pips. */
const COLOR_OPTIONS = [
  { value: 'W', label: 'White' },
  { value: 'U', label: 'Blue' },
  { value: 'B', label: 'Black' },
  { value: 'R', label: 'Red' },
  { value: 'G', label: 'Green' },
  { value: 'C', label: 'Colourless' },
];

interface DeckSearchFiltersProps {
  filters: DeckFilters;
  onUpdateFilters: (filters: Partial<DeckFilters>) => void;
  onResetFilters: () => void;
  onToggleFormat: (format: string) => void;
  onToggleColor: (color: string) => void;
  hasActiveFilters: boolean;
  activeFilterCount: number;
}

export const DeckSearchFilters = ({
  filters,
  onUpdateFilters,
  onResetFilters,
  onToggleFormat,
  onToggleColor,
  hasActiveFilters,
  activeFilterCount,
}: DeckSearchFiltersProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <FilterButton count={activeFilterCount} />
      </SheetTrigger>
      {/* The same shell as `CardFilterSheet`, because it is the same drawer. */}
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-0 bg-card p-0 shadow-2xl shadow-black/50 sm:max-w-md"
      >
        {/* pr-12 clears the Sheet's own close control, which is absolutely placed. */}
        <div className="flex items-center justify-between py-3 pl-4 pr-12">
          <SheetTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Filters
          </SheetTitle>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6">
          <section className="space-y-2">
            <Label>Format</Label>
            <div className="flex flex-wrap gap-1.5">
              {DECK_FORMATS.map(format => (
                /* `FacetChip`, not `Badge variant="outline"`. The outline
                   variant is literally a border, and these chips were the last
                   hairlines on this page. */
                <FacetChip
                  key={format.value}
                  selected={filters.format.includes(format.value)}
                  onClick={() => onToggleFormat(format.value)}
                >
                  {format.label}
                </FacetChip>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <Label>Colour identity</Label>
            <Select
              value={filters.colorMode}
              onValueChange={value => onUpdateFilters({ colorMode: value as ColorMatchMode })}
            >
              <SelectTrigger className={cn(FIELD, 'h-9')} aria-label="Colour match mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={SURFACE}>
                {(Object.keys(COLOR_MATCH_LABELS) as ColorMatchMode[]).map(mode => (
                  <SelectItem key={mode} value={mode}>
                    {COLOR_MATCH_LABELS[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_OPTIONS.map(color => (
                <FacetChip
                  key={color.value}
                  selected={filters.colors.includes(color.value)}
                  onClick={() => onToggleColor(color.value)}
                  title={color.label}
                  className="gap-1.5"
                >
                  <ManaPip symbol={color.value} size="xs" />
                  {color.label}
                </FacetChip>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Power level</Label>
              <span className="text-sm tabular-nums text-muted-foreground">
                {filters.minPower} – {filters.maxPower}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Decks without a computed power score are always shown.
            </p>
            <div>
              <Label className="text-xs">Min: {filters.minPower}</Label>
              <Slider
                value={[filters.minPower]}
                onValueChange={([value]) =>
                  onUpdateFilters({ minPower: Math.min(value, filters.maxPower) })
                }
                min={1}
                max={10}
                step={1}
                className="mt-2"
              />
            </div>
            <div>
              <Label className="text-xs">Max: {filters.maxPower}</Label>
              <Slider
                value={[filters.maxPower]}
                onValueChange={([value]) =>
                  onUpdateFilters({ maxPower: Math.max(value, filters.minPower) })
                }
                min={1}
                max={10}
                step={1}
                className="mt-2"
              />
            </div>
          </section>

          <Button className="w-full" onClick={() => setOpen(false)}>
            Show decks
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DeckSearchFilters;
