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
 * Everything here is CSS gradients, so it is sharp at any size, weighs nothing,
 * downloads nothing, and carries no licence at all.
 *
 * ---------------------------------------------------------------------------
 * ADDING REAL ARTWORK LATER
 * ---------------------------------------------------------------------------
 *
 * `image` exists for exactly that and is unset on every style below. Point it
 * at commissioned or permissively licensed illustration — NOT Wizards or
 * Scryfall card art — and it is composited above the ground and below the
 * texture, so the weave still reads on top of it and the vignette still sits
 * the cards down onto it. Nothing else has to change.
 */

export interface MatStyle {
  id: MatStyleId;
  name: string;
  /** One line, shown under the name in the picker. */
  note: string;
  /**
   * Texture layers, front to back, at a given strength. Strength is how much
   * surface the tone allows: the board backdrop asks for less than a seat.
   */
  texture: (strength: number) => string[];
  /** Large-scale variation, so a surface reads as material rather than a fill. */
  mottle: readonly string[];
  /**
   * A `background-image` layer for real artwork. Unset on every built-in style.
   * See the note above before setting one.
   */
  image?: string;
}

export type MatStyleId = 'cloth' | 'felt' | 'leather' | 'slate' | 'carbon' | 'plain';

/** A twill: a bright pass and a heavier dark pass crossing at right angles. */
const clothTexture = (s: number): string[] => [
  `repeating-linear-gradient(45deg, hsl(0 0% 100% / ${0.014 * s}) 0 1px, transparent 1px 7px)`,
  `repeating-linear-gradient(-45deg, hsl(0 0% 0% / ${0.13 * s}) 0 2px, transparent 2px 7px)`,
];

/**
 * Felt has no direction. Two fine grids slightly out of step with each other
 * read as fibre rather than as a pattern, which a single grid never does.
 */
const feltTexture = (s: number): string[] => [
  `repeating-linear-gradient(0deg, hsl(0 0% 100% / ${0.01 * s}) 0 1px, transparent 1px 3px)`,
  `repeating-linear-gradient(90deg, hsl(0 0% 0% / ${0.045 * s}) 0 1px, transparent 1px 4px)`,
];

/**
 * Leather is irregular at a scale you can see. Wide soft radials at odd
 * positions, no repetition, because anything that tiles stops reading as hide.
 */
const leatherTexture = (s: number): string[] => [
  `radial-gradient(28% 44% at 22% 34%, hsl(0 0% 0% / ${0.1 * s}), transparent 70%)`,
  `radial-gradient(34% 30% at 72% 62%, hsl(0 0% 0% / ${0.085 * s}), transparent 72%)`,
  `radial-gradient(22% 38% at 46% 78%, hsl(0 0% 100% / ${0.02 * s}), transparent 70%)`,
  `repeating-linear-gradient(112deg, hsl(0 0% 0% / ${0.03 * s}) 0 1px, transparent 1px 9px)`,
];

/** Stone: matte, cool, and coarse enough to sit quietly under a busy board. */
const slateTexture = (s: number): string[] => [
  `repeating-linear-gradient(102deg, hsl(210 12% 100% / ${0.012 * s}) 0 2px, transparent 2px 11px)`,
  `repeating-linear-gradient(8deg, hsl(210 14% 0% / ${0.07 * s}) 0 1px, transparent 1px 6px)`,
];

/** A tight technical weave. The one that does not pretend to be a material. */
const carbonTexture = (s: number): string[] => [
  `repeating-linear-gradient(45deg, hsl(0 0% 100% / ${0.02 * s}) 0 1px, transparent 1px 4px)`,
  `repeating-linear-gradient(-45deg, hsl(0 0% 100% / ${0.02 * s}) 0 1px, transparent 1px 4px)`,
  `repeating-linear-gradient(90deg, hsl(0 0% 0% / ${0.09 * s}) 0 3px, transparent 3px 8px)`,
];

const SOFT_MOTTLE: readonly string[] = [
  'radial-gradient(70% 120% at 18% 8%, hsl(0 0% 100% / 0.035), transparent 60%)',
  'radial-gradient(90% 140% at 88% 92%, hsl(0 0% 0% / 0.16), transparent 62%)',
  'radial-gradient(50% 90% at 68% 22%, hsl(0 0% 100% / 0.02), transparent 70%)',
];

const WIDE_MOTTLE: readonly string[] = [
  'radial-gradient(90% 150% at 12% 18%, hsl(0 0% 100% / 0.045), transparent 62%)',
  'radial-gradient(110% 160% at 92% 84%, hsl(0 0% 0% / 0.2), transparent 60%)',
];

const COOL_MOTTLE: readonly string[] = [
  'radial-gradient(80% 130% at 26% 12%, hsl(210 20% 100% / 0.03), transparent 62%)',
  'radial-gradient(100% 150% at 84% 88%, hsl(210 18% 0% / 0.19), transparent 60%)',
  'radial-gradient(46% 80% at 60% 40%, hsl(210 22% 100% / 0.016), transparent 72%)',
];

export const MAT_STYLES: Record<MatStyleId, MatStyle> = {
  cloth: {
    id: 'cloth',
    name: 'Cloth',
    note: 'Woven twill, the way a printed mat is made.',
    texture: clothTexture,
    mottle: SOFT_MOTTLE,
  },
  felt: {
    id: 'felt',
    name: 'Felt',
    note: 'Soft and directionless. The quietest under a busy board.',
    texture: feltTexture,
    mottle: SOFT_MOTTLE,
  },
  leather: {
    id: 'leather',
    name: 'Leather',
    note: 'Irregular grain that never repeats.',
    texture: leatherTexture,
    mottle: WIDE_MOTTLE,
  },
  slate: {
    id: 'slate',
    name: 'Slate',
    note: 'Cool stone, matte, no shine.',
    texture: slateTexture,
    mottle: COOL_MOTTLE,
  },
  carbon: {
    id: 'carbon',
    name: 'Carbon',
    note: 'Tight technical weave.',
    texture: carbonTexture,
    mottle: SOFT_MOTTLE,
  },
  plain: {
    id: 'plain',
    name: 'Plain',
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
