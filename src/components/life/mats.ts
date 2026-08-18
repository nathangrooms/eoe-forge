/**
 * DeckMatrix — life counter: the five colour mats.
 *
 * A pod of charcoal rectangles is unreadable at arm's length: everyone's panel
 * looks like everyone else's, and finding your own seat means reading a name
 * upside down. Giving each seat the *mat* of its colour fixes that in one
 * glance, and it is the one place the monochrome rule bends by design — this is
 * MTG colour semantics, exactly what `--mana-*` exists for.
 *
 * A mat is built in two independent halves, and the first one is enough on its
 * own:
 *
 *   1. **The surface.** Layered CSS gradients driven entirely by the mana
 *      tokens — a key light, a bounce off the far corner, a ground sweep, a
 *      woven texture and a vignette. No network, no images, works offline, and
 *      renders identically on the first frame. This is the mat.
 *   2. **The art.** A striking card of that colour, looked up live in the
 *      `cards` table and used through its `art_crop` (see `useMatArt`). It
 *      arrives late, sits *under* the colour layers, and is pushed down hard —
 *      texture and atmosphere, never content. Nothing breaks without it.
 *
 * Legibility is not left to chance. Every colour layer is a translucent wash
 * over black, so its alpha *is* the resulting luminance, and each colour carries
 * a hard `peak` that no layer and no surface tone can push through. On top of
 * that every mat pools darkness under its own middle, which is precisely where
 * the life total is drawn.
 */

import type { CSSProperties } from 'react';

/** The five mats. Colourless is not a seat colour — a seat is always one of these. */
export type MatColor = 'W' | 'U' | 'B' | 'R' | 'G';

export const MAT_COLORS: readonly MatColor[] = ['W', 'U', 'B', 'R', 'G'] as const;

export function isMatColor(value: unknown): value is MatColor {
  return typeof value === 'string' && (MAT_COLORS as readonly string[]).includes(value);
}

/**
 * Seat colours for a fresh pod, in the order they are handed out.
 *
 * Not WUBRG order, and not arbitrary either: the three strongly hued mats go
 * out first, so a two-player game is blue against red rather than two mats that
 * are both nearly neutral. White comes fourth and black last, because those two
 * are the pair most easily confused with each other and with the table itself —
 * a four-player pod therefore defaults to four unmistakable mats, and black is
 * still one tap away for anyone who wants it.
 */
export const DEFAULT_MAT_ORDER: readonly MatColor[] = ['U', 'R', 'G', 'W', 'B'] as const;

/**
 * The next colour not already taken, so growing a pod never hands out a
 * duplicate while a free colour is still on the shelf.
 */
export function nextFreeMat(taken: readonly MatColor[], index = 0): MatColor {
  const free = DEFAULT_MAT_ORDER.filter(color => !taken.includes(color));
  if (free.length > 0) return free[0];
  return DEFAULT_MAT_ORDER[index % DEFAULT_MAT_ORDER.length];
}

/** Distinct colours for a whole pod, seat 0 first. */
export function defaultMats(count: number): MatColor[] {
  return Array.from({ length: count }, (_, i) => DEFAULT_MAT_ORDER[i % DEFAULT_MAT_ORDER.length]);
}

/* -------------------------------------------------------------------------- */
/* Definitions                                                                */
/* -------------------------------------------------------------------------- */

export interface MatDefinition {
  color: MatColor;
  /** Shown under the swatch in setup. */
  label: string;
  /** The flavour of the mat, so a swatch is more than a coloured square. */
  epithet: string;
  /** The `--mana-*` custom property carrying this colour's hue. */
  token: string;
  /**
   * The brightest this colour is ever allowed to get, as an alpha over black.
   *
   * Because every layer is a wash over black, `peak × the token's own lightness`
   * *is* the mat's maximum relative luminance — so this one number decides both
   * how strongly the colour reads and whether a white life total survives on top
   * of it. It is a hard ceiling, not a multiplier: no combination of layers and
   * no surface tone can push a mat past it.
   *
   * The five are deliberately not equal, and not equal in the obvious way
   * either. White's token is the lightest in the system by a mile, so half of
   * it is already a bright mat; black's is a mid grey, but black's seat is
   * *supposed* to be the darkest thing on the table, so it is held lowest of
   * all. The ceilings are set by how the mats should look side by side, not by
   * the tokens they are made from.
   */
  peak: number;
  /**
   * Token for the bounce light, when it should differ from the key.
   *
   * Only white uses this. `--mana-white` is hue 45, so at the low lightness a
   * legible mat demands it lands on khaki — correct for a Plains, but it reads
   * as "gold" rather than "white" next to the other four. Bouncing the neutral
   * `--mana-colorless` back into it pulls the mat towards parchment and silver,
   * which is unmistakably white mana. Still a mana token, still no invented
   * colour.
   */
  accent?: string;
  /** Where the key light falls, as a `background-position` pair. */
  light: string;
  /** Where the bounce light comes back from. */
  bounce: string;
  /** Angle of the ground sweep, degrees. */
  sweep: number;
  /**
   * Cards whose `art_crop` may back this mat, best first. Resolved against the
   * `cards` table at runtime — a name that is not in the table is skipped, and
   * a colour with no matches keeps its CSS surface alone.
   */
  art: readonly string[];
}

