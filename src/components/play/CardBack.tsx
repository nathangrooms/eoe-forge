/**
 * The back of a Magic card — drawn, not fetched.
 *
 * A face-down card is one of the most common objects on a table: every library,
 * every opponent's hand, every morph. Hotlinking somebody's scan of a card back
 * would put a third-party request (and a broken image, the day it moves) into
 * the middle of the board, so this is pure SVG: a dark ground, the concentric
 * ovals a Magic player recognises from across a room, and an inset frame drawn
 * *inside the artwork* rather than as a CSS hairline.
 *
 * Everything is proportional to the viewBox, so one component serves a 40 px
 * library stack and a 200 px face-down permanent without a second asset.
 */

import { memo, useId, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { CARD_ASPECT } from '@/components/cards/CardImage';

/** Matches the radius `CardImage` gives a real card, so a stack lines up. */
export const CARD_RADIUS = '4.75% / 3.4%';

export interface CardBackProps {
  /** Rendered width in px. Ignored when `fill` is set. */
  width?: number;
  /** Stretch to the parent's width instead of taking a fixed one. */
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

/**
 * One card back. The oval stack is the recognisable part; the rest is depth —
 * a radial ground so the centre lifts, and two inset frames so the card reads
 * as an object with thickness rather than a flat swatch.
 */
export const CardBack = memo(function CardBack({
  width,
  fill = false,
  className,
  style,
  title,
}: CardBackProps) {
  const uid = useId().replace(/:/g, '');
  const ground = `cb-ground-${uid}`;
  const oval = `cb-oval-${uid}`;
  const sheen = `cb-sheen-${uid}`;

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-[hsl(20_10%_6%)] shadow-md shadow-black/50',
        fill ? 'w-full' : 'shrink-0',
        className
      )}
      style={{
        aspectRatio: CARD_ASPECT,
        borderRadius: CARD_RADIUS,
        ...(fill ? {} : { width }),
        ...style,
      }}
      title={title}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      <svg
        viewBox="0 0 100 140"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        focusable="false"
      >
        <defs>
          <radialGradient id={ground} cx="50%" cy="42%" r="78%">
            <stop offset="0%" stopColor="#3a2f28" />
            <stop offset="55%" stopColor="#221b17" />
            <stop offset="100%" stopColor="#0c0908" />
          </radialGradient>
          <radialGradient id={oval} cx="50%" cy="38%" r="70%">
            <stop offset="0%" stopColor="#6b5847" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#43362c" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#1a1411" stopOpacity="0.1" />
          </radialGradient>
          <linearGradient id={sheen} x1="0%" y1="0%" x2="30%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.09" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.18" />
          </linearGradient>
        </defs>

        {/* Ground */}
        <rect x="0" y="0" width="100" height="140" fill={`url(#${ground})`} />

        {/* Inset frames — drawn art, so they survive the no-hairlines rule. */}
        <rect
          x="4.5"
          y="4.5"
          width="91"
          height="131"
          rx="5"
          fill="none"
          stroke="#8a7358"
          strokeOpacity="0.24"
          strokeWidth="1.6"
        />
        <rect
          x="8.5"
          y="8.5"
          width="83"
          height="123"
          rx="3.5"
          fill="none"
          stroke="#8a7358"
          strokeOpacity="0.12"
          strokeWidth="0.9"
        />

        {/* The concentric ovals. */}
        <ellipse cx="50" cy="70" rx="35" ry="52" fill={`url(#${oval})`} />
        <ellipse
          cx="50"
          cy="70"
          rx="35"
          ry="52"
          fill="none"
          stroke="#c8ab84"
          strokeOpacity="0.22"
          strokeWidth="1.3"
        />
        <ellipse
          cx="50"
          cy="70"
          rx="27.5"
          ry="41"
          fill="none"
          stroke="#c8ab84"
          strokeOpacity="0.16"
          strokeWidth="1"
        />
        <ellipse
          cx="50"
          cy="70"
          rx="19"
          ry="28.5"
          fill="none"
          stroke="#c8ab84"
          strokeOpacity="0.11"
          strokeWidth="0.8"
        />
        <ellipse cx="50" cy="70" rx="10" ry="15" fill="#0d0a08" fillOpacity="0.45" />
        <ellipse
          cx="50"
          cy="70"
          rx="10"
          ry="15"
          fill="none"
          stroke="#c8ab84"
          strokeOpacity="0.2"
          strokeWidth="0.7"
        />

        {/* Corner flourishes, so the frame is not four bare lines. */}
        {[
          [14, 14, 0],
          [86, 14, 90],
          [86, 126, 180],
          [14, 126, 270],
        ].map(([x, y, r]) => (
          <path
            key={`${x}-${y}`}
            d="M 0 0 L 9 0 M 0 0 L 0 9"
            transform={`translate(${x} ${y}) rotate(${r})`}
            stroke="#c8ab84"
            strokeOpacity="0.2"
            strokeWidth="1.1"
            strokeLinecap="round"
            fill="none"
          />
        ))}

        {/* Light falling across the card. */}
        <rect x="0" y="0" width="100" height="140" fill={`url(#${sheen})`} />
      </svg>
    </div>
  );
});

export interface LibraryStackProps {
  /** Cards left in the zone. Zero renders an empty well, not a card. */
  count: number;
  width?: number;
  /** How many backs to actually draw. The rest is implied by the count badge. */
  maxLayers?: number;
  label?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * A library as a physical stack.
 *
 * Depth comes from real offsets — each layer sits a fraction of a card up and
 * left of the one below — because a deck rendered as a single back with a
 * number beside it reads as an icon, and a deck rendered as a stack reads as
 * cards you could pick up.
 */
export function LibraryStack({
  count,
  width = 44,
  maxLayers = 5,
  label = 'Library',
  onClick,
  className,
}: LibraryStackProps) {
  const layers = Math.max(0, Math.min(maxLayers, count));
  const step = Math.max(1.2, width * 0.045);
  const height = width / 0.7176;

  const body = (
    <span className="relative block" style={{ width, height: height + step * maxLayers }}>
      {count === 0 ? (
        <span
          className="absolute left-0 top-0 block bg-black/25 shadow-inner"
          style={{ width, height, borderRadius: CARD_RADIUS }}
        />
      ) : (
        Array.from({ length: layers }).map((_, index) => (
          <CardBack
            key={index}
            width={width}
            className="absolute left-0"
            style={{
              bottom: index * step,
              left: index * (step * 0.35),
              zIndex: index,
            }}
          />
        ))
      )}

      <span
        className="absolute -bottom-1 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background/85 px-1.5 text-[10px] font-semibold leading-4 text-foreground shadow-md shadow-black/50 backdrop-blur-sm tabular-nums"
      >
        {count}
      </span>
    </span>
  );

  if (!onClick) {
    return (
      <span className={cn('inline-block', className)} title={`${label}: ${count}`}>
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label}: ${count}`}
      aria-label={`${label}, ${count} cards`}
      className={cn(
        'inline-block rounded-lg transition-transform duration-200 ease-out',
        'hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        className
      )}
    >
      {body}
    </button>
  );
}

export default CardBack;
