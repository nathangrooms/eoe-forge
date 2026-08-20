/**
 * A seat's playmat.
 *
 * This is the single change that turns the play screen from a dashboard into a
 * game: cards stop sitting in bordered boxes and start sitting *on* something.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS NOT MADE OF CARD ART ANY MORE
 * ---------------------------------------------------------------------------
 *
 * Owner: *"Playmats are all dark low quality images"*. That is correct, and the
 * cause is structural rather than a matter of tuning, so no amount of adjusting
 * the filter would have fixed it.
 *
 * Each mat used to be the seat's COMMANDER ART, blown up full bleed and then
 * beaten down until it was atmosphere. Scryfall's `art_crop` is roughly
 * **626 x 457**. The mats it was being stretched across, measured on a real
 * board:
 *
 *   two-seat table, 1920 wide     1912 x 369    3.05x upscale
 *   four-seat quads, 1920 wide     948 x 369    1.51x upscale
 *   two-seat table, 1680 wide     1672 x 358    2.67x upscale
 *
 * There is no filter that puts pixels back. A photograph enlarged three times
 * past its resolution and then darkened is a dark low-quality image, exactly as
 * reported, and it is *worse* on the widest screens, which is the opposite of
 * what anyone expects.
 *
 * The second reason is a licence. Scryfall's image guidelines say plainly: *"Do
 * not blur, sharpen, desaturate, or color-shift card images."* The mat was
 * applying `saturate(0.26) brightness(0.4) contrast(1.06)` — desaturating and
 * colour-shifting, in as many words. This project has already removed one
 * blurred-art pattern for that reason; `src/lib/cards/identityGround.ts` is
 * that removal, and it records the reasoning. Higher-resolution art would make
 * the licence problem worse rather than better, which is why "just fetch the
 * `large` crop" is not the answer either.
 *
 * ---------------------------------------------------------------------------
 * WHAT REPLACED IT
 * ---------------------------------------------------------------------------
 *
 * A playmat is a designed surface, not a photograph of a card. Real ones are
 * printed cloth: a weave you can see, a colour, and the way light falls on a
 * table. All three are things CSS draws at any size, so a procedural mat
 * **cannot be low resolution** — there is no source image to run out of.
 *
 * The surface is built in layers, and every one of them is a `background-image`
 * on a single element. No filters, no blurs, no extra compositing layers: this
 * board can hold 120 permanents and the budget is measured in microseconds.
 *
 *   1. **Charcoal ground.** The interface is monochrome; so is the table.
 *   2. **Colour identity.** From `identityGround`, which is our own derived
 *      data rather than Wizards' artwork, so a Simic seat reads blue-green and
 *      a mono-red seat reads red. This is the thing the art was really there to
 *      do — tell four seats apart at a glance — and it does it better, because
 *      a commander's illustration is not reliably its own colours.
 *   3. **Weave.** Two crossed repeating gradients at a 7px pitch, one light and
 *      one dark, which is a cloth twill rather than the 2px hatch that used to
 *      beat against card edges on a wide screen.
 *   4. **Mottle.** Three large soft radials at very low alpha. Without them a
 *      procedural surface reads as a gradient, which reads as a web page.
 *   5. **Centre glow and edge vignette.** A table is lit from above the middle.
 *      This is what makes the mat sit *under* the cards rather than behind them.
 *   6. **A bound edge**, as an inset ring, the way a printed mat is stitched.
 *
 * ---------------------------------------------------------------------------
 * THE ONE BITMAP THAT IS ALLOWED: THE PLAYER'S OWN
 * ---------------------------------------------------------------------------
 * Everything above is about CARD ART, and both reasons are specific to it: a
 * 626 px crop cannot fill a 1912 px mat, and Scryfall's guidelines forbid the
 * treatment a readable mat has to apply. Neither reason touches a picture the
 * player owns. So `/play/mats` lets somebody upload one, it is downscaled to
 * 1920 on its longest edge before it is stored, and it lands here as the
 * `image` layer — under the tint and the texture, so the weave still reads
 * across it and the vignette still sits the cards down onto it.
 *
 * It paints the reader's OWN seat, for the same reason the colour does. Four
 * seats wearing one person's photograph is one table, not four players.
 */