export const MAT_DEFINITIONS: Record<MatColor, MatDefinition> = {
  W: {
    color: 'W',
    label: 'White',
    epithet: 'Order · the high sun',
    token: '--mana-white',
    // Half a token that is nearly white already. Reads as pale stone rather
    // than as a lit page, and lands a shade above black's mat so the two
    // near-neutral mats are never mistaken for each other.
    peak: 0.5,
    accent: '--mana-colorless',
    // Sun off the top edge rather than on it, so the visible band is the
    // accent's pale stone and the warm core never sits under the +1 glyph.
    light: '50% -28%',
    bounce: '50% 112%',
    sweep: 178,
    art: ['Elesh Norn, Grand Cenobite', 'Approach of the Second Sun', 'Wrath of God', 'Sun Titan', 'Plains'],
  },
  U: {
    color: 'U',
    label: 'Blue',
    epithet: 'Depth · the drowned tide',
    token: '--mana-blue',
    peak: 0.86,
    light: '18% 4%',
    bounce: '88% 96%',
    sweep: 200,
    art: ['Cyclonic Rift', 'Consecrated Sphinx', 'Counterspell', 'Brainstorm', 'Island'],
  },
  B: {
    color: 'B',
    label: 'Black',
    epithet: 'Rot · the low mire',
    token: '--mana-black',
    // The darkest mat by design. A violet-grey token held low reads as rot
    // rather than as lavender, and black's seat should be the one the eye
    // passes over.
    peak: 0.34,
    light: '80% 4%',
    bounce: '10% 100%',
    sweep: 155,
    art: ['Sheoldred, the Apocalypse', 'Damnation', "Bolas's Citadel", 'Gray Merchant of Asphodel', 'Swamp'],
  },
  R: {
    color: 'R',
    label: 'Red',
    epithet: 'Fury · the ember floor',
    token: '--mana-red',
    peak: 0.8,
    // Fire comes from below. The one mat lit from the bottom, which is why it
    // is recognisable across a table even before the hue registers.
    light: '50% 110%',
    bounce: '14% 0%',
    sweep: 12,
    art: ['Blasphemous Act', 'Terror of the Peaks', 'Inferno Titan', 'Lightning Bolt', 'Mountain'],
  },
  G: {
    color: 'G',
    label: 'Green',
    epithet: 'Growth · the deep canopy',
    token: '--mana-green',
    peak: 0.9,
    light: '24% 0%',
    bounce: '84% 92%',
    sweep: 168,
    art: ['Craterhoof Behemoth', 'Avenger of Zendikar', 'Vorinclex, Voice of Hunger', 'Cultivate', 'Forest'],
  },
};

/** Every card name any mat might use, deduped — one lookup covers all five. */
export const MAT_ART_CANDIDATES: string[] = Array.from(
  new Set(MAT_COLORS.flatMap(color => MAT_DEFINITIONS[color].art)),
);

export function matDefinition(color: MatColor): MatDefinition {
  return MAT_DEFINITIONS[color] ?? MAT_DEFINITIONS.W;
}

/* -------------------------------------------------------------------------- */
/* Surface                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * How hard a mat is pushed down for the surface it is on.
 *
 * `seat` is the live board — the number on top of it has to be readable across
 * a table, so it is the darkest. `preview` is the setup board, looked at from
 * phone distance with nothing written over most of it, so the colour is allowed
 * to sing. `swatch` is a thumbnail: no scrim at all, because a 44px tile with a
 * vignette on it is just a grey square.
 */
export type MatTone = 'seat' | 'preview' | 'swatch';

interface ToneSpec {
  /** Multiplies every colour layer's alpha. */
  gain: number;
  /** Flat black wash over the whole mat. */
  scrim: number;
  /** Dark pool under the middle of the mat, where the life total is drawn. */
  center: number;
  /** Strength of the edge vignette. */
  vignette: number;
  /** Opacity of the card art beneath the colour, when there is any. */
  art: number;
  /** `filter` applied to the art. */
  artFilter: string;
  /**
   * Move the key light to the middle of the tile instead of where the mat's own
   * lighting puts it.
   *
   * Only the swatch wants this, and it is not cosmetic. Two mats are lit from
   * off-canvas — white's sun sits above the top edge — so a thumbnail of them
   * shows the *outer* falloff and nothing else, which made white render darker
   * than black in the picker even though its mat is much lighter. A swatch is a
   * sample of the paint, not a miniature of the lighting.
   */
  flatten?: boolean;
}

