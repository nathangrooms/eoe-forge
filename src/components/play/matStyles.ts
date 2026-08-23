/**
 * Playmat surfaces you can choose between.
 *
 * Owner: *"thought we was gonna use awesome artwork and let yourself pick a
 * playmat style?"* The picking half was simply missing. This is it.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE ARE DRAWN AND NOT PHOTOGRAPHED
 * ---------------------------------------------------------------------------
 *
 * See the long note at the top of `Playmat.tsx`. Two walls, and neither moves
 * by trying harder: Scryfall's `art_crop` is 626 x 457 against mats measured at
 * 948 to 1912 wide, so card art is upscaled 1.5x to 3x and looks worst on the
 * biggest screens; and Scryfall's guidelines say "Do not blur, sharpen,
 * desaturate, or color-shift card images", which is precisely what a readable
 * mat has to do to art before cards can sit on it.
 *
 * Everything here is CSS gradients and inline SVG, so it is sharp at any size,
 * weighs nothing, downloads nothing, and carries no licence at all.
 *
 * ---------------------------------------------------------------------------
 * "THE MAT IS A FLAT COLOUR", AND WHY THAT WAS TRUE
 * ---------------------------------------------------------------------------
 *
 * Owner, on a screenshot of a real game: *"THE MAT IS A FLAT COLOUR. A large
 * dark red field with no art, no texture and no seat identity."*
 *
 * The first thing to say is that the playmat system WAS reaching that screen,
 * and that was measured rather than assumed: eight background layers on the
 * seat, the per-seat tint working, a mono-red seat sampling mean RGB
 * 52.7/40.6/41.0 against a red-green seat's 69.6/68.8/63.1. Nothing was broken
 * or unwired, and there is no missing feature to reconnect.
 *
 * The rest of the sentence was true, and it is measurable too. Sampling a
 * 120 x 80 patch of bare mat off a real screenshot on 23 Aug 2026, two seats,
 * 14 permanents a seat:
 *
 *     1920 x 1080    mean luminance 38.69, standard deviation 6.56  (2.6% of 255)
 *     1280 x 800     mean luminance 41.04, standard deviation 3.43  (1.3%)
 *
 * A weave you cannot measure is a weave nobody can see. And `image` — the layer
 * this file has always had for real artwork — was unset on all six styles, so
 * "no art" was not a fault either. It was the literal specification.
 *
 * ---------------------------------------------------------------------------
 * WHAT CHANGED
 * ---------------------------------------------------------------------------
 *
 * 1. **The weave is a drawn tile rather than two crossed gradients.** Real
 *    twill is short broken threads, not continuous rules, and a repeating
 *    linear gradient can only make continuous rules — which is why raising its
 *    alpha would have made stripes rather than cloth. The tile is SVG, so it
 *    repeats at a fixed pitch and is sharp at any size, exactly as the
 *    gradients were.
 *
 * 2. **Every style carries real artwork now.** `art` is a printed plate: an
 *    emblem in the middle and a bound edge, which are the two things a printed
 *    playmat actually has. It is monochrome, so the seat's own colour dyes it
 *    rather than fighting it, and it is drawn at a few percent alpha, so a
 *    board of 120 permanents still sits on top of it and reads.
 *
 *    NOT card art, and for the same two reasons as ever: resolution, and a
 *    licence that forbids the treatment a mat has to apply. Both of those are
 *    about photographs of somebody else's illustration. Neither says anything
 *    about a shape we drew ourselves.
 *
 * 3. **The emblem is round and sized to the mat's HEIGHT**, never stretched. A
 *    seat mat runs from about 5:1 down to 2.5:1, and the one thing that makes
 *    drawn artwork look cheap is an oval that should have been a circle.
 */

/**
 * One `background-image` and the three properties that place it.
 *
 * The mat used to be a bare list of layer strings, and `Playmat` emitted sizing
 * only for the reader's uploaded picture — correctly, because a gradient has no
 * intrinsic size and `auto` and `cover` mean the same thing for one. That stops
 * being true the moment a layer is a drawn plate that must not be stretched, so
 * a layer now carries its own placement and `Playmat` reads it off.
 */
