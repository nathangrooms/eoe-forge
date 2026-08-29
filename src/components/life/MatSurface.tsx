/**
 * DeckMatrix — life counter: a colour mat, drawn.
 *
 * Three stacked layers and nothing else:
 *
 *   black floor → card art (if any) → the colour, weave, pool and vignette
 *
 * The colour goes *over* the art rather than under it. Card art is full of hues
 * that have nothing to do with the seat — a green mat backed by Craterhoof's
 * orange sky would read as orange — so washing the colour across the top is what
 * makes five different illustrations read as five consistent mats. It also means
 * the vignette and the centre pool fall on the art too, which is what keeps the
 * life total on top of it legible.
 *
 * Every layer is inert. A mat is scenery on a surface whose whole job is taking
 * taps, so it must never intercept one.
 */

import { memo } from 'react';

import { cn } from '@/lib/utils';

import {
  matArtScrimStyle,
  matArtStyle,
  matSurfaceStyle,
  type MatColor,
  type MatTone,
} from './mats';

export interface MatSurfaceProps {
  color: MatColor;
  /** `art_crop` resolved from the `cards` table. Absent is a normal state. */
  art?: string | null;
  tone?: MatTone;
  className?: string;
  /** Rounding for the mat itself, so it can sit inside a rounded panel. */
  radius?: string;
}

function MatSurfaceImpl({ color, art, tone = 'seat', className, radius }: MatSurfaceProps) {
  const artLayer = matArtStyle(art, tone);

  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      style={{ backgroundColor: 'hsl(0 0% 0%)', borderRadius: radius }}
    >
      {artLayer && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              ...artLayer,
              // A shade oversized so the art's own edges never land inside the mat.
              transform: 'scale(1.06)',
            }}
          />
          {/* The art is pushed down by a layer OVER it, never by a filter ON it.
              Scryfall's guidelines forbid desaturating or colour-shifting a card
              image, and a `filter` is both. */}
          <div className="absolute inset-0" style={matArtScrimStyle(tone)} />
        </>
      )}
      <div className="absolute inset-0" style={matSurfaceStyle(color, tone)} />
    </div>
  );
}

/**
 * Memoised: on the board this renders once per seat and then sits still through
 * every single tap, and its style objects are rebuilt from scratch each call.
 */
export const MatSurface = memo(MatSurfaceImpl);
