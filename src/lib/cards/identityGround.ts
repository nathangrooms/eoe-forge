/**
 * A background derived from a card's colour identity.
 *
 * This replaces a blurred copy of the card art. Scryfall's image guidelines are
 * explicit: "Do not blur, sharpen, desaturate, or color-shift card images." That
 * rule exists to stop anyone misrepresenting a card, and our use was decorative
 * with the sharp card composited over it, so it may well have been accepted. But
 * the downside of guessing wrong is losing the API this entire product is built
 * on, so we do not guess.
 *
 * The purpose the blur served is still worth having. The interface is
 * deliberately monochrome charcoal, which leaves large surfaces flat and grey,
 * and Magic's colour lives in its cards. So the colour comes from the card's
 * COLOUR IDENTITY instead, which is our own derived data rather than Wizards'
 * artwork. It carries the same meaning, and arguably carries it better: a Simic
 * deck now reads blue-green at a glance, whether or not its commander's
 * illustration happens to be.
 *
 * Returns a CSS gradient string, or null for colourless, where the honest answer
 * is no colour at all.
 */

const MANA_HSL: Record<string, string> = {
  W: 'var(--mana-white)',
  U: 'var(--mana-blue)',
  B: 'var(--mana-black)',
  R: 'var(--mana-red)',
  G: 'var(--mana-green)',
};

/** Order matters: WUBRG is how every Magic player reads a colour identity. */
const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

export function identityGround(
  colors: readonly string[] | null | undefined,
  opts: { alpha?: number; angle?: number } = {}
): string | null {
  const { alpha = 0.28, angle = 135 } = opts;

  const ci = WUBRG.filter(c => (colors ?? []).some(x => x?.toUpperCase() === c));
  if (ci.length === 0) return null;

  /* A single colour still needs two stops, or there is no gradient to see. The
     second is the same hue at a lower alpha rather than a different colour, so
     a mono deck reads as one colour deepening rather than as two. */
  if (ci.length === 1) {
    const c = MANA_HSL[ci[0]];
    return `linear-gradient(${angle}deg, hsl(${c} / ${alpha}) 0%, hsl(${c} / ${alpha * 0.35}) 100%)`;
  }

  const step = 100 / (ci.length - 1);
  const stops = ci
    .map((c, i) => `hsl(${MANA_HSL[c]} / ${alpha}) ${Math.round(i * step)}%`)
    .join(', ');
  return `linear-gradient(${angle}deg, ${stops})`;
}

export default identityGround;