export interface MatLayer {
  image: string;
  /** `background-size`. Defaults to `auto`, which is right for a gradient. */
  size?: string;
  /** `background-position`. Defaults to `0 0`. */
  position?: string;
  /** `background-repeat`. Defaults to `repeat`. */
  repeat?: string;
}

/** A gradient layer: no intrinsic size, tiles by default. */
const g = (image: string): MatLayer => ({ image });

/**
 * An SVG, as a `url()` a stylesheet can hold.
 *
 * Percent-encoded rather than base64: it stays readable in devtools and it is
 * shorter. The two parentheses are encoded by hand because `encodeURIComponent`
 * leaves them alone and a bare `)` would close the `url(` early, which is the
 * one way a data URI turns into a broken declaration.
 */
function svgUrl(markup: string): string {
  const body = markup.replace(/\s+/g, ' ').trim();
  return `url("data:image/svg+xml,${encodeURIComponent(body)
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')}")`;
}

/* -------------------------------------------------------------------------- */
/* The weave                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The GRAIN of a material: fractal noise, dark and light, in one tile.
 *
 * This is the layer that decides whether a surface reads as a material or as a
 * fill, and it is the one that was missing. A first attempt drew literal
 * threads as short strokes in a 16px tile and painted it at a 9px pitch; the
 * downscale turned every 2px stroke into a 1.1px antialiased smear and the
 * measured amplitude went DOWN, from 6.56 to 5.08. A thread you have to draw
 * thinner than a pixel is not a thread.
 *
 * `feTurbulence` has no such problem: it is evaluated at the device's own
 * resolution, so the grain is per-pixel however large the tile is drawn, and
 * `stitchTiles` makes it repeat without a seam.
 *
 * It is deliberately NEUTRAL in mean. The noise is centred on 0.5, and the two
 * rects split it: the black one takes alpha `R - 0.5`, so it darkens only the
 * half of the field above the midpoint, and the white one takes `0.5 - R`
 * scaled, so it lightens only the half below. A single grey rect would have
 * been simpler and would have lifted a 45-level mat toward mid grey, which is
 * how "add some texture" turns a dark table into a pale one.
 *
 * @param pitch    Tile size in px. Larger repeats less obviously; the noise
 *                 itself is not scaled by it, only the repeat period is.
 * @param freq     `baseFrequency`: how fine the grain is.
 * @param dark     Peak alpha of the dark speckle.
 * @param light    Peak alpha of the light speckle.
 */
function grain(pitch: number, freq: number, dark: number, light: number): MatLayer {
  const markup = `
    <svg xmlns='http://www.w3.org/2000/svg' width='${pitch}' height='${pitch}'>
      <filter id='g' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>
        <feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' stitchTiles='stitch'/>
        <feColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${dark} 0 0 0 ${(
          -dark * 0.5
        ).toFixed(3)}'/>
      </filter>
      <filter id='l' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>
        <feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' stitchTiles='stitch'/>
        <feColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 ${(-light).toFixed(
          3
        )} 0 0 0 ${(light * 0.5).toFixed(3)}'/>
      </filter>
      <rect width='${pitch}' height='${pitch}' filter='url(#g)'/>
      <rect width='${pitch}' height='${pitch}' filter='url(#l)'/>
    </svg>`;
  return { image: svgUrl(markup), size: `${pitch}px ${pitch}px`, repeat: 'repeat' };
}

/**
 * A twill: the grain of the cloth, and the diagonal the threads run in.
 *
 * The direction stays a pair of crossed gradients, which is what a gradient is
 * genuinely good at — a continuous rule at an exact angle and an exact pitch,
 * sharp at any size. What it was never able to do is the grain, and that is now
 * the layer above it.
 */
