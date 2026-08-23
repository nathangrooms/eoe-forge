import type { ReactNode } from 'react';
import { ManaPip } from '@/components/ui/mana-cost';
import { cn } from '@/lib/utils';
import { bandRange, PLAYABILITY_BANDS } from '@/lib/deck/playabilityView';
import type { PlayabilityBandId } from '@/lib/deck/playabilityView';
import type { DeckCategory } from '@/lib/deck/cardCategories';
import {
  type ColourFacet,
  type DeckCardFacets,
  type DeckCardFilterState,
  type FacetOption,
  type ManaValueFacet,
  type PriceFacet,
} from '@/lib/deck/deckCardFilters';

/**
 * The deck's own facets, always open, with live counts.
 *
 * ## Why this one is not a slide-over, when four others are
 *
 * The audit found filter placement was being decided per page: a slide-over on
 * card search, the collection, the wishlist and the deck builder, a popover on
 * My Decks, an inline panel on the marketplace, always-open rows here. Four of
 * those were the same job and are now the same control. This is the genuine
 * exception, and it stays.
 *
 * The difference is what the facets are made of. Every chip here is computed
 * from the deck in your hand and carries its real count: `Creature 30`,
 * `2 mana 18`, `Reliable 41`. That is a map of the deck rather than a query
 * builder, and hiding a map behind a button defeats the map. A card-search
 * facet list is fixed, knows nothing about your results, and has no count to
 * show, which is why it can live behind a trigger.
 *
 * ## What moved out of this file
 *
 * The search box, the count line, the clear control, the view toggle and the
 * `Card` the whole thing sat in. All five were this page's own copies of things
 * that exist once now: the search had no debounce and drew the shadcn `Input`
 * with its hairline border, and the count line was one of six phrasings of
 * "how many results". `DeckCardsPanel` composes them from `FilterBar`.
 *
 * What is left is the facet rows, which is the part no other page has.
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

function FacetRow({ label, children }: { label: string; children: ReactNode }) {
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
  className?: string;
}

export function DeckCardFilters({
  facets,
  state,
  onChange,
  className,
}: DeckCardFiltersProps) {

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
    <div className={cn('w-full space-y-3', className)}>
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
                    /* No em-dash in copy, and a tooltip is copy. */
                    title={band ? `${band.label}. ${band.blurb}` : undefined}
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
