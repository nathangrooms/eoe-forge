/**
 * One suggested card, at a size you can read.
 *
 * Additions, removals and land recommendations were three separate layouts
 * built from three differently-sized hand-rolled `<img>` tags — 96px, 80px and
 * a 40×56 `object-cover` box that literally cropped the card to a stamp. They
 * are the same object: a card, a reason, and one action. So they are one
 * component now, and the card is the biggest thing in it.
 *
 * The tile toggles selection; the action button stops propagation so "add this
 * one now" never has to fight the checkbox.
 *
 * The art is the one exception, and it is the law rather than a preference:
 * clicking a card anywhere outside play mode goes to `/cards/:id` (see
 * `card-link.ts`, and the deck grid on this same page, which already does it).
 * The optimiser was the one card-heavy surface where the art was inert — you
 * could be asked to cut a card and have no way to read it. So the art
 * navigates and everything around it — the tags, the name, the reason, the
 * empty space — still toggles, which keeps selection a much larger target than
 * the thing it now shares the tile with.
 */

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardImage, useOpenCard } from '@/components/cards';
import { AddToListButton } from '@/components/shopping/AddToListButton';

export interface SuggestionTileProps {
  name: string;
  /** Full card object for `<CardImage>`. */
  card: any;
  /** `null` when Scryfall has no price — renders nothing rather than $0.00. */
  price?: number | null;
  reason?: string;
  /** Small pills above the art: category, priority, ownership. */
  tags?: ReactNode;
  /** Computed castability on this deck's mana base, when it is meaningful. */
  footnote?: ReactNode;
  selected?: boolean;
  onToggle?: () => void;
  /** The single action — "Add now", "Remove". */
  action: ReactNode;
  /** Removals grey the art so a cut reads as a cut. */
  dimmed?: boolean;
  /**
   * Offer the shopping and proxy lists beside the action.
   *
   * Set on cards the optimiser wants you to ADD, never on cuts. "Add now" puts
   * the card in the deck, and a card in a deck you do not own reaches the
   * shopping list on its own as a deck shortfall. This is for the other, more
   * common answer: yes, but I have not got one. Put it on the list and decide
   * about the deck when it turns up. Without it, a player has to commit a card
   * they do not own to a deck just to remember to buy it.
   */
  offerLists?: boolean;
  /** The deck the suggestion was made for, kept as the reason on the list. */
  deckId?: string | null;
}

export function SuggestionTile({
  name,
  card,
  price,
  reason,
  tags,
  footnote,
  selected,
  onToggle,
  action,
  dimmed,
  offerLists,
  deckId,
}: SuggestionTileProps) {
  const selectable = Boolean(onToggle);
  const openCard = useOpenCard();

  return (
    <div
      className={cn(
        'flex flex-col rounded-2xl p-4 transition-colors',
        // Tone, not outline — design law 2.
        selected ? 'bg-muted shadow-xl' : 'bg-card shadow-lg',
        selectable && 'cursor-pointer'
      )}
      onClick={onToggle}
      role={selectable ? 'checkbox' : undefined}
      aria-checked={selectable ? Boolean(selected) : undefined}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={
        selectable
          ? e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggle?.();
              }
            }
          : undefined
      }
    >
      {tags && <div className="mb-2.5 flex flex-wrap items-center gap-2">{tags}</div>}

      {/* `stopPropagation` on the wrapper, not on `CardImage`: the tile's own
          click handler sits above it, and without this a tap on the art would
          navigate *and* toggle selection on the way out. */}
      <div
        className="relative"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        <CardImage
          card={card}
          size="lg"
          fill
          onClick={() => openCard(card)}
          imageClassName={cn(dimmed && selected && 'opacity-45 grayscale')}
        />
        {/* Selection tick sits on the art rather than beside it, so the card
            keeps the full width of the tile. */}
        {selected && (
          <div className="pointer-events-none absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <Check className="h-5 w-5" />
          </div>
        )}
      </div>

      <div className="mt-3 flex-1">
        <p className="text-base font-semibold leading-snug">{name}</p>
        {price !== null && price !== undefined && (
          <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
            ${price.toFixed(2)}
          </p>
        )}
        {reason && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{reason}</p>
        )}
        {footnote && <div className="mt-2">{footnote}</div>}
      </div>

      <div
        className="mt-4"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        {offerLists ? (
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">{action}</div>
            {/* The same button as the card page, search results and the deck
                table. One component, so the action never drifts by surface. */}
            <AddToListButton
              card={card ?? { name }}
              kind="shopping"
              source="suggestion"
              deckId={deckId ?? null}
              display="icon"
              variant="secondary"
              className="h-11 w-11"
            />
            <AddToListButton
              card={card ?? { name }}
              kind="proxy"
              source="suggestion"
              deckId={deckId ?? null}
              display="icon"
              variant="secondary"
              className="h-11 w-11"
            />
          </div>
        ) : (
          action
        )}
      </div>
    </div>
  );
}

/** Consistent pill for the little facts above the art. */
export function TilePill({
  children,
  tone = 'default',
  title,
}: {
  children: ReactNode;
  tone?: 'default' | 'danger';
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'rounded-md px-2.5 py-1 text-xs font-medium',
        tone === 'danger' ? 'bg-destructive/15 text-destructive' : 'bg-muted text-foreground'
      )}
    >
      {children}
    </span>
  );
}
