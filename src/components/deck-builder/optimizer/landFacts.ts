/**
 * What the land ranker measured about a land, and how to say it in one line.
 *
 * Its own module because two components print this line: the land tiles in
 * `LandRecommendationsSection`, and both sides of a land trade rendered by
 * `SwapsSection`. A tile and a swap row six inches apart that phrase the same
 * measurement differently read as two different measurements, so there is one
 * function and both call it.
 */

/**
 * What the land ranker measured, as the edge function sends it.
 *
 * `null` when the land was not one of the ranked candidates. Null means
 * unmeasured and renders as nothing, never as "makes no colours".
 */
export interface LandGrounds {
  /** Colours of this deck it taps for, FREE. Not ones it charges you for. */
  produces: string[];
  /** Colours it can reach by fetching another land out of the library. */
  fetches: string[];
  entersTapped: boolean;
  ownedQuantity: number;
  usd: number | null;
}

const COLOUR_LABEL: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

/**
 * The measured facts about one land, in one line.
 *
 * Colours it TAPS for, free — never colours it charges an extra mana for or
 * restricts to one card type, which is the distinction the ranker is built on.
 * Returns null when nothing was measured; an absent measurement must never
 * look like a zero.
 */
export function landFactsLine(grounds: LandGrounds | null | undefined): string | null {
  if (!grounds) return null;

  const parts: string[] = [];
  if (grounds.produces?.length) {
    parts.push(`Taps for ${grounds.produces.map(c => COLOUR_LABEL[c] ?? c).join(', ')}`);
  } else if (grounds.fetches?.length) {
    parts.push(`Fetches ${grounds.fetches.map(c => COLOUR_LABEL[c] ?? c).join(', ')}`);
  }
  if (grounds.entersTapped) parts.push('Enters tapped');
  return parts.length ? parts.join(' · ') : null;
}
