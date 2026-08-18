import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CardImage, CardGrid, CardGridSkeleton, CardSizeSlider, useCardSize } from '@/components/cards';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { Loader2, Search, SlidersHorizontal, TrendingUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { countActiveFilters, describeFilters, type CommanderFilters } from './commander-query';

/**
 * Choosing a commander, as a wall of commanders.
 *
 * The old step 1 put twelve cards in a bordered box under a heading and a
 * search field, then buried a second, differently-styled results grid inside
 * the finder card below it. A commander is the single most consequential choice
 * in the whole flow and it is a *picture* — so this stage is one full-bleed
 * grid of full card images at whatever size the player likes, and everything
 * else (search, filters, sort) is chrome above it or in the right-hand panel.
 */

export type CommanderSource = 'popular' | 'search' | 'finder';

export interface CommanderStageProps {
  cards: any[];
  loading: boolean;
  loadingMore?: boolean;
  /** Total matches Scryfall reported, when it reported one. */
  total?: number | null;
  hasMore?: boolean;
  onLoadMore?: () => void;
  source: CommanderSource;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters: CommanderFilters;
  onOpenFinder: () => void;
  onClearFinder: () => void;
  onSelect: (card: any) => void;
  error?: string | null;
  /** Set while the commander's archetypes are being read. */
  analyzing?: boolean;
  analyzingCard?: any;
}

const SOURCE_LABEL: Record<CommanderSource, string> = {
  popular: 'Most played commanders',
  search: 'Search results',
  finder: 'Commander finder',
};

export function CommanderStage({
  cards,
  loading,
  loadingMore = false,
  total = null,
  hasMore = false,
  onLoadMore,
  source,
  searchValue,
  onSearchChange,
  filters,
  onOpenFinder,
  onClearFinder,
  onSelect,
  error = null,
  analyzing = false,
  analyzingCard,
}: CommanderStageProps) {
  const [cardWidth, setCardWidth] = useCardSize('ai-builder-commanders', 190);
  const activeFilters = countActiveFilters(filters);
  const filterSummary = describeFilters(filters);

  /**
   * The analysing state is the chosen commander at full size and nothing else.
   * It used to be a spinner in a tinted box while the card you had just picked
   * vanished off screen.
   */
  if (analyzing) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 py-10">
        {analyzingCard && (
          <div className="animate-pulse motion-reduce:animate-none">
            <CardImage card={analyzingCard} size="xl" eager hideFlip />
          </div>
        )}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:hidden" />
            Reading {analyzingCard?.name ?? 'your commander'}
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            Matching the rules text against known archetypes to work out what this
            deck wants to do.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Control strip — search, finder, sizing. Full width, no box. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search commanders, partners and backgrounds…"
            className="h-11 border-0 bg-muted/50 pl-9 pr-9 text-base shadow-none focus-visible:ring-1"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Button
          variant={activeFilters > 0 ? 'default' : 'secondary'}
          onClick={onOpenFinder}
          className="h-11"
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Commander finder
          {activeFilters > 0 && (
            <span className="ml-2 rounded bg-background/25 px-1.5 py-0.5 text-xs tabular-nums">
              {activeFilters}
            </span>
          )}
        </Button>

        <CardSizeSlider
          storageKey="ai-builder-commanders"
          value={cardWidth}
          onValueChange={setCardWidth}
          showValue={false}
          className="hidden lg:flex"
        />
      </div>

      {/* What the grid is showing, and why. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {source === 'popular' && <TrendingUp className="h-4 w-4 text-muted-foreground" />}
          {SOURCE_LABEL[source]}
        </h2>
        {source === 'popular' && (
          <span className="text-xs text-muted-foreground">in EDHREC play order</span>
        )}
        {source === 'finder' && filterSummary && (
          <Badge variant="secondary" className="font-normal">
            {filterSummary}
          </Badge>
        )}
        {total !== null && total > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {cards.length} of {total.toLocaleString()}
          </span>
        )}
        {source === 'finder' && (
          <Button variant="ghost" size="sm" onClick={onClearFinder} className="h-7">
            Clear filters
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-muted/50 p-4 text-sm text-destructive">{error}</p>
      )}

      {loading ? (
        <CardGridSkeleton width={cardWidth} count={18} />
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center">
          <Search className="h-6 w-6 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {source === 'search'
              ? `No commanders match “${searchValue}”.`
              : 'No commanders match those filters. Try removing one.'}
          </p>
        </div>
      ) : (
        <CardGrid width={cardWidth}>
          {cards.map((card: any, i: number) => (
            <button
              key={card.id ?? card.name}
              type="button"
              onClick={() => onSelect(card)}
              className={cn(
                'group/pick block w-full text-left',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
              )}
              title={`Build a deck for ${card.name}`}
            >
              <CardImage card={card} width={cardWidth} fill interactive eager={i < 12} hideFlip>
                {/* Sits on card art, so light-on-dark is correct here. */}
                <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/90 to-transparent p-2 pt-8 opacity-0 transition-opacity duration-200 group-hover/pick:opacity-100 group-focus-visible/pick:opacity-100">
                  <span className="min-w-0">
                    <span className="block truncate text-[0.7rem] font-semibold text-white">
                      {card.name}
                    </span>
                    {typeof card.edhrec_rank === 'number' && (
                      <span className="block text-[0.65rem] tabular-nums text-white/70">
                        EDHREC #{card.edhrec_rank.toLocaleString()}
                      </span>
                    )}
                  </span>
                  <ColorIdentity colors={card.color_identity} size="xs" />
                </span>
              </CardImage>
            </button>
          ))}
        </CardGrid>
      )}

      {hasMore && onLoadMore && (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading…
              </>
            ) : (
              'Load more commanders'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export default CommanderStage;
