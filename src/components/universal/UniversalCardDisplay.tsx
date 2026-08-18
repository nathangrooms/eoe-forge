import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { CardCost } from '@/components/cards/CardCost';
import { cn } from '@/lib/utils';
import {
  formatUsd,
  getCardImage,
  getPowerToughness,
  getSetCode,
  getTypeLine,
  getUsdPrice,
  hasBackFace,
  rarityClass,
  rarityCode,
} from '@/lib/scryfall/card-utils';
import { ArrowDown, ArrowUp, Eye, Heart, ImageOff, Plus, RefreshCw } from 'lucide-react';

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
  /** 0 = largest tiles, 4 = smallest. Only affects the image grid. */
  density?: number;
  /** When provided, the table headers become click-to-sort controls. */
  sort?: CardSort;
  onSortChange?: (key: CardSortKey) => void;
}

/** Minimum tile width per density step, in px. Drives grid-template-columns. */
const DENSITY_WIDTHS = [240, 196, 160, 132, 108];

const cardKey = (card: any, index: number) =>
  card?.collectionItemId ?? card?.storageItemId ?? card?.id ?? `card-${index}`;

/* ------------------------------------------------------------------ *
 * Card art with lazy loading, reserved space and a real failure state.
 * ------------------------------------------------------------------ */

function CardArt({
  card,
  size,
  face,
  className,
}: {
  card: any;
  size: 'small' | 'normal' | 'large';
  face: number;
  className?: string;
}) {
  const src = getCardImage(card, size, face);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <div
        className={cn(
          'flex h-full w-full flex-col items-center justify-center gap-1 bg-muted p-2 text-center',
          className
        )}
      >
        <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
        <p className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground">
          {card?.name}
        </p>
        <p className="line-clamp-1 text-[10px] text-muted-foreground">{getTypeLine(card)}</p>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={card?.name ?? 'Magic card'}
      loading="lazy"
      decoding="async"
      width={size === 'small' ? 146 : 488}
      height={size === 'small' ? 204 : 680}
      onError={() => setFailed(true)}
      className={cn('h-full w-full object-contain', className)}
    />
  );
}

/** Full-size art on hover — the way Scryfall, Moxfield and EDHREC all behave. */
function CardHoverPreview({ card, children }: { card: any; children: React.ReactNode }) {
  return (
    <HoverCard openDelay={220} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="w-[248px] overflow-hidden rounded-lg border-border p-0"
      >
        <div className="aspect-[63/88] w-full bg-muted">
          <CardArt card={card} size="normal" face={0} />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function RarityMark({ rarity }: { rarity?: string }) {
  if (!rarity) return null;
  return (
    <span
      title={rarity}
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-border font-mono text-[10px] leading-none',
        rarityClass(rarity)
      )}
    >
      {rarityCode(rarity)}
    </span>
  );
}

