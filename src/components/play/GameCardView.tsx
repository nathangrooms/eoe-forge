/**
 * One physical card on the play table.
 *
 * Three states matter and each has to read instantly across a table-sized
 * board: tapped (rotated, as it would be in paper), attacking or blocking
 * (raised and labelled), and face-down or hidden (a back, never a blank).
 *
 * A card with no image still renders as a card — name, cost as pips, type line,
 * power and toughness — rather than a grey rectangle, because the card database
 * has gaps and a playtest that shows holes where cards should be is unusable.
 */

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { ManaCost } from '@/components/ui/mana-cost';
import { powerOf, toughnessOf, statLine, isLand, isCreature } from '@/lib/game';
import type { CardInstance } from '@/lib/game';

export type GameCardSize = 'xs' | 'sm' | 'md' | 'lg';

const WIDTH: Record<GameCardSize, string> = {
  xs: 'w-[3.25rem]',
  sm: 'w-[4.5rem]',
  md: 'w-[6.5rem]',
  lg: 'w-[9rem]',
};

const NAME_TEXT: Record<GameCardSize, string> = {
  xs: 'text-[7px] leading-tight',
  sm: 'text-[9px] leading-tight',
  md: 'text-[11px] leading-snug',
  lg: 'text-sm leading-snug',
};

export interface GameCardViewProps {
  card: CardInstance;
  size?: GameCardSize;
  /** Render the back instead of the face. */
  hidden?: boolean;
  selected?: boolean;
  /** Dimmed and non-interactive — e.g. a spell you cannot pay for. */
  dimmed?: boolean;
  /** Highlight ring plus label. Used by the combat view. */
  role?: 'attacker' | 'blocker' | 'target' | null;
  onClick?: () => void;
  onDoubleClick?: () => void;
  className?: string;
  /** Overrides the automatic tapped rotation, for hand and zone lists. */
  ignoreTapped?: boolean;
  title?: string;
}

function CardFace({ card, size }: { card: CardInstance; size: GameCardSize }) {
  if (card.imageUrl) {
    return (
      <img
        src={card.imageUrl}
        alt={card.name}
        loading="lazy"
        draggable={false}
        className="h-full w-full rounded-[4%] object-cover"
      />
    );
  }

  const stats = statLine(card);
  const compact = size === 'xs' || size === 'sm';

  return (
    <div className="flex h-full w-full flex-col justify-between rounded-[4%] bg-muted p-1.5">
      <div className="min-w-0">
        <p className={cn('truncate font-medium text-foreground', NAME_TEXT[size])}>{card.name}</p>
        {!compact && card.manaCost && <ManaCost cost={card.manaCost} size="xs" className="mt-1" />}
      </div>
      {!compact && (
        <p className="truncate text-[9px] leading-tight text-muted-foreground">{card.typeLine}</p>
      )}
      {stats && (
        <p className={cn('self-end font-semibold text-foreground', compact ? 'text-[9px]' : 'text-xs')}>
          {stats}
        </p>
      )}
    </div>
  );
}

function CardBack({ size }: { size: GameCardSize }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-[4%] bg-muted">
      <span
        className={cn(
          'font-semibold uppercase tracking-[0.2em] text-muted-foreground',
          size === 'xs' ? 'text-[6px]' : size === 'sm' ? 'text-[7px]' : 'text-[9px]'
        )}
      >
        DM
      </span>
    </div>
  );
}

export const GameCardView = memo(function GameCardView({
  card,
  size = 'sm',
  hidden,
  selected,
  dimmed,
  role,
  onClick,
  onDoubleClick,
  className,
  ignoreTapped,
  title,
}: GameCardViewProps) {
  const tapped = !ignoreTapped && card.tapped;
  const interactive = !!onClick;
  const counters = Object.entries(card.counters).filter(([, value]) => value !== 0);
  const damage = card.damage;

  const roleRing =
    role === 'attacker'
      ? 'ring-2 ring-foreground'
      : role === 'blocker'
        ? 'ring-2 ring-muted-foreground'
        : role === 'target'
          ? 'ring-2 ring-destructive'
          : '';

  return (
    <div className={cn('relative shrink-0', WIDTH[size], className)}>
      {/* The rotation is on an inner element: a CSS rotate does not change the
          layout box, so tapping a card must not reflow the row around it. */}
      <div
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        title={title ?? card.name}
        aria-label={card.name}
        aria-pressed={interactive ? !!selected : undefined}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onKeyDown={
          interactive
            ? event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onClick?.();
                }
              }
            : undefined
        }
        className={cn(
          'aspect-[63/88] w-full overflow-hidden rounded-[4%] bg-card shadow-sm',
          'transition-[transform,box-shadow,opacity] duration-200 ease-out motion-reduce:transition-none',
          tapped && 'rotate-90',
          selected && 'ring-2 ring-foreground',
          roleRing,
          dimmed && 'opacity-40 saturate-0',
          interactive && 'cursor-pointer hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0'
        )}
      >
        {hidden ? <CardBack size={size} /> : <CardFace card={card} size={size} />}
      </div>

      {/* Overlays sit outside the rotated element so they stay upright. */}
      {(counters.length > 0 || damage > 0 || card.summoningSick) && (
        <div className="pointer-events-none absolute -bottom-1 left-0 right-0 flex flex-wrap justify-center gap-0.5">
          {counters.map(([key, value]) => (
            <span
              key={key}
              className="rounded-full bg-foreground px-1.5 text-[9px] font-semibold leading-4 text-background shadow-sm"
              title={`${value} ${key} counters`}
            >
              {value > 0 ? `+${value}` : value}
            </span>
          ))}
          {damage > 0 && (
            <span
              className="rounded-full bg-destructive px-1.5 text-[9px] font-semibold leading-4 text-destructive-foreground shadow-sm"
              title={`${damage} damage marked`}
            >
              {damage}
            </span>
          )}
          {card.summoningSick && isCreature(card) && !isLand(card) && (
            <span
              className="rounded-full bg-muted px-1.5 text-[9px] font-medium leading-4 text-muted-foreground shadow-sm"
              title="Summoning sick"
            >
              zzz
            </span>
          )}
        </div>
      )}

      {role === 'attacker' && (
        <span className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-1.5 text-[9px] font-semibold leading-4 text-background shadow-sm">
          {powerOf(card)}/{toughnessOf(card)}
        </span>
      )}
    </div>
  );
});