const clothTexture = (s: number): MatLayer[] => [
  grain(160, 0.9, +(1.05 * s).toFixed(3), +(0.72 * s).toFixed(3)),
  g(`repeating-linear-gradient(45deg, hsl(0 0% 100% / ${0.03 * s}) 0 1px, transparent 1px 7px)`),
  g(`repeating-linear-gradient(-45deg, hsl(0 0% 0% / ${0.2 * s}) 0 2px, transparent 2px 7px)`),
];

/**
 * Felt has no direction. A fine tile and two grids slightly out of step with
 * each other read as fibre rather than as a pattern, which one grid never does.
 */
const feltTexture = (s: number): MatLayer[] => [
  /* Finer and softer than cloth: a higher base frequency is a shorter fibre,
     and felt is short fibre pressed flat. */
  grain(140, 1.5, +(0.85 * s).toFixed(3), +(0.58 * s).toFixed(3)),
  g(`repeating-linear-gradient(0deg, hsl(0 0% 100% / ${0.02 * s}) 0 1px, transparent 1px 3px)`),
  g(`repeating-linear-gradient(90deg, hsl(0 0% 0% / ${0.07 * s}) 0 1px, transparent 1px 4px)`),
];

/**
 * Leather is irregular at a scale you can see. A large hand-drawn grain tile
 * and wide soft radials at odd positions, so nothing lines up with anything.
 */
const leatherTexture = (s: number): MatLayer[] => [
  /* Coarse and low: hide is a large irregular grain, not a fine one. */
  grain(200, 0.42, +(1.1 * s).toFixed(3), +(0.66 * s).toFixed(3)),
  {
    image: svgUrl(`
      <svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>
        <g fill='none' stroke='#000' stroke-opacity='${(0.26 * s).toFixed(3)}' stroke-width='1.1'>
          <path d='M4 22c18 9 30-6 48 2s28 14 46 6'/>
          <path d='M-4 56c22-11 34 8 54 1s30-12 48-3'/>
          <path d='M2 88c20 7 28-8 47-2s30 13 49 4'/>
          <path d='M18 4c6 20-8 30 1 48s10 30 2 46'/>
          <path d='M62 -2c7 18-6 28 2 46s9 32 1 48'/>
          <path d='M98 2c5 21-9 29 0 47s11 31 3 47'/>
        </g>
        <g fill='none' stroke='#fff' stroke-opacity='${(0.05 * s).toFixed(3)}' stroke-width='0.8'>
          <path d='M4 24c18 9 30-6 48 2s28 14 46 6'/>
          <path d='M20 4c6 20-8 30 1 48s10 30 2 46'/>
        </g>
      </svg>`),
    size: '74px 74px',
  },
  g(`radial-gradient(28% 44% at 22% 34%, hsl(0 0% 0% / ${0.14 * s}), transparent 70%)`),
  g(`radial-gradient(34% 30% at 72% 62%, hsl(0 0% 0% / ${0.12 * s}), transparent 72%)`),
  g(`radial-gradient(22% 38% at 46% 78%, hsl(0 0% 100% / ${0.03 * s}), transparent 70%)`),
];

/** Stone: matte, cool, and coarse enough to sit quietly under a busy board. */
const slateTexture = (s: number): MatLayer[] => [
  /* Stone is grain all the way down: the finest of the six, and the one with
     no direction to it at all. */
  grain(150, 1.9, +(0.98 * s).toFixed(3), +(0.66 * s).toFixed(3)),
  {
    image: svgUrl(`
      <svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'>
        <g stroke-linecap='round'>
          <path d='M2 9h13M22 4h19M46 12h12M6 25h21M33 21h9M48 28h9M3 41h11M19 45h17M42 38h15M8 55h18M31 52h10M46 57h11'
            stroke='#000' stroke-opacity='${(0.24 * s).toFixed(3)}' stroke-width='1.4'/>
          <path d='M4 11h11M24 6h16M6 27h18M35 23h7M5 43h9M21 47h13M10 57h15'
            stroke='#fff' stroke-opacity='${(0.045 * s).toFixed(3)}' stroke-width='0.9'/>
        </g>
      </svg>`),
    size: '48px 48px',
  },
  g(`repeating-linear-gradient(102deg, hsl(210 12% 100% / ${0.03 * s}) 0 2px, transparent 2px 11px)`),
];