const TONE: Record<MatTone, ToneSpec> = {
  seat: {
    gain: 1,
    // No flat wash at all on the live board. Contrast is bought where it is
    // actually needed — the pool under the number — instead of by greying out
    // the whole mat, which is what made five colours look like one.
    scrim: 0,
    center: 0.5,
    vignette: 0.42,
    // The art is allowed to be genuinely visible here — this is the surface
    // people look at for two hours, and the pool above keeps the number safe
    // regardless of what the illustration is doing underneath it.
    art: 0.72,
    artFilter: 'saturate(0.68) brightness(0.58) contrast(1.1)',
  },
  preview: {
    gain: 1.22,
    scrim: 0,
    center: 0.24,
    vignette: 0.3,
    art: 0.72,
    artFilter: 'saturate(0.78) brightness(0.6) contrast(1.06)',
  },
  swatch: {
    // A 70px tile shows the *inside* of a gradient, never its shape — and for
    // the mats lit from off-canvas it would otherwise show only the dim outer
    // stops. A gain this high drags every stop up to the colour's ceiling, so a
    // swatch reads as a flat sample of the mat at its brightest. It still cannot
    // exceed `peak`, which is what keeps white and black apart here too.
    gain: 3,
    scrim: 0,
    center: 0,
    vignette: 0.1,
    // And the art steps back: at thumbnail size an illustration is noise, and
    // the swatch's job is to answer "which colour is this".
    art: 0.5,
    artFilter: 'saturate(0.9) brightness(0.75) contrast(1.04)',
    flatten: true,
  },
};

/**
 * One colour layer, as a fraction of this mat's peak.
 *
 * `fraction` is relative — 1 means "as bright as this colour is ever allowed to
 * get" — and the tone's gain can lift a dim layer towards that ceiling but never
 * through it. That asymmetry is the whole trick: a swatch can be flooded with
 * colour and a seat can be lit softly, and neither can make a mat brighter than
 * the legibility budget its `peak` set.
 */
function wash(def: MatDefinition, fraction: number, gain: number, token = def.token): string {
  const a = Math.max(0, Math.min(def.peak, def.peak * fraction * gain));
  return `hsl(var(${token}) / ${a.toFixed(3)})`;
}

const ink = (alpha: number) => `hsl(0 0% 0% / ${alpha.toFixed(3)})`;

/**
 * The colour half of a mat: everything except the card art, which is its own
 * element underneath.
 *
 * CSS paints the *first* background-image on top, so this list reads
 * front-to-back: scrim, weave, vignette, then the light itself.
 */
export function matSurfaceStyle(color: MatColor, tone: MatTone = 'seat'): CSSProperties {
  const def = matDefinition(color);
  const spec = TONE[tone];
  const g = spec.gain;
  const light = spec.flatten ? '50% 34%' : def.light;

  const layers = [
    // Flat wash. The one layer that is pure contrast insurance.
    spec.scrim > 0 ? `linear-gradient(${ink(spec.scrim)}, ${ink(spec.scrim)})` : null,

    // Woven cloth. Two crossed threads at 1-2% — felt rather than seen, and the
    // reason the mat does not read as a flat fill.
    'repeating-linear-gradient(45deg, hsl(0 0% 100% / 0.016) 0 2px, transparent 2px 5px)',
    'repeating-linear-gradient(-45deg, hsl(0 0% 0% / 0.055) 0 3px, transparent 3px 7px)',

    // A dark pool under the middle, where the life total sits.
    spec.center > 0
      ? `radial-gradient(58% 46% at 50% 50%, ${ink(spec.center)} 0%, transparent 74%)`
      : null,

    // Edge vignette — the mat falls away into the table.
    `radial-gradient(126% 118% at 50% 46%, transparent 26%, ${ink(spec.vignette)} 100%)`,

    // Ground sweep along the mat's long axis.
    `linear-gradient(${def.sweep}deg, ${wash(def, 0.42, g, def.accent)} 0%, ${wash(def, 0.14, g, def.accent)} 52%, ${wash(def, 0.3, g, def.accent)} 100%)`,

    // Bounce off the far corner, so the unlit side is not dead black.
    `radial-gradient(96% 82% at ${def.bounce}, ${wash(def, 0.42, g, def.accent)} 0%, transparent 74%)`,

    // Key light. The layer that makes the mat that colour. Its outer stops fall
    // back to the accent where one is set, so white's warm core spreads out into
    // silver instead of flooding the whole mat with gold.
    `radial-gradient(128% 104% at ${light}, ${wash(def, 1, g)} 0%, ${wash(def, 0.44, g, def.accent)} 42%, ${wash(def, 0.1, g, def.accent)} 82%)`,
  ].filter(Boolean) as string[];

  return {
    backgroundColor: 'hsl(0 0% 0%)',
    backgroundImage: layers.join(', '),
  };
}

/** The art half: `background-*` for the layer that sits beneath the colour. */
export function matArtStyle(art: string | null | undefined, tone: MatTone = 'seat'): CSSProperties | null {
  if (!art) return null;
  const spec = TONE[tone];
  return {
    backgroundImage: `url("${art}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    opacity: spec.art,
    filter: spec.artFilter,
  };
}
