import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { CardCost } from '@/components/cards/CardCost';
import { CardGrid, CardImage, CARD_WIDTH_DEFAULT } from '@/components/cards';
import { cn } from '@/lib/utils';
import {
  formatUsd,
  getPowerToughness,
  getSetCode,
  getTypeLine,
  getUsdPrice,
  rarityClass,
  rarityCode,
} from '@/lib/scryfall/card-utils';
import { ArrowDown, ArrowUp, Eye, Heart, Plus } from 'lucide-react';

/**
 * How a set of card results is drawn.
 *
 * Three rules here, all of them things this file used to get wrong:
 *
 * 1. **No borders.** Not on the tiles, not on the table, not on the rows. Depth
 *    comes from surface tint (`bg-muted/20`, `bg-card`) and shadow, which is
 *    how the rest of the product builds hierarchy.
 * 2. **The art is the tile.** A card grid is a wall of Magic art, not a wall of
 *    bordered boxes with a stamp-sized picture inside one corner. Metadata
 *    rides on top of the art and only on hover.
 * 3. **Resolution follows rendered size.** Every image goes through `CardImage`,
 *    which asks Scryfall for `large` at any meaningful size. This grid used to
 *    request `small` (146 px wide) and draw it at 240 px, which is precisely why
 *    cards looked soft everywhere.
 */

export type CardViewMode = 'grid' | 'list' | 'compact';

/** Columns the table can sort by. Each maps to a Scryfall `order` value. */
export type CardSortKey =
  | 'name'
  | 'cmc'
  | 'set'
  | 'rarity'
  | 'power'
  | 'toughness'
  | 'usd'
  | 'released'
  | 'edhrec';

export interface CardSort {
  key: CardSortKey;
  dir: 'asc' | 'desc';
}

interface UniversalCardDisplayProps {
  cards: any[];
  viewMode: CardViewMode;
  onCardClick?: (card: any) => void;
  onCardAdd?: (card: any) => void;
  onCardWishlist?: (card: any) => void;
  showWishlistButton?: boolean;
  selectionMode?: boolean;
  selectedCards?: Set<string>;
  /**
   * Minimum tile width in px, straight from `useCardSize` / `CardSizeSlider`.
   * Drives both the grid track size and the Scryfall resolution requested,
   * replacing the old five-step `density` index.
   */
  cardWidth?: number;
  /** When provided, the table headers become click-to-sort controls. */
  sort?: CardSort;
  onSortChange?: (key: CardSortKey) => void;
}

/**
 * Borderless checkbox skin. The shadcn `Checkbox` draws `border border-primary`
 * and nothing else, so stripping the border needs a surface to replace it.
 */
const CHECKBOX = 'border-0 bg-muted data-[state=checked]:bg-primary';

/** Below this the art is too small to read a name off, so the tile gets a caption. */
const CAPTION_BELOW = 132;
/** Below this the set/price pill is clutter rather than information. */
const PILL_BELOW = 118;

const cardKey = (card: any, index: number) =>
  card?.collectionItemId ?? card?.storageItemId ?? card?.id ?? `card-${index}`;

/* ------------------------------------------------------------------ *
 * Full-size art on hover — the way Scryfall, Moxfield and EDHREC behave.
 * ------------------------------------------------------------------ */

function CardHoverPreview({ card, children }: { card: any; children: React.ReactNode }) {
  return (
    <HoverCard openDelay={220} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        // No popover chrome at all: the card itself is the popover.
        className="w-[264px] border-0 bg-transparent p-0 shadow-none"
      >
        <CardImage card={card} size="lg" fill hideFlip />
      </HoverCardContent>
    </HoverCard>
  );
}

/** Rarity as a flat tinted chip. The old version wore a hairline border. */
function RarityMark({ rarity }: { rarity?: string }) {
  if (!rarity) return null;
  return (
    <span
      title={rarity}
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-muted font-mono text-[10px] leading-none',
        rarityClass(rarity)
      )}
    >
      {rarityCode(rarity)}
    </span>
  );
}

/** A piece of art beside every card name — a card is never referenced as text alone. */
function RowThumb({ card, width = 34 }: { card: any; width?: number }) {
  return <CardImage card={card} width={width} hideFlip className="hidden sm:block" />;
}