import { memo, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { identityGround } from '@/lib/cards/identityGround';
import { matStyleOf, type MatStyleId } from './matStyles';
import { tintColors, usePlaymatPrefs, type MatTintId } from './usePlaymatStyle';

export type MatTone = 'seat' | 'active' | 'viewer' | 'board';

/**
 * How much surface each tone gets.
 *
 * The viewer's own mat is allowed to be a touch brighter — you look at it most
 * and its cards are the ones you read closely — the active seat brighter still,
 * so whose turn it is is legible from across the room, and the board backdrop
 * behind every seat is pushed furthest down of all.
 */
const TONE: Record<
  MatTone,
  { base: string; glow: number; vignette: number; tint: number; weave: number }
> = {
  seat: { base: '0 0% 9.5%', glow: 0.05, vignette: 0.5, tint: 0.16, weave: 1 },
  active: { base: '0 0% 12%', glow: 0.085, vignette: 0.42, tint: 0.24, weave: 1 },
  viewer: { base: '0 0% 11%', glow: 0.07, vignette: 0.46, tint: 0.2, weave: 1 },
  board: { base: '0 0% 6.5%', glow: 0.035, vignette: 0.62, tint: 0, weave: 0.6 },
};

/* The texture and the large-scale mottle both come from the chosen style now.
   See `matStyles.ts`, which also carries the note on why a 7px weave pitch and
   why none of this is a photograph. */

export interface PlaymatProps {
  /**
   * Colour identity of whoever sits here, for the tint.
   *
   * Our own derived data, not card artwork — see `identityGround`. Colourless
   * or absent gives a plain charcoal mat, which is the honest answer.
   */
  colors?: readonly string[] | null;
  tone?: MatTone;
  /** Rendered above the mat, inside the same clipping box. */
  children?: ReactNode;
  className?: string;
  /** Corner radius class for the whole surface. */
  rounded?: string;
  /**
   * Override the reader's chosen surface. Leave unset in the game, where every
   * mat should follow one choice; pass it in a picker to draw a preview.
   */
  style?: MatStyleId;
  /** Same, for the colour. Only a picker should pass this. */
  tintOverride?: MatTintId;
  /**
   * Whether this is the reader's OWN seat.
   *
   * A chosen colour applies here and nowhere else. Letting it repaint every mat
   * would make a four-seat table four identical rectangles and destroy the one
   * job the tint has, which is telling seats apart at a glance. Owner: "it
   * loads the same colour playmat for bot enemy, it should load their colour
   * scheme maybe (of commander)". So opponents always follow their own
   * commander, whatever you picked for yourself.
   */
  ownSeat?: boolean;
  /**
   * An uploaded mat to paint, overriding the reader's own.
   *
   * `undefined` means follow the reader's choice, which applies to their own
   * seat only. `null` means deliberately none, which is what the surface
   * previews in the picker want: they are showing you Cloth and Felt, not your
   * photograph with Cloth and Felt written under it.
   */
  image?: string | null;
}

/**
 * A picture is safe to put in `url()` only once it holds none of the characters
 * that could end the function early. Signed storage links never do. Anything
 * that does is not painted at all, because a mat is not worth an injected
 * declaration.
 */
function urlLayer(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/["'()\\\s]/.test(url)) return null;
  return `url("${url}")`;
}

export const Playmat = memo(function Playmat({
  colors,
  tone = 'seat',
  children,
  className,
  rounded = 'rounded-2xl',
  style,
  tintOverride,
  ownSeat = false,
  image,
}: PlaymatProps) {
  const prefs = usePlaymatPrefs();
  const mat = matStyleOf(style ?? prefs.style);
  const settings = TONE[tone];
  /* `deck` follows the seat, which is what tells four players apart. A named
     colour overrides it for the reader's own mat only; every other seat keeps
     its commander's colours so the table stays readable. A picker passing
     `tintOverride` is always drawing the reader's own surface. */
  const chosenTint = tintOverride ?? (ownSeat ? prefs.tint : 'deck');

  /* An uploaded mat follows the same rule as the tint, and for the same
     reason: it is YOUR mat, at YOUR seat. Painting it behind all four would
     make one table out of four players and lose the thing seats are told apart
     by. When online play maps a seat to the person sitting in it, that seat
     passes its own owner's mat in through `image`. */
  const uploaded = image !== undefined ? image : ownSeat ? prefs.matUrl : null;
  const picture = urlLayer(uploaded);

  const painted = tintColors(chosenTint, colors);
  /* A photograph is already the seat's identity, and dyeing it red is not what
     anybody means by choosing a picture. So the colour wash is dropped while
     an uploaded mat is live; the texture and the table light stay, because
     those are what sit the cards down onto it. */
  const tint =
    settings.tint > 0 && !picture
      ? identityGround(painted, { alpha: settings.tint, angle: 155 })
      : null;

  /* One element, one `background-image`, painted front to back in CSS order.
     The browser composites this as a single layer, so a four-seat board is four
     gradient stacks rather than sixteen absolutely-positioned divs. */
  const layers = [
    /* Light on the middle of the table, and the fall-off at its edges. */
    `radial-gradient(120% 100% at 50% 38%, hsl(0 0% 100% / ${settings.glow}) 0%, transparent 46%)`,
    `radial-gradient(125% 110% at 50% 45%, transparent 38%, hsl(0 0% 2% / ${settings.vignette}) 100%)`,
    ...mat.texture(settings.weave),
    ...mat.mottle,
    /* The tint sits under the texture, so the weave reads on top of it — the
       way a dye sits in cloth rather than on it. */
    ...(tint ? [tint] : []),
    /* Real artwork goes under the tint and the texture so the weave still
       reads across it. Either a style carrying its own (unset on every
       built-in one; see the licensing note in `matStyles.ts`) or the reader's
       own upload. */
    ...(mat.image ? [mat.image] : []),
    ...(picture ? [picture] : []),
  ];

  const surface: CSSProperties = {
    backgroundColor: `hsl(${settings.base})`,
    backgroundImage: layers.join(','),
  };

  /* Sizing is only emitted when there is a real picture to size. A gradient
     has no intrinsic dimensions, so `auto` and `cover` mean the same thing for
     every other layer, and leaving the property off entirely keeps the
     gradient-only case byte-for-byte what it was.

     `cover` is what makes any shape of picture work: a mat box is anywhere
     from 948x369 to 1912x369, no photograph is that shape, and the choice is
     between cropping it and squashing it. */
  if (picture) {
    surface.backgroundSize = layers.map(layer => (layer === picture ? 'cover' : 'auto')).join(',');
    surface.backgroundPosition = layers.map(layer => (layer === picture ? 'center' : '0 0')).join(',');
    surface.backgroundRepeat = layers.map(layer => (layer === picture ? 'no-repeat' : 'repeat')).join(',');
  }

  return (
    <div className={cn('relative overflow-hidden', rounded, className)} style={surface}>
      {/* The bound edge. An inset ring rather than a border, because a border
          changes the box, and the spec is explicit that zones are separated by
          surface and spacing and never by a line. */}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.05),inset_0_0_0_1px_hsl(0_0%_0%/0.35)]',
          rounded
        )}
      />
      {children}
    </div>
  );
});

export default Playmat;