function RowActions({
  card,
  onCardClick,
  onCardAdd,
  onCardWishlist,
  showWishlistButton,
}: {
  card: any;
  onCardClick?: (card: any) => void;
  onCardAdd?: (card: any) => void;
  onCardWishlist?: (card: any) => void;
  showWishlistButton?: boolean;
}) {
  const stop = (fn?: (card: any) => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn?.(card);
  };

  return (
    <div className="flex items-center gap-1">
      {onCardClick && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
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
          className="h-7 w-7 p-0"
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
          className="h-7 w-7 p-0"
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
  density = 2,
  sort,
  onSortChange,
}: UniversalCardDisplayProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef(1);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});

  const { index: focusIndex, setIndex, itemRefs, onKeyDown } = useRovingFocus(
    cards.length,
    columnsRef
  );
  // Roving tabindex: one tab stop for the whole result set, arrows move within it.
  const tabStop = focusIndex < 0 ? 0 : focusIndex;

  // Track the live column count so ArrowUp/ArrowDown move by a row.
  useEffect(() => {
    const el = gridRef.current;
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
  }, [viewMode, density, cards.length]);

  const activate = useCallback(
    (i: number) => {
      const card = cards[i];
      if (card) onCardClick?.(card);
    },
    [cards, onCardClick]
  );

  const toggleFlip = (key: string) =>
    setFlipped(prev => ({ ...prev, [key]: !prev[key] }));

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
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
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
                    'group cursor-pointer border-b border-border last:border-0 transition-colors',
                    'hover:bg-accent focus:bg-accent focus:outline-none',
                    'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    isSelected && 'bg-accent'
                  )}
                >
                  {selectionMode && (
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onCardClick?.(card)}
                        aria-label={`Select ${card.name}`}
                      />
                    </td>
                  )}
                  <td className="max-w-[280px] px-3 py-2">
                    <CardHoverPreview card={card}>
                      <span className="block truncate font-medium text-foreground">
                        {card.name}
                      </span>
                    </CardHoverPreview>
                  </td>
                  <td className="px-3 py-2">
                    <CardCost card={card} size="xs" />
                  </td>
                  <td className="hidden max-w-[240px] truncate px-3 py-2 text-muted-foreground md:table-cell">
                    {getTypeLine(card)}
                  </td>
                  <td className="hidden px-3 py-2 font-mono text-xs uppercase text-muted-foreground sm:table-cell">
                    {getSetCode(card)}
                  </td>
                  <td className="px-3 py-2">
                    <RarityMark rarity={card.rarity} />
                  </td>
                  <td className="hidden px-3 py-2 tabular-nums text-muted-foreground sm:table-cell">
                    {pt ? `${pt.power}/${pt.toughness}` : ''}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">
                    {formatUsd(getUsdPrice(card))}
                  </td>
                  <td className="px-3 py-2">
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
      <div
        ref={gridRef}
        role="list"
        className="divide-y divide-border rounded-lg border border-border"
      >
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
                'group flex cursor-pointer items-center gap-3 px-3 py-1.5 transition-colors',
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
                    aria-label={`Select ${card.name}`}
                  />
                </div>
              )}
              <CardHoverPreview card={card}>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {card.name}
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
  const minWidth = DENSITY_WIDTHS[Math.min(DENSITY_WIDTHS.length - 1, Math.max(0, density))];

  return (
    <div
      ref={gridRef}
      role="list"
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))` }}
    >
      {cards.map((card, i) => {
        const key = cardKey(card, i);
        const isSelected = selectedCards.has(card.collectionItemId || card.id);
        const flippable = hasBackFace(card);
        const face = flipped[key] ? 1 : 0;

        return (
          <div
            key={key}
            role="listitem"
            tabIndex={i === tabStop ? 0 : -1}
            ref={el => { itemRefs.current[i] = el; }}
            onFocus={() => setIndex(i)}
            onKeyDown={e => onKeyDown(e, activate)}
            onClick={() => onCardClick?.(card)}
            aria-label={card.name}
            className={cn(
              'group relative cursor-pointer rounded-lg border border-border bg-card transition-colors',
              'hover:border-foreground/30 focus:outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              isSelected && 'border-foreground ring-1 ring-foreground'
            )}
          >
            {selectionMode && (
              <div className="absolute left-2 top-2 z-10" onClick={e => e.stopPropagation()}>
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onCardClick?.(card)}
                  className="border-2 bg-background"
                  aria-label={`Select ${card.name}`}
                />
              </div>
            )}

            <div className="aspect-[63/88] w-full overflow-hidden rounded-t-lg bg-muted">
              <CardArt card={card} size="small" face={face} />
            </div>

            {flippable && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  toggleFlip(key);
                }}
                title="Flip card"
                aria-label={`Flip ${card.name}`}
                className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background/90 text-foreground transition-colors hover:bg-accent"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}

            <div className="space-y-1.5 p-2">
              <div className="flex items-start justify-between gap-1">
                <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                  {card.name}
                </h3>
                <CardCost card={card} size="xs" />
              </div>
              <div className="flex items-center justify-between gap-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <RarityMark rarity={card.rarity} />
                  <span className="truncate font-mono text-[10px] uppercase text-muted-foreground">
                    {getSetCode(card)}
                  </span>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {formatUsd(getUsdPrice(card))}
                </span>
              </div>
            </div>

            {/* Action bar pinned to the bottom edge — the art stays visible. */}
            {!selectionMode && (onCardAdd || onCardWishlist) && (
              <div
                className={cn(
                  'pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 rounded-b-lg',
                  'border-t border-border bg-background/95 px-2 py-1 opacity-0 transition-opacity',
                  'group-hover:pointer-events-auto group-hover:opacity-100',
                  'group-focus-within:pointer-events-auto group-focus-within:opacity-100'
                )}
              >
                <RowActions
                  card={card}
                  onCardClick={onCardClick}
                  onCardAdd={onCardAdd}
                  onCardWishlist={onCardWishlist}
                  showWishlistButton={showWishlistButton}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
