import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ManaCost } from '@/components/ui/mana-cost';
import {
  CATEGORY_BG_CLASS,
  CATEGORY_TEXT_CLASS,
  groupByCategory,
} from '@/lib/deck/cardCategories';
import { cardImage, type DeckCardRow } from '@/lib/deck/deckCards';

/**
 * Visual decklist, grouped by canonical card type.
 *
 * Cards are drawn at the real Magic card ratio (5:7 — a card is 63x88mm, and
 * Scryfall's own images are 488x680). The previous 3:4 frame cropped ~5% off
 * every card, and the hover state painted an opaque scrim over the art the
 * user was trying to look at.
 */

interface DeckCardGridProps {
  rows: DeckCardRow[];
  onCardClick?: (row: DeckCardRow) => void;
  /** Sections collapsed on first render. Everything else starts open. */
  collapsedByDefault?: string[];
  className?: string;
}

export function DeckCardGrid({
  rows,
  onCardClick,
  collapsedByDefault = [],
  className,
}: DeckCardGridProps) {
  const groups = useMemo(
    () =>
      groupByCategory(rows, row => ({
        typeLine: row.card?.type_line,
        isCommander: row.is_commander,
        isSideboard: row.is_sideboard,
      })),
    [rows]
  );

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(collapsedByDefault));

  const toggle = (category: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  if (groups.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-10 text-center">
          <p className="font-medium">No cards in this deck yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add cards in the deck builder and they will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {groups.map(group => {
        const isOpen = !collapsed.has(group.category);
        const count = group.items.reduce((sum, row) => sum + row.quantity, 0);

        return (
          <Card key={group.category} className="overflow-hidden">
            <CardHeader className="p-0">
              <button
                type="button"
                onClick={() => toggle(group.category)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <span
                  className={cn('h-3 w-1 rounded-full', CATEGORY_BG_CLASS[group.category])}
                  aria-hidden
                />
                <h3 className={cn('text-base font-semibold', CATEGORY_TEXT_CLASS[group.category])}>
                  {group.label}
                </h3>
                <Badge variant="secondary" className="tabular-nums">
                  {count}
                </Badge>
              </button>
            </CardHeader>

            {isOpen && (
              <CardContent className="pt-0">
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {group.items.map(row => {
                    const image = cardImage(row, 'normal');
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => onCardClick?.(row)}
                          className="group w-full text-left focus:outline-none"
                        >
                          <div className="relative aspect-[5/7] overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-all group-hover:ring-2 group-hover:ring-foreground group-focus-visible:ring-2 group-focus-visible:ring-ring">
                            {image ? (
                              <img
                                src={image}
                                alt={row.card?.name || row.card_name}
                                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                                loading="lazy"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
                                {row.card_name}
                              </span>
                            )}

                            {row.quantity > 1 && (
                              // The badge sits over card art, so it needs an
                              // explicit dark ground rather than a theme token.
                              <span className="absolute left-1.5 top-1.5 rounded bg-black/80 px-1.5 py-0.5 text-xs font-bold text-white">
                                {row.quantity}x
                              </span>
                            )}
                          </div>

                          <div className="mt-1.5 flex items-start justify-between gap-1">
                            <span className="line-clamp-1 text-xs font-medium">
                              {row.card?.name || row.card_name}
                            </span>
                            {row.card?.mana_cost ? (
                              <ManaCost cost={row.card.mana_cost} size="xs" className="shrink-0" />
                            ) : null}
                          </div>
                          {row.card?.prices?.usd && (
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              ${parseFloat(row.card.prices.usd).toFixed(2)}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export default DeckCardGrid;
