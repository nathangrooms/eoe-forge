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
import type { DeckCardGroup } from '@/lib/deck/deckCardGroups';
import type { CardPlayability, ManaProfile } from '@/lib/deck/playability';
import { PlayabilityFlag, PlayabilityMeter } from './PlayabilityMeter';
import { DeckCardOverlay, type DeckCardEditing } from './DeckCardEditing';

/**
 * Visual decklist, grouped.
 *
 * Cards are drawn at the real Magic card ratio (5:7 — a card is 63x88mm, and
 * Scryfall's own images are 488x680). The previous 3:4 frame cropped ~5% off
 * every card, and the hover state painted an opaque scrim over the art the
 * user was trying to look at.
 *
 * Three things arrived here in the merge, all optional, so a caller that passes
 * none of them gets exactly what it got before:
 *
 * - `groups`, so the deck can be cut by colour or mana value as well as by card
 *   type. Omit it and the grid groups `rows` by type itself, as it always has.
 * - `width`, from the size slider. Omit it and cards are drawn at `lg` in the
 *   fixed responsive grid.
 * - `editing`, the quantity / replace / remove cluster. Omit it and the cards
 *   are just cards, which is what the public deck page wants.
 */

interface DeckCardGridProps {
  rows: DeckCardRow[];
  /** Pre-cut sections. Omit and the grid groups `rows` by card type itself. */
  groups?: DeckCardGroup[];
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
  /** Card width in pixels, from the size slider. */
  width?: number;
  /** The controls that change the deck. Omit for a decklist nobody can edit. */
  editing?: DeckCardEditing;
  /** Shown in place of the sections when `rows` is empty. */
  empty?: { title: string; body: string };
  className?: string;
}

export function DeckCardGrid({
  rows,
  groups: providedGroups,
  onCardClick,
  collapsedByDefault = [],
  playabilityFor,
  manaProfile,
  width,
  editing,
  empty,
  className,
}: DeckCardGridProps) {
  const ownGroups = useMemo<DeckCardGroup[]>(
    () =>
      groupByCategory(rows, row => ({
        typeLine: row.card?.type_line,
        isCommander: row.is_commander,
        isSideboard: row.is_sideboard,
      })).map(group => ({
        key: group.category,
        label: group.label,
        category: group.category,
        rows: group.items,
      })),
    [rows]
  );

  const groups = providedGroups ?? ownGroups;

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(collapsedByDefault));

  const toggle = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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
            {empty?.body ?? 'Search for cards on the Add tab and they will appear here.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {groups.map(group => {
        const isOpen = !collapsed.has(group.key);
        const count = group.rows.reduce((sum, row) => sum + row.quantity, 0);

        return (
          <Card key={group.key} className="overflow-hidden">
            <CardHeader className="p-0">
              <button
                type="button"
                onClick={() => toggle(group.key)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    'h-3 w-1 rounded-full',
                    group.category ? CATEGORY_BG_CLASS[group.category] : 'bg-muted-foreground'
                  )}
                  aria-hidden
                />
                <h3
                  className={cn(
                    'text-lg font-semibold',
                    group.category ? CATEGORY_TEXT_CLASS[group.category] : undefined
                  )}
                >
                  {group.label}
                </h3>
                <Badge variant="secondary" className="text-sm tabular-nums">
                  {count}
                </Badge>
              </button>
            </CardHeader>

            {/* TWENTY-FOUR PIXELS EACH SIDE IS A DESKTOP FIGURE.
                `CardContent` carries shadcn's `p-6`, and on a 390px phone that
                turns a 358px box into a 310px one. The two-column expression
                below needs 312 — two tracks of `max(150px, calc(50% - 6px))`
                plus the 12px gap — so it missed by TWO PIXELS and the tab fell
                back to one 310px card per row and 36,111px of scroll. Every
                other card surface in the product gets its grid at 358px and
                lays out two columns; even this deck's own Value tab does.

                So the padding follows the screen. 12px each side on a phone
                gives the grid 334px, which is exactly two 161px tracks, and
                `sm:` restores the desktop figure untouched. */}
            {isOpen && (
              <CardContent className="px-3 pb-3 pt-0 sm:px-6 sm:pb-6">
                <ul
                  className={cn(
                    'grid gap-3',
                    !width && 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
                  )}
                  style={
                    width
                      ? {
                          /* The same track expression as `CardGrid`, which this
                             list is a second copy of. It was a bare
                             `minmax(${width}px, 1fr)`: no `min(…, 100%)`, so a
                             card wider than the column could push the page
                             sideways, and no two-column floor, so on a 390px
                             phone the default 230 gave one 366px card per row
                             and the Cards tab measured 36,914px tall. See the
                             comment on `CardGrid` for the arithmetic. */
                          gridTemplateColumns: `repeat(auto-fill, minmax(min(${width}px, max(150px, calc(50% - 6px)), 100%), 1fr))`,
                        }
                      : undefined
                  }
                >
                  {group.rows.map(row => (
                    <li key={row.id} className="group relative">
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
                        /* `width` overrides `size` for both layout and the
                           resolution asked for, so the slider drives the
                           picture as well as the box. */
                        width={width}
                        fill
                        onClick={() => onCardClick?.(row)}
                        /* While the deck is editable the overlay is the
                           affordance; the lift would slide the card out from
                           under its own controls. */
                        interactive={!editing}
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

                      {/* The commander is changed from the block above the
                          decklist, which is where it is drawn whole. A quantity
                          stepper on the command zone would be a control for a
                          number that is always one. */}
                      {editing && !row.is_commander && (
                        <DeckCardOverlay row={row} editing={editing} />
                      )}

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