/** A tight technical weave. The one that does not pretend to be a material. */
const carbonTexture = (s: number): MatLayer[] => [
  /* The lightest grain of the six. Carbon is the one surface that is meant to
     read as manufactured rather than as a material. */
  grain(120, 1.2, +(0.6 * s).toFixed(3), +(0.4 * s).toFixed(3)),
  {
    image: svgUrl(`
      <svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'>
        <rect width='8' height='8' fill='#fff' fill-opacity='${(0.05 * s).toFixed(3)}'/>
        <rect x='8' y='8' width='8' height='8' fill='#fff' fill-opacity='${(0.05 * s).toFixed(3)}'/>
        <g stroke='#000' stroke-opacity='${(0.3 * s).toFixed(3)}' stroke-width='1'>
          <path d='M0 0l8 8M8 8l8 8M8 0l-8 8M16 8l-8 8'/>
        </g>
      </svg>`),
    size: '11px 11px',
  },
  g(`repeating-linear-gradient(90deg, hsl(0 0% 0% / ${0.12 * s}) 0 3px, transparent 3px 9px)`),
];

const SOFT_MOTTLE: readonly MatLayer[] = [
  g('radial-gradient(70% 120% at 18% 8%, hsl(0 0% 100% / 0.035), transparent 60%)'),
  g('radial-gradient(90% 140% at 88% 92%, hsl(0 0% 0% / 0.16), transparent 62%)'),
  g('radial-gradient(50% 90% at 68% 22%, hsl(0 0% 100% / 0.02), transparent 70%)'),
];

const WIDE_MOTTLE: readonly MatLayer[] = [
  g('radial-gradient(90% 150% at 12% 18%, hsl(0 0% 100% / 0.045), transparent 62%)'),
  g('radial-gradient(110% 160% at 92% 84%, hsl(0 0% 0% / 0.2), transparent 60%)'),
];

const COOL_MOTTLE: readonly MatLayer[] = [
  g('radial-gradient(80% 130% at 26% 12%, hsl(210 20% 100% / 0.03), transparent 62%)'),
  g('radial-gradient(100% 150% at 84% 88%, hsl(210 18% 0% / 0.19), transparent 60%)'),
  g('radial-gradient(46% 80% at 60% 40%, hsl(210 22% 100% / 0.016), transparent 72%)'),
];

/* -------------------------------------------------------------------------- */
/* The printed plate: what makes it a playmat and not a rectangle             */
/* -------------------------------------------------------------------------- */

/**
 * The emblem in the middle of the mat, sized to the mat's HEIGHT.
 *
 * `background-size: auto 84%`, centred, no repeat, so a 1904 x 369 table and a
 * 628 x 264 quadrant both get a circle rather than an oval, and neither of them
 * gets a mark bigger than the mat it is printed on.
 *
 * The alpha ceiling is the whole design constraint here. This sits UNDER the
 * seat's colour and under the weave, and there are up to 120 cards on top of
 * it; a mark you notice while you are counting blockers is a mark that has
 * failed. Every one of these tops out in the low single figures of a percent.
 */
function emblem(markup: string): MatLayer {
  return {
    image: svgUrl(
      `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'>${markup}</svg>`
    ),
    size: 'auto 84%',
    position: 'center',
    repeat: 'no-repeat',
  };
}

/**
 * The bound edge of a printed mat, as a plate rather than as a ring.
 *
 * Full bleed and stretched, which is safe because it is nothing but inset
 * rules: a rectangle scaled non-uniformly is still a rectangle. Anything with a
 * corner ornament would have to be its own layer, and a fourth layer per mat is
 * not worth a flourish nobody will look at.
 */
