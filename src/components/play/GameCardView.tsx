/**
 * One physical card on the table.
 *
 * The states that have to read instantly, from across a four-player board:
 *
 *   tapped        turned ninety degrees, exactly as it lies in paper, and it
 *                 *turns* — the rotation is animated, because a card that
 *                 teleports between upright and sideways loses the one cue
 *                 that says "this is spent".
 *   attacking     lunged toward the seat it is attacking, lifted off the mat.
 *   face down     a real drawn card back, never a grey rectangle.
 *   selected      washed and raised, never outlined. No hairlines anywhere.
 *
 * Card art goes through `CardImage`, which already picks a Scryfall resolution
 * that matches the rendered size. A card with no art at all still renders as a
 * card — name, cost as pips, type line, power and toughness — because the card
 * database has gaps and a playtest full of holes is unusable.
 */

import { memo, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ManaCost } from '@/components/ui/mana-cost';
import { CardImage } from '@/components/cards/CardImage';
import { CardBack, CARD_RADIUS } from './CardBack';
import { powerOf, toughnessOf, statLine, isLand, isCreature } from '@/lib/game';
import type { CardInstance } from '@/lib/game';

export type GameCardSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Rendered width in px per size token. Drives the Scryfall resolution too. */
export const GAME_CARD_WIDTH: Record<GameCardSize, number> = {
  xs: 46,
  sm: 68,
  md: 104,
  lg: 148,
  xl: 208,
};

const NAME_TEXT: Record<GameCardSize, string> = {
  xs: 'text-[7px] leading-tight',
  sm: 'text-[9px] leading-tight',
  md: 'text-[11px] leading-snug',
  lg: 'text-sm leading-snug',
  xl: 'text-base leading-snug',
};

/** A lunge, in card-local pixels. Positive y is toward the bottom of the seat. */
export interface Lunge {
  x: number;
  y: number;
}

export interface GameCardViewProps {
  card: CardInstance;
  size?: GameCardSize;
  /** Explicit width in px, overriding `size`. */
  width?: number;
  /** Render the back instead of the face. */
  hidden?: boolean;
  selected?: boolean;
  /** Dimmed and inert — e.g. a spell you cannot pay for. */
  dimmed?: boolean;
  /** Combat standing. Shown with elevation and a label, never an outline. */
  role?: 'attacker' | 'blocker' | 'target' | null;
  /** Push toward the defending seat while attacking. */
  lunge?: Lunge | null;
  onClick?: () => void;
  onDoubleClick?: () => void;
  className?: string;
  style?: CSSProperties;
  /** Overrides the automatic tapped rotation, for hand and zone lists. */
  ignoreTapped?: boolean;
  title?: string;
  /** Play the "just arrived on the battlefield" entrance. */
  entering?: boolean;
}

/** A card with no art: still a card, not a placeholder. */
function TypographicFace({ card, size }: { card: CardInstance; size: GameCardSize }) {
  const stats = statLine(card);
  const compact = size === 'xs' || size === 'sm';

  return (
    <div
      className="flex h-full w-full flex-col justify-between bg-card p-1.5"
      style={{ borderRadius: CARD_RADIUS }}
    >
      <div className="min-w-0">
        <p className={cn('truncate font-medium text-foreground', NAME_TEXT[size])}>{card.name}</p>
        {!compact && card.manaCost && <ManaCost cost={card.manaCost} size="xs" className="mt-1" />}
      </div>
      {!compact && (
        <p className="truncate text-[9px] leading-tight text-muted-foreground">{card.typeLine}</p>
      )}
      {stats && (
        <p
          className={cn(
            'self-end font-semibold text-foreground',
            compact ? 'text-[9px]' : 'text-xs'
          )}
        >
          {stats}
        </p>
      )}
    </div>
  );
}

