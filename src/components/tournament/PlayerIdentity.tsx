/**
 * DeckMatrix — how a player is drawn everywhere in the tournament surface.
 *
 * One rule underneath all of it: a seat is a player *and their deck*, and a
 * deck is its commander card — whole, never cropped, at whatever size the
 * surface can afford. Pairings, standings, the roster, the bracket and the
 * podium all render through these two pieces so a player looks like the same
 * person on every screen.
 *
 * A player with no registered deck gets a designed card-shaped panel — their
 * monogram set in the same geometry as a real card — rather than a hole in the
 * layout.
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { CardImage, CARD_ASPECT, type CardImageSize } from '@/components/cards';
import { ManaPip } from '@/components/ui/mana-cost';
import type { Standing } from './scoring';
import type { PlayerView } from './playerViews';

/** Matches `CardImage`'s corner geometry so a fallback sits flush with real cards. */
const CARD_RADIUS = '4.75% / 3.4%';

const WUBRG = ['W', 'U', 'B', 'R', 'G'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function sortIdentity(colors: string[] | undefined): string[] {
  const clean = Array.from(new Set((colors ?? []).map(c => c.toUpperCase()))).filter(c =>
    WUBRG.includes(c)
  );
  return clean.sort((a, b) => WUBRG.indexOf(a) - WUBRG.indexOf(b));
}

export interface CommanderPortraitProps {
  view: PlayerView;
  size?: CardImageSize;
  /** Grey the card out — used for the losing side of a decided match. */
  dimmed?: boolean;
  eager?: boolean;
  className?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}

/**
 * The commander card for a seat, stretched to its container.
 *
 * `fill` rather than a fixed width so the caller decides the geometry and the
 * card scales with the layout; the `size` token still drives which Scryfall
 * resolution is requested.
 */
export function CommanderPortrait({
  view,
  size = 'sm',
  dimmed = false,
  eager = false,
  className,
  onClick,
  children,
}: CommanderPortraitProps) {
  const pips = useMemo(() => sortIdentity(view.deck?.colors), [view.deck?.colors]);

  if (view.card) {
    return (
      <CardImage
        card={view.card}
        size={size}
        fill
        eager={eager}
        onClick={onClick}
        title={`${view.card.name} — ${view.deck?.deckName ?? view.name}`}
        className={className}
        imageClassName={cn(dimmed && 'opacity-45 grayscale')}
      >
        {children}
      </CardImage>
    );
  }

  const compact = size === 'xs' || size === 'sm';

  return (
    <div className={cn('relative w-full select-none', className)}>
      <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          onClick
            ? e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        className={cn(
          'relative flex w-full flex-col items-center justify-center gap-[6%] overflow-hidden bg-muted p-[8%] text-center',
          'shadow-lg shadow-black/30',
          dimmed && 'opacity-45',
          onClick && 'cursor-pointer'
        )}
        style={{ aspectRatio: CARD_ASPECT, borderRadius: CARD_RADIUS }}
      >
        <span
          aria-hidden="true"
          className={cn(
            'font-semibold leading-none tracking-tight text-foreground/70',
            compact ? 'text-lg' : 'text-4xl'
          )}
        >
          {initials(view.name)}
        </span>

        {pips.length > 0 ? (
          <span className="flex flex-wrap items-center justify-center gap-1">
            {pips.map(c => (
              <ManaPip key={c} symbol={c} size={compact ? 'xs' : 'md'} />
            ))}
          </span>
        ) : (
          !compact && (
            <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              No deck
            </span>
          )
        )}
        {children}
      </div>
    </div>
  );
}

/** `4–1–0` with the match points beside it. Reads the same as a printed sheet. */
export function RecordLine({
  standing,
  className,
}: {
  standing?: Standing;
  className?: string;
}) {
  if (!standing) {
    return <span className={cn('text-xs text-muted-foreground', className)}>No matches yet</span>;
  }
  return (
    <span className={cn('text-xs tabular-nums text-muted-foreground', className)}>
      <span className="font-medium text-foreground">
        {standing.wins}–{standing.losses}–{standing.draws}
      </span>
      <span className="px-1.5 text-muted-foreground/50">·</span>
      {standing.points} pt{standing.points === 1 ? '' : 's'}
    </span>
  );
}

/** Deck name plus colour identity — the line under a player's name. */
export function DeckLine({
  view,
  className,
}: {
  view: PlayerView;
  className?: string;
}) {
  const pips = sortIdentity(view.deck?.colors);

  if (!view.deck) {
    return (
      <span className={cn('text-xs italic text-muted-foreground/70', className)}>
        No deck registered
      </span>
    );
  }

  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
      {pips.length > 0 && (
        <span className="flex shrink-0 items-center gap-0.5">
          {pips.map(c => (
            <ManaPip key={c} symbol={c} size="xs" />
          ))}
        </span>
      )}
      <span className="truncate text-xs text-muted-foreground">{view.deck.deckName}</span>
    </span>
  );
}
