import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ManaPip } from '@/components/ui/mana-cost';
import { cn } from '@/lib/utils';
import { bandRange, PLAYABILITY_BANDS } from '@/lib/deck/playabilityView';
import type { PlayabilityBandId } from '@/lib/deck/playabilityView';
import type { DeckCategory } from '@/lib/deck/cardCategories';
import {
  isFilterActive,
  type ColourFacet,
  type DeckCardFacets,
  type DeckCardFilterState,
  type FacetOption,
  type ManaValueFacet,
  type PriceFacet,
} from '@/lib/deck/deckCardFilters';

/**
 * The card-list filter bar.
 *
 * Deliberately not a popover. The brief is "filters must be visible and
 * immediate, not buried in a menu": every facet the deck actually has is on
 * screen with its real count, one click toggles it, and the result count
 * updates as you go. Nothing here opens an overlay, so the list never
 * disappears behind the control that is filtering it.
 *
 * Laid out for a desktop at full width — a label column and a flowing chip row
 * per facet, which stays readable at 1440px instead of collapsing into the
 * two-column card of tiny selects this replaces.
 */

interface ChipProps {
  active: boolean;
  onClick: () => void;
  count: number;
  children: ReactNode;
  className?: string;
  title?: string;
}

function Chip({ active, onClick, count, children, className, title }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        // Depth by surface tint, never an outline — design law 2.
        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-foreground text-background shadow-sm'
          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
        className
      )}
    >
      {children}
      <span
        className={cn(
          'tabular-nums text-xs',
          active ? 'text-background/70' : 'text-muted-foreground/70'
        )}
      >
        {count}
      </span>
    </button>
  );
}

function FacetRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <span className="w-full shrink-0 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground sm:w-28">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export interface DeckCardFiltersProps {
  facets: DeckCardFacets;
  state: DeckCardFilterState;
  onChange: (next: DeckCardFilterState) => void;
  /** Copies currently shown, and copies in the deck — both real counts. */
  shown: number;
  total: number;
  /** Right-hand slot, used for the grid/table view toggle. */
  action?: ReactNode;
  className?: string;
}

export function DeckCardFilters({
  facets,
  state,
  onChange,
  shown,
  total,
  action,
  className,
}: DeckCardFiltersProps) {
  const active = isFilterActive(state);

  /** Toggle one value inside one array facet. */
  function toggle<K extends keyof DeckCardFilterState>(
    key: K,
    value: DeckCardFilterState[K] extends Array<infer V> ? V : never
  ) {
    const list = state[key] as unknown as unknown[];
    const has = list.includes(value);
    onChange({
      ...state,
      [key]: has ? list.filter(v => v !== value) : [...list, value],
    } as DeckCardFilterState);
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="space-y-4 p-4 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={state.search}
              onChange={e => onChange({ ...state, search: e.target.value })}
              placeholder="Search this deck by name, type or rules text…"
              aria-label="Search cards in this deck"
              className="h-11 pl-10 text-base"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
              <span className="font-semibold text-foreground">{shown}</span> of {total} cards
            </span>
            {active && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange({
                    search: '',
                    categories: [],
                    colours: [],
                    manaValues: [],
                    rarities: [],
                    prices: [],
                    playability: [],
                  })
                }
              >
                <X className="mr-1.5 h-4 w-4" />
                Clear
              </Button>
            )}
            {action}
          </div>
        </div>

        <div className="space-y-3">
          {facets.categories.length > 1 && (
            <FacetRow label="Type">
              {facets.categories.map((option: FacetOption<DeckCategory>) => (
                <Chip
                  key={option.value}
                  active={state.categories.includes(option.value)}
                  onClick={() => toggle('categories', option.value)}
                  count={option.count}
                >
                  {option.label}
                </Chip>
              ))}
            </FacetRow>
          )}

          {facets.colours.length > 1 && (
            <FacetRow label="Colour">
              {facets.colours.map((option: FacetOption<ColourFacet>) => (
                <Chip
                  key={option.value}
                  active={state.colours.includes(option.value)}
                  onClick={() => toggle('colours', option.value)}
                  count={option.count}
                  title={option.label}
                >
                  <ManaPip symbol={option.value} size="sm" />
                  {option.label}
                </Chip>
              ))}
            </FacetRow>
          )}

          {facets.manaValues.length > 1 && (
            <FacetRow label="Mana value">
              {facets.manaValues.map((option: FacetOption<ManaValueFacet>) => (
                <Chip
                  key={option.value}
                  active={state.manaValues.includes(option.value)}
                  onClick={() => toggle('manaValues', option.value)}
                  count={option.count}
                  className="tabular-nums"
                >
                  {option.label}
                </Chip>
              ))}
            </FacetRow>
          )}

          {facets.playability.length > 1 && (
            <FacetRow label="Playability">
              {facets.playability.map((option: FacetOption<PlayabilityBandId>) => {
                const band = PLAYABILITY_BANDS.find(b => b.id === option.value);
                return (
                  <Chip
                    key={option.value}
                    active={state.playability.includes(option.value)}
                    onClick={() => toggle('playability', option.value)}
                    count={option.count}
                    title={band ? `${band.label} — ${band.blurb}` : undefined}
                  >
                    <span
                      className={cn(
                        'h-2 w-6 shrink-0 rounded-full',
                        // Inside an active chip the ground flips, so the swatch
                        // needs the inverted ink to stay visible.
                        state.playability.includes(option.value)
                          ? 'bg-background/70'
                          : band?.fillClass
                      )}
                      aria-hidden
                    />
                    {band?.label ?? option.label}
                  </Chip>
                );
              })}
            </FacetRow>
          )}

          {facets.rarities.length > 1 && (
            <FacetRow label="Rarity">
              {facets.rarities.map((option: FacetOption<string>) => (
                <Chip
                  key={option.value}
                  active={state.rarities.includes(option.value)}
                  onClick={() => toggle('rarities', option.value)}
                  count={option.count}
                  className="capitalize"
                >
                  {option.label}
                </Chip>
              ))}
            </FacetRow>
          )}

          {facets.prices.length > 1 && (
            <FacetRow label="Price">
              {facets.prices.map((option: FacetOption<PriceFacet>) => (
                <Chip
                  key={option.value}
                  active={state.prices.includes(option.value)}
                  onClick={() => toggle('prices', option.value)}
                  count={option.count}
                >
                  {option.label}
                </Chip>
              ))}
            </FacetRow>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Legend for the playability meter, so the bands are not folklore.
 *
 * Ranges, not `${band.min}%+`. The open-ended form is only true of the top
 * band: it printed "Hard 25%+", which claims Hard covers everything above 25%
 * when Hard is 25–50 and a 90% card is Reliable. Four of the five rows were
 * telling the player the wrong thing about their own colour coding.
 */
export function PlayabilityLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-2', className)}>
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Playability
      </span>
      {PLAYABILITY_BANDS.map(band => (
        <span key={band.id} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn('h-1.5 w-8 rounded-full', band.fillClass)} aria-hidden />
          <span className="font-medium text-foreground">{band.label}</span>
          <span className="tabular-nums">{bandRange(band)}</span>
        </span>
      ))}
    </div>
  );
}

export default DeckCardFilters;