const boundEdge = (light: number, dark: number): MatLayer => ({
  image: svgUrl(`
    <svg xmlns='http://www.w3.org/2000/svg' width='400' height='200' viewBox='0 0 400 200' preserveAspectRatio='none'>
      <rect x='5' y='5' width='390' height='190' rx='6' fill='none' stroke='#fff' stroke-opacity='${light}' stroke-width='1.5'/>
      <rect x='9' y='9' width='382' height='182' rx='4' fill='none' stroke='#000' stroke-opacity='${dark}' stroke-width='1'/>
    </svg>`),
  size: '100% 100%',
  position: 'center',
  repeat: 'no-repeat',
});

/** Twelve points off two rings: the plainest of the six, and the default. */
const CLOTH_EMBLEM = `
  <g fill='none' stroke='#fff' stroke-opacity='0.075'>
    <circle cx='200' cy='200' r='150' stroke-width='2.5'/>
    <circle cx='200' cy='200' r='118' stroke-width='1.2'/>
    <circle cx='200' cy='200' r='54' stroke-width='1.6'/>
    <path d='M200 26v58M200 316v58M26 200h58M316 200h58' stroke-width='2'/>
    <path d='M77 77l41 41M323 77l-41 41M77 323l41-41M323 323l-41-41' stroke-width='1.2'/>
  </g>
  <g fill='#fff' fill-opacity='0.038'>
    <path d='M200 60l30 110 110 30-110 30-30 110-30-110-110-30 110-30z'/>
  </g>`;

