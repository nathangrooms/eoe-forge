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
 * over black, so the alpha *is* the resulting luminance: a mat's peak lightness
 * is `intensity × the token's own lightness`, and white — by far the lightest
 * token at ~73% — is given the lowest intensity of the five for that reason.
 * On top of that every mat carries a centre scrim, which is precisely where the
 * life total is drawn.
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
 * Not WUBRG order: adjacent seats sit next to each other on a table, so the
 * default rotation alternates light against dark (white, black, blue, red) to
 * keep neighbouring mats from reading as the same mat.
 */
export const DEFAULT_MAT_ORDER: readonly MatColor[] = ['W', 'B', 'U', 'R', 'G'] as const;

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
   * Ceiling on every colour layer's alpha. Because the layers wash over black,
   * this doubles as a ceiling on the mat's lightness — which is what keeps a
   * white life total readable on white's mat.
   */
  intensity: number;
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
    // The lightest token in the system by a wide margin. Held right down, or a
    // white life total sits on a white mat.
    intensity: 0.3,
    light: '50% -10%',
    bounce: '50% 108%',
    sweep: 178,
    art: ['Elesh Norn, Grand Cenobite', 'Approach of the Second Sun', 'Wrath of God', 'Sun Titan', 'Plains'],
  },
  U: {
    color: 'U',
    label: 'Blue',
    epithet: 'Depth · the drowned tide',
    token: '--mana-blue',
    intensity: 0.82,
    light: '22% 8%',
    bounce: '86% 92%',
    sweep: 200,
    art: ['Cyclonic Rift', 'Consecrated Sphinx', 'Counterspell', 'Brainstorm', 'Island'],
  },
  B: {
    color: 'B',
    label: 'Black',
    epithet: 'Rot · the low mire',
    token: '--mana-black',
    // The token is a desaturated violet-grey; it needs headroom to read as a
    // colour at all rather than as more charcoal.
    intensity: 1,
    light: '76% 12%',
    bounce: '14% 96%',
    sweep: 155,
    art: ['Sheoldred, the Apocalypse', 'Damnation', "Bolas's Citadel", 'Gray Merchant of Asphodel', 'Swamp'],
  },
  R: {
    color: 'R',
    label: 'Red',
    epithet: 'Fury · the ember floor',
    token: '--mana-red',
    intensity: 0.78,
    // Fire comes from below. The one mat lit from the bottom.
    light: '50% 104%',
    bounce: '18% 6%',
    sweep: 12,
    art: ['Blasphemous Act', 'Terror of the Peaks', 'Inferno Titan', 'Lightning Bolt', 'Mountain'],
  },
  G: {
    color: 'G',
    label: 'Green',
    epithet: 'Growth · the deep canopy',
    token: '--mana-green',
    intensity: 0.9,
    light: '28% 4%',
    bounce: '80% 88%',
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
}

const TONE: Record<MatTone, ToneSpec> = {
  seat: {
    gain: 1,
    scrim: 0.22,
    center: 0.4,
    vignette: 0.5,
    art: 0.5,
    artFilter: 'saturate(0.5) brightness(0.42) contrast(1.08)',
  },
  preview: {
    gain: 1.08,
    scrim: 0.1,
    center: 0.22,
    vignette: 0.42,
    art: 0.62,
    artFilter: 'saturate(0.62) brightness(0.5) contrast(1.06)',
  },
  swatch: {
    gain: 1.15,
    scrim: 0,
    center: 0,
    vignette: 0.24,
    art: 0.72,
    artFilter: 'saturate(0.75) brightness(0.6) contrast(1.05)',
  },
};

/** `hsl(var(--mana-x) / a)`, alpha clamped by the mat's own ceiling and the tone. */
function wash(def: MatDefinition, alpha: number, gain: number): string {
  const a = Math.max(0, Math.min(0.95, alpha * def.intensity * gain));
  return `hsl(var(${def.token}) / ${a.toFixed(3)})`;
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
    `linear-gradient(${def.sweep}deg, ${wash(def, 0.26, g)} 0%, transparent 46%, ${wash(def, 0.16, g)} 100%)`,

    // Bounce off the far corner, so the unlit side is not dead black.
    `radial-gradient(92% 76% at ${def.bounce}, ${wash(def, 0.2, g)} 0%, transparent 72%)`,

    // Key light. The layer that makes the mat that colour.
    `radial-gradient(122% 96% at ${def.light}, ${wash(def, 0.56, g)} 0%, ${wash(def, 0.2, g)} 38%, transparent 74%)`,
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