function RowActions({
  card,
  onCardClick,
  onCardAdd,
  onCardWishlist,
  showWishlistButton,
  tone = 'row',
}: {
  card: any;
  onCardClick?: (card: any) => void;
  onCardAdd?: (card: any) => void;
  onCardWishlist?: (card: any) => void;
  showWishlistButton?: boolean;
  /** `overlay` sits directly on card art and needs its own opaque surface. */
  tone?: 'row' | 'overlay';
}) {
  const stop = (fn?: (card: any) => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    fn?.(card);
  };

  const buttonClass =
    tone === 'overlay'
      ? 'h-7 w-7 rounded-full bg-background/85 p-0 text-foreground shadow-md shadow-black/40 backdrop-blur hover:bg-background'
      : 'h-7 w-7 p-0';

  return (
    <div className="flex items-center gap-1">
      {onCardClick && (
        <Button
          size="sm"
          variant="ghost"
          className={buttonClass}
          aria-label={`View ${card.name}`}
          onClick={stop(onCardClick)}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
      )}
      {onCardAdd && (
        <Button
          size="sm"
          variant="ghost"
          className={buttonClass}
          aria-label={`Add ${card.name}`}
          onClick={stop(onCardAdd)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      )}
      {showWishlistButton && onCardWishlist && (
        <Button
          size="sm"
          variant="ghost"
          className={buttonClass}
          aria-label={`Wishlist ${card.name}`}
          onClick={stop(onCardWishlist)}
        >
          <Heart className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Keyboard traversal — arrow keys move a roving focus, Enter opens.
 * ------------------------------------------------------------------ */

function useRovingFocus(count: number, columnsRef: React.MutableRefObject<number>) {
  const [index, setIndex] = useState(-1);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    if (index >= count) setIndex(count - 1);
  }, [count, index]);

  useLayoutEffect(() => {
    if (index >= 0) itemRefs.current[index]?.focus();
  }, [index]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, onActivate: (i: number) => void) => {
      const cols = Math.max(1, columnsRef.current);
      const current = index < 0 ? 0 : index;
      let next = current;

      switch (e.key) {
        case 'ArrowRight': next = Math.min(count - 1, current + 1); break;
        case 'ArrowLeft': next = Math.max(0, current - 1); break;
        case 'ArrowDown': next = Math.min(count - 1, current + cols); break;
        case 'ArrowUp': next = Math.max(0, current - cols); break;
        case 'Home': next = 0; break;
        case 'End': next = count - 1; break;
        case 'Enter':
        case ' ':
          if (index >= 0) {
            e.preventDefault();
            onActivate(index);
          }
          return;
        default:
          return;
      }

      e.preventDefault();
      setIndex(next);
    },
    [count, index, columnsRef]
  );

  return { index, setIndex, itemRefs, onKeyDown };
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

export function UniversalCardDisplay({
  cards,
  viewMode,
  onCardClick,
  onCardAdd,
  onCardWishlist,
  showWishlistButton = false,
  selectionMode = false,
  selectedCards = new Set(),
  cardWidth = CARD_WIDTH_DEFAULT,
  sort,
  onSortChange,
}: UniversalCardDisplayProps) {
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef(1);

  const { index: focusIndex, setIndex, itemRefs, onKeyDown } = useRovingFocus(
    cards.length,
    columnsRef
  );
  // Roving tabindex: one tab stop for the whole result set, arrows move within it.
  const tabStop = focusIndex < 0 ? 0 : focusIndex;

  // Track the live column count so ArrowUp/ArrowDown move by a row. `CardGrid`
  // owns the grid element now, so the count is read off this wrapper's only
  // child rather than off a grid laid out here.
  useEffect(() => {
    if (viewMode !== 'grid') {
      columnsRef.current = 1;
      return;
    }
    const el = gridWrapRef.current?.firstElementChild as HTMLElement | null;
    if (!el) {
      columnsRef.current = 1;
      return;
    }
    const measure = () => {
      const cols = window.getComputedStyle(el).gridTemplateColumns;
      columnsRef.current = cols && cols !== 'none' ? cols.split(' ').filter(Boolean).length : 1;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [viewMode, cardWidth, cards.length]);

  const activate = useCallback(
    (i: number) => {
      const card = cards[i];
      if (card) onCardClick?.(card);
    },
    [cards, onCardClick]
  );

  if (!cards.length) return null;

  /* ---------------------------- Table view ---------------------------- */
  if (viewMode === 'list') {
    const columns: { key: CardSortKey | null; label: string; className?: string }[] = [
      { key: 'name', label: 'Name' },
      { key: 'cmc', label: 'Cost', className: 'w-[132px]' },
      { key: null, label: 'Type', className: 'hidden md:table-cell' },
      { key: 'set', label: 'Set', className: 'hidden sm:table-cell w-[84px]' },
      { key: 'rarity', label: 'Rarity', className: 'w-[64px]' },
      { key: 'power', label: 'P/T', className: 'hidden sm:table-cell w-[72px]' },
      { key: 'usd', label: 'Price', className: 'w-[84px] text-right' },
    ];

    return (
      <div className="overflow-x-auto rounded-xl bg-card shadow-lg shadow-black/20">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-muted/40">
              {selectionMode && <th className="w-10 px-3 py-2" />}
              {columns.map(col => {
                const sortable = Boolean(col.key && onSortChange);
                const active = sort && col.key === sort.key;
                return (
                  <th
                    key={col.label}
                    scope="col"
                    className={cn(
                      'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground',
                      col.className
                    )}
                    aria-sort={
                      active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onSortChange!(col.key as CardSortKey)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active && 'text-foreground'
                        )}
                      >
                        {col.label}
                        {active ? (
                          sort!.dir === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : null}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}
              <th scope="col" className="w-[112px] px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {cards.map((card, i) => {
              const key = cardKey(card, i);
              const isSelected = selectedCards.has(card.collectionItemId || card.id);
              const pt = getPowerToughness(card);
              return (
                <tr
                  key={key}
                  tabIndex={i === tabStop ? 0 : -1}
                  ref={el => { itemRefs.current[i] = el; }}
                  onFocus={() => setIndex(i)}
                  onKeyDown={e => onKeyDown(e, activate)}
                  onClick={() => onCardClick?.(card)}
                  className={cn(
                    // Rows separate by an alternating surface tint, never a rule.
                    'group cursor-pointer transition-colors even:bg-muted/20',
                    'hover:bg-accent focus:bg-accent focus:outline-none',
                    'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    isSelected && 'bg-accent'
                  )}
                >
                  {selectionMode && (
                    <td className="px-3 py-1.5" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onCardClick?.(card)}
                        className={CHECKBOX}
                        aria-label={`Select ${card.name}`}
                      />
                    </td>
                  )}
                  <td className="max-w-[320px] px-3 py-1.5">
                    <CardHoverPreview card={card}>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <RowThumb card={card} />
                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                          {card.name}
                        </span>
                      </span>
                    </CardHoverPreview>
                  </td>
                  <td className="px-3 py-1.5">
                    <CardCost card={card} size="xs" />
                  </td>
                  <td className="hidden max-w-[240px] truncate px-3 py-1.5 text-muted-foreground md:table-cell">
                    {getTypeLine(card)}
                  </td>
                  <td className="hidden px-3 py-1.5 font-mono text-xs uppercase text-muted-foreground sm:table-cell">
                    {getSetCode(card)}
                  </td>
                  <td className="px-3 py-1.5">
                    <RarityMark rarity={card.rarity} />
                  </td>
                  <td className="hidden px-3 py-1.5 tabular-nums text-muted-foreground sm:table-cell">
                    {pt ? `${pt.power}/${pt.toughness}` : ''}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                    {formatUsd(getUsdPrice(card))}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <RowActions
                        card={card}
                        onCardClick={onCardClick}
                        onCardAdd={onCardAdd}
                        onCardWishlist={onCardWishlist}
                        showWishlistButton={showWishlistButton}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  /* --------------------------- Compact view --------------------------- */
  if (viewMode === 'compact') {
    return (
      <div role="list" className="overflow-hidden rounded-xl bg-card shadow-lg shadow-black/20">
        {cards.map((card, i) => {
          const key = cardKey(card, i);
          const isSelected = selectedCards.has(card.collectionItemId || card.id);
          return (
            <div
              key={key}
              role="listitem"
              tabIndex={i === tabStop ? 0 : -1}
              ref={el => { itemRefs.current[i] = el; }}
              onFocus={() => setIndex(i)}
              onKeyDown={e => onKeyDown(e, activate)}
              onClick={() => onCardClick?.(card)}
              className={cn(
                'group flex cursor-pointer items-center gap-3 px-3 py-1 transition-colors odd:bg-muted/20',
                'hover:bg-accent focus:bg-accent focus:outline-none',
                'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                isSelected && 'bg-accent'
              )}
            >
              {selectionMode && (
                <div onClick={e => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onCardClick?.(card)}
                    className={CHECKBOX}
                    aria-label={`Select ${card.name}`}
                  />
                </div>
              )}
              <CardHoverPreview card={card}>
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  <RowThumb card={card} width={26} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {card.name}
                  </span>
                </span>
              </CardHoverPreview>
              <CardCost card={card} size="xs" />
              <RarityMark rarity={card.rarity} />
              <span className="hidden w-24 shrink-0 text-right font-mono text-xs uppercase text-muted-foreground sm:inline">
                {getSetCode(card)}
              </span>
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {formatUsd(getUsdPrice(card))}
              </span>
              <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <RowActions
                  card={card}
                  onCardClick={onCardClick}
                  onCardAdd={onCardAdd}
                  onCardWishlist={onCardWishlist}
                  showWishlistButton={showWishlistButton}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /* ---------------------------- Image grid ---------------------------- */
  const showCaption = cardWidth < CAPTION_BELOW;
  const showPill = cardWidth >= PILL_BELOW;

  return (
    <div ref={gridWrapRef} role="group" aria-label="Card results">
      <CardGrid width={cardWidth}>
        {cards.map((card, i) => {
          const key = cardKey(card, i);
          const isSelected = selectedCards.has(card.collectionItemId || card.id);
          const price = formatUsd(getUsdPrice(card));

          return (
            <div
              key={key}
              role="button"
              tabIndex={i === tabStop ? 0 : -1}
              ref={el => { itemRefs.current[i] = el; }}
              onFocus={() => setIndex(i)}
              onKeyDown={e => onKeyDown(e, activate)}
              onClick={() => onCardClick?.(card)}
              aria-label={card.name}
              className={cn(
                // `group` here (not only inside CardImage) so the overlays react
                // to keyboard focus on the tile, not just to a hovering pointer.
                'group cursor-pointer rounded-lg focus:outline-none',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
              )}
            >
              <CardImage
                card={card}
                width={cardWidth}
                fill
                interactive
                eager={i < 8}
                imageClassName={cn(
                  isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                )}
              >
                {selectionMode && (
                  <div className="absolute left-2 top-2 z-20" onClick={e => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onCardClick?.(card)}
                      className={cn(CHECKBOX, 'bg-background/90 shadow-md shadow-black/40')}
                      aria-label={`Select ${card.name}`}
                    />
                  </div>
                )}

                {/* Actions ride the top-right; the flip control owns bottom-right. */}
                {!selectionMode && (onCardClick || onCardAdd || onCardWishlist) && (
                  <div
                    className={cn(
                      'absolute right-1.5 top-1.5 z-20 opacity-0 transition-opacity duration-150',
                      'motion-reduce:transition-none',
                      'group-hover:opacity-100 group-focus-within:opacity-100'
                    )}
                  >
                    <RowActions
                      card={card}
                      onCardClick={onCardClick}
                      onCardAdd={onCardAdd}
                      onCardWishlist={onCardWishlist}
                      showWishlistButton={showWishlistButton}
                      tone="overlay"
                    />
                  </div>
                )}

                {showPill && (
                  <span
                    className={cn(
                      'pointer-events-none absolute bottom-1.5 left-1.5 z-10 inline-flex items-center gap-1.5',
                      'rounded-full bg-background/85 px-2 py-0.5 text-[0.65rem] leading-none text-foreground backdrop-blur',
                      'opacity-0 transition-opacity duration-150 motion-reduce:transition-none',
                      'group-hover:opacity-100 group-focus-within:opacity-100'
                    )}
                  >
                    <span className="font-mono uppercase text-muted-foreground">
                      {getSetCode(card)}
                    </span>
                    <span className="tabular-nums">{price}</span>
                  </span>
                )}
              </CardImage>

              {showCaption && (
                <p className="mt-1 truncate text-center text-[0.65rem] leading-tight text-muted-foreground">
                  {card.name}
                </p>
              )}
            </div>
          );
        })}
      </CardGrid>
    </div>
  );
}