/** A rosette: twelve petals, the softest of the six. */
const FELT_EMBLEM = `
  <g fill='none' stroke='#fff' stroke-opacity='0.062' stroke-width='1.6'>
    <circle cx='200' cy='200' r='152'/>
    <circle cx='200' cy='200' r='92'/>
    ${Array.from({ length: 12 }, (_, i) => {
      const a = (i * Math.PI) / 6;
      return `<circle cx='${(200 + Math.cos(a) * 122).toFixed(1)}' cy='${(
        200 +
        Math.sin(a) * 122
      ).toFixed(1)}' r='34'/>`;
    }).join('')}
  </g>`;

/** Tooled scrollwork, the way a leather mat is stamped. */
const LEATHER_EMBLEM = `
  <g fill='none' stroke='#fff' stroke-opacity='0.07' stroke-width='2.2' stroke-linecap='round'>
    <circle cx='200' cy='200' r='148'/>
    <path d='M200 66c-46 26-46 68 0 94s46 68 0 94'/>
    <path d='M200 66c46 26 46 68 0 94s-46 68 0 94'/>
    <path d='M66 200c26-46 68-46 94 0s68 46 94 0'/>
    <path d='M66 200c26 46 68 46 94 0s68-46 94 0'/>
  </g>
  <g fill='none' stroke='#000' stroke-opacity='0.07' stroke-width='1.2'>
    <circle cx='200' cy='200' r='156'/>
  </g>`;

/** A carved ring, twenty-four ticks and a hexagon inside it. */
const SLATE_EMBLEM = `
  <g fill='none' stroke='#fff' stroke-opacity='0.07'>
    <circle cx='200' cy='200' r='150' stroke-width='2'/>
    <circle cx='200' cy='200' r='134' stroke-width='1'/>
    <path d='M200 62l119.5 69v138L200 338 80.5 269V131z' stroke-width='1.6'/>
    ${Array.from({ length: 24 }, (_, i) => {
      const a = (i * Math.PI) / 12;
      return `<path d='M${(200 + Math.cos(a) * 136).toFixed(1)} ${(
        200 +
        Math.sin(a) * 136
      ).toFixed(1)}L${(200 + Math.cos(a) * 148).toFixed(1)} ${(200 + Math.sin(a) * 148).toFixed(
        1
      )}' stroke-width='2'/>`;
    }).join('')}
  </g>`;

/** A hex lattice. The one that does not pretend to be a material. */
const CARBON_EMBLEM = `
  <g fill='none' stroke='#fff' stroke-opacity='0.07' stroke-width='1.6'>
    <path d='M200 54l126.5 73v146L200 346 73.5 273V127z'/>
    <path d='M200 106l81.5 47v94L200 294l-81.5-47v-94z'/>
    <path d='M200 158l36.5 21v42L200 242l-36.5-21v-42z'/>
    <path d='M200 54v52M326.5 127l-45 26M326.5 273l-45-26M200 346v-52M73.5 273l45-26M73.5 127l45 26'/>
  </g>`;

export interface MatStyle {
  id: MatStyleId;
  name: string;
  /** One line, shown under the name in the picker. */
  note: string;
  /**
   * Texture layers, front to back, at a given strength. Strength is how much
   * surface the tone allows: the board backdrop asks for less than a seat.
   */
  texture: (strength: number) => MatLayer[];
  /** Large-scale variation, so a surface reads as material rather than a fill. */
  mottle: readonly MatLayer[];
  /**
   * The printed plate: the emblem in the middle, and the bound edge.
   *
   * Drawn by us, so there is no licence and no resolution to run out of. It is
   * composited above the ground and below the tint and the weave, so the seat's
   * colour dyes it and the cloth reads across it, which is how a printed mat is
   * actually made.
   */
  art?: (strength: number) => MatLayer[];
  /**
   * A `background-image` layer for a photograph. Still unset on every built-in
   * style, and still where a commissioned illustration would go. `art` above is
   * the drawn plate and is not the same thing.
   */
  image?: string;
}

export type MatStyleId = 'cloth' | 'felt' | 'leather' | 'slate' | 'carbon' | 'plain';

/**
 * The plate for one style.
 *
 * `strength` is the tone's own weave allowance, so the board backdrop behind
 * the seats gets a fainter plate than a seat does, and the mats stay the things
 * you look at.
 */
const plate =
  (mark: string, edgeLight: number, edgeDark: number) =>
  (s: number): MatLayer[] =>
    s <= 0 ? [] : [emblem(mark), boundEdge(+(edgeLight * s).toFixed(3), +(edgeDark * s).toFixed(3))];

export const MAT_STYLES: Record<MatStyleId, MatStyle> = {
  cloth: {
    id: 'cloth',
    name: 'Cloth',
    note: 'Woven twill, the way a printed mat is made.',
    texture: clothTexture,
    mottle: SOFT_MOTTLE,
    art: plate(CLOTH_EMBLEM, 0.07, 0.3),
  },
  felt: {
    id: 'felt',
    name: 'Felt',
    note: 'Soft and directionless. The quietest under a busy board.',
    texture: feltTexture,
    mottle: SOFT_MOTTLE,
    art: plate(FELT_EMBLEM, 0.05, 0.26),
  },
  leather: {
    id: 'leather',
    name: 'Leather',
    note: 'Irregular grain that never repeats.',
    texture: leatherTexture,
    mottle: WIDE_MOTTLE,
    art: plate(LEATHER_EMBLEM, 0.08, 0.34),
  },
  slate: {
    id: 'slate',
    name: 'Slate',
    note: 'Cool stone, matte, no shine.',
    texture: slateTexture,
    mottle: COOL_MOTTLE,
    art: plate(SLATE_EMBLEM, 0.06, 0.3),
  },
  carbon: {
    id: 'carbon',
    name: 'Carbon',
    note: 'Tight technical weave.',
    texture: carbonTexture,
    mottle: SOFT_MOTTLE,
    art: plate(CARBON_EMBLEM, 0.06, 0.32),
  },
  plain: {
    id: 'plain',
    name: 'Plain',
    /* No weave and no plate: the one surface that is only the table and its
       light. It is the honest answer for somebody who wants nothing behind
       their cards, and it is the control the other five are judged against. */
    note: 'No texture at all. Just the table and its light.',
    texture: () => [],
    mottle: SOFT_MOTTLE,
  },
};

export const MAT_STYLE_IDS = Object.keys(MAT_STYLES) as MatStyleId[];

export const DEFAULT_MAT_STYLE: MatStyleId = 'cloth';

/** A stored value from an older build, or a hand-edited one, must not break the board. */
export function matStyleOf(id: string | null | undefined): MatStyle {
  return MAT_STYLES[(id ?? '') as MatStyleId] ?? MAT_STYLES[DEFAULT_MAT_STYLE];
}
