import { useMemo, useState } from 'react';
import { PriceTag } from '@/components/pricing';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ManaCost } from '@/components/ui/mana-cost';
import { CardImage } from '@/components/cards';
import {
  CATEGORY_BG_CLASS,
  CATEGORY_TEXT_CLASS,
  groupByCategory,
} from '@/lib/deck/cardCategories';
import { cardImage, type DeckCardRow } from '@/lib/deck/deckCards';
import type { CardPlayability, ManaProfile } from '@/lib/deck/playability';
import { PlayabilityFlag, PlayabilityMeter } from './PlayabilityMeter';

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
  /**
   * Castability per row, from the memoised engine. Omit both this and
   * `manaProfile` and the tiles render exactly as before — the public deck
   * page has no mana profile to hand.
   */
  playabilityFor?: (row: DeckCardRow) => CardPlayability | null;
  manaProfile?: ManaProfile;
  /** Shown in place of the sections when `rows` is empty. */
  empty?: { title: string; body: string };
  className?: string;
}

export function DeckCardGrid({
  rows,
  onCardClick,
  collapsedByDefault = [],
  playabilityFor,
  manaProfile,
  empty,
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
          <p className="text-base font-medium">
            {empty?.title ?? 'No cards in this deck yet'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {empty?.body ?? 'Add cards in the deck builder and they will appear here.'}
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
                className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted"
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
                <h3 className={cn('text-lg font-semibold', CATEGORY_TEXT_CLASS[group.category])}>
                  {group.label}
                </h3>
                <Badge variant="secondary" className="text-sm tabular-nums">
                  {count}
                </Badge>
              </button>
            </CardHeader>

            {isOpen && (
              <CardContent className="pt-0">
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {group.items.map(row => (
                    <li key={row.id}>
                      {/* The shared `CardImage`: real card geometry, the
                          resolution ladder, blur-up and the flip affordance on
                          double-faced cards. The hand-rolled <img> this
                          replaced drew every card into a 5:7 box with a
                          `ring-1 ring-border` hairline — a border, on a hundred
                          cards at once. */}
                      <CardImage
                        card={{
                          ...(row.card ?? {}),
                          id: row.card_id,
                          name: row.card?.name || row.card_name,
                          image_uris: row.card?.image_uris ?? undefined,
                          image_url: cardImage(row, 'normal') ?? undefined,
                        }}
                        size="lg"
                        fill
                        onClick={() => onCardClick?.(row)}
                        title={row.card?.name || row.card_name}
                      >
                        {row.quantity > 1 && (
                          // The badge sits over card art, so it needs an
                          // explicit dark ground rather than a theme token.
                          <span className="absolute left-1.5 top-1.5 rounded bg-black/80 px-1.5 py-0.5 text-xs font-bold text-white">
                            {row.quantity}x
                          </span>
                        )}
                        {/* Only the two problem bands stamp the art. The meter
                            under the tile carries the figure for every card, so
                            marking all ninety-nine would bury the signal. */}
                        <PlayabilityFlag card={playabilityFor?.(row) ?? null} />
                      </CardImage>

                      {/* 13px, not 10px. The caption under a card is the one
                          place a player reads a name at a glance and the old
                          size was unreadable at arm's length. */}
                      <div className="mt-2 flex items-start justify-between gap-1.5">
                        <span className="line-clamp-1 text-sm font-medium">
                          {row.card?.name || row.card_name}
                        </span>
                        {row.card?.mana_cost ? (
                          <ManaCost cost={row.card.mana_cost} size="sm" className="shrink-0" />
                        ) : null}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        {manaProfile ? (
                          <PlayabilityMeter
                            card={playabilityFor?.(row) ?? null}
                            profile={manaProfile}
                          />
                        ) : (
                          <span />
                        )}
                        {/* PriceTag rather than a raw parseFloat: a card we
                            hold no price for used to render nothing at all, so
                            the gap was invisible. It now says so. */}
                        <PriceTag card={row.card} size="sm" />
                      </div>
                    </li>
                  ))}
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