export const GameCardView = memo(function GameCardView({
  card,
  size = 'sm',
  width,
  hidden,
  selected,
  dimmed,
  role,
  lunge,
  onClick,
  onDoubleClick,
  className,
  style,
  ignoreTapped,
  title,
  entering,
}: GameCardViewProps) {
  const reduceMotion = useReducedMotion();
  const renderedWidth = width ?? GAME_CARD_WIDTH[size];
  const tapped = !ignoreTapped && card.tapped;
  const interactive = !!onClick;

  const counters = Object.entries(card.counters).filter(([, value]) => value !== 0);
  const damage = card.damage;

  const lift = role === 'attacker' ? -10 : role === 'blocker' ? -5 : selected ? -6 : 0;

  const animate = reduceMotion
    ? { rotate: tapped ? 90 : 0, x: 0, y: 0, scale: 1 }
    : {
        rotate: tapped ? 90 : 0,
        x: lunge?.x ?? 0,
        y: (lunge?.y ?? 0) + lift,
        scale: role === 'attacker' || selected ? 1.05 : 1,
      };

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: renderedWidth, ...style }}>
      {/* The rotation lives on an inner element: a CSS rotate does not change
          the layout box, so tapping a card must not reflow the row around it. */}
      <motion.div
        initial={
          entering && !reduceMotion ? { opacity: 0, scale: 0.68, y: 28, rotate: 0 } : false
        }
        animate={animate}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 320, damping: 26, mass: 0.7 }
        }
        className={cn(
          'relative w-full origin-center',
          dimmed && 'opacity-40 saturate-0',
          role === 'attacker' && 'drop-shadow-[0_10px_18px_rgba(0,0,0,0.65)]',
          selected && 'drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]'
        )}
      >
        {hidden ? (
          <CardBack fill title={title ?? 'Face-down card'} />
        ) : card.imageUrl ? (
          <CardImage
            card={{ name: card.name, image_url: card.imageUrl }}
            fill
            width={renderedWidth}
            onClick={onClick ? () => onClick() : undefined}
            interactive={interactive}
            hideFlip
            title={title ?? card.name}
          />
        ) : (
          <div
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            onClick={onClick}
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
            title={title ?? card.name}
            aria-label={card.name}
            className={cn(
              'block w-full overflow-hidden shadow-md shadow-black/40',
              interactive &&
                'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            style={{ aspectRatio: '488 / 680', borderRadius: CARD_RADIUS }}
          >
            <TypographicFace card={card} size={size} />
          </div>
        )}

        {/* Selection and targeting read as a wash on the card, not an outline. */}
        {(selected || role === 'target') && (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-0',
              role === 'target' ? 'bg-destructive/30' : 'bg-foreground/20'
            )}
            style={{ borderRadius: CARD_RADIUS }}
          />
        )}

        {/* Tapped cards sit in shade — the rotation says "spent", this agrees. */}
        {tapped && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-black/35"
            style={{ borderRadius: CARD_RADIUS }}
          />
        )}

        {onDoubleClick && (
          <span className="absolute inset-0" onDoubleClick={onDoubleClick} aria-hidden="true" />
        )}
      </motion.div>

      {/* Overlays sit outside the rotated element so they stay upright. */}
      {(counters.length > 0 || damage > 0 || card.summoningSick) && (
        <div className="pointer-events-none absolute -bottom-1.5 left-0 right-0 z-10 flex flex-wrap justify-center gap-0.5">
          {counters.map(([key, value]) => (
            <span
              key={key}
              className="rounded-full bg-foreground px-1.5 text-[9px] font-semibold leading-4 text-background shadow-md shadow-black/50"
              title={`${value} ${key} counters`}
            >
              {value > 0 ? `+${value}` : value}
            </span>
          ))}
          {damage > 0 && (
            <span
              className="rounded-full bg-destructive px-1.5 text-[9px] font-semibold leading-4 text-destructive-foreground shadow-md shadow-black/50"
              title={`${damage} damage marked`}
            >
              {damage}
            </span>
          )}
          {card.summoningSick && isCreature(card) && !isLand(card) && (
            <span
              className="rounded-full bg-background/85 px-1.5 text-[9px] font-medium leading-4 text-muted-foreground shadow-md shadow-black/50 backdrop-blur-sm"
              title="Summoning sick"
            >
              zzz
            </span>
          )}
        </div>
      )}

      {(role === 'attacker' || role === 'blocker') && (
        <span
          className={cn(
            'pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full px-1.5 text-[9px] font-semibold leading-4 shadow-md shadow-black/60',
            role === 'attacker'
              ? 'bg-foreground text-background'
              : 'bg-background/90 text-foreground backdrop-blur-sm'
          )}
        >
          {powerOf(card)}/{toughnessOf(card)}
        </span>
      )}
    </div>
  );
});

export default GameCardView;
