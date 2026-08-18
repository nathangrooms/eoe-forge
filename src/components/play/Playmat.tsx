/**
 * A seat's playmat.
 *
 * This is the single change that turns the play screen from a dashboard into a
 * game: cards stop sitting in bordered boxes and start sitting *on* something.
 * Each seat's mat is that player's commander art, blown up full-bleed and then
 * beaten down — desaturated, darkened, vignetted — until it is atmosphere
 * rather than content. A playmat you can read the cards on is a good playmat;
 * one you can read the *mat* on is a bad one.
 *
 * The art crop is derived, not fetched. Scryfall serves every size of a
 * printing from the same path with the size as the first segment:
 *
 *   https://cards.scryfall.io/normal/front/8/0/<id>.jpg?<ts>
 *   https://cards.scryfall.io/art_crop/front/8/0/<id>.jpg?<ts>
 *
 * so swapping the segment gives the illustration alone — no frame, no name bar,
 * no rules text — which is exactly what a mat wants. If the URL is not a
 * Scryfall path the original image is used as the mat instead; it is heavily
 * blurred and darkened at that point either way.
 *
 * With no commander at all a seat still gets a real surface: a neutral charcoal
 * mat with a woven texture, built from layered CSS gradients. That is mat
 * artwork, not chrome decoration.
 */

import { memo, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Scryfall image size segments that a URL may arrive with. */
const SIZE_SEGMENTS = ['normal', 'large', 'small', 'border_crop', 'png'];

/**
 * The illustration crop for a Scryfall card image URL.
 *
 * Returns `undefined` for a missing URL and the original URL for anything that
 * is not a recognised Scryfall size path — a mat is better with the full card
 * behind it than with nothing.
 */
export function artCropUrl(imageUrl?: string | null): string | undefined {
  if (!imageUrl) return undefined;

  for (const segment of SIZE_SEGMENTS) {
    const marker = `/${segment}/`;
    const at = imageUrl.indexOf(marker);
    if (at === -1) continue;

    let next = `${imageUrl.slice(0, at)}/art_crop/${imageUrl.slice(at + marker.length)}`;
    // `art_crop` is only ever served as JPEG, so a `png` path needs its
    // extension swapped as well or the request 404s.
    if (segment === 'png') next = next.replace(/\.png(\?|$)/, '.jpg$1');
    return next;
  }

  return imageUrl;
}

export type MatTone = 'seat' | 'active' | 'viewer' | 'board';

/**
 * How hard the art is pushed back per surface.
 *
 * The viewer's own mat is allowed to be a touch brighter — you look at it most
 * and its cards are the ones you read closely — and the board backdrop behind
 * every seat is pushed furthest down of all.
 */
const TONE: Record<MatTone, { filter: string; opacity: number; scrim: number }> = {
  seat: { filter: 'saturate(0.26) brightness(0.4) contrast(1.06)', opacity: 1, scrim: 0.48 },
  active: { filter: 'saturate(0.36) brightness(0.48) contrast(1.06)', opacity: 1, scrim: 0.42 },
  viewer: { filter: 'saturate(0.3) brightness(0.42) contrast(1.05)', opacity: 1, scrim: 0.46 },
  board: { filter: 'saturate(0.16) brightness(0.3) contrast(1.1)', opacity: 0.85, scrim: 0.62 },
};

/**
 * The fallback surface: a charcoal weave. Two crossed repeating gradients give
 * the cloth, one radial gives the light falling on the middle of the table.
 */
const WOVEN: CSSProperties = {
  backgroundColor: 'hsl(var(--muted))',
  backgroundImage: [
    'radial-gradient(120% 90% at 50% 0%, hsl(0 0% 100% / 0.05), transparent 65%)',
    'repeating-linear-gradient(45deg, hsl(0 0% 100% / 0.018) 0 2px, transparent 2px 5px)',
    'repeating-linear-gradient(-45deg, hsl(0 0% 0% / 0.16) 0 2px, transparent 2px 5px)',
  ].join(','),
};

export interface PlaymatProps {
  /** Commander art (or any card image) to derive the mat from. */
  art?: string | null;
  /** Skip the crop derivation — pass a URL that is already an illustration. */
  raw?: boolean;
  tone?: MatTone;
  /** Rendered above the mat, inside the same clipping box. */
  children?: ReactNode;
  className?: string;
  /** Corner radius class for the whole surface. */
  rounded?: string;
}

export const Playmat = memo(function Playmat({
  art,
  raw = false,
  tone = 'seat',
  children,
  className,
  rounded = 'rounded-2xl',
}: PlaymatProps) {
  const url = raw ? art ?? undefined : artCropUrl(art);
  const settings = TONE[tone];

  return (
    <div className={cn('relative overflow-hidden bg-muted', rounded, className)}>
      {/* The art itself. A background image rather than an <img>: this is a
          surface, not a card, and CardImage exists for the latter. */}
      {url ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${JSON.stringify(url)})`,
            filter: settings.filter,
            opacity: settings.opacity,
            transform: 'scale(1.06)',
          }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0" style={WOVEN} />
      )}

      {/* Scrim + vignette. Cards have to stay readable on top of this, which is
          the only reason the mat is allowed to exist. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background: [
            `linear-gradient(hsl(0 0% 4% / ${settings.scrim}), hsl(0 0% 4% / ${settings.scrim}))`,
            'radial-gradient(120% 100% at 50% 45%, transparent 30%, hsl(0 0% 3% / 0.62) 100%)',
          ].join(','),
        }}
      />

      {children}
    </div>
  );
});

export default Playmat;
